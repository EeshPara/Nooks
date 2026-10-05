export type ArtifactKind = 'note' | 'quiz' | 'flashcards' | 'exam';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  hint?: string;
}

export interface StudyQuestion {
  id: string;
  prompt: string;
  options?: string[];
  /** Zero-based correct option for multiple choice. */
  correctIndex?: number;
  /** Accepted answer for short answer; case, spacing and punctuation are normalized. */
  answer?: string;
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  subject: string;
  color: string;
  content?: string;
  cards?: Flashcard[];
  questions?: StudyQuestion[];
  createdAt: string;
  updatedAt: string;
  description?: string;
  source?: string;
  favorite?: boolean;
  revision?: number;
  courseId?: string;
  topicId?: string;
}

export interface ProgressEvent {
  /** Room captured when this practice session starts. */
  roomId?: string;
  artifactId: string;
  /** Version actually studied. Absent only on retained legacy results/history. */
  artifactRevision?: number;
  kind: 'flashcards' | 'quiz' | 'exam' | 'match' | 'sprint';
  score: number;
  total: number;
  xp: number;
  durationSeconds?: number;
  sessionId: string;
  answers?: Record<string, number | string>;
  cardRatings?: Record<string, 'again' | 'hard' | 'good' | 'easy'>;
  matches?: { cardId: string; front: string; back: string }[];
}

export function normalizeAnswer(value: string): string {
  return value.toLocaleLowerCase().replace(/[.,!?;:]/g, '').trim().replace(/\s+/g, ' ');
}

export function isCorrectAnswer(question: StudyQuestion, value: number | string): boolean {
  if (question.options?.length) return typeof value === 'number' && value === question.correctIndex;
  if (typeof value !== 'string' || !normalizeAnswer(value)) return false;
  return [question.answer, ...(question.acceptedAnswers ?? [])].some(answer => answer !== undefined && normalizeAnswer(answer) === normalizeAnswer(value));
}

export function expectedAnswer(question: StudyQuestion): string {
  return question.options?.[question.correctIndex ?? -1] ?? question.answer ?? question.acceptedAnswers?.[0] ?? 'No answer provided';
}

export function shuffledOptionIndices(question: StudyQuestion): number[] {
  const order = (question.options ?? []).map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
