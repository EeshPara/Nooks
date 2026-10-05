from pathlib import Path
import subprocess, json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
video=ROOT/'generated-8s.mp4'
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-vf','scale=640:360','-f','rawvideo','-pix_fmt','rgb24','-'])
frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,360,640,3)
f=frames.astype(np.float32)
regions={
 'all':(0,0,640,360),
 'desk_and_chair':(50,264,362,354),
 'right_books':(540,15,633,195),
 'cat_and_cushion':(508,246,635,317),
 'far_city':(297,63,443,153),
 'steam_plume':(140,0,290,220),
}
stats={}
def alignment(a,b):
 # Report the integer offset that minimizes brightness-normalized structure difference.
 ag=a.mean(axis=2); bg=b.mean(axis=2)
 best=None
 for y in range(-3,4):
  for x in range(-3,4):
   aa=ag[4:-4,4:-4]
   bb=bg[4+y:bg.shape[0]-4+y,4+x:bg.shape[1]-4+x]
   delta=(bb-bb.mean())-(aa-aa.mean())
   score=float(np.abs(delta).mean())
   if best is None or score<best['error']:best={'offset_640px':[x,y],'error':score}
 return best
for name,(x1,y1,x2,y2) in regions.items():
 r=f[:,y1:y2,x1:x2]
 adjacent=np.abs(np.diff(r,axis=0)).mean(axis=(1,2,3))
 seam=float(np.abs(r[-1]-r[0]).mean())
 stats[name]={
  'bounds_640px':[x1,y1,x2,y2],
  'adjacent_mean_mae_255':float(adjacent.mean()),
  'adjacent_p95_mae_255':float(np.quantile(adjacent,.95)),
  'first_last_seam_mae_255':seam,
  'seam_over_adjacent_p95':seam/max(float(np.quantile(adjacent,.95)),.0001),
  'best_first_last_alignment':alignment(r[0],r[-1]),
  'max_first_frame_drift_mae_255':float(np.abs(r-r[0]).mean(axis=(1,2,3)).max()),
 }
report={'video':str(video),'frames':len(frames),'fps':24,'duration':len(frames)/24,'measurement_dimensions':[640,360],'regions':stats}
(ROOT/'review/source-motion-metrics.json').write_text(json.dumps(report,indent=2))
for idx in [0,48,96,144,len(frames)-1]:
 Image.fromarray(frames[idx]).save(ROOT/f'review/frame-{idx:03d}.png')
canvas=Image.new('RGB',(1280,440),(20,20,20)); d=ImageDraw.Draw(canvas)
canvas.paste(Image.fromarray(frames[0]),(0,25));canvas.paste(Image.fromarray(frames[-1]),(640,25))
d.text((12,6),'First frame',(255,255,255));d.text((652,6),'Last frame',(255,255,255))
for name,(x1,y1,x2,y2) in regions.items():
 if name in ['desk_and_chair','right_books','cat_and_cushion']:
  for ox in [0,640]:d.rectangle((ox+x1,y1+25,ox+x2,y2+25),outline=(200,230,180),width=1)
d.text((12,400),'Boxes: static geometry alignment measured separately from steam, rain, and lamp movement.',(235,235,235))
canvas.save(ROOT/'review/source-seam-comparison.jpg',quality=92)
print(json.dumps(report,indent=2))
