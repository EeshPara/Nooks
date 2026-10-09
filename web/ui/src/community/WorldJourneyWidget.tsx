import { ArrowUpRight, Check, DoorOpen, Sparkles } from 'lucide-react';
import { allRoomScenes } from '../personalization/types';
import { RewardDrawing } from '../world/RewardDrawing';
import { MovableWidget } from '../world/WorkspaceLayout';
import { worldMilestones, type NookWorld } from './nookWorlds';
import './WorldJourneyWidget.css';

/** A view of saved world progress; this panel never grants inventory or focus credit. */
export function WorldJourneyWidget({ world, progress, onExplore }: { world: NookWorld; progress: number; onExplore: () => void }) {
  const seconds = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const milestones = worldMilestones(world);
  const next = milestones.find(milestone => seconds < milestone.minutes * 60);
  const room = next?.kind === 'room' ? allRoomScenes.find(scene => scene.id === next.roomId) : undefined;
  const remaining = next ? Math.ceil((next.minutes * 60 - seconds) / 60) : 0;
  return <MovableWidget id="collection-next" label={`${world.title} journey`} className="collection-compact-position world-journey-position">
    <section className="world-journey-widget" aria-label={`${world.title} journey`}>
      <header><Sparkles size={13} aria-hidden="true"/><span>{world.title} journey</span><small>{Math.floor(seconds / 60)} min</small></header>
      <div className="world-journey-next">
        <div className="world-journey-art" aria-hidden="true">
          {next?.kind === 'item' ? <RewardDrawing art={next.art} size={62}/> : room ? <img src={room.thumbnail || room.image} alt=""/> : <Check size={30}/>}
        </div>
        <div><span>{next ? next.kind === 'room' ? 'Your next room' : 'Your next discovery' : 'Every chapter discovered'}</span><h3>{next?.title ?? 'A world to call your own'}</h3><p>{next ? `${remaining} more ${remaining === 1 ? 'minute' : 'minutes'} of focus` : 'Revisit your favorite hideaway.'}</p></div>
      </div>
      <ol className="world-journey-marks" aria-label="Journey milestones">
        {milestones.map(milestone => {
          const earned = seconds >= milestone.minutes * 60;
          return <li key={milestone.kind === 'item' ? milestone.id : milestone.roomId} data-earned={earned} data-next={milestone === next} title={`${milestone.title} · ${milestone.minutes} min${earned ? ' · discovered' : ''}`}>
            <span aria-hidden="true">{earned ? <Check size={11}/> : milestone.kind === 'room' ? <DoorOpen size={11}/> : <Sparkles size={10}/>}</span>
            <small aria-hidden="true">{milestone.minutes}</small>
            <span className="world-journey-sr">{milestone.title}, {milestone.minutes} minutes, {earned ? 'discovered' : milestone === next ? 'next discovery' : 'ahead'}</span>
          </li>;
        })}
      </ol>
      <button type="button" className="world-journey-link" onClick={onExplore}>View your journey <ArrowUpRight size={14} aria-hidden="true"/></button>
    </section>
  </MovableWidget>;
}
