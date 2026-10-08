from pathlib import Path
import json, subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
RESULTS={}
for name in ['rainy-library','howls-moving-study','gryffindor-common-room']:
 p=HERE/name
 video=ROOT/'web/ui/public/videos/nooks-animated-pilot'/f'{name}.mp4'
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
 data=subprocess.check_output(['ffmpeg','-loglevel','error','-i',str(video),'-f','rawvideo','-pix_fmt','rgb24','-'])
 frames=np.frombuffer(data,dtype=np.uint8).reshape(-1,720,1280,3)
 mask=np.array(Image.open(p/'motion-mask.png'))>4
 outside=(~mask)
 means=[]; outs=[]; ins=[]
 for previous,frame in zip(frames[:-1],frames[1:]):
  diff=np.abs(frame.astype(np.int16)-previous.astype(np.int16)).mean(axis=2)
  means.append(float(diff.mean())); outs.append(float(diff[outside].mean())); ins.append(float(diff[mask].mean()))
 seam=np.abs(frames[-1].astype(np.int16)-frames[0].astype(np.int16)).mean(axis=2)
 results={'file':str(video.relative_to(ROOT)),'bytes':video.stat().st_size,'duration':float(meta['format']['duration']),'frames':len(frames),'width':1280,'height':720,'video_codec':meta['streams'][0]['codec_name'],'audio_tracks':sum(s['codec_type']=='audio' for s in meta['streams']),'frame_change_mean':float(np.mean(means)),'seam_change_mean':float(seam.mean()),'seam_vs_typical':float(seam.mean()/max(np.mean(means),0.0001)),'outside_motion_mask_temporal_change':float(np.mean(outs)),'inside_motion_mask_temporal_change':float(np.mean(ins)),'peak_frame_brightness_change':float(np.max(np.abs(np.diff(frames.mean(axis=(1,2,3))))))}
 RESULTS[name]=results
 canvas=Image.new('RGB',(1280,1080)); draw=ImageDraw.Draw(canvas)
 for row,index in enumerate([0,len(frames)//2,len(frames)-1]):
  frame=Image.fromarray(frames[index].astype('uint8'))
  canvas.paste(frame.resize((640,360)),(0,row*360))
  box={'rainy-library':(72,440,700,670),'howls-moving-study':(500,300,840,520),'gryffindor-common-room':(140,260,650,470)}[name]
  canvas.paste(frame.crop(box).resize((640,360)),(640,row*360))
  draw.text((6,row*360+6),f'Frame {index}',fill='white')
 canvas.save(p/'review-contact.jpg',quality=92)
 print(name,json.dumps(results),flush=True)
(HERE/'qa-metrics.json').write_text(json.dumps(RESULTS,indent=2))
