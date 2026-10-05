import { readNativeRecoveryScope } from './study/studyRecoveryScope';

/** Cached host data can suggest a view only after a fresh workspace proves its owner. */
export function verifiedInitialPresentation(initial: any, fresh: any) {
  if (!initial || !fresh?.workspace || !Array.isArray(fresh.workspace.artifacts)) return undefined;
  const scope = readNativeRecoveryScope(fresh.recoveryScope);
  const initialScope = readNativeRecoveryScope(initial.recoveryScope);
  if (fresh.workspace.backend === 'supabase' && (!scope || initialScope !== scope)) return undefined;
  if (initialScope !== scope) return undefined;
  const saved = (item: any) => item?.id ? fresh.workspace.artifacts.find((current: any) => current.id === item.id) : undefined;
  // A stale full snapshot must never replace the newly verified workspace, and
  // saved material must use that workspace's current revision and contents.
  return { recoveryScope: scope, navigation: initial.navigation,
    artifact: initial.unsaved === true ? initial.artifact : saved(initial.artifact),
    alongsideArtifact: saved(initial.alongsideArtifact), unsaved: initial.unsaved };
}
