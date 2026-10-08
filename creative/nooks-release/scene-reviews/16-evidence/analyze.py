from pathlib import Path
import subprocess,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path.cwd();out=ROOT/'creative/nooks-release/scene-reviews/16-evidence';result={}
for name,box in [('frog-pond-studio',(470,275,830,430)),('kuromi-midnight-desk',(980,440,1120,580))]:
 p=ROOT/'creative/nooks-animated-all/jobs'/name;v=p/'finished.mp4';sha=hashlib.sha256(v.read_bytes()).hexdigest()
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(v),'-pix_fmt','rgb24','-f','rawvideo','-']);f=np.frombuffer(raw,np.uint8).reshape(-1,720,1280,3)
 mask=np.asarray(Image.open(p/'motion-mask.png'))>4;change=[];inside=[];outside=[]
 for a,b in zip(f[:-1],f[1:]):
  d=np.abs(a.astype(np.int16)-b.astype(np.int16)).mean(axis=2);change.append(float(d.mean()));inside.append(float(d[mask].mean()));outside.append(float(d[~mask].mean()))
 seam=float(np.abs(f[-1].astype(np.int16)-f[0].astype(np.int16)).mean());qa=json.loads((p/'qa.json').read_text())
 result[name]={'videoSha256':sha,'frames':len(f),'meanFrameChange':float(np.mean(change)),'seamChange':seam,'seamVsTypical':seam/np.mean(change),'insideMaskChange':float(np.mean(inside)),'outsideMaskChange':float(np.mean(outside)),'peakBrightnessChange':float(np.abs(np.diff(f.mean(axis=(1,2,3)))).max()),'qaMatchesVideo':qa['videoSha256']==sha}
 src=Image.open(ROOT/'web/ui/public/images/nooks-50'/f'{name}.webp').convert('RGB').resize((1280,720),Image.Resampling.LANCZOS)
 for label,indices in [('motion',[0,12,24,36,48,60,72,83]),('seam',[82,83,0,1]),('source-compare',['source',0,24,42,60,83])]:
  w=box[2]-box[0];h=box[3]-box[1];cols=2;canvas=Image.new('RGB',(cols*w,((len(indices)+1)//2)*(h+22)),(15,15,15));draw=ImageDraw.Draw(canvas)
  for n,i in enumerate(indices):
   im=src if i=='source' else Image.fromarray(f[i]);x=n%cols*w;y=n//cols*(h+22);canvas.paste(im.crop(box),(x,y+22));draw.text((x+4,y+4),str(i),fill='white')
  canvas.save(out/f'{name}-{label}.png')
 assert sha==hashlib.sha256(v.read_bytes()).hexdigest()
(out/'metrics.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
