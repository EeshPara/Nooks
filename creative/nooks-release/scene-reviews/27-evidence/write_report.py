import json,hashlib
from datetime import datetime,timezone
from pathlib import Path
base=Path('creative/nooks-release/scene-reviews'); metrics=json.loads((base/'27-evidence/metrics.json').read_text())
expected={'lighthouse-study':'a358cfcc2ed5225af6ec6641d66b05669f5e59ca8e5fd14da73d27c43fb2537b','desert-casita':'bdf54988552ae7f23a71893c7424c7d2b7feb203c6e2a651d25970d35b28438e','stationery-studio':'aac94049ca9f537333c203768554847117ead7dd2c595911369e571ca59cd547'}
findings={
'lighthouse-study':[
'The boat now has one crisp sail, mast and hull consistent with the source. The cliff retains its original rock contours without the former blended smear. Both independent inspection crops have zero decoded temporal change across all 84 frames and no mask coverage.',
'Localized open-sea variation and faint steam remain. Sampled water variation stays clear of the boat, cliff and railing; the furniture and foreground cup remain singular and stable. The cup inspection crop has zero temporal change.',
'The native full frame retains the original warm scene composition. Eight motion samples and last-two/first-two water and steam crops show no conspicuous boundary discontinuity. Independently recomputed seam/typical ratio is 1.3680.'
],
'desert-casita':[
'The stone fountain stem and base retain singular source contours; the displaced translucent left edge from review 23 is absent. The pedestal inspection crop has zero mask coverage and only 0.00001594 mean adjacent channel change, consistent with negligible codec variation.',
'Water ripples remain in the open pool on either side of the pedestal, with stable tile borders and no sampled duplicate stone. Faint steam above the drink remains, while the cup inspection crop is pixel-identical across all 84 frames.',
'The native full frame preserves the courtyard architecture, plants and lamp geometry. Eight motion samples and last-two/first-two pool and steam crops show no conspicuous boundary jump. Independently recomputed seam/typical ratio is 0.7146.'
],
'stationery-studio':[
'The window vase now preserves the source decoration, handle and singular rim/body outline. Its inspection crop has zero mask coverage and zero temporal change across all 84 decoded frames, correcting the former ceramic wobble.',
'Only restrained translucent mug steam animates. The visible wisps stay above the drink in the inspected full frame and motion samples; the drinking mug inspection crop remains pixel-identical through the clip. The plant and candles remain static source artwork, and this must not be described as moving foliage.',
'The native full frame preserves desk, shelving, papers and pen geometry. Eight steam samples and last-two/first-two seam crops show no conspicuous jump or doubled rigid object. Independently recomputed seam/typical ratio is 0.6008.'
]}
r={'reviewId':'27','reviewer':'scene_review_27','reviewedAtUtc':datetime.now(timezone.utc).isoformat(),'method':'Read review 23 defects and producer correction report; independently fully decoded each candidate, verified exact SHA-256, recomputed whole-frame and rigid-region metrics, and viewed original source artwork, native full frames, enlarged source comparisons, eight motion samples and last-two/first-two seam crops.','limitations':['No continuous full-speed playback or audio audition performed.','Approval applies to the exact-hash sampled visuals and full decode, not integrated product quality or production readiness.'],'scenes':[]}
for name,m in metrics.items():
 path=Path('creative/nooks-animated-all/jobs')/name/'finished.mp4'
 assert hashlib.sha256(path.read_bytes()).hexdigest()==m['videoSha256']==expected[name]
 r['scenes'].append({'sceneId':name,'videoPath':str(path),'videoSha256':m['videoSha256'],'qaMatchesVideo':m['qaMatchesVideo'],'verdict':'approved_visual_samples','scope':'Exact-hash sampled visual review and independent full decode','quantitativeQa':m['quantitativeQa'],'independentMetrics':{k:v for k,v in m.items() if k not in ['quantitativeQa','regions']},'independentRegionMetrics':m['regions'],'findings':findings[name],'requiredChanges':[],'followUps':['Verify repeated full-speed playback and integrated ambience in the product.'],'evidence':[str(p) for p in sorted((base/'27-evidence').glob(name+'*.png'))]})
(base/'27.json').write_text(json.dumps(r,indent=2)+'\n')
lines=['# Independent corrected scene review 27','','All three exact candidates are **approved_visual_samples**. Each independently decodes to 84 frames, 1280×720, 24 fps, 3.5 seconds, H.264 High/yuv420p, with no audio track. Their supplied hashes match both the files and QA records.','','I inspected original source artwork, native full frames, source comparisons, eight motion samples, rigid-prop crops, and last-two/first-two seam crops. No continuous full-speed playback or audio audition was performed; integrated playback and ambience remain separate checks.']
for s in r['scenes']:
 lines += ['', '## '+s['sceneId'],'','Verdict: **'+s['verdict']+'**','','SHA-256: `'+s['videoSha256']+'`','']+s['findings']
lines+=['','Reproducible extraction, independent metrics and image evidence are in `27-evidence/`. No assets, specifications, maps, or shared manifests were edited.']
(base/'27.md').write_text('\n\n'.join(lines)+'\n')
print('Wrote 27.json and 27.md; all three exact hashes approved for sampled visuals.')
