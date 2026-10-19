#!/usr/bin/env python3
"""Resumable, budget-limited Higgsfield generation; no ambiguous submission retries."""
import argparse, concurrent.futures, fcntl, hashlib, json, os, subprocess, sys, threading, time
from pathlib import Path
from specs import BASE,SPECS
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
PUBLIC=ROOT/'web/ui/public'
JOBS=HERE/'jobs'
LOCK=threading.Lock()
STOP=threading.Event()

def save(path,data):
 tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(data,indent=2)+'\n');os.replace(tmp,path)
def read(path):return json.loads(path.read_text())
def command(args):return json.loads(subprocess.check_output(args,text=True))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def source(name):return PUBLIC/'images/nooks-50'/f'{name}.webp'
def spec(name,duration):return {'roomId':name,'model':'seedance1_5','duration':duration,'prompt':BASE+SPECS[name][0],'regions':SPECS[name][1],'coordinateSpace':[600,338],'sourceArtworkSha256':sha(source(name))}
def balance():return float(command(['higgsfield','account','status','--json'])['credits'])
def validate():
 catalog=read(ROOT/'creative/nooks-50-backgrounds/scenes.json')
 assert set(SPECS)=={s['id'] for s in catalog},'Spec/catalog mismatch'
 for name,(_,regions) in SPECS.items():
  assert source(name).exists() and regions
  for region in regions:
   pts=region['points'];pts=list(zip(pts[::2],pts[1::2])) if region['kind']=='ellipse' else pts
   assert all(0<=x<=600 and 0<=y<=338 for x,y in pts),(name,region)

def retrieve(name):
 p=JOBS/name; jobfile=p/'job.json'
 if not jobfile.exists(): return None
 try:
  data=read(jobfile);job=data[0] if isinstance(data,list) else data
 except (ValueError,IndexError): return None
 if job.get('status')!='completed' or not job.get('result_url'):return None
 target=p/'generated.mp4'
 if not target.exists():
  subprocess.run(['curl','-L','--fail','--silent','--show-error','--retry','3',job['result_url'],'-o',str(target.with_suffix('.part'))],check=True)
  os.replace(target.with_suffix('.part'),target)
 return job

def generate(name,args):
 p=JOBS/name;p.mkdir(parents=True,exist_ok=True)
 wanted=spec(name,args.duration)
 if (p/'spec.json').exists() and any(read(p/'spec.json').get(k)!=wanted[k] for k in ['model','duration','prompt','sourceArtworkSha256']):raise RuntimeError(f'{name}: immutable submitted spec differs; manual review required')
 save(p/'spec.json',wanted)
 if (p/'submission.json').exists():
  job=retrieve(name)
  print(name, 'downloaded' if job else 'already submitted; inspect existing job, never resubmit automatically',flush=True)
  return
 with LOCK:
  if STOP.is_set():return
  current=balance(); initial=read(HERE/'budget-ledger.json')['initialCredits']
  reserved=sum(args.duration*.6 for q in JOBS.glob('*/submission.json') if read(q).get('state')=='submitting')
  if initial-current+reserved+args.duration*.6>args.max_spend or current-reserved<args.duration*.6:
   STOP.set(); print('Budget limit reached; queue stopped',flush=True);return
  # Durable marker BEFORE paid command: timeout/crash can never silently duplicate jobs.
  save(p/'submission.json',{'state':'submitting','time':time.time(),'balanceBefore':current,'duration':args.duration})
 cmd=['higgsfield','generate','create','seedance1_5','--prompt',wanted['prompt'],'--start-image',str(source(name)),'--end-image',str(source(name)),'--duration',str(args.duration),'--resolution','720p','--aspect_ratio','16:9','--generate-audio','false','--wait','--wait-timeout','20m','--wait-interval','5s','--json']
 with (p/'job.json').open('w') as out,(p/'generation.log').open('w') as err:
  result=subprocess.run(cmd,stdout=out,stderr=err)
 marker=read(p/'submission.json');marker.update(state='completed' if result.returncode==0 else 'needs-reconciliation',exitCode=result.returncode);save(p/'submission.json',marker)
 if result.returncode:
  STOP.set();print(name,'submission incomplete; stopped queue for manual reconciliation',flush=True);return
 job=retrieve(name)
 if not job:STOP.set();raise RuntimeError(f'{name}: missing completed job result')
 print(name,'generated and downloaded',flush=True)

def safe_generate(name,args):
 try:generate(name,args)
 except BaseException:
  STOP.set()
  raise

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--generate',action='store_true');parser.add_argument('--duration',type=int,choices=[4,8,12],default=4);parser.add_argument('--limit',type=int);parser.add_argument('--ids',nargs='*');parser.add_argument('--max-spend',type=float,default=150);parser.add_argument('--download',action='store_true');args=parser.parse_args()
 validate();JOBS.mkdir(exist_ok=True)
 names=args.ids or list(SPECS)
 assert set(names)<=set(SPECS)
 if args.limit is not None:names=names[:args.limit]
 # One process-wide lock prevents two queue invocations exceeding provider limit.
 with (HERE/'.queue.lock').open('w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if args.download:
   for name in names:retrieve(name)
  elif args.generate:
   if not (HERE/'budget-ledger.json').exists():save(HERE/'budget-ledger.json',{'initialCredits':balance(),'maxSpend':args.max_spend,'startedAt':time.time()})
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for result in pool.map(lambda name:safe_generate(name,args),names):pass
  else:
   save(HERE/'scene-specs.json',[spec(n,args.duration) for n in names]); print(f'Validated {len(names)} scene specs; no generation submitted')
if __name__=='__main__':main()
