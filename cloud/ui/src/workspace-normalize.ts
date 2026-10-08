import type { Organization } from './organization/types';
import { emptyOrganization } from './organization/types';
import type { WorkspaceSpace } from './personalization/types';
import type { Artifact, ProgressEvent } from './study/types';
import type { RoomProgress } from './world/RoomJourney';

export type Task = { id:string; title:string; subject:string; done:boolean; dueDate?:string };
export type WorkspaceWidgetId = 'spotify'|'timer'|'tasks'|'collection'|'collection-next'|'welcome'|'people';
export type WorkspaceWidgetPosition = { x:number; y:number };
export type WorkspaceLayoutValue = { version:1; positions:Partial<Record<WorkspaceWidgetId,WorkspaceWidgetPosition>> };
export type WorkspaceLayoutChange = { id:WorkspaceWidgetId; position:WorkspaceWidgetPosition|null }|{ reset:true };
export type Workspace = { onboarding?:{name:string;avatar:number;version:number;completedAt:string}; revision?:number; updatedAt?:string; backend?:string; workspaceLayout?:WorkspaceLayoutValue; artworkWarnings?:{code:string;message:string}[]; organization?:Organization; roomProgress?:Record<string,RoomProgress>; space?:WorkspaceSpace; shares?:{id:string;url?:string;createdAt:string}[]; artifacts:Artifact[]; progress:ProgressEvent[]; plan:{tasks:Task[]}; stats:{xp:number;level:number;streak:number;focusMinutes:number}; focusSessions:any[] };
export const blankWorkspace: Workspace = { workspaceLayout:{version:1,positions:{}}, artifacts:[], progress:[], plan:{tasks:[]}, stats:{xp:0,level:1,streak:0,focusMinutes:0}, focusSessions:[] };
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

export function normalizeWorkspaceLayout(value:unknown):WorkspaceLayoutValue {
 const input=record(value), positions=record(input.positions), result:WorkspaceLayoutValue={version:1,positions:{}};
 if(input.version!==1)return result;
 for(const id of ['spotify','timer','tasks','collection','collection-next','welcome','people'] as const) {
  if(!Object.hasOwn(positions,id))continue;
  const point=record(positions[id]);
  if(Object.hasOwn(point,'x')&&Object.hasOwn(point,'y')&&typeof point.x==='number'&&Number.isFinite(point.x)&&point.x>=0&&point.x<=1&&typeof point.y==='number'&&Number.isFinite(point.y)&&point.y>=0&&point.y<=1)result.positions[id]={x:point.x,y:point.y};
 }
 return result;
}

/** Model-visible summaries omit private collections; omission never means deletion. */
export function normalizeWorkspace(value: unknown, previous: Workspace = blankWorkspace): Workspace {
 const incoming = record(value);
 const richSnapshot = Array.isArray(incoming.artifacts);
 const previousOrganization = previous.organization ?? emptyOrganization();
 const organization = record(incoming.organization);
 const tasks = Array.isArray(incoming.plan) ? incoming.plan : record(incoming.plan).tasks;
 // The summary's course list is deliberately capped. It must not replace a
 // complete loaded organization, nor does it contain topics or saved sessions.
 const orgBase = !richSnapshot && previous.organization ? previousOrganization : { ...previousOrganization, ...organization };
 const organizationArray = (key: 'courses'|'topics'|'sessions'|'noteRevisions'|'noteProposals') =>
  !richSnapshot && previous.organization ? previousOrganization[key] ?? [] : Array.isArray(organization[key]) ? organization[key] : previousOrganization[key] ?? [];
 return {
  ...previous, ...incoming,
  workspaceLayout: normalizeWorkspaceLayout(richSnapshot || Object.hasOwn(incoming,'workspaceLayout') ? incoming.workspaceLayout : previous.workspaceLayout),
  artworkWarnings: richSnapshot ? (Array.isArray(incoming.artworkWarnings) ? incoming.artworkWarnings.filter((warning:any)=>warning?.code==='ARTWORK_UNAVAILABLE') : []) : previous.artworkWarnings,
  revision: richSnapshot ? incoming.revision : previous.revision,
  updatedAt: richSnapshot ? incoming.updatedAt : previous.updatedAt,
  artifacts: richSnapshot ? incoming.artifacts.map((artifact:Artifact) => ({ ...artifact, revision:artifact.revision ?? 1 })) : previous.artifacts,
  progress: Array.isArray(incoming.progress) ? incoming.progress : previous.progress,
  focusSessions: Array.isArray(incoming.focusSessions) ? incoming.focusSessions : previous.focusSessions,
  plan: { tasks: Array.isArray(tasks) ? tasks : previous.plan.tasks },
  stats: { ...previous.stats, ...record(incoming.stats) },
  organization: { ...orgBase, schemaVersion:1, courses:organizationArray('courses'), topics:organizationArray('topics'), sessions:organizationArray('sessions'), noteRevisions:organizationArray('noteRevisions'), noteProposals:organizationArray('noteProposals') },
 };
}
