/**
 * Layout fields verified against MCP Apps McpUiHostContext:
 * https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiHostContext.html
 * Legacy adapter: https://github.com/openai/openai-apps-sdk-examples/blob/main/src/types.ts
 * Safe areas are system/mobile insets, not a guaranteed rectangle for ChatGPT's chat sheet.
 */
export type HostDisplayMode = 'inline' | 'fullscreen' | 'pip';
export type HostInsets = { top: number; right: number; bottom: number; left: number };
export type HostContainerDimensions = ({ height: number } | { maxHeight?: number }) & ({ width: number } | { maxWidth?: number });
export type HostLayoutData = {
  displayMode?: HostDisplayMode;
  safeAreaInsets?: HostInsets;
  containerDimensions?: HostContainerDimensions;
};
export type HostContextRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is HostContextRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const validPixel = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validMode = (value: unknown): value is HostDisplayMode => value === 'inline' || value === 'fullscreen' || value === 'pip';
const edges = ['top', 'right', 'bottom', 'left'] as const;

export function readHostInsets(value: unknown): HostInsets | undefined {
  if (!isRecord(value) || !edges.every(edge => validPixel(value[edge]))) return undefined;
  return { top: value.top as number, right: value.right as number, bottom: value.bottom as number, left: value.left as number };
}

/** Notifications are partial at the top level. An explicitly unset value clears old geometry. */
export function mergeHostContext(previous: HostContextRecord, update: unknown): HostContextRecord {
  return isRecord(update) ? { ...previous, ...update } : previous;
}

export function readHostLayout(context: unknown): HostLayoutData {
  if (!isRecord(context)) return {};
  const result: HostLayoutData = {};
  if (validMode(context.displayMode)) result.displayMode = context.displayMode;
  const insets = readHostInsets(context.safeAreaInsets);
  if (insets) result.safeAreaInsets = insets;
  if (isRecord(context.containerDimensions)) {
    const source = context.containerDimensions;
    const dimensions: HostContainerDimensions = {};
    if (validPixel(source.width)) Object.assign(dimensions, { width: source.width });
    else if (validPixel(source.maxWidth)) Object.assign(dimensions, { maxWidth: source.maxWidth });
    if (validPixel(source.height)) Object.assign(dimensions, { height: source.height });
    else if (validPixel(source.maxHeight)) Object.assign(dimensions, { maxHeight: source.maxHeight });
    if (Object.keys(dimensions).length) result.containerDimensions = dimensions;
  }
  return result;
}

/** Adapt only verified legacy globals; never guess conversation/occlusion fields. */
export function legacyLayoutUpdate(globals: unknown): HostContextRecord {
  if (!isRecord(globals)) return {};
  const result: HostContextRecord = {};
  if (Object.hasOwn(globals, 'displayMode')) result.displayMode = validMode(globals.displayMode) ? globals.displayMode : undefined;
  if (Object.hasOwn(globals, 'safeArea')) result.safeAreaInsets = isRecord(globals.safeArea) ? readHostInsets(globals.safeArea.insets) : undefined;
  if (Object.hasOwn(globals, 'maxHeight')) result.containerDimensions = validPixel(globals.maxHeight) ? { maxHeight: globals.maxHeight } : undefined;
  return result;
}

/** CSS data only: additional composer clearance belongs to the app's own design CSS. */
export function hostLayoutStyle(layout: HostLayoutData): Record<string, string> {
  const style: Record<string, string> = {};
  for (const edge of edges) style[`--nooks-host-safe-${edge}`] = `${layout.safeAreaInsets?.[edge] ?? 0}px`;
  for (const dimension of ['width', 'height', 'maxWidth', 'maxHeight'] as const) {
    const value = (layout.containerDimensions as Record<string, number> | undefined)?.[dimension];
    if (value !== undefined) style[`--nooks-host-container-${dimension.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = `${value}px`;
  }
  return style;
}
