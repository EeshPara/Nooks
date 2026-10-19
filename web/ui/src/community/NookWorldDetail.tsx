import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { getPublicNook } from './nookCatalog';
import { roomUnlocked, worldMilestones, worldProgress, type NookWorld, type RoomFocusProgress } from './nookWorlds';
import type { RoomScene } from '../personalization/types';
import { RewardDrawing } from '../world/RewardDrawing';
import './NookWorldDetail.css';

export function NookWorldDetail({ world, progress, currentRoomId, headingId, onJoin }: { world: NookWorld; progress: RoomFocusProgress; currentRoomId: string; headingId: string; onJoin: (scene: RoomScene) => void }) {
  const seconds = worldProgress(world, progress);
  const milestones = worldMilestones(world);
  const next = milestones.find(step => step.minutes * 60 > seconds);
  const available = world.rooms.filter(room => roomUnlocked(world, room, progress, currentRoomId));
  const starting = world.rooms.filter(room => room.minutes === 0);
  const cover = getPublicNook(world.coverRoomId)!.scene;
  const enter = (roomId: string) => {
    const room = world.rooms.find(room => room.roomId === roomId), nook = getPublicNook(roomId);
    if (room && nook && roomUnlocked(world, room, progress, currentRoomId)) onJoin({ ...nook.scene, title: room.title });
  };
  const chapters = world.rooms.filter(room => room.minutes > 0).map((room, index, rooms) => ({ room, items: milestones.filter(step => step.kind === 'item' && step.minutes > (index ? rooms[index - 1].minutes : 0) && step.minutes < room.minutes) }));
  return <div className="nw-detail">
    <div className="nw-hero">
      <img src={cover.image} alt="" />
      <div className="nw-hero-copy"><span>{world.progression ? 'A WORLD TO DISCOVER' : 'FIND YOUR PLACE'}</span><h2 id={headingId}>{world.title}</h2><p>{world.description}</p><div className="nw-hero-meta"><span>{world.rooms.length} rooms</span><span>{available.length} open to you</span>{world.progression && <span>{Math.floor(seconds / 60)} minutes studied</span>}</div></div>
    </div>
    {world.progression && <div className="nw-explanation"><span className="nw-explanation-star" aria-hidden="true">✧</span><p><strong>A little studying. A little magic.</strong> Earn keepsakes as you focus, then discover another room. Time in any Hogwarts room counts.</p></div>}
    <div className="nw-section-heading"><div><span className="nw-eyebrow">{world.progression ? 'START HERE' : 'MAKE YOURSELF AT HOME'}</span><h3>{world.progression ? 'Choose your common room' : 'Where would you like to study?'}</h3></div><span>{world.progression ? 'Every house is open to you.' : 'Your work comes with you.'}</span></div>
    <div className="nw-starting-rooms">{starting.map(room => {
      const nook = getPublicNook(room.roomId)!;
      return <button type="button" key={room.roomId} onClick={() => enter(room.roomId)} aria-label={`Study in ${room.title}`} className={`nw-room-choice ${currentRoomId === room.roomId ? 'is-current' : ''}`}><div><img src={nook.scene.thumbnail ?? nook.scene.image} alt="" loading="lazy"/><span>{currentRoomId === room.roomId ? <><Check size={12}/> You're here</> : 'Open now'}</span></div><strong>{room.title}</strong><span>Study here <ArrowRight size={14}/></span></button>;
    })}</div>
    {world.progression && <section className="nw-journey" aria-label="Hogwarts discovery journey">
      <div className="nw-section-heading"><div><span className="nw-eyebrow">YOUR JOURNEY</span><h3>There’s more behind every door.</h3></div><span>Everything you discover stays yours.</span></div>
      {next && <div className="nw-next-progress"><div><span>Up next: <strong>{next.title}</strong></span><span>{Math.max(0, Math.ceil(next.minutes - seconds / 60))} more focus minutes</span></div><progress aria-label={`Progress toward ${next.title}`} value={Math.min(seconds, next.minutes * 60)} max={next.minutes * 60}/></div>}
      <ol className="nw-chapters">{chapters.map(({room,items},index) => {
        const nook = getPublicNook(room.roomId)!, unlocked = roomUnlocked(world,room,progress,currentRoomId);
        return <li className="nw-chapter" key={room.roomId}><div className="nw-chapter-steps"><span className="nw-chapter-label">{index === 0 ? '01 · Settle into the castle' : '02 · Follow your curiosity'}</span><div className="nw-keepsakes">{items.map(item => item.kind === 'item' && <div className={`nw-keepsake ${seconds >= item.minutes * 60 ? 'is-earned' : ''}`} key={item.id}><RewardDrawing art={item.art} size={68}/><div><span>{seconds >= item.minutes * 60 ? 'Collected' : `${item.minutes} min total`}</span><strong>{item.title}</strong><p>{item.description}</p></div>{seconds >= item.minutes * 60 && <Check size={16} aria-label="Collected"/>}</div>)}</div><div className="nw-door-step"><span className="nw-door-icon">{unlocked ? <Check size={16}/> : <LockKeyhole size={16}/>}</span><div><strong>{unlocked ? 'A new room is yours' : 'Then, a new room opens'}</strong><span>{room.minutes} minutes of focus in Hogwarts</span></div></div></div><div className="nw-destination"><img src={nook.scene.image} alt={`${room.title} preview`} loading="lazy"/><div className="nw-destination-copy"><span>{unlocked ? 'DISCOVERED' : 'YOUR NEXT DESTINATION'}</span><h4>{room.title}</h4>{unlocked ? <button type="button" onClick={() => enter(room.roomId)}>Study here <ArrowRight size={16}/></button> : <span className="nw-unlock-label"><LockKeyhole size={13}/>{Math.max(0,Math.ceil(room.minutes - seconds / 60))} more minutes to unlock</span>}</div></div></li>;
      })}</ol>
      <p className="nw-journey-note">Stay in your favorite room for as long as you like. Your next discovery will be waiting.</p>
    </section>}
  </div>;
}
