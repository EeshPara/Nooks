let nativeScope: string | undefined;

/** Call only with private metadata from the authenticated workspace_get response. */
export function setNativeRecoveryScope(value: unknown) {
  nativeScope = readNativeRecoveryScope(value);
  return nativeScope;
}
export const readNativeRecoveryScope = (value: unknown) => typeof value === 'string' && /^account:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
export const getNativeRecoveryScope = () => nativeScope;
