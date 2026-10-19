from pathlib import Path
import subprocess,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path.cwd();OUT=ROOT/'creative/nooks-release/scene-reviews';JOBS=ROOT/'creative/nooks-animated-all/jobs'
regions={
'cyberpunk-rain-loft':{'central-rain':(500,0,650,330),'right-rain':(740,0,960,290),'canal':(550,325,955,455)},
'secret-door-study':{'steam':(195,400,305,565)}}
metrics={}
for name,boxes in regions.items():
 p=JOBS/name;video=p/'finished.mp4';sha=hashlib.sha256(video.read_bytes()).hexdigest();qa=json.loads((p/'qa.json').read_text());assert sha==qa['videoSha256']
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-f','rawvideo','-pix_fmt','rgb24','-']);frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,720,1280,3)
 source=Image.open(ROOT/f'web/ui/public/images/nooks-50/{name}.webp').convert('RGB').resize((1280,720),Image.Resampling.LANCZOS)
 mask=np.asarray(Image.open(p/'motion-mask.png'))>4;changes=[];inside=[];outside=[]
 for a,b in zip(frames[:-1],frames[1:]):
  d=np.abs(b.astype(np.int16)-a.astype(np.int16)).mean(axis=2);changes.append(float(d.mean()));inside.append(float(d[mask].mean()));outside.append(float(d[~mask].mean()))
 seam=float(np.abs(frames[-1].astype(np.int16)-frames[0].astype(np.int16)).mean());typical=float(np.mean(changes));peak=float(np.abs(np.diff(frames.mean(axis=(1,2,3)))).max())
 row={'videoSha256':sha,'frames':len(frames),'durationSeconds':float(meta['format']['duration']),'audioTracks':sum(s['codec_type']=='audio' for s in meta['streams']),'meanFrameChange':typical,'seamChange':seam,'seamVsTypical':seam/max(.0001,typical),'insideMaskChange':float(np.mean(inside)),'outsideMaskChange':float(np.mean(outside)),'peakBrightnessChange':peak,'qaMatchesVideo':True,'cropMetrics':{},'evidence':[]}
 for label,box in boxes.items():
  x1,y1,x2,y2=box;crops=frames[:,y1:y2,x1:x2];area=crops.mean(axis=(1,2,3));iMin=int(area.argmin());iMax=int(area.argmax());row['cropMetrics'][label]={'box':box,'minBrightnessFrame':iMin,'maxBrightnessFrame':iMax,'brightnessRange':float(np.ptp(area)),'maxPixelRange':int(np.ptp(crops,axis=0).max())}
  ids=[0,12,24,36,48,60,72,83];w=x2-x1;h=y2-y1
  for kind,entries in [('motion',[(str(i),Image.fromarray(frames[i]).crop(box)) for i in ids]),('source-seam',[('source',source.crop(box))]+[(str(i),Image.fromarray(frames[i]).crop(box)) for i in [iMin,iMax,82,83,0,1]])]:
   scale=2 if w<150 else 1;ww=w*scale;hh=h*scale;cols=min(4,len(entries));rows=(len(entries)+cols-1)//cols
   sheet=Image.new('RGB',(ww*cols,(hh+24)*rows),'#151515');draw=ImageDraw.Draw(sheet)
   for j,(txt,im) in enumerate(entries):
    x=(j%cols)*ww;y=(j//cols)*(hh+24);sheet.paste(im.resize((ww,hh)),(x,y+24));draw.text((x+3,y+4),f'{label}: {txt}',fill='white')
   dest=OUT/f'20-{name}-{label}-{kind}.png';sheet.save(dest);row['evidence'].append(str(dest.relative_to(ROOT)))
 assert sha==hashlib.sha256(video.read_bytes()).hexdigest();metrics[name]=row;print(name,sha,row['seamVsTypical'],flush=True)
(OUT/'20-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
