"""Source/candidate crops and temporal rigidity measurements for pilot corrections."""
import sys,subprocess,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'creative/nooks-release'
JOBS=ROOT/'creative/nooks-animated-all/jobs'
CROPS={
 'rainy-library':{'steam':(85,475,165,558),'skyline':(405,240,680,480)},
 'howls-moving-study':{'steam':(315,490,395,585),'stove':(618,317,691,393),'cat':(715,425,825,475),'lantern':(425,25,481,100)},
 'gryffindor-common-room':{'upper-fire':(212,280,344,375),'screen':(176,370,438,450),'left-post':(178,334,219,428),'right-post':(405,336,435,439),'left-candle':(929,171,958,225),'right-candle':(1190,110,1237,175),'cat':(511,390,605,440)}
}
reports=[]
for name,regions in CROPS.items():
 p=JOBS/name
 frames=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p/'finished.mp4'),'-f','rawvideo','-pix_fmt','rgb24','-']),np.uint8).reshape(-1,720,1280,3)
 source=Image.open(p/'poster.png').convert('RGB'); result={'sceneId':name,'regions':{}}
 for label,box in regions.items():
  x,y,X,Y=box;w=X-x;h=Y-y
  indexes=[0,24,48,72,120,len(frames)-1]
  canvas=Image.new('RGB',(max(w,160)*4,(h+24)*2),'#202020');draw=ImageDraw.Draw(canvas)
  ims=[source.crop(box)]+[Image.fromarray(frames[i]).crop(box) for i in indexes]
  for k,im in enumerate(ims):
   xx=(k%4)*max(w,160);yy=(k//4)*(h+24);canvas.paste(im,(xx,yy+24));draw.text((xx+3,yy+3),'source' if k==0 else f'frame {indexes[k-1]}',fill='white')
  dest=OUT/f'pilot-correction-{name}-{label}.png';canvas.save(dest)
  a=frames[:,y:Y,x:X].astype(np.int16)
  result['regions'][label]={'box':box,'meanFrameChange':float(np.abs(np.diff(a,axis=0)).mean()),'maxTemporalPixelRange':int(np.ptp(a,axis=0).max()),'cropEvidence':str(dest.relative_to(ROOT))}
 reports.append(result)
(OUT/'pilot-corrections-crop-metrics.json').write_text(json.dumps(reports,indent=2)+'\n')
