/** Original sample study material. Never fetched from a student's conversation. */
export function createWorkspace(now = new Date().toISOString()) {
  return {
    version: 1,
    workspaceLayout: { version: 1, positions: {} },
    artifacts: [
      { id: 'note-cell-energy', kind: 'note', title: 'The little engines of life', subject: 'Biology', color: '#8ba788', description: 'Cellular respiration, made a little clearer.', favorite: true, createdAt: now, updatedAt: now, content: '# Cellular respiration\n\nCells turn the energy stored in glucose into ATP, a small molecule they can use to do work.\n\n## The big picture\n\n**Glucose + oxygen → carbon dioxide + water + usable energy**\n\n1. **Glycolysis** splits glucose in the cytoplasm. It produces a small amount of ATP and supplies molecules for the next stages.\n2. **The citric acid cycle** runs in the mitochondrial matrix. It releases carbon dioxide and loads electron carriers.\n3. **Oxidative phosphorylation** uses an electron transport chain and a proton gradient to make most of the ATP. Oxygen is the final electron acceptor.\n\n## Remember this\n\nThe mitochondrion does not create energy from nothing. It transfers chemical energy into a form the cell can use.\n\n## Check your understanding\n\nWhy does a cell need oxygen even though glycolysis itself does not use oxygen?' },
      { id: 'cards-cell-energy', kind: 'flashcards', title: 'Cell energy essentials', subject: 'Biology', color: '#8ba788', description: 'Six small ideas. One stronger memory.', createdAt: now, updatedAt: now, cards: [
        { id: 'card-1', front: 'What is the main energy currency of a cell?', back: 'ATP', hint: 'Three letters.' },
        { id: 'card-2', front: 'Where does glycolysis occur?', back: 'The cytoplasm' },
        { id: 'card-3', front: 'Where does the citric acid cycle occur in eukaryotic cells?', back: 'The mitochondrial matrix' },
        { id: 'card-4', front: 'What is the final electron acceptor in aerobic respiration?', back: 'Oxygen' },
        { id: 'card-5', front: 'What drives ATP synthase?', back: 'A proton gradient across the inner mitochondrial membrane' },
        { id: 'card-6', front: 'Which stage produces most ATP in aerobic respiration?', back: 'Oxidative phosphorylation' },
      ] },
      { id: 'quiz-cell-energy', kind: 'quiz', title: 'A quick energy check', subject: 'Biology', color: '#8ba788', description: 'A five-question check-in before your next lecture.', createdAt: now, updatedAt: now, questions: [
        { id: 'q1', prompt: 'Where does glycolysis take place?', options: ['Nucleus', 'Cytoplasm', 'Mitochondrial matrix', 'Cell membrane'], correctIndex: 1, explanation: 'Glycolysis occurs in the cytoplasm.' },
        { id: 'q2', prompt: 'What is the final electron acceptor in aerobic respiration?', options: ['Carbon dioxide', 'Glucose', 'Oxygen', 'ATP'], correctIndex: 2, explanation: 'Oxygen accepts electrons and combines with protons to form water.' },
        { id: 'q3', prompt: 'Which stage normally makes most ATP?', options: ['Glycolysis', 'Oxidative phosphorylation', 'The citric acid cycle', 'Glucose transport'], correctIndex: 1, explanation: 'The electron transport chain establishes a gradient that powers ATP synthase.' },
        { id: 'q4', prompt: 'What small molecule is the cell’s main energy currency?', answer: 'ATP', acceptedAnswers: ['adenosine triphosphate'], explanation: 'ATP transfers energy to many cellular processes.' },
        { id: 'q5', prompt: 'What crosses the inner mitochondrial membrane to power ATP synthase?', options: ['Protons', 'Glucose molecules', 'DNA', 'Carbon dioxide'], correctIndex: 0, explanation: 'Protons flow down their electrochemical gradient through ATP synthase.' },
      ] },
      { id: 'note-learning', kind: 'note', title: 'Learn it. Leave it. Recall it.', subject: 'Study skills', color: '#c498af', description: 'A small guide to active recall and spacing.', createdAt: now, updatedAt: now, content: '# A kinder way to remember\n\nReading feels familiar. Remembering takes practice.\n\n## Active recall\n\nClose your notes and explain an idea from memory. Check what you missed, then try again.\n\n## Spaced practice\n\nReturn to an idea over several days. A short review tomorrow often helps more than another long review tonight.\n\n## Your next small step\n\nPick one concept, make three flashcards, and take a five-minute break.' },
    ],
    progress: [],
    reviews: {},
    focusSessions: [],
    roomProgress: {},
    plan: { tasks: [
      { id: 'task-1', title: 'Review cell energy flashcards', subject: 'Biology', done: false },
      { id: 'task-2', title: 'Try a five-question check-in', subject: 'Biology', done: false },
      { id: 'task-3', title: 'Make room for a focused 25 minutes', subject: 'Study skills', done: false },
    ] },
    stats: { xp: 0, level: 1, streak: 0, focusMinutes: 0 },
    updatedAt: now,
  };
}
