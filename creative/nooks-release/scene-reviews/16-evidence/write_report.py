from pathlib import Path
from datetime import datetime,timezone
import hashlib,json
root=Path.cwd();out=root/'creative/nooks-release/scene-reviews';metrics=json.loads((out/'16-evidence/metrics.json').read_text());scenes=[]
findings={
'frog-pond-studio':[
'Actual source art and independently extracted native-resolution samples retain the bridge, studio, frog, flower stems, furniture and broad lily-pad silhouettes. Full decode completed for all 84 frames; outside-mask movement is negligible.',
'The intended small water ripples become thick, pale concentric bands around frames 40–68. At frames 48, 56, 60 and 68, the right arc visibly passes over the right foreground lily pad instead of being occluded by its surface. The new rings read as a graphic overlay, weakening the realistic, restful motion requested.',
'Last-two/first-two crops show no obvious geometric seam jump; the measured seam ratio is 0.5041. A numerical seam pass does not resolve the visible water/leaf compositing problem. The front cup is stationary; tea steam mentioned in the prompt was not included in the final motion mask.'
],
'kuromi-midnight-desk':[
'Actual source art and eight native-resolution motion samples retain the mug rim, bedspread texture, furniture, plush characters, notebook and background architecture without visible doubled or shifted rigid geometry.',
'The sole moving region is a restrained translucent steam wisp immediately above the mug. It changes gently in the sampled frames without an opaque smoke plume or altered mug silhouette. Intentional stillness of the plush toys, lamp and sleeping cat is consistent with this scene.',
'Full decode completed for all 84 frames. The seam ratio is 3.7447, close to but below the producer threshold of 4; last-two/first-two crops show only a small steam/exposure difference rather than a hard geometric jump. Repeated full-speed viewing remains needed to assess perceived seam smoothness.'
]}
for name in metrics:
 p=root/'creative/nooks-animated-all/jobs'/name;qa=json.loads((p/'qa.json').read_text());sha=hashlib.sha256((p/'finished.mp4').read_bytes()).hexdigest();assert sha==metrics[name]['videoSha256']
 bad=name=='frog-pond-studio';evidence=[str(x.relative_to(root)) for x in sorted((out/'16-evidence').glob(name+'-*.png'))]
 if bad:evidence.append('creative/nooks-release/scene-reviews/16-evidence/frog-ring-detail.png')
 scenes.append({'sceneId':name,'videoPath':str((p/'finished.mp4').relative_to(root)),'videoSha256':sha,'qaMatchesVideo':qa['videoSha256']==sha,'verdict':'needs_correction' if bad else 'approved_visual_samples','scope':'Exact-SHA sampled visuals and independent full decode; no full-speed playback or audio audition','quantitativeQa':qa,'independentMetrics':metrics[name],'findings':findings[name],'requiredChanges':['Remove rings from the solid lily-pad surfaces and reduce the broad pale bands to restrained, believable water motion. Preserve source geometry and independently review the corrected exact hash before publishing.'] if bad else [],'followUps':['Verify repeated full-speed playback and audition integrated ambience.'],'evidence':evidence+[str((p/'mask-review.jpg').relative_to(root)),str((p/'review-contact.jpg').relative_to(root)),f'web/ui/public/images/nooks-50/{name}.webp']})
report={'reviewId':'16','reviewer':'scene_review_16','reviewedAtUtc':datetime.now(timezone.utc).isoformat(),'method':'Viewed actual source artwork, producer mask/contact sheets, independently extracted native-resolution source/motion/last-two-first-two seam crops; fully decoded all 84 frames and independently recomputed adjacent/seam/mask/brightness metrics. SHA checked before decode and report creation.','limitations':['No full-speed playback or audio audition performed.','Approval applies only to exact-hash sampled visual evidence, not integrated product quality or production readiness.'],'scenes':scenes}
(out/'16.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Scene review 16','','Kuromi passes sampled visual review. Frog Pond requires correction for water rings drawn over lily pads. No full-speed playback or audio audition was performed.','']
for s in scenes:
 lines.extend([f"## {s['sceneId']}",'',f"SHA-256: `{s['videoSha256']}`. Verdict: **{s['verdict']}**.",''])
 lines.extend('- '+x for x in s['findings']);lines.append('')
 if s['requiredChanges']:lines.extend(['Required: '+s['requiredChanges'][0],''])
lines.extend(['Evidence, independent metrics and reproduction script: `16-evidence/`. Exact schema report: `16.json`. Black label strips are evidence padding, not video content.',''])
(out/'16.md').write_text('\n'.join(lines));print('Wrote 16.json and 16.md; exact hashes unchanged.')
