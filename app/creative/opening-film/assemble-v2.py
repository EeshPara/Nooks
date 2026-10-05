"""Continuous two-shot flight with a plural Nooks reveal and clean library landing."""
from pathlib import Path
import json, subprocess, os
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
out = root / 'exports'
out.mkdir(exist_ok=True)
duration = 11
args = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
sources = ['01-attic-tokyo', '02-tokyo-library-continuous']
for shot in sources:
    args += ['-i', str(root / 'clips' / (shot + '.mp4'))]
args += ['-loop','1','-framerate','24','-i',str(root.parents[1] / 'ui/public/images/nooks-wordmark.png')]
args += ['-i',str(root / 'clips/05-score.m4a')]
if not (out / 'tagline-v2.png').exists():
    tagline = Image.new('RGBA', (1000, 80), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tagline)
    font = ImageFont.truetype(os.environ.get('NOOKS_FONT', 'DejaVuSans.ttf'), 46)
    draw.text((500, 40), 'Your little study nook in ChatGPT.', font=font, anchor='mm', fill=(255,246,231,255))
    tagline.save(out / 'tagline-v2.png')
args += ['-loop','1','-framerate','24','-i',str(out / 'tagline-v2.png')]

# Frame 108 is the next shot's actual start plate. Retain only frames 0..107
# from shot one, so the seam has neither an endpoint pause nor a duplicated frame.
# The same 1.25x travel pace applies on both sides of the join.
filters = [
    '[0:v]trim=end_frame=108,setpts=(PTS-STARTPTS)*0.8,fps=24,trim=end_frame=86,setsar=1[v0]',
    '[1:v]trim=end_frame=121,setpts=(PTS-STARTPTS)*0.8,fps=24,trim=end_frame=97,setsar=1[v1]',
    '[v0][v1]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop_duration=4,trim=duration=11,format=yuv420p[scene]',
    'color=c=black@0.28:s=1280x720:r=24:d=11,format=rgba,fade=t=in:st=7.4:d=0.5:alpha=1,fade=t=out:st=9.6:d=0.8:alpha=1[shade]',
    '[scene][shade]overlay=shortest=1[dimmed]',
    # Use the real current wordmark. Left-to-right alpha reveal spells Nooks,
    # without synthesizing lettering or changing the underlying brand artwork.
    "[2:v]crop=2120:675:35:23,scale=420:-2,format=rgba,lutrgb=r=255:g=248:b=234,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip((T-7.65)*1.6-X/W,0,1)',fade=t=out:st=9.6:d=0.8:alpha=1[logo]",
    '[dimmed][logo]overlay=x=(W-w)/2:y=252:shortest=1[branded]',
    '[4:v]scale=500:40,format=rgba,fade=t=in:st=8.35:d=0.4:alpha=1,fade=t=out:st=9.6:d=0.8:alpha=1[tagline]',
    '[branded][tagline]overlay=x=(W-w)/2:y=412:shortest=1[final]',
    '[3:a]volume=0.65,afade=t=in:d=0.15,afade=t=out:st=9.6:d=1.4,apad=whole_dur=11,atrim=duration=11[audio]',
]
filter_file = out / 'edit-filter-v2.txt'
filter_file.write_text(';\n'.join(filters))
target = out / 'nooks-opening-v2.mp4'
args += ['-filter_complex_script',str(filter_file),'-map','[final]','-map','[audio]','-t',str(duration),'-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-metadata','title=Nooks — Your little study nook in ChatGPT','-threads','4',str(target)]
subprocess.run(args,check=True)
for t,name in [(0,'nooks-opening-poster-v2.jpg'),(9.3,'nooks-opening-brand-v2.jpg'),(10.9,'nooks-opening-landing-v2.jpg')]:
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-ss',str(t),'-i',str(target),'-frames:v','1',str(out/name)],check=True)
manifest = {'version':2,'duration_seconds':duration,'width':1280,'height':720,'fps':24,'sources':sources,'source_resolution':'native 720p; no upscale','handoff_source_frame':108,'travel_rate':1.25,'title':'Nooks','tagline':'Your little study nook in ChatGPT.','ending':'Current plural wordmark reveals, then wordmark/tagline/shade fade out to the actual rainy library background.','review_status':'awaiting motion review'}
(out/'manifest-v2.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(target)
