"""Finish downloaded scenes once; leave stable reviewed hashes untouched."""
import argparse,fcntl,json,time
from pipeline import HERE,JOBS,SPECS
from finish import finish
from review import review
ap=argparse.ArgumentParser();ap.add_argument('--watch-seconds',type=int,default=0);args=ap.parse_args()
end=time.monotonic()+args.watch_seconds
with (HERE/'.finish.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 while True:
  ready=[n for n in SPECS if (JOBS/n/'generated.mp4').exists() and not (JOBS/n/'qa.json').exists()]
  for name in ready:
   finish(name,2);review(name)
  if time.monotonic()>=end:break
  if all((JOBS/n/'qa.json').exists() for n in SPECS):break
  time.sleep(min(15,max(0,end-time.monotonic())))
 summaries=[]
 for name in SPECS:
  p=JOBS/name/'qa.json'
  if p.exists():summaries.append((name,json.loads(p.read_text())['technicalPass']))
 print(json.dumps({'finished':len(summaries),'failed':[n for n,passed in summaries if not passed],'pending':[n for n in SPECS if not (JOBS/n/'qa.json').exists()]}),flush=True)
