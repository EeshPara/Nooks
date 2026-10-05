import { useCallback, useEffect, useRef, useState } from 'react';
import { callTool } from '../bridge';
import { accents, roomScenes, safeBackgroundImage } from '../personalization/types';
import type { WorkspaceSpace } from '../personalization/types';
import type { LiveNook } from './useLiveNooks';

type Scene = NonNullable<LiveNook['scene']>;
type SceneSelection = { key: string; scope: string; nookId: string; scene: Scene };
type SceneState = { key?: string; appearance?: WorkspaceSpace; loading: boolean; error?: string };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function selectedScene(enabled: boolean, scope: string | undefined, nook?: LiveNook | null): SceneSelection | undefined {
  if (!enabled || !scope?.startsWith('account:') || !uuid(scope.slice(8)) || !nook?.joined || nook.roomId !== 'custom' || !uuid(nook.id) || !uuid(nook.scene?.id) || !/^[a-f0-9]{64}$/.test(nook.scene?.snapshotHash ?? '')) return;
  return { key: JSON.stringify([scope, nook.id, nook.scene.id, nook.scene.snapshotHash]), scope, nookId: nook.id, scene: { ...nook.scene } };
}

/** Copy only display fields. Never retain an owner's private storage reference. */
function sceneAppearance(value: unknown): WorkspaceSpace {
  const space = value as WorkspaceSpace | null;
  const image = safeBackgroundImage(space?.backgroundImage);
  if (!space || typeof space.name !== 'string' || !space.name.trim() || space.name.length > 80 || typeof space.tagline !== 'string' || space.tagline.length > 240 ||
      !['botanical', 'moonlight', 'sunrise', 'lavender', 'sky'].includes(space.theme) || !accents.some(item => item.value === space.accent) ||
      !['sleepy-dog', 'sprout', 'cat', 'none', 'bunny', 'fox', 'capybara', 'red-panda', 'owl', 'turtle', 'bear', 'ghost'].includes(space.companion) ||
      !['calm', 'focused'].includes(space.layout) || !Array.isArray(space.decorations) || space.decorations.length > 2 || space.decorations.some(item => !['sparkles', 'stickers'].includes(item)) ||
      space.room !== undefined && !roomScenes.some(item => item.id === space.room) || !image) throw new Error('This nook’s artwork could not be loaded. Try again.');
  return { name: space.name, tagline: space.tagline, theme: space.theme, accent: space.accent, companion: space.companion, layout: space.layout, decorations: [...space.decorations], ...(space.room === undefined ? {} : { room: space.room }), backgroundImage: image };
}

/** A transient, membership-authorized scene; callers must not save it as personal preferences. */
export function usePublishedNookScene({ enabled, recoveryScope, nook }: { enabled: boolean; recoveryScope?: string; nook?: LiveNook | null }) {
  const selection = selectedScene(enabled, recoveryScope, nook);
  const key = selection?.key;
  const current = useRef(selection); current.current = selection;
  const mounted = useRef(false), sequence = useRef(0);
  // Only the current selection is cached, in memory. Leaving, changing accounts,
  // or losing verified membership immediately makes the previous bytes unusable.
  const [state, setState] = useState<SceneState>({ loading: false });
  const refresh = useCallback(async () => {
    const selected = current.current;
    if (!mounted.current || !selected) return;
    const stamp = ++sequence.current;
    const valid = () => mounted.current && stamp === sequence.current && selected.key === current.current?.key;
    setState({ key: selected.key, loading: true });
    try {
      const result = await callTool('nook_scene_get', { nookId: selected.nookId });
      if (!valid()) return;
      if (result.recoveryScope !== selected.scope) throw new Error('Your account changed. Reopen this nook in your current account.');
      if (result.nookId !== selected.nookId || result.scene?.id !== selected.scene.id || result.scene?.snapshotHash !== selected.scene.snapshotHash) throw new Error('This nook’s artwork changed. Reopen the nook to load its current scene.');
      const appearance = sceneAppearance(result.appearance);
      if (valid()) setState({ key: selected.key, appearance, loading: false });
    } catch (cause) {
      if (valid()) setState({ key: selected.key, loading: false, error: cause instanceof Error ? cause.message : 'This nook’s artwork could not be loaded. Try again.' });
    }
  }, []);
  useEffect(() => {
    mounted.current = true; sequence.current++;
    setState({ key, loading: !!key });
    if (key) void refresh();
    // Resume requires fresh server authorization, even when the immutable image
    // identity did not change while this tab was hidden.
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; sequence.current++; document.removeEventListener('visibilitychange', visible); };
  }, [key, refresh]);
  const isCustom = enabled && nook?.joined === true && nook.roomId === 'custom';
  const visible = !!key && state.key === key;
  return {
    isCustom, nookId: selection?.nookId, scene: selection?.scene,
    appearance: visible ? state.appearance : undefined,
    loading: !!key && (!visible || state.loading),
    error: isCustom && !selection ? 'This nook’s artwork is unavailable. Reopen the nook to try again.' : visible ? state.error : undefined,
    refresh,
  };
}
