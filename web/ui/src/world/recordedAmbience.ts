import rain from './audio/rain-window.mp3?inline';
import stove from './audio/stove-fire.mp3?inline';
import hearth from './audio/hearth-fire.mp3?inline';

// Inlined media keeps native ChatGPT playback independent of cross-origin fetch permissions.
export const recordedAmbience = { rain, stove, hearth };
export function fireVariant(roomId: string): 'stove' | 'hearth' {
  return roomId === 'howls-moving-study' ? 'stove' : 'hearth';
}
export function recordingBytes(dataUrl: string): ArrayBuffer {
  if (!dataUrl.startsWith('data:audio/') || !dataUrl.includes(';base64,')) throw new Error('The nook sound recording is unavailable.');
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
