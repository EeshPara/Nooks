from pathlib import Path
import subprocess, json, array, math
ROOT=Path(__file__).resolve().parents[2]
report={}
for path in sorted((ROOT/'web/ui/src/world/audio').glob('*.mp3')):
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','2','-ar','44100','-'])
    samples=array.array('f'); samples.frombytes(raw)
    measurements=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-23:TP=-5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
    measured=json.JSONDecoder().raw_decode(measurements[measurements.rfind('{'):])[0]
    seam=max(abs(samples[-2]-samples[0]),abs(samples[-1]-samples[1]))
    nearby=max(abs(samples[i]-samples[i-2]) for i in list(range(2,8820))+list(range(len(samples)-8820,len(samples))))
    report[path.name]={'seconds':round(len(samples)/88200,3),'bytes':path.stat().st_size,'lufs':float(measured['input_i']),'true_peak_db':float(measured['input_tp']),'lra':float(measured['input_lra']),'seam_jump':round(seam,6),'near_seam_max_sample_jump':round(nearby,6),'clipped_samples':sum(abs(s)>=1 for s in samples)}
(ROOT/'creative/nooks-ambience/audio-metrics.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
