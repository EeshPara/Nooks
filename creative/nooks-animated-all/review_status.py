"""Bind independent approval to current video bytes; stale reviews never count."""
import json
from pathlib import Path
from pipeline import HERE,ROOT,JOBS,SPECS,sha,save
reports=ROOT/'creative/nooks-release/scene-reviews'
entries=[]
for report in sorted(reports.glob('*.json')):
 try:data=json.loads(report.read_text())
 except ValueError:continue
 if not isinstance(data,dict) or not isinstance(data.get('scenes'),list):continue
 for scene in data['scenes']:
  if not isinstance(scene,dict):continue
  entries.append((report,scene,data.get('reviewer')))
manifest=json.loads((HERE/'manifest.json').read_text()) if (HERE/'manifest.json').exists() else {'clips':[]}
published={c['roomId']:c for c in manifest['clips']}
status=[]
for name in SPECS:
 path=JOBS/name/'finished.mp4';digest=sha(path) if path.exists() else None
 exact=[];stale=[]
 for report,scene,reviewer in entries:
  if scene.get('sceneId',scene.get('roomId'))!=name:continue
  item={'report':str(report.relative_to(ROOT)),'reviewer':reviewer,'verdict':scene.get('verdict'),'videoSha256':scene.get('videoSha256')}
  (exact if digest and scene.get('videoSha256')==digest else stale).append(item)
 passing=[x for x in exact if str(x['verdict']).startswith('approved')]
 failing=[x for x in exact if any(k in str(x['verdict']).lower() for k in ['reject','revision','fail','needs_','requires_','changes_required'])]
 status.append({'roomId':name,'currentVideoSha256':digest,'published':name in published,'publishedBytesMatch':bool(digest and name in published and published[name]['qa']['videoSha256']==digest),'independentVisualSamples':'requires_revision' if failing else ('approved_exact_sha' if passing else 'pending'),'currentReviews':exact,'staleReviews':stale})
save(HERE/'review-status.json',{'scope':'Independent exact-SHA frame sampling; does not imply real-time playback/audio or production readiness','scenes':status})
print(json.dumps({'published':len(published),'independentApproved':sum(x['independentVisualSamples']=='approved_exact_sha' for x in status),'requiresRevision':sum(x['independentVisualSamples']=='requires_revision' for x in status)}))
