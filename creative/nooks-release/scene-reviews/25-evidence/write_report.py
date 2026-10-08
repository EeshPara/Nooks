from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
root=Path.cwd();out=root/'creative/nooks-release/scene-reviews';metrics=json.loads((out/'25-evidence/metrics.json').read_text());regions=json.loads((out/'25-evidence/region-metrics.json').read_text())
findings={
'antique-workshop':[
'The corrected clock keeps one pendulum disk and singular support details. The independent clock crop is pixel-identical across all 84 decoded frames, eliminating the duplicate brass disk found in review 17.',
'The sleeping cat retains a singular back, tail and cushion outline in source comparisons and eight extracted samples. Very restrained torso variation remains: the independent cat crop has mean temporal range 2.316 on 0–255 RGB values. This is subtle breathing-like variation, with no sampled limb morph or duplicated fur edge.',
'Architecture, instruments and furniture remain stable in the full-frame comparison. Last-two/first-two cat samples show no geometric jump. Independently reproduced seam/typical ratio: 1.5955.'
],
'hateno-study':[
'The large yellow leaf and forked branch now retain singular source outlines in eight extracted samples and source comparisons; the translucent displaced branch and leaf edge from review 17 are absent.',
'This candidate uses extremely gentle daylight variation over the fixed foliage region, not moving leaves. The independent leaf crop mean brightness varies by only 0.6895 code values over the loop, and its mean temporal range is 0.8839. Full-scene samples look nearly still; approval must not be described as convincing leaf animation or a broadly animated landscape.',
'The brush holder, lantern, village and desk retain their source geometry. Last-two/first-two leaf samples show no visible boundary jump. Independently reproduced seam/typical ratio: 1.0228.'
],
'frog-pond-studio':[
'The pale concentric bands that crossed the foreground lily pads in review 16 are removed. Source and native-resolution frames 48, 60 and 68 show restrained ripples confined to the open-water gap, with no ring drawn across the adjacent right or front pads.',
'The independent right-pad and front-pad interior crops are pixel-identical across all 84 frames; the open-water crop has mean temporal range 12.0389, confirming localized changing water rather than an entirely static replacement. These measurements concern selected interiors, not exhaustive leaf segmentation.',
'The bridge, frog, plants, furniture and cup remain stable in full-frame and sampled comparisons. Last-two/first-two water crops show no obvious geometric discontinuity. Independently reproduced seam/typical ratio: 0.5140.'
]}
r={'reviewId':'25','reviewer':'scene_review_25','reviewedAtUtc':datetime.now(timezone.utc).isoformat(),'method':'Read original defect and producer correction reports; viewed original source artwork, independent full frames, eight extracted motion samples, source comparisons and last-two/first-two seam crops. Fully decoded all 84 frames of each exact hash, independently recomputed seam and region metrics, and checked codec profile.','limitations':['No continuous full-speed playback or audio audition performed.','Approval applies only to exact-hash sampled visuals and technical decode, not integrated product quality or production readiness.'],'scenes':[]}
for name,m in metrics.items():
 p=Path('creative/nooks-animated-all/jobs')/name/'finished.mp4';assert hashlib.sha256(p.read_bytes()).hexdigest()==m['videoSha256']
 r['scenes'].append({'sceneId':name,'videoPath':str(p),'videoSha256':m['videoSha256'],'qaMatchesVideo':m['qaMatchesVideo'],'verdict':'approved_visual_samples','scope':'Exact-hash sampled visual review, independent full decode and standard delivery codec check','quantitativeQa':m['quantitativeQa'],'independentMetrics':{k:v for k,v in m.items() if k!='quantitativeQa'},'independentRegionMetrics':regions[name],'findings':findings[name],'requiredChanges':[],'followUps':['Check repeated full-speed playback and integrated ambience in the product.'],'evidence':[str(x.relative_to(root)) for x in sorted((out/'25-evidence').glob(name+'*.png'))]})
(out/'25.json').write_text(json.dumps(r,indent=2)+'\n')
lines=['# Scene review 25','','The three corrected candidates pass exact-hash sampled visual review. All decode as standard H.264 High, yuv420p, level 3.1, 1280×720 at 24 fps. No full-speed playback or audio audition was performed.','']
for s in r['scenes']:
 lines+=['## '+s['sceneId'],'',f"SHA-256: `{s['videoSha256']}`. Verdict: **approved_visual_samples**.",'']+['- '+x for x in s['findings']]+['']
lines+=['All 84 frames decode in every candidate, with no audio tracks. Exact hashes match the producer QA records and were rechecked before report creation. Evidence scripts, crops, independent codec/seam metrics and region checks are in `25-evidence/`; machine-readable report is `25.json`. Labels are evidence padding outside video content.','']
(out/'25.md').write_text('\n'.join(lines))
print('Wrote 25.json and 25.md; three exact hashes reverified.')
