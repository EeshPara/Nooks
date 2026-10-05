import type { Artifact } from './types';

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, max: number) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const indices = (value: unknown, length: number): value is number[] => Array.isArray(value) && value.length <= length && new Set(value).size === value.length && value.every(index => integer(index, length - 1));
const indexed = (value: unknown, length: number, valid: (item: any, index: number) => boolean) => record(value) && Object.entries(value).every(([key, item]) => /^(0|[1-9]\d*)$/.test(key) && integer(Number(key), length - 1) && valid(item, Number(key)));

/** Recovery storage is editable by the browser and must never crash a study session. */
export function validPracticeCheckpoint(value: unknown, artifact: Artifact): boolean {
  if (!record(value) || value.version !== 1 || value.kind !== artifact.kind || value.artifactRevision !== (artifact.revision ?? 1) ||
    typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 128 || !integer(value.elapsedSeconds, 604800) || !record(value.state)) return false;
  const state = value.state;
  if (artifact.kind === 'flashcards') {
    const length = artifact.cards?.length ?? 0;
    return length > 0 && indices(state.queue, length) && indices(state.known, length) &&
      new Set([...state.queue, ...state.known]).size === length && !state.queue.some(index => state.known.includes(index)) &&
      indexed(state.firstAnswers, length, item => typeof item === 'boolean') && state.known.every(index => Object.hasOwn(state.firstAnswers, index)) &&
      typeof state.flipped === 'boolean' && typeof state.showHint === 'boolean' && state.complete === (state.queue.length === 0) && integer(state.duration, 604800);
  }
  if (artifact.kind !== 'quiz' && artifact.kind !== 'exam') return false;
  const questions = artifact.questions ?? [];
  const length = questions.length;
  return length > 0 && integer(state.index, length - 1) && ['questions', 'submit', 'results'].includes(state.stage) && ['all', 'missed'].includes(state.reviewFilter) &&
    indexed(state.checked, length, item => typeof item === 'boolean') && indexed(state.flagged, length, item => typeof item === 'boolean') &&
    indexed(state.answers, length, (answer, index) => questions[index].options?.length ? integer(answer, questions[index].options!.length - 1) : typeof answer === 'string' && answer.length <= 2000) &&
    Array.isArray(state.optionOrders) && state.optionOrders.length === length && state.optionOrders.every((order: unknown, index: number) => {
      const count = questions[index].options?.length ?? 0;
      return indices(order, count) && order.length === count;
    });
}
