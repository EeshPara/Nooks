import { BrowserPreviewStore } from './browser-store.mjs';
import { createPreviewTools } from './browser-tools.mjs';

/** Reuse the real study engine, without opening IndexedDB or contacting a service. */
export function createTutorialTools(seed) {
 class MemoryStore extends BrowserPreviewStore {
  constructor(){super();this.value={...this.empty(),...structuredClone(seed),version:1,backend:'browser-preview',shares:[]};}
  async load(){return structuredClone(this.value);}
  async commit(expectedRevision,next){if(this.value.revision!==expectedRevision)return false;this.value=structuredClone(next);return true;}
 }
 const call=createPreviewTools({store:new MemoryStore()});
 return async (name,args={})=>{
  if(name.startsWith('nook_artwork_')||name.startsWith('nook_publish_'))throw new Error('Artwork generation and publishing are available after the tour. Nothing in practice is saved.');
  return call(name,args);
 };
}
