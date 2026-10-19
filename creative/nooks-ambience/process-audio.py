"""Build restrained, circular ambience beds from licensed Freesound previews.
Download source URLs in SOURCES.md to /tmp/nooks-{kind}-original.mp3 first.
Uses ffmpeg only; no generation of synthetic nature noise.
"""
from pathlib import Path
import subprocess, json, array, math
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'web/ui/src/world/audio'
# start, duration, low-pass Hz, target LUFS. Preserve natural stereo where present.
SPECS={'wind':(5,46,3600,-23),'forest':(12,46,5500,-23),'waves':(40,54,4800,-22),
       'stream':(10,46,4200,-23),'night':(25,50,4800,-25),'train':(2,32,1800,-24),'room':(2,38,1800,-27)}
for kind,(start,duration,cutoff,lufs) in SPECS.items():
    origin=Path(f'/tmp/nooks-{kind}-original.mp3')
    available=float(json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-of','json',str(origin)]))['format']['duration'])
    duration=min(duration,available-start-.1)
    filters=f'highpass=f=65,lowpass=f={cutoff},acompressor=threshold=0.08:ratio=2.5:attack=35:release=350,loudnorm=I={lufs}:TP=-6:LRA=7'
    raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start),'-t',str(duration),'-i',str(origin),'-af',filters,'-ar','44100','-ac','2','-f','f32le','-'])
    samples=array.array('f'); samples.frombytes(raw)
    # End-to-start overlap: play middle, tail->head crossfade, wrap into middle.
    # Both sides of the wrap share the original adjacent samples, with no silence.
    overlap=44100*3*2
    middle=samples[overlap:-overlap]
    tail=samples[-overlap:]; head=samples[:overlap]
    for i in range(overlap):
        t=(i//2)/(overlap//2-1)
        tail[i]=tail[i]*(1-t)+head[i]*t
    loop=middle+tail
    out=DEST/f'{kind}-bed.mp3'
    subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar','44100','-ac','2','-i','-','-codec:a','libmp3lame','-b:a','96k',str(out)],input=loop.tobytes(),check=True)
    print(kind,round(len(loop)/88200,2),out.stat().st_size)
