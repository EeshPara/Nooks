import { StudyEngine } from '../../../server/engine.mjs';
import { NookCreator, creatorToolNames } from '../../../server/nook-creator.mjs';
import { InputError } from '../../../server/errors.mjs';
import { BrowserPreviewStore } from './browser-store.mjs';

export const mode = 'browser-preview';
const unavailable = new Set(['space_share', 'space_unshare', 'space_share_get', 'nook_publish_prepare', 'nook_publish_commit']);

export function createPreviewTools({ store = new BrowserPreviewStore(), clock = () => new Date() } = {}) {
  const engine = new StudyEngine(store, { clock });
  const creator = new NookCreator(store, { clock });
  // This is a browser-local capability, not a signed-in account or public identity.
  const browserIdentity = Object.freeze({ id: 'this-browser-only', scopes: ['notable.read', 'notable.write'] });
  return async (name, args = {}) => {
    if (unavailable.has(name)) throw new InputError('Public sharing and publishing need the connected community service. Your private browser work stays saved here.', 'FEATURE_UNAVAILABLE');
    const result = creatorToolNames.has(name)
      ? await creator.call(name, args, browserIdentity)
      : await engine.call(name, args, browserIdentity);
    if (result.workspace) result.workspace.backend = mode;
    return { ...result, mode, authenticated: false, storage: 'this-browser' };
  };
}

let preview;
export async function callPreviewTool(name, args = {}) {
  preview ??= createPreviewTools();
  return preview(name, args);
}
