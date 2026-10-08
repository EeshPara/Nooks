import { isTutorialPractice } from '../onboarding/tutorialSession';
import { useEffect, useSyncExternalStore } from 'react';
import { nooksAccount } from './client';

export function useNooksAccount(enabled = true) {
 const account = useSyncExternalStore(nooksAccount.subscribe, nooksAccount.getSnapshot, nooksAccount.getSnapshot);
 useEffect(() => { if (enabled && !isTutorialPractice) void nooksAccount.initialize(); }, [enabled]);
 return isTutorialPractice ? {...account,status:'device' as const,workspaceKey:'device',user:null} : account;
}
