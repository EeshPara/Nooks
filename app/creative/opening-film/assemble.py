"""Reproducible fifteen-second edit from generated matched-endpoint sources."""
from pathlib import Path
import json, subprocess, os
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
export = root / 'exports'
export.mkdir(exist_ok=True)
sources = ['01-attic-tokyo', '02-tokyo-forest-std', '03-forest-neon', '04-neon-home-v2']
args = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
for shot in sources:
    source = root / 'clips' / f'{shot}.mp4'
    if not source.exists(): raise SystemExit(f'Missing reviewed source: {source}')
    args.extend(['-i', str(source)])
args.extend(['-loop','1','-framerate','24','-i',str(root.parents[1] / 'ui/public/images/nook-wordmark.webp')])
args.extend(['-i',str(root / 'clips/05-score.m4a')])
# Render real typography as a video overlay; never ask the generator to draw text.
if not (export / 'tagline-overlay.png').exists():
    tagline = Image.new('RGBA', (900, 70), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tagline)
    font = ImageFont.truetype(os.environ.get('NOOKS_FONT', 'DejaVuSans.ttf'), 48)
    draw.text((450, 35), (export / 'tagline.txt').read_text().strip(), font=font, anchor='mm', fill=(255,246,231,255), stroke_width=1, stroke_fill=(255,246,231,100))
    tagline.save(export / 'tagline-overlay.png')
args.extend(['-loop','1','-framerate','24','-i',str(export / 'tagline-overlay.png')])

# Four 75-frame segments retain all source motion, including the complete hidden
# world crossings. The matched endpoint is retained at the end of each segment.
# A deliberate 2.5-second final hold gives the title time to be read.
filters = []
for i in range(4):
    filters.append(f'[{i}:v]trim=end_frame=121,setpts=(PTS-STARTPTS)*74/120,fps=24,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=75,setpts=PTS-STARTPTS,setsar=1[v{i}]')
filters.append('[v0][v1][v2][v3]concat=n=4:v=1:a=0,tpad=stop_mode=clone:stop_duration=2.5,trim=duration=15,format=yuv420p[scene]')
filters.append('color=c=black@0.28:s=1280x720:r=24:d=15,format=rgba,fade=t=in:st=11.8:d=0.8:alpha=1[shade]')
filters.append('[scene][shade]overlay=shortest=1[dimmed]')
filters.append('[4:v]scale=430:-2,format=rgba,fade=t=in:st=12.05:d=0.65:alpha=1[logo]')
filters.append('[dimmed][logo]overlay=x=(W-w)/2:y=250:shortest=1[branded]')
filters.append('[6:v]scale=450:35,format=rgba,fade=t=in:st=12.4:d=0.5:alpha=1[tagline]')
filters.append('[branded][tagline]overlay=x=(W-w)/2:y=415:shortest=1[final]')
filters.append('[5:a]volume=0.65,afade=t=in:d=0.2,afade=t=out:st=13.8:d=1.2,apad=whole_dur=15,atrim=duration=15[audio]')
(export / 'edit-filter.txt').write_text(';\n'.join(filters))
args.extend(['-filter_complex_script', str(export / 'edit-filter.txt'), '-map','[final]','-map','[audio]','-t','15','-r','24','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-metadata','title=Nook — Your little study nook in ChatGPT','-metadata','comment=Original illustrated Nooks opening. Video generated with Higgsfield Kling 3.0; original music with Sonilo.','-threads','4',str(export / 'nooks-opening-v1.mp4')])
subprocess.run(args,check=True)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-ss','14','-i',str(export / 'nooks-opening-v1.mp4'),'-frames:v','1',str(export / 'nooks-opening-poster.jpg')],check=True)
manifest = {'duration_seconds':15,'width':1280,'height':720,'fps':24,'sources':sources,'title':'nook','tagline':(export/'tagline.txt').read_text(),'review_status':'awaiting final review','source_resolution':'native 720p; no upscaling','sound':'original Sonilo instrumental, reduced by 3.74 dB; muted default in app','credits_before':270}
(export / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(export / 'nooks-opening-v1.mp4')
