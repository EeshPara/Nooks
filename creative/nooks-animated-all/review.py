"""Full decode, loop-seam/frame-motion QA, contact sheets and explicit review publication."""
import argparse,json,subprocess,shutil
import numpy as np
from PIL import Image,ImageDraw,ImageOps
from pipeline import HERE,ROOT,PUBLIC,JOBS,SPECS,save,sha,source

def review(name):
 p=JOBS/name;video=p/'finished.mp4'
 if not video.exists():return
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-f','rawvideo','-pix_fmt','rgb24','-'])
 frames=np.frombuffer(data,dtype=np.uint8).reshape(-1,720,1280,3);mask=np.array(Image.open(p/'motion-mask.png'))>4
 changes=[];inside=[];outside=[]
 for a,b in zip(frames[:-1],frames[1:]):
  d=np.abs(b.astype(np.int16)-a.astype(np.int16)).mean(axis=2);changes.append(float(d.mean()));inside.append(float(d[mask].mean()));outside.append(float(d[~mask].mean()))
 seam=float(np.abs(frames[-1].astype(np.int16)-frames[0].astype(np.int16)).mean())
 brightness=float(np.abs(np.diff(frames.mean(axis=(1,2,3)))).max());typical=float(np.mean(changes))
 qa={'durationSeconds':float(meta['format']['duration']),'frames':len(frames),'width':1280,'height':720,'fps':24,'audioTracks':sum(x['codec_type']=='audio' for x in meta['streams']),'bytes':video.stat().st_size,'frameChangeMean':typical,'seamChangeMean':seam,'seamVsTypical':seam/max(.0001,typical),'insideMaskChange':float(np.mean(inside)),'outsideMaskChange':float(np.mean(outside)),'peakBrightnessChange':brightness,'motionMaskCoverage':float(mask.mean()),'videoSha256':sha(video),'sourceArtworkSha256':sha(source(name))}
 qa['technicalPass']=qa['audioTracks']==0 and qa['outsideMaskChange']<.12 and brightness<.8 and qa['seamVsTypical']<4 and qa['insideMaskChange']>.006
 save(p/'qa.json',qa)
 canvas=Image.new('RGB',(1200,1014));draw=ImageDraw.Draw(canvas)
 ys,xs=np.where(mask);box=(max(0,int(xs.min())-20),max(0,int(ys.min())-20),min(1280,int(xs.max())+20),min(720,int(ys.max())+20))
 for row,idx in enumerate([0,len(frames)//2,len(frames)-1]):
  im=Image.fromarray(frames[idx]);canvas.paste(im.resize((600,338)),(0,row*338));canvas.paste(ImageOps.pad(im.crop(box),(600,338),color='#161616'),(600,row*338));draw.text((6,row*338+6),f'{name}: frame {idx}',fill='white')
 canvas.save(p/'review-contact.jpg',quality=92)
 # Difference visibility: exaggerate only for diagnostic inspection, never shipped.
 diff=np.abs(frames[len(frames)//2].astype(np.int16)-frames[0].astype(np.int16));Image.fromarray(np.minimum(diff*10,255).astype('uint8')).save(p/'motion-difference.png')
 print(name,json.dumps(qa),flush=True);return qa

def publish(names,reviewer):
 manifest_path=HERE/'manifest.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'provider':'Higgsfield','model':'seedance1_5','clips':[]}
 mapping_path=ROOT/'web/ui/src/world/nookFilms.json';mapping=json.loads(mapping_path.read_text())
 for name in names:
  p=JOBS/name;qa=json.loads((p/'qa.json').read_text());video=p/'finished.mp4'
  assert qa['technicalPass'],f'{name}: technical QA failed'
  assert qa['videoSha256']==sha(video) and qa['sourceArtworkSha256']==sha(source(name)),f'{name}: reviewed bytes changed'
  target=PUBLIC/'videos/nooks-animated-all'/f'{name}.mp4';target.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(video,target)
  clip={'roomId':name,'image':f'/images/nooks-50/{name}.webp','video':f'/videos/nooks-animated-all/{name}.mp4','qa':qa,'motionRegions':[r['label'] for r in SPECS[name][1] if r['alpha']>0],'visualReview':reviewer}
  job=json.loads((p/'job.json').read_text());job=job[0] if isinstance(job,list) else job
  clip.update(providerJobId=job['id'],generatedDurationSeconds=json.loads((p/'spec.json').read_text())['duration'])
  manifest['clips']=[c for c in manifest['clips'] if c['roomId']!=name]+[clip];mapping[name]={'image':clip['image'],'video':clip['video']}
 save(manifest_path,manifest);save(mapping_path,mapping)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--ids',nargs='*');ap.add_argument('--publish-reviewed',action='store_true');ap.add_argument('--reviewer');args=ap.parse_args();names=args.ids or list(SPECS)
 if args.publish_reviewed:
  assert args.ids and args.reviewer,'Explicit scene IDs and reviewer evidence required';publish(names,args.reviewer)
 else:
  for name in names:review(name)
