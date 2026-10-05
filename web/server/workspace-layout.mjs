import { InputError } from './errors.mjs';

export const WORKSPACE_WIDGET_IDS = Object.freeze(['spotify', 'timer', 'tasks', 'collection', 'welcome', 'people']);
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const position = value => plainObject(value) && Object.hasOwn(value, 'x') && Object.hasOwn(value, 'y') && coordinate(value.x) && coordinate(value.y);
export const defaultWorkspaceLayout = () => ({ version: 1, positions: {} });

/** Cosmetic state must never prevent loading study material from an older workspace. */
export function normalizeWorkspaceLayout(value) {
  const result = defaultWorkspaceLayout();
  if (!plainObject(value) || value.version !== 1 || !plainObject(value.positions)) return result;
  for (const id of WORKSPACE_WIDGET_IDS) {
    if (Object.hasOwn(value.positions, id) && position(value.positions[id])) {
      result.positions[id] = { x: value.positions[id].x, y: value.positions[id].y };
    }
  }
  return result;
}

export function validateWorkspaceLayoutChange(value) {
  const invalid = () => { throw new InputError('Move one supported widget using x and y from 0 to 1, reset it with position: null, or reset the arrangement with reset: true.'); };
  if (!plainObject(value)) invalid();
  const fields = Reflect.ownKeys(value);
  if (fields.length === 1 && fields[0] === 'reset' && value.reset === true) return { reset: true };
  if (fields.length !== 2 || !fields.includes('id') || !fields.includes('position') || !WORKSPACE_WIDGET_IDS.includes(value.id)) invalid();
  if (value.position === null) return { id: value.id, position: null };
  if (!position(value.position) || Reflect.ownKeys(value.position).length !== 2) invalid();
  return { id: value.id, position: { x: value.position.x, y: value.position.y } };
}

/** Reapply one patch to the latest document on every transaction/CAS attempt. */
export function updateWorkspaceLayout(workspace, input) {
  const change = validateWorkspaceLayoutChange(input);
  const layout = change.reset ? defaultWorkspaceLayout() : normalizeWorkspaceLayout(workspace.workspaceLayout);
  if (!change.reset) {
    if (change.position === null) delete layout.positions[change.id];
    else layout.positions[change.id] = change.position;
  }
  workspace.workspaceLayout = layout;
  return { workspaceLayout: structuredClone(layout) };
}
