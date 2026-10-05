"""Original environment-first sound edit. Keeps V2's video packets unchanged."""
from pathlib import Path
import json, subprocess, shutil

root=Path(__file__).resolve().parent
out=root/'exports'; stems=out/'audio-v3'; stems.mkdir(exist_ok=True)
ff='ffmpeg'
sources={'city':('06-rain-city.mp3',-25),'air':('07-air-motion.mp3',-26),'library':('08-library-foley.mp3',-27),'warm':('09-warm-undertone.m4a',-32)}
def run(args):
    subprocess.run([ff,'-y','-hide_banner','-loglevel','error',*args],check=True)
for name,(filename,target) in sources.items():
    # Tame sparse foley peaks before setting a consistent, quiet stem level.
    chain='highpass=f=100,lowpass=f=6500,acompressor=threshold=0.09:ratio=3:attack=5:release=120,' if name!='warm' else 'highpass=f=140,lowpass=f=3800,'
    chain+=f'loudnorm=I={target}:TP=-6:LRA=8,aresample=48000,aformat=channel_layouts=stereo'
    run(['-i',str(root/'clips'/filename),'-af',chain,'-c:a','pcm_f32le',str(stems/(name+'.wav'))])

args=[]
for name in sources: args+=['-i',str(stems/(name+'.wav'))]
filters=[
    '[0:a]atrim=duration=6.6,asetpts=PTS-STARTPTS,afade=t=in:d=0.65,afade=t=out:st=4.9:d=1.7,apulsator=mode=sine:hz=0.12:amount=0.2,volume=0.82,adelay=650|650[city]',
    '[1:a]asplit=2[exitwind][doorwind]',
    '[exitwind]atrim=start=0.15:end=3.85,asetpts=PTS-STARTPTS,atempo=2,afade=t=in:d=0.25,afade=t=out:st=1.15:d=0.7,volume=0.52,pan=stereo|c0=0.9*c0|c1=0.7*c1,adelay=650|650[air1]',
    '[doorwind]atrim=start=0.6:end=3.6,asetpts=PTS-STARTPTS,atempo=2,afade=t=in:d=0.2,afade=t=out:st=0.85:d=0.65,volume=0.4,pan=stereo|c0=0.7*c0|c1=0.9*c1,adelay=4850|4850[air2]',
    '[2:a]asplit=2[desk][landing]',
    '[desk]atrim=duration=1.6,asetpts=PTS-STARTPTS,afade=t=in:d=0.18,afade=t=out:st=0.7:d=0.9,volume=0.65[deskbed]',
    '[landing]atrim=start=2.5:end=8,asetpts=PTS-STARTPTS,afade=t=in:d=1.3,volume=0.85,adelay=5500|5500[library]',
    '[city][air1][air2][deskbed][library]amix=inputs=5:normalize=0:duration=longest,apad=whole_dur=11,atrim=duration=11,afade=t=out:st=9.7:d=1.3[effects]',
    '[3:a]apad=whole_dur=11,atrim=duration=11,volume=0.4,afade=t=in:d=1.5,afade=t=out:st=9.4:d=1.6[warm]',
    '[effects]asplit=2[fxcopy][fxwarm]',
    '[fxwarm][warm]amix=inputs=2:normalize=0:duration=longest[mix]',
]
(out/'audio-filter-v3.txt').write_text(';\n'.join(filters))
run([*args,'-filter_complex_script',str(out/'audio-filter-v3.txt'),'-map','[mix]','-c:a','pcm_f32le',str(stems/'warm-raw.wav'),'-map','[fxcopy]','-c:a','pcm_f32le',str(stems/'ambience-raw.wav')])

# Use the same gain for both audition versions so ambience-only is a fair comparison.
probe=subprocess.run([ff,'-hide_banner','-i',str(stems/'warm-raw.wav'),'-af','loudnorm=I=-21:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
levels=json.JSONDecoder().raw_decode(probe.stderr[probe.stderr.rfind('{'):])[0]
gain=min(-21-float(levels['input_i']),-2-float(levels['input_tp']))
for variant,filename in [('warm','nooks-opening-v3.mp4'),('ambience','nooks-opening-v3-ambience.mp4')]:
    mix=stems/(variant+'-mix.wav')
    run(['-i',str(stems/(variant+'-raw.wav')),'-af',f'volume={gain}dB,alimiter=limit=0.794:level=false:latency=true','-ar','48000','-c:a','pcm_s24le',str(mix)])
    run(['-i',str(out/'nooks-opening-v2.mp4'),'-i',str(mix),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','11','-movflags','+faststart','-metadata','title=Nooks — a little world of sound',str(out/filename)])
    measure=subprocess.run([ff,'-hide_banner','-i',str(out/filename),'-af','loudnorm=I=-21:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    data=json.JSONDecoder().raw_decode(measure.stderr[measure.stderr.rfind('{'):])[0]
    (root/'review'/f'audio-{variant}-v3.json').write_text(json.dumps(data,indent=2)+'\n')
    print(filename, 'integrated',data['input_i'],'LUFS; true peak',data['input_tp'],'dBTP')
manifest={'version':3,'duration':11,'visual_source':'nooks-opening-v2.mp4','video_reencoded':False,'default_audio':'warm environment and camera movement; very quiet beatless undertone','alternate_audio':'environment only','stems':sources,'master_gain_db':gain,'cue_times':{'window_exit':0.65,'outside_rain_train':0.65,'door_sweep':4.85,'library_return':5.5,'outro_fade':9.7},'review':'Pending browser verification'}
(out/'manifest-v3.json').write_text(json.dumps(manifest,indent=2)+'\n')
