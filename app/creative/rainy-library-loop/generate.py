from pathlib import Path
import subprocess
p=Path(__file__).parent
image=str(p.parents[1]/'ui/public/images/lofi-rainy-library.webp')
args=['higgsfield','generate','create','seedance1_5','--prompt',p.joinpath('prompt.txt').read_text(),'--start-image',image,'--end-image',image,'--duration','8','--resolution','720p','--aspect_ratio','16:9','--generate-audio','false','--wait','--wait-timeout','20m','--wait-interval','5s','--json']
with p.joinpath('job.json').open('w') as out, p.joinpath('generation.log').open('w') as err:
 r=subprocess.run(args,stdout=out,stderr=err)
print('Generation finished:',r.returncode)
print(p.joinpath('job.json').read_text()[-12000:])
print(p.joinpath('generation.log').read_text()[-2000:])
