import { InputError } from './errors.mjs';
import { validateProgressRoom } from './room-progress.mjs';
const integer=(value,min,max,name)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new InputError(`Invalid ${name}.`);return value;};
const object=(value,keys,name)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new InputError(`Invalid ${name}.`);return value;};
const boolean=(value,name)=>{if(typeof value!=='boolean')throw new InputError(`Invalid ${name}.`);return value;};
function ownedArtifact(workspace,artifactId){if(typeof artifactId!=='string'||artifactId.length>128)throw new InputError('Choose saved practice material.');const artifact=workspace.artifacts.find(item=>item.id===artifactId);if(!artifact)throw new InputError('This study item is not in your library.','NOT_FOUND');return artifact;}
function indices(value,length,name){if(!Array.isArray(value)||value.length>length||new Set(value).size!==value.length)throw new InputError(`Invalid ${name}.`);return value.map(item=>integer(item,0,length-1,name));}
function indexedMap(value,length,validate,name){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>length)throw new InputError(`Invalid ${name}.`);return Object.fromEntries(Object.entries(value).map(([key,item])=>{if(!/^(0|[1-9]\d*)$/.test(key))throw new InputError(`Invalid ${name}.`);const index=integer(Number(key),0,length-1,name);return[key,validate(item,index)];}));}
export function getPracticeCheckpoint(workspace,args){
 object(args,['artifactId'],'checkpoint request');const artifact=ownedArtifact(workspace,args.artifactId);const value=workspace.practiceCheckpoints?.[artifact.id];
 return {checkpoint:value&&value.artifactRevision===(artifact.revision??1)&&value.kind===artifact.kind?structuredClone(value):null};
}
export function savePracticeCheckpoint(workspace,args,now){
 object(args,['artifactId','checkpoint'],'checkpoint request');const artifact=ownedArtifact(workspace,args.artifactId);
 workspace.practiceCheckpoints??={};
 if(args.checkpoint===null){delete workspace.practiceCheckpoints[artifact.id];return{checkpoint:null};}
 const input=object(args.checkpoint,['version','kind','artifactRevision','sessionId','roomId','elapsedSeconds','state','updatedAt'],'checkpoint');
 if(input.version!==1||!['flashcards','quiz','exam'].includes(input.kind)||artifact.kind!==input.kind)throw new InputError('This practice checkpoint does not match the study material.');
 if(input.artifactRevision!==(artifact.revision??1))throw new InputError('This study material changed. Start a new practice session.','REVISION_CONFLICT');
 if(typeof input.sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sessionId))throw new InputError('Invalid practice session.');
 const elapsedSeconds=integer(input.elapsedSeconds,0,604800,'practice duration');let state;
 if(input.kind==='flashcards'){
  const length=artifact.cards.length;
  if(!length)throw new InputError('Add cards before saving a practice position.');
  const value=object(input.state,['queue','known','firstAnswers','flipped','showHint','complete','duration'],'card progress');
  state={queue:indices(value.queue,length,'card queue'),known:indices(value.known,length,'known cards'),firstAnswers:indexedMap(value.firstAnswers,length,(item)=>boolean(item,'card response'),'card responses'),flipped:boolean(value.flipped,'card flip'),showHint:boolean(value.showHint,'card hint'),complete:boolean(value.complete,'completion state'),duration:integer(value.duration,0,604800,'card duration')};
  if(new Set([...state.queue,...state.known]).size!==length || state.queue.some(index=>state.known.includes(index)) || state.complete!==(state.queue.length===0) || state.known.some(index=>!Object.hasOwn(state.firstAnswers,index)))throw new InputError('This card position is inconsistent. Start a new practice session.');
 }else{
  const length=artifact.questions.length;
  if(!length)throw new InputError('Add questions before saving a practice position.');
  const value=object(input.state,['index','answers','checked','flagged','optionOrders','stage','reviewFilter'],'quiz progress');
  if(!['questions','submit','results'].includes(value.stage)||!['all','missed'].includes(value.reviewFilter))throw new InputError('Invalid quiz stage.');
  if(!Array.isArray(value.optionOrders)||value.optionOrders.length!==length)throw new InputError('Invalid question order.');
  const optionOrders=value.optionOrders.map((order,index)=>{const count=artifact.questions[index].options?.length??0;const valid=indices(order,count,'option order');if(valid.length!==count)throw new InputError('Invalid option order.');return valid;});
  const answers=indexedMap(value.answers,length,(answer,index)=>{const count=artifact.questions[index].options?.length;if(count)return integer(answer,0,count-1,'question answer');if(typeof answer!=='string'||answer.length>2000)throw new InputError('Invalid written answer.');return answer;},'question answers');
  state={index:integer(value.index,0,length-1,'question index'),answers,checked:indexedMap(value.checked,length,item=>boolean(item,'checked answer'),'checked answers'),flagged:indexedMap(value.flagged,length,item=>boolean(item,'flagged answer'),'flagged answers'),optionOrders,stage:value.stage,reviewFilter:value.reviewFilter};
 }
 const checkpoint={version:1,kind:input.kind,artifactRevision:input.artifactRevision,sessionId:input.sessionId,...(input.roomId?{roomId:validateProgressRoom(input.roomId)}:{}),elapsedSeconds,state,updatedAt:now};
 if(JSON.stringify(checkpoint).length>250000)throw new InputError('This practice checkpoint is too large.','TOO_LARGE');
 workspace.practiceCheckpoints[artifact.id]=checkpoint;
 // Keep recent unfinished/completed practice positions bounded, independently of learning history.
 const entries=Object.entries(workspace.practiceCheckpoints).sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt));
 workspace.practiceCheckpoints=Object.fromEntries(entries.slice(0,30));
 return {checkpoint:structuredClone(checkpoint)};
}
