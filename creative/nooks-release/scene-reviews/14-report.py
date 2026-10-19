from pathlib import Path
import json,hashlib,datetime
root=Path.cwd();out=root/'creative/nooks-release/scene-reviews';metrics=json.loads((out/'14-metrics.json').read_text())
findings={
'oxford-library':[
'Original single foreground flame and wick are restored; the independently decoded candle crop has exactly identical pixels across all 84 frames. No displaced second flame remains in source/minimum/maximum/boundary comparisons.',
'Eight fireplace samples show localized changing fire behind a stable chair and masonry. Last-two/first-two samples retain geometry without an obvious added boundary jump; original candle remains still while the hearth supplies motion.',
'Independent full decode reproduces seam ratio 0.8628 and outside-mask change 0.000060.'],
'nevermore-study':[
'Original lantern cage, hanging fixture, distant candle group and foreground glass edges retain singular source silhouettes in eight samples and source/minimum/maximum/boundary comparisons. The previously displaced rigid geometry is absent.',
'Only extremely subtle luminance variation remains: crop mean brightness ranges are 0.51–0.54 on a 0–255 scale, and maximum per-channel pixel ranges are 3–4. This is measurable original-geometry light modulation, not moving flame silhouettes. Its perceptual contribution may be nearly imperceptible and still needs full-speed assessment.',
'Independent full decode reproduces seam ratio 2.2109, outside-mask change 0.000081 and peak whole-frame brightness change 0.003299. No obvious spatial discontinuity appears in boundary samples.'],
'autumn-bakery':[
'Corrected glass candle retains one original flame and wick. The smaller aligned bright shapes above it also exist in the original glass reflection; they are not new displaced flames. Coffee steam is faint and transparent, with stable mug and window sill in examined samples.',
'The separate foliage mask still blends displaced geometry. The diagonal branch is duplicated, leaf edges have a translucent displaced layer, and the distant building/window behind them is blurred and shifted relative to the source. This is clear in the source versus frame 12 enlarged comparison and recurs across motion samples.',
'Independent full decode passes numerical gates with seam ratio 1.1601 and outside-mask change 0.000124, but the persistent foliage/background ghosting prevents visual approval.'],
'seoul-night-cafe':[
'Corrected candle retains original flame, wick and ribbed glass geometry. Tea steam is restrained and transparent in examined samples; cup and nearby chair remain stable.',
'The two broad rain masks still import shifted city geometry. N Seoul Tower has a clearly doubled antenna, observation deck and shaft relative to the single original tower. Nearby buildings have softened duplicate edges. This is visible at native resolution and obvious in the enlarged source versus frame 76 comparison; it persists across eight motion samples.',
'Independent full decode passes numerical gates with seam ratio 1.7450 and outside-mask change 0.000291, but duplicated skyline geometry prevents visual approval.']}
required={
'autumn-bakery':['Remove or repair the foliage motion region so both branches and the building behind them remain singular. Retain reviewed steam and geometry-safe candle if desired; independently review the resulting new hash.'],
'seoul-night-cafe':['Remove or redesign the rain masks to exclude rigid skyline geometry and preserve a single tower/building silhouette. Retain the reviewed steam and geometry-safe candle if desired; independently review the resulting new hash.']}
report={'reviewId':'14','reviewer':'scene_review_14','reviewedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Read geometry-safe correction report and implementation; independently decoded all 84 frames of each exact candidate; recomputed motion/seam/brightness metrics; viewed full-frame contacts and independently extracted source, eight motion samples, brightness extrema and last-two/first-two seam crops. Small crops enlarged 2x for diagnosis. Hashes verified before and after decode. Report-writing hashes rechecked: superseded candidates are explicitly marked and no replacement bytes are approved.','limitations':['No full-speed playback or audio audition performed.','Approvals cover sampled visual integrity and full-decode metrics only; they are not integrated product or production-readiness approval.'],'scenes':[]}
md=['# Scene review 14','', 'Oxford Library and Nevermore Study pass sampled visual/full-decode review. Autumn Bakery and Seoul Night Cafe remain **needs_revision** because their non-light masks duplicate scenery. All four light corrections themselves preserve original geometry in examined samples. No full-speed playback or audio audition was performed.','']
for name,m in metrics.items():
 video=root/f'creative/nooks-animated-all/jobs/{name}/finished.mp4';current_sha=hashlib.sha256(video.read_bytes()).hexdigest()
 qa=json.loads((video.parent/'qa.json').read_text()) if current_sha==m['videoSha256'] else None
 if name in ['oxford-library','nevermore-study']: assert current_sha==m['videoSha256']
 m['supersededAtReportWriting']=current_sha!=m['videoSha256']
 m['currentVideoSha256AtReportWriting']=current_sha
 verdict='needs_revision' if name in required else 'approved_visual_samples';evidence=m['evidence']+[f'creative/nooks-animated-all/jobs/{name}/review-contact.jpg',f'web/ui/public/images/nooks-50/{name}.webp']
 if name in required:evidence.append(f'creative/nooks-release/scene-reviews/14-{name}-'+('leaves' if name=='autumn-bakery' else 'rain')+'-enlarged.png')
 report['scenes'].append({'sceneId':name,'videoPath':str(video.relative_to(root)),'videoSha256':m['videoSha256'],'qaMatchesVideo':True,'verdict':verdict,'scope':'Exact-SHA sampled visuals and independent full-decode metrics; no full-speed playback or audio audition','quantitativeQa':qa,'supersededAtReportWriting':m['supersededAtReportWriting'],'independentMetrics':{k:v for k,v in m.items() if k!='evidence'},'findings':findings[name],'requiredChanges':required.get(name,[]),'followUps':['Verify repeated full-speed playback and audition integrated ambience.'],'evidence':evidence})
 md+=['## '+name,'',f"SHA-256: `{m['videoSha256']}`. Verdict: **{verdict}**.",'']+['- '+s for s in findings[name]]+['']
 if name in required:md+=['Required: '+required[name][0],'']
 md+=['Follow-up: verify repeated full-speed playback and audition integrated ambience.','']
md+=['Evidence and independent metrics: `14.json`, `14-metrics.json`, and `14-<scene>-*.png`. Label strips and unused black cells are evidence padding, not video content.','']
(out/'14.json').write_text(json.dumps(report,indent=2)+'\n');(out/'14.md').write_text('\n'.join(md));print([(s['sceneId'],s['verdict'],s['videoSha256']) for s in report['scenes']])
