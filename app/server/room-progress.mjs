import catalog from '../ui/src/world/room-rewards.json' with { type: 'json' };
import { ROOM_IDS } from './space.mjs';
import { InputError } from './errors.mjs';

/** The same authored catalog drives UI milestones and server-side unlock decisions. */
export const rewardCatalog = catalog;
export const PROGRESS_ROOM_IDS = Object.freeze([...ROOM_IDS, 'custom']);
const rewardIds = new Set();
for (const roomId of PROGRESS_ROOM_IDS) {
  const room = rewardCatalog.rooms?.[roomId];
  if (!room || !Array.isArray(room.rewards) || !room.rewards.length) throw new Error(`Missing reward catalog for ${roomId}.`);
  for (const reward of room.rewards) {
    if (typeof reward.id !== 'string' || rewardIds.has(reward.id) || !Number.isInteger(reward.minutes) || reward.minutes <= 0) throw new Error('Invalid room reward catalog.');
    rewardIds.add(reward.id);
  }
}
if (Object.keys(rewardCatalog.rooms).some(roomId => !PROGRESS_ROOM_IDS.includes(roomId))) throw new Error('Reward catalog contains an unknown room.');

export function validateProgressRoom(roomId) {
  if (!PROGRESS_ROOM_IDS.includes(roomId)) throw new InputError('Invalid study nook.');
  return roomId;
}
export function activeRoomId(space = {}) {
  if (space.backgroundImage || space._storedBackground) return 'custom';
  if (ROOM_IDS.includes(space.room)) return space.room;
  return ({ botanical: 'rainy-library', moonlight: 'rainy-library', sunrise: 'sakura-garden', lavender: 'sakura-garden', sky: 'midnight-train' })[space.theme] ?? 'rainy-library';
}
export function roomState(workspace, roomId) {
  validateProgressRoom(roomId);
  workspace.roomProgress ??= {};
  return workspace.roomProgress[roomId] ??= { focusSeconds: 0, sessions: 0, practices: 0, placed: [] };
}
export function activeFocusMilliseconds(session, now) {
  const end = new Date(session.pausedAt ?? now).valueOf();
  return Math.max(0, end - new Date(session.startedAt).valueOf() - (session.pausedMilliseconds ?? 0));
}
/** Schema migration only: no historical minutes or rewards are invented. */
export function hydrateRoomProgress(workspace, now) {
  workspace.roomProgress ??= {};
  for (const session of workspace.focusSessions) {
    if (session.roomId || session.completedAt || session.cancelledAt) continue;
    session.roomId = activeRoomId(workspace.space);
    session.roomCapturedAt = now;
    session.roomCreditOffsetMilliseconds = Math.min(session.targetMinutes * 60000, activeFocusMilliseconds(session, now));
  }
}
export function placeRoomReward(workspace, args) {
  const roomId = validateProgressRoom(args.roomId);
  if (typeof args.placed !== 'boolean') throw new InputError('placed must be true or false.');
  const reward = rewardCatalog.rooms[roomId].rewards.find(item => item.id === args.rewardId);
  if (!reward) throw new InputError('This reward does not belong to this nook.');
  const progress = roomState(workspace, roomId);
  if (progress.focusSeconds < reward.minutes * 60) throw new InputError('Keep focusing in this nook to unlock that reward.', 'REWARD_LOCKED');
  const selected = progress.placed.includes(reward.id);
  if (args.placed && !selected) {
    if (progress.placed.length >= 3) throw new InputError('Place up to three rewards in each nook. Remove one first.', 'ROOM_FULL');
    progress.placed.push(reward.id);
  } else if (!args.placed && selected) progress.placed = progress.placed.filter(id => id !== reward.id);
  return { roomId, roomProgress: progress, rewardId: reward.id, placed: args.placed };
}

/** Public appearance only: no elapsed time, sessions, practice records or other rooms. */
export function publicRoomDisplay(workspace) {
  const roomId = activeRoomId(workspace.space);
  const progress = workspace.roomProgress?.[roomId];
  if (!progress?.placed?.length) return undefined;
  const rewards = rewardCatalog.rooms[roomId].rewards;
  const placed = [...new Set(progress.placed)].filter(id => rewards.some(reward => reward.id === id && progress.focusSeconds >= reward.minutes * 60)).slice(0, 3);
  return placed.length ? { roomId, placed } : undefined;
}
