/** Reject delayed full snapshots before a later UI write can copy stale state. */
export interface WorkspaceOrder { revision?: number; updatedAt?: string }
export function acceptWorkspace(current: WorkspaceOrder | null, incoming: WorkspaceOrder): boolean {
  if (!current) return true;
  if (Number.isSafeInteger(current.revision) && Number.isSafeInteger(incoming.revision)) return incoming.revision! >= current.revision!;
  if (Number.isSafeInteger(current.revision) && !Number.isSafeInteger(incoming.revision)) return false;
  const previous = Date.parse(current.updatedAt ?? ''), next = Date.parse(incoming.updatedAt ?? '');
  return !Number.isFinite(previous) || !Number.isFinite(next) || next >= previous;
}
