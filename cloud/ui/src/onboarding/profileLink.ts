import type { NookProfile } from '../community/NookCreator';
// Only the explicit Connect my account action may carry this small profile
// across the device/account boundary. Never transfer the device library.
let pending:{profile:NookProfile;from:string;claimed?:string}|undefined;
export function requestProfileLink(profile:NookProfile,from:string){pending={profile:{...profile},from};}
export function claimProfileLink(scope:string){
 if(!pending||scope===pending.from||!scope.startsWith('account:')||pending.claimed&&pending.claimed!==scope)return;
 pending.claimed=scope;return {...pending.profile};
}
export function clearProfileLink(){pending=undefined;}
