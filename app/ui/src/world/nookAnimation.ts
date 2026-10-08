import approvedFilms from './nookFilms.json';

/** The manifest contains reviewed clips made from each exact selected artwork. */
const films: Readonly<Record<string, { image: string; video: string }>> = approvedFilms;

export function nookAnimation({workspaceReady,roomId,sceneImage,customArtwork,alternateScene,customNook}:{workspaceReady:boolean;roomId:string;sceneImage:string;customArtwork:boolean;alternateScene:boolean;customNook:boolean}):string|undefined {
 if(!workspaceReady||customArtwork||alternateScene||customNook)return;
 const film=Object.hasOwn(films,roomId)?films[roomId]:undefined;
 return film?.image===sceneImage?film.video:undefined;
}
