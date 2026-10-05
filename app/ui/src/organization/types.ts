import type { Artifact, ProgressEvent } from '../study/types';

export type CourseColor = 'sand' | 'rose' | 'lavender' | 'sky' | 'sage' | 'clay';
export type OrganizedArtifact = Artifact & { courseId?: string; topicId?: string; revision?: number };
export interface Course { id: string; title: string; description: string; color: CourseColor; archived: boolean; examDate?: string; revision: number; createdAt: string; updatedAt: string }
export interface Topic { id: string; courseId: string; title: string; description: string; revision: number; createdAt: string; updatedAt: string }
export interface StudySession { id: string; title: string; summary: string; courseId?: string; topicId?: string; artifactIds: string[]; goals: string[]; nextSteps: string[]; openQuestions: string[]; nookId?: string; revision: number; createdAt: string; updatedAt: string; userConfirmedAt: string }
export interface NoteRevision { id: string; artifactId: string; revision: number; title: string; characters: number; savedAt: string; supersededAt: string; source: string }
export interface NoteProposal { id: string; artifactId: string; baseRevision: number; title: string; content?: string; reason: string; createdAt: string; stale?: boolean }
export interface Organization { schemaVersion: 1; courses: Course[]; topics: Topic[]; sessions: StudySession[]; noteRevisions?: NoteRevision[]; noteProposals?: NoteProposal[] }
export interface LibraryWorkspace { artifacts: OrganizedArtifact[]; organization?: Organization; progress: (ProgressEvent & { completedAt?: string })[]; focusSessions: { id: string; subject?: string; courseId?: string; topicId?: string; completedAt?: string; minutes?: number; activeSeconds?: number; roomId?: string }[] }
export type OrganizationTool = (name: string, args: Record<string, unknown>) => Promise<any>;
export interface LibraryScope { courseId?: string; topicId?: string; unfiled: boolean }
export const emptyOrganization = (): Organization => ({ schemaVersion: 1, courses: [], topics: [], sessions: [], noteRevisions: [], noteProposals: [] });
export function resultData<T = any>(raw: any): T {
  const data = raw?._meta?.notableData ?? raw?.structuredContent ?? raw;
  if (raw?.isError || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : data?.error?.message ?? 'This change could not be saved. Please try again.');
  return data as T;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Your work is still here; please try again.'; }
export function shortDate(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function friendlyTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export const kindNames: Record<Artifact['kind'], string> = { note: 'Note', flashcards: 'Flashcards', quiz: 'Quiz', exam: 'Exam' };
