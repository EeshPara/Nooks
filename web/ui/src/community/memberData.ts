export interface NookMember {
  id: string;
  name: string;
  avatar: number;
  subject: string;
  status: 'focusing' | 'break';
  totalMinutes: number;
  sessionSeconds: number;
  streak: number;
  sessions: number;
  weeklyMinutes: number[];
}

export const memberAvatarNames = ['Scarf bunny', 'Amber fox', 'Capybara', 'Red panda', 'Sleepy owl', 'Moss turtle', 'Honey bear', 'Paper ghost'] as const;
export const memberAvatarCount = memberAvatarNames.length;

function nookSeed(id: string): number {
  let seed = 0;
  for (const letter of id) seed = (seed * 31 + letter.charCodeAt(0)) >>> 0;
  return seed;
}

const names = ['Mina', 'Jun', 'Sofia', 'Arlo', 'Aisha', 'Theo', 'Luna', 'Kai', 'Iris', 'Noah', 'Priya', 'Emi', 'Jules', 'Leo', 'Amara', 'Sam'];
const subjects = ['Biology & a little tea', 'One more chapter', 'Making sense of calculus', 'Finishing my thesis', 'Learning Japanese', 'Sketchbook & design notes', 'Studying for finals', 'Reading after work'];
const totalMinutes = [1842, 1268, 864, 486, 207, 127, 67, 29];

/** Stable sample profiles: never mixed with saved study progress or real presence. */
export function getNookMembers(nookId: string): NookMember[] {
  const seed = nookSeed(nookId);
  return totalMinutes.map((minutes, index) => {
    const total = minutes + seed % (index > 4 ? 8 : 39);
    const streak = index > 5 ? 1 + seed % 2 : 3 + (seed + index * 3) % 16;
    const weekBudget = Math.min(total, 190 + seed % 90);
    const weights = [2, 5, 3, 4, 2, 3, 8].map((weight, day) => day >= 7 - Math.min(streak, 7) ? weight : 0);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    return {
      id: `${nookId}-member-${index}`,
      name: names[(index + seed % names.length) % names.length],
      avatar: (index + seed % memberAvatarCount) % memberAvatarCount,
      subject: subjects[(index + seed % subjects.length) % subjects.length],
      status: index === 2 || index === 6 ? 'break' : 'focusing',
      totalMinutes: total,
      sessionSeconds: Math.min(Math.floor(total * 60 / 3), (12 + (seed + index * 13) % 39) * 60 + (seed + index * 7) % 60),
      streak,
      sessions: Math.max(streak, Math.floor(total / 32)),
      weeklyMinutes: weights.map(weight => Math.floor(weekBudget * weight / totalWeight)),
    };
  });
}

export function formatStudyTime(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  return hours ? `${hours}h ${safe % 60}m` : `${safe}m`;
}
