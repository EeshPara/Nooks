/** Only use motion made from the exact selected artwork; custom nooks keep their own art. */
const films:Record<string,{image:string;video:string}>={
 'rainy-library':{image:'/images/nooks-50/rainy-library.webp',video:'/videos/nooks-animated-pilot/rainy-library.mp4'},
 'howls-moving-study':{image:'/images/nooks-50/howls-moving-study.webp',video:'/videos/nooks-animated-pilot/howls-moving-study.mp4'},
 'gryffindor-common-room':{image:'/images/nooks-50/gryffindor-common-room.webp',video:'/videos/nooks-animated-pilot/gryffindor-common-room.mp4'},
};
export function nookAnimation({workspaceReady,roomId,sceneImage,customArtwork,alternateScene,customNook}:{workspaceReady:boolean;roomId:string;sceneImage:string;customArtwork:boolean;alternateScene:boolean;customNook:boolean}):string|undefined {
 if(!workspaceReady||customArtwork||alternateScene||customNook)return;
 const film=films[roomId];return film?.image===sceneImage?film.video:undefined;
}
