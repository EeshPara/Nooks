import type { Artifact } from './types';

type MaterialPage = { artifact?: Artifact; offset?: number; nextOffset?: number | null };
/** Read all pages of one revision; never feed an excerpt to generation as a full source. */
export async function readCompleteMaterial(id: string, read: (id: string, offset: number) => Promise<MaterialPage>): Promise<Artifact> {
  let offset = 0;
  let complete: Artifact | undefined;
  for (let page = 0; page < 24; page++) {
    const result = await read(id, offset);
    const item = result.artifact;
    if (!item || item.id !== id) throw new Error('This material could not be opened. Choose it again.');
    if (complete && (complete.revision !== item.revision || complete.kind !== item.kind)) throw new Error('This material changed while loading. Try again for the latest version.');
    if (result.offset !== undefined && result.offset !== offset) throw new Error('This material returned an incomplete page. Please retry.');
    if (!complete) complete = { ...item, content: '', cards: [], questions: [] };
    let length: number;
    if (item.kind === 'note') {
      if (typeof item.content !== 'string') throw new Error('The note text is unavailable. Please retry.');
      complete.content += item.content; length = item.content.length;
    } else if (item.kind === 'flashcards') {
      if (!Array.isArray(item.cards)) throw new Error('The flashcards are unavailable. Please retry.');
      complete.cards!.push(...item.cards); length = item.cards.length;
    } else {
      if (!Array.isArray(item.questions)) throw new Error('The questions are unavailable. Please retry.');
      complete.questions!.push(...item.questions); length = item.questions.length;
    }
    if (JSON.stringify(complete).length > 300_000) throw new Error('This item is too large for one request. Paste the passage you want to study.');
    if (result.nextOffset == null) return complete;
    if (!length || result.nextOffset !== offset + length) throw new Error('This material returned an incomplete page. Please retry.');
    offset = result.nextOffset;
  }
  throw new Error('This item has too many pages for one request. Choose a smaller passage.');
}
