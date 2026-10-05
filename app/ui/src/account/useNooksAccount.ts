import { useEffect, useSyncExternalStore } from 'react';
import { nooksAccount } from './client';

export function useNooksAccount(enabled = true) {
 const account = useSyncExternalStore(nooksAccount.subscribe, nooksAccount.getSnapshot, nooksAccount.getSnapshot);
 useEffect(() => { if (enabled) void nooksAccount.initialize(); }, [enabled]);
 return account;
}
