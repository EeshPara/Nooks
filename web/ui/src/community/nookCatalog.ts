import { allRoomScenes, roomScenes, type RoomScene } from '../personalization/types';

export interface PublicNook {
  id: string;
  title: string;
  scene: RoomScene;
  description: string;
  audiences: string[];
  studyingNow: number;
  owner: { name: string; handle: string; isCreator: boolean };
}

export interface NookDraft {
  id: string;
  name: string;
  description: string;
  sceneId: string;
  visibility: 'public' | 'private';
  createdAt: string;
}

// Community activity is illustrative, stable demo data, never live presence.
const descriptions: Record<string, [string, string[], number, string?]> = {
  'rainy-library': ['A lamp, a stack of books, and company for one more chapter. Settle in for quiet reading and long stretches of focus.', ['Book lovers', 'Exam season', 'Night owls'], 128],
  'midnight-train': ['The countryside slips by while you make a little progress. A late-night carriage for people with big deadlines and very good playlists.', ['Night owls', 'Writers', 'Deep work'], 86, 'Sana'],
  'sakura-garden': ['A gentle place to begin again. Take your time among the petals, with a community that celebrates showing up.', ['Gentle focus', 'Language learners', 'Early birds'], 164, 'Mina'],
  'seaside-studio': ['Open the windows and start with one small task. Bright mornings, ocean air, and a shared table for fresh ideas.', ['Early birds', 'Design students', 'Creative work'], 72],
  'alpine-cabin': ['Snow outside, a fire inside, and nowhere you need to rush. A quiet retreat for the kind of work that needs a whole afternoon.', ['Deep work', 'Research', 'Winter people'], 49],
  'autumn-bookshop': ['A corner between old shelves and a rainy window. Come for your reading list; stay for the warm, unhurried company.', ['Book lovers', 'Humanities', 'Writing'], 112],
  'moonlit-observatory': ['Stay curious under an enormous sky. Join other question-askers for problem sets, research, and the occasional midnight breakthrough.', ['STEM', 'Research', 'Night owls'], 68],
  'sunlit-greenhouse': ['Grow something while you learn something. A sunny nook for steady routines and people who like watching their effort take root.', ['Plant people', 'Biology', 'Daily habits'], 203, 'Mina'],
  'neon-tokyo': ['The city is awake with you. Find your rhythm above the neon for coding sessions, revision, and one last page before bed.', ['Night owls', 'Coding', 'Anime fans'], 248, 'Jun'],
  'paris-attic': ['First coffee, soft light, and a rooftop view. A little corner for sketchbooks, language practice, and ambitious morning plans.', ['Language learners', 'Art students', 'Early birds'], 97],
  'kyoto-teahouse': ['Let the rain set the pace. Share a quiet table with people practicing patience, languages, and the art of doing one thing at a time.', ['Language learners', 'Gentle focus', 'Tea lovers'], 139, 'Jun'],
  'brooklyn-loft': ['Put a record on and get comfortable. A shared Sunday feeling for creative projects, side quests, and work worth making.', ['Creative work', 'Design students', 'Music lovers'], 117, 'Leo'],
  'cloud-bedroom': ['A soft landing for your study day. Bring your pastel stationery, your flashcards, and whatever you are figuring out.', ['Cozy study', 'Flashcard people', 'Gentle focus'], 156, 'Mina'],
  'oxford-library': ['A little academic ambition, a lot of very old books. Quiet company for essays, exam prep, and the reading you finally want to finish.', ['Humanities', 'Exam season', 'Research'], 184],
  'lighthouse-study': ['A small light at the edge of the sea. Find a steady place to think, write, and finish things with other independent minds.', ['Writers', 'Deep work', 'Ocean people'], 34],
  'tropical-veranda': ['Rain on palm leaves and plenty of time to think. A sheltered corner for slow mornings and one focused session at a time.', ['Gentle focus', 'Remote study', 'Rain lovers'], 63],
  'mossy-watermill': ['Follow the stream to a little wooden desk. A storybook escape for reading, sketching, and growing a calmer study habit.', ['Book lovers', 'Creative work', 'Nature people'], 91],
  'aurora-cabin': ['When your deadline keeps you up, the sky keeps you company. A northern hideaway for quiet nights and thoughtful work.', ['Night owls', 'Deep work', 'Winter people'], 52],
  'autumn-camper': ['Take the scenic route through your to-do list. A traveling nook for curious people, personal projects, and a change of perspective.', ['Creative work', 'Anime fans', 'Independent study'], 41],
  'ricefield-porch': ['Late summer stretches out beyond the porch. Join an easygoing study circle for homework, language practice, and everyday progress.', ['Anime fans', 'Language learners', 'Gentle focus'], 123],
  'lakeside-boathouse': ['A watercolor afternoon beside still water. Bring a notebook and share a little peace with people making space to learn.', ['Art students', 'Nature people', 'Reading'], 38],
  'castle-study': ['Your studies, with a little magic. Collect curious keepsakes as you work through chapters, quests, and real-life exams.', ['Fantasy fans', 'Exam season', 'Book lovers'], 221, 'Sana'],
  'desert-casita': ['Warm walls, wide skies, and a clear desk. Find your afternoon rhythm alongside makers and early-evening studiers.', ['Design students', 'Creative work', 'Deep work'], 27],
  'underwater-study': ['Leave the noisy world at the surface. A blue, dreamlike refuge for intense focus and people who think a little differently.', ['STEM', 'Deep work', 'Ocean people'], 108],
  'floating-airship': ['A desk above the clouds and somewhere new to go. Bring your imagination and give your next project a little altitude.', ['Fantasy fans', 'Creative work', 'Writers'], 77],
  'moon-base': ['Earth looks peaceful from here. Join the night shift for problem-solving, coding, and the next small step toward something big.', ['STEM', 'Coding', 'Space lovers'], 145],
  'woodland-treehouse': ['A little hideout high in the canopy. Share the quiet with nature lovers, paper notebooks, and a growing collection of discoveries.', ['Nature people', 'Book lovers', 'Gentle focus'], 176],
  'lavender-cottage': ['An afternoon painted in lavender. A gentle place for journaling, studying, and making a little more time for yourself.', ['Art students', 'Gentle focus', 'Journaling'], 82],
  'canal-apartment': ['Bikes outside, rain on the canal, and your desk by the window. A cozy meeting place for languages, essays, and late afternoon focus.', ['Language learners', 'Humanities', 'Rain lovers'], 93],
  'night-campus': ['The library is still open. Join the pixel night shift, stack up study sessions, and turn your next deadline into a small victory.', ['Gamers', 'Coding', 'Exam season'], 197, 'Leo'],
  'mosslight-dungeon': ['Every study session is a little expedition. Explore a candlelit hideaway, collect runes, and uncover what is waiting deeper inside.', ['Fantasy fans', 'Gamers', 'Deep work'], 132],
};

const creators: Record<string, PublicNook['owner']> = {
  Mina: { name: 'Mina studies', handle: '@minastudies', isCreator: true },
  Sana: { name: 'After hours with Sana', handle: '@sana.afterhours', isCreator: true },
  Jun: { name: 'Tea with Jun', handle: '@teawithjun', isCreator: true },
  Leo: { name: 'Leo makes things', handle: '@leomakes', isCreator: true },
};

export const allPublicNooks: PublicNook[] = allRoomScenes.map(scene => {
  const [description, audiences, studyingNow, creator] = descriptions[scene.id] ?? [scene.caption, [scene.collection ?? 'Cozy study', 'Study together'], 24];
  return {
    id: scene.id,
    title: scene.title,
    scene,
    description,
    audiences,
    studyingNow,
    owner: creator ? creators[creator] : { name: 'Nooks', handle: '@nooks', isCreator: false },
  };
});

export const publicNooks = roomScenes.map(scene => allPublicNooks.find(nook => nook.id === scene.id)!);

export function getPublicNook(id: string): PublicNook | undefined {
  return allPublicNooks.find(nook => nook.id === id);
}
