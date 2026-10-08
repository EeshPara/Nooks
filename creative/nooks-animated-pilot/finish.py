"""Restrict generated motion to scene geometry and close each loop without reversal."""
from pathlib import Path
import json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUTPUT=ROOT/'web/ui/public/videos/nooks-animated-pilot'
W,H=1280,720
S=W/1672
CONFIG={
 'rainy-library': {'polygons':[
  ([(435,0),(514,0),(514,586),(435,568)],170),
  ([(541,0),(650,0),(650,607),(541,588)],170),
  ([(682,0),(920,0),(920,628),(682,608)],170),
  ([(946,0),(1285,0),(1285,654),(946,630)],170),
  ([(1317,0),(1451,0),(1451,660),(1317,653)],170)],
  'ellipses':[((127,628,196,718),60),((225,474,286,504),28),((1623,419,1671,487),25)]},
 'howls-moving-study': {'polygons':[], 'ellipses':[
  ((824,432,883,497),220),((941,565,1060,613),180),((429,654,503,758),55),((575,53,620,134),28)]},
 'gryffindor-common-room':{'polygons':[
  ([(265,387),(418,376),(472,476),(469,554),(270,580)],210)],
  'ellipses':[((678,520,783,567),180),((1220,228,1247,281),100),((1565,156,1597,210),100),((1428,346,1457,379),60)]}
}

def run(name):
 p=HERE/name
 source=ROOT/'web/ui/public/images/nooks-50'/f'{name}.webp'
 Image.open(source).convert('RGB').resize((W,H), Image.Resampling.LANCZOS).save(p/'poster.png')
 mask=Image.new('L',(W,H),0); draw=ImageDraw.Draw(mask)
 for points,opacity in CONFIG[name]['polygons']:
  draw.polygon([(round(x*S),round(y*S)) for x,y in points],fill=opacity)
 for box,opacity in CONFIG[name]['ellipses']:
  draw.ellipse(tuple(round(n*S) for n in box),fill=opacity)
 mask=mask.filter(ImageFilter.GaussianBlur(5))
 mask.save(p/'motion-mask.png')
 graph=(
  '[0:v]scale=1280:720,setsar=1,fps=24,trim=end=8,setpts=PTS-STARTPTS,format=yuv420p,split=2[full][head];'
  '[head]trim=end=1,setpts=PTS-STARTPTS[h];'
  '[full][h]xfade=transition=fade:duration=0.958333333:offset=7,trim=start=1:end=8,setpts=PTS-STARTPTS,format=rgba[motion];'
  '[1:v]format=rgba[still];[2:v]format=gray[mask];'
  '[motion][mask]alphamerge[animated];[still][animated]overlay=shortest=1:format=auto,format=yuv420p[out]')
 target=OUTPUT/f'{name}.mp4'
 subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(p/'generated.mp4'),'-loop','1','-framerate','24','-i',str(p/'poster.png'),'-loop','1','-framerate','24','-i',str(p/'motion-mask.png'),'-filter_complex',graph,'-map','[out]','-an','-t','7','-r','24','-c:v','libx264','-preset','slow','-crf','14','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
 print(name, target.stat().st_size, flush=True)

if __name__=='__main__':
 import sys
 for name in sys.argv[1:] or CONFIG: run(name)
