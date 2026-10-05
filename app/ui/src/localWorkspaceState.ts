type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>;
type LocalField = 'profile' | 'drafts' | 'active-draft' | 'last-opened';
const legacy: Record<LocalField, string> = { profile: 'nooks:profile:v1', drafts: 'nooks:drafts:v1', 'active-draft': 'nooks:active-draft:v1', 'last-opened': 'notable-last-opened' };
const validScope = (scope?: string) => scope === 'device' || /^account:[A-Za-z0-9_-]{1,128}$/.test(scope ?? '');
function browserStorage() { try { return localStorage; } catch { return undefined; } }

/** Only explicit device mode may read old unscoped website preferences. */
export function readLocalWorkspaceState(scope: string | undefined, field: LocalField, storage: LocalStorage | undefined = browserStorage()) {
  if (!validScope(scope) || !storage) return null;
  try { return storage.getItem(`nooks:${field}:${scope}`) ?? (scope === 'device' ? storage.getItem(legacy[field]) : null); } catch { return null; }
}
export function writeLocalWorkspaceState(scope: string | undefined, field: LocalField, value: string, storage: LocalStorage | undefined = browserStorage()) {
  if (!validScope(scope) || !storage) return;
  try { storage.setItem(`nooks:${field}:${scope}`, value); } catch { /* Local preferences must not prevent use of saved workspace data. */ }
}
