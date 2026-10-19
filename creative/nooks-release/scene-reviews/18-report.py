from pathlib import Path
import json,hashlib,datetime
root=Path.cwd();out=root/'creative/nooks-release/scene-reviews';jobs=root/'creative/nooks-animated-all/jobs';metrics=json.loads((out/'18-metrics.json').read_text())
findings={
'sakura-garden':[
'The previously doubled blossom petals and branch outlines are removed. The original singular blossoms remain intact in source comparison, eight sampled frames and boundary crops; the independently decoded blossom crop is pixel-identical across all 84 frames.',
'The pond retains subtle varying ripples and reflections. Pond banks, bridge, rocks, windows, desk and objects retain stable silhouettes in examined full-scene and crop samples. No obvious hard mask boundary or extra spatial jump appears in last-two/first-two samples.',
'Independent full decode reproduces seam ratio 2.6775 and outside-mask change 0.000054. This numeric pass and sample review do not establish imperceptible looping at full speed.'
],
'autumn-bakery':[
'The previously doubled diagonal branch, translucent leaves and shifted building are removed. Original foliage and distant window geometry remain singular; the independently decoded foliage crop is pixel-identical across all 84 frames.',
'Coffee vapor remains faint and transparent against a stable cup and sill. The glass candle retains its original single main flame and wick; small aligned reflections above the flame also exist in source artwork. Light intensity varies subtly without displaced candle geometry in brightness-extreme and boundary samples.',
'Independent full decode reproduces seam ratio 1.7597 and outside-mask change 0.000073. Candle crop mean brightness range is 0.92 on the 0–255 scale; this is subtle luminance modulation, not moving flame shape.'
],
'seoul-night-cafe':[
'The previously doubled tower antenna, observation deck, shaft and city building edges are removed. Original skyline geometry is singular in source, extrema and boundary comparisons. Broad city/rain animation is gone; remaining maximum per-channel change of 2 in the skyline crop is negligible codec-level variation, with mean brightness range 0.000079.',
'Coffee vapor stays subtle and transparent while mug, chair and table remain stable. Candle wick, flame silhouette and ribbed glass retain original geometry; the slight light modulation does not create a displaced second flame in examined samples.',
'Independent full decode reproduces seam ratio 1.8998 and outside-mask change 0.000068. Candle crop mean brightness range is 1.18 on the 0–255 scale. The scene retains steam and subtle candle intensity motion; rain streaks and city remain visually still.'
]}
report={'reviewId':'18','reviewer':'scene_review_18','reviewedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Read prior review 12 and 14 defects. Independently decoded every frame of each exact corrected candidate, recomputed motion/seam/brightness metrics, viewed source artwork, full-frame contacts, masks, eight native-resolution motion crops, brightness extrema and last-two/first-two boundary crops. Smaller crops enlarged 2x for inspection. Verified candidate hashes before/after decode and again at report writing.','limitations':['No full-speed playback or audio audition performed.','Approval applies only to sampled visual integrity of the exact hashes and full-decode metrics, not integrated product quality or production readiness.'],'scenes':[]}
for name,m in metrics.items():
 video=jobs/name/'finished.mp4';sha=hashlib.sha256(video.read_bytes()).hexdigest();assert sha==m['videoSha256'];qa=json.loads((jobs/name/'qa.json').read_text());assert qa['videoSha256']==sha
 evidence=m.pop('evidence')+[f'creative/nooks-animated-all/jobs/{name}/review-contact.jpg',f'creative/nooks-animated-all/jobs/{name}/mask-review.jpg',f'web/ui/public/images/nooks-50/{name}.webp']
 report['scenes'].append({'sceneId':name,'videoPath':str(video.relative_to(root)),'videoSha256':sha,'qaMatchesVideo':True,'verdict':'approved_visual_samples','scope':'Exact-SHA sampled visuals and independent full-decode metrics; no full-speed playback or audio audition','quantitativeQa':qa,'independentMetrics':m,'findings':findings[name],'requiredChanges':[],'followUps':['Verify repeated full-speed playback and audition integrated ambience.'],'evidence':evidence})
(out/'18.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Corrected scene review 18','','All three corrected candidates pass sampled visual inspection. Prior blossom/foliage/skyline duplication is absent. No full-speed playback or audio listening was performed; this is not production-readiness approval.','']
for s in report['scenes']:
 lines += ['## '+s['sceneId'],'',f"Verdict: **{s['verdict']}**. SHA-256: `{s['videoSha256']}`.",'']+['- '+f for f in s['findings']]+['',f"All {s['independentMetrics']['frames']} frames decoded. Evidence: [source/seam and motion measurements](18-metrics.json), with image paths in [18.json](18.json).",'']
(out/'18.md').write_text('\n'.join(lines))
print('Wrote 18.json and 18.md; all three exact hashes approved_visual_samples.')
