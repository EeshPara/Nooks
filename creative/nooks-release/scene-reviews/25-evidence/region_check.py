from pathlib import Path
import numpy as np,json,subprocess
from PIL import Image,ImageDraw
out=Path('creative/nooks-release/scene-reviews/25-evidence'); reports={}
regions={'antique-workshop':{'clock':(1196,170,1280,296),'cat':(1100,540,1230,610)},'hateno-study':{'leaves':(327,0,516,117)},'frog-pond-studio':{'open_water':(600,390,660,405),'right_pad':(728,389,799,405),'front_pad':(604,416,660,424)}}
for name,boxes in regions.items():
 path=Path('creative/nooks-animated-all/jobs')/name/'finished.mp4'
 f=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','rawvideo','-pix_fmt','rgb24','-']),np.uint8).reshape(-1,720,1280,3)
 reports[name]={}
 for label,(x1,y1,x2,y2) in boxes.items():
  crop=f[:,y1:y2,x1:x2].astype(np.int16); means=crop.mean((1,2,3))
  reports[name][label]={'meanTemporalRange':float(np.ptp(crop,axis=0).mean()),'meanBrightnessRange':float(np.ptp(means)), 'meanAdjacentChange':float(np.abs(np.diff(crop,axis=0)).mean())}
 if name=='frog-pond-studio':
  box=(470,275,830,430);src=Image.open(f'web/ui/public/images/nooks-50/{name}.webp').convert('RGB').resize((1280,720),Image.Resampling.LANCZOS);canvas=Image.new('RGB',(720,354));draw=ImageDraw.Draw(canvas)
  for n,idx in enumerate([-1,48,60,68]):
   im=src if idx==-1 else Image.fromarray(f[idx]); x=n%2*360;y=n//2*177;canvas.paste(im.crop(box),(x,y+22));draw.text((x+4,y+4),'Source' if idx==-1 else f'Frame {idx}',fill='white')
  canvas.save(out/'frog-native-correction-check.png')
(out/'region-metrics.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
