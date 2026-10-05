from pathlib import Path
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
p=Path(__file__).parent
# Restrict generative motion to glass and warm practical lights. All furniture stays in the source still.
mask=Image.new('L',(1280,720),0)
d=ImageDraw.Draw(mask)
d.polygon([(190,0),(750,0),(907,141),(907,355),(817,384),(631,401),(453,409),(244,385)],fill=166)
for box in [(714,337,804,403),(941,168,997,223),(1048,181,1094,227),(63,245,202,323)]: d.ellipse(box,fill=80)
mask=mask.filter(ImageFilter.GaussianBlur(8))
a=np.array(mask,dtype=float)
# The model overdid the steam. Remove its broad plume and reveal only a small, translucent base wisp.
y,x=np.mgrid[:720,:1280]
left=np.clip((x-280)/35,0,1); right=np.clip((625-x)/35,0,1)
plume=left*right*np.clip((466-y)/30,0,1)
a*=1-plume
steam=43*np.exp(-((x-447)/24)**2)*np.clip((y-376)/60,0,1)*np.clip((445-y)/9,0,1)
a=np.maximum(a,steam)
Image.fromarray(a.astype('uint8')).save(p/'motion-mask.png')
# A cyclic overlap joins tail to head while keeping rain travelling forwards.
graph=(
 '[0:v]trim=end=8,setpts=PTS-STARTPTS,split=2[full][head];'
 '[head]trim=end=0.8,setpts=PTS-STARTPTS[h];'
 '[full][h]xfade=transition=fade:duration=0.8:offset=7.2,trim=start=0.8:end=8,setpts=PTS-STARTPTS[motion];'
 '[1:v]scale=1280:720,setsar=1,format=yuv420p[still];'
 '[2:v]format=gray[mask];'
 '[still][motion][mask]maskedmerge,format=yuv420p[out]')
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(p/'generated-8s.mp4'),'-loop','1','-framerate','24','-i',str(p/'static-plate.png'),'-loop','1','-framerate','24','-i',str(p/'motion-mask.png'),'-filter_complex',graph,'-map','[out]','-an','-t','7.2','-r','24','-c:v','libx264','-preset','slow','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(p/'rainy-library-loop-v1.mp4')],check=True)
print('Loop optimized:',p.joinpath('rainy-library-loop-v1.mp4').stat().st_size)
