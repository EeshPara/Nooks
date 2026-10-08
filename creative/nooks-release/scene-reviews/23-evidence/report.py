import json,hashlib,datetime
from pathlib import Path
root=Path.cwd(); directory=root/'creative/nooks-release/scene-reviews'; evidence=directory/'23-evidence'
metrics=json.loads((evidence/'metrics.json').read_text())
details={
'lighthouse-study':([
'Inspected full-scene contact views, native-resolution motion crops, enlarged source comparisons and last-two/first-two seam frames. Furniture, rail, lamps and foreground cup remain stable; the tea steam is faint and aligned with the cup.',
'The sea mask includes the distant sailboat. Source comparisons show the original crisp sail/hull blended with an offset softer sail/hull, making the boat doubled or translucent. The left cliff face also becomes locally smeared because the same water mask extends onto rock.',
'Water variation is restrained and no conspicuous boundary jump was seen in sampled seam frames. Numeric seam and outside-mask passes do not detect rigid-object contamination inside the mask.'
],['Restrict ocean motion to open water, excluding the complete sailboat and its immediate silhouette as well as all cliff/rock geometry with a safe feather margin. Preserve the original geometry; independently review the new exact hash.']),
'desert-casita':([
'Inspected full-scene contact views, native-resolution motion crops, enlarged source comparisons and last-two/first-two seam frames. Courtyard architecture, plants, lamps, tile borders and cup retain their layout. Steam originates above the foreground drink.',
'The fountain-trickle mask overlays the rigid stone pedestal. In source comparisons, its carved stem and base become softer and wider, with an offset translucent left contour visible in multiple samples. Water around the pedestal is plausible, but the stone should not participate in that blended motion.',
'The water stays inside the pool in sampled frames and the seam has no large discontinuity. The compositing defect remains despite passing technical metrics.'
],['Remove the stone pedestal from all motion masks. Keep pool water animation confined around the pedestal or narrow the trickle treatment to actual water only; preserve the source stone geometry and review the new hash.']),
'stationery-studio':([
'Inspected full-scene contact views, native-resolution motion crops, enlarged source comparisons and last-two/first-two seam frames. Papers, pens, shelf furniture, candles and cup are stable. Mug steam is clearly aligned with the drink and gently translucent in the sampled sequence.',
'The region labeled window plant leaf tips is actually centered largely on the ceramic vase below the plant. Source comparisons show the vase decoration and right contour becoming softened/overlaid by a moving layer. This reads as rigid ceramic texture/contour wobble rather than plant leaves moving.',
'No obvious seam jump or detached candle was observed; the bright candle remains part of the static artwork. The vase issue is localized and is not captured by outside-mask stability.'
],['Freeze/remove the window plant leaf-tip mask, retaining mug steam, or re-mask only actual leaves without touching the rigid vase and independently review the new hash.'])}
report={'reviewId':'23','reviewer':'scene_review_23','reviewedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Independent full decode of all 84 frames per clip, exact SHA verification, recomputed motion/brightness/seam metrics, source artwork comparisons, full-scene contacts, native motion crops, enlarged rigid-object comparisons and sampled boundary frames.','limitations':['No continuous full-speed playback or audio audition performed.','Verdicts concern sampled visuals of the exact hash, not integrated product quality or production readiness.'],'scenes':[]}
for name,m in metrics.items():
 video=root/f'creative/nooks-animated-all/jobs/{name}/finished.mp4'
 assert hashlib.sha256(video.read_bytes()).hexdigest()==m['videoSha256']
 findings,required=details[name]
 report['scenes'].append({'sceneId':name,'videoPath':str(video.relative_to(root)),'videoSha256':m['videoSha256'],'qaMatchesVideo':m['qaMatchesVideo'],'verdict':'needs_revision','scope':'Exact-SHA sampled visuals and independent full-decode metrics; no full-speed playback or audio audition','quantitativeQa':m['quantitativeQa'],'independentMetrics':{k:v for k,v in m.items() if k!='quantitativeQa'},'findings':findings,'requiredChanges':required,'followUps':['Verify repeated full-speed playback and audition integrated ambience after correction.'],'evidence':[str(p.relative_to(root)) for p in sorted(evidence.glob(name+'-*.png'))]+[f'creative/nooks-animated-all/jobs/{name}/mask-review.jpg',f'creative/nooks-animated-all/jobs/{name}/review-contact.jpg']})
(directory/'23.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Independent scene review 23','',report['method'],'','No continuous full-speed playback or audio audition was performed. All three clips decode successfully (84 frames, 3.5 seconds, 1280×720, 24 fps, no embedded audio), match their QA hashes, and pass existing technical gates. All three nevertheless need localized compositing revisions.','']
for s in report['scenes']:
 lines += ['## '+s['sceneId'],'','Verdict: **needs_revision**','',f"SHA-256: `{s['videoSha256']}`",'',f"Seam/typical: {s['independentMetrics']['seamVsTypical']:.3f}; outside-mask change: {s['independentMetrics']['outsideMaskChange']:.6f}.",'']
 lines += [x+'\n' for x in s['findings']]
 lines += ['Required: '+s['requiredChanges'][0],'']
lines += ['Evidence: `23-evidence/` contains native-motion samples, source comparisons, seam crops, detail crops, extraction scripts, and independently recomputed metrics.','']
(directory/'23.md').write_text('\n'.join(lines))
print('Wrote 23.json and 23.md, exact hashes reconfirmed.')
