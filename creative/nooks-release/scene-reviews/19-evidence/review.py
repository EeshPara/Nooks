import json,subprocess,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
root=Path.cwd(); out=root/'creative/nooks-release/scene-reviews/19-evidence'
scenes={'sumeru-akademiya':{'waterfall':(824,246,920,362),'leaves':(1075,28,1155,157)},'mage-archive':{'fire':(1155,420,1280,558),'steam':(219,449,303,590)}}
reports={}
for name,regions in scenes.items():
 p=root/'creative/nooks-animated-all/jobs'/name; path=p/'finished.mp4'; sha=hashlib.sha256(path.read_bytes()).hexdigest()
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
 frames=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','rawvideo','-pix_fmt','rgb24','-']),np.uint8).reshape(-1,720,1280,3)
 mask=np.array(Image.open(p/'motion-mask.png'))>4
 diffs=[np.abs(b.astype(np.int16)-a.astype(np.int16)).mean(2) for a,b in zip(frames[:-1],frames[1:])]
 typical=float(np.mean([d.mean() for d in diffs]));seam=float(np.abs(frames[-1].astype(np.int16)-frames[0].astype(np.int16)).mean())
 qa=json.loads((p/'qa.json').read_text())
 reports[name]={'videoSha256':sha,'frames':len(frames),'meanFrameChange':typical,'seamChange':seam,'seamVsTypical':seam/max(.0001,typical),'insideMaskChange':float(np.mean([d[mask].mean() for d in diffs])),'outsideMaskChange':float(np.mean([d[~mask].mean() for d in diffs])),'peakBrightnessChange':float(np.abs(np.diff(frames.mean((1,2,3)))).max()),'qaMatchesVideo':sha==qa['videoSha256'],'quantitativeQa':qa,'audioTracks':sum(s['codec_type']=='audio' for s in meta['streams'])}
 source=Image.open(root/f'web/ui/public/images/nooks-50/{name}.webp').convert('RGB').resize((1280,720),Image.Resampling.LANCZOS)
 for region,box in regions.items():
  w,h=box[2]-box[0],box[3]-box[1]
  for suffix,indices,scale in [('motion',[0,12,24,36,48,60,72,83],2),('seam',[82,83,0,1],3),('source-compare',[-1,12,36,60],3)]:
   cols=4;rows=(len(indices)+3)//4;canvas=Image.new('RGB',(w*scale*cols,(h*scale+23)*rows),'#181818');draw=ImageDraw.Draw(canvas)
   for n,idx in enumerate(indices):
    im=source if idx==-1 else Image.fromarray(frames[idx]);x=(n%cols)*w*scale;y=(n//cols)*(h*scale+23)
    canvas.paste(im.crop(box).resize((w*scale,h*scale),Image.Resampling.NEAREST),(x,y+23));draw.text((x+4,y+5),'Source' if idx==-1 else f'Frame {idx}',fill='white')
   canvas.save(out/f'{name}-{region}-{suffix}.png')
 assert sha==hashlib.sha256(path.read_bytes()).hexdigest()
(out/'metrics.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
