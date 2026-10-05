import { Artifact } from './types';

export function validateStudyArtifact(artifact: Artifact): string[] {
  const errors: string[] = [];
  if (!artifact.title.trim()) errors.push('Give your study set a title.');
  if (!artifact.subject.trim()) errors.push('Add a subject for your study set.');
  if (artifact.title.length > 180) errors.push('Keep the title under 180 characters.');
  if (artifact.kind === 'flashcards') {
    if (!artifact.cards?.length) errors.push('Keep at least one flashcard in this set.');
    artifact.cards?.forEach((card, index) => {
      if (!card.front.trim() || !card.back.trim()) errors.push(`Card ${index + 1} needs a question and an answer.`);
    });
  } else if (artifact.kind === 'quiz' || artifact.kind === 'exam') {
    if (!artifact.questions?.length) errors.push('Keep at least one question in this set.');
    artifact.questions?.forEach((question, index) => {
      if (!question.prompt.trim()) errors.push(`Question ${index + 1} needs a prompt.`);
      if (question.options?.length) {
        if (question.options.length < 2 || question.options.some(option => !option.trim())) errors.push(`Question ${index + 1} needs at least two complete answer choices.`);
        if (!Number.isInteger(question.correctIndex) || question.correctIndex! < 0 || question.correctIndex! >= question.options.length) errors.push(`Choose the correct answer for question ${index + 1}.`);
      } else if (!question.answer?.trim()) errors.push(`Question ${index + 1} needs an accepted answer.`);
    });
  }
  return errors;
}

export function deleteQuestionOption(options: string[], correctIndex: number | undefined, removeIndex: number) {
  return {
    options: options.filter((_, index) => index !== removeIndex),
    correctIndex: correctIndex === removeIndex ? undefined : correctIndex !== undefined && correctIndex > removeIndex ? correctIndex - 1 : correctIndex,
  };
}
