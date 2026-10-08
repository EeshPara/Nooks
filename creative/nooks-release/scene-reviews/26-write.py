from pathlib import Path
import json,hashlib,datetime
root=Path.cwd();base=root/'creative/nooks-release/scene-reviews';metrics=json.loads((base/'26-evidence/metrics.json').read_text())
findings={
'neon-tokyo':[
'The two broad rain masks have been removed. Source and sampled skyline crops retain singular window rows, train, tower and storefront edges; the offset buildings seen in review 24 are absent. The independent skyline crop has mean temporal range 0.000475 on 0–255 values, consistent with an effectively static exterior.',
'The remaining mug steam is restrained and transparent. Eight motion samples and source/brightness-extreme/seam crops show a stable mug rim, window bar and exterior silhouette behind it, with no conspicuous solid plume or doubled mug.',
'This is a largely still Tokyo scene with localized steam, not an animated skyline or moving rain. Sampled last-two/first-two images show no apparent geometry jump; seam/typical ratio is 0.6045.'],
'cyberpunk-rain-loft':[
'The displaced towers, extra window rows and changed flying-vehicle silhouette from review 20 are removed. The sampled skyline remains aligned to the source; independent skyline mean temporal range is 0.000717 on 0–255 values.',
'Canal reflections vary subtly within the water region. Source comparison, eight motion samples and boundary samples preserve the foreground bridge and surrounding building edges without an apparent duplicated bridge or hard compositing edge.',
'The sampled seam has no evident geometry jump. Independently measured seam/typical ratio 3.7611 remains below the existing threshold of 4, with less margin than the other three clips. Repeated full-speed playback should check whether the water boundary is perceptible.'],
'sumeru-akademiya':[
'The right hanging-leaf crop now retains the single original leaf silhouettes against the blue sky. The faint displaced foliage from review 19 is absent in source, brightness-extreme and boundary comparisons; its mean temporal range is only 0.000162 on 0–255 values.',
'The retained distant waterfall varies within its existing cascade. Eight native motion crops show coherent falling-water streaks; the lip, neighboring palms, arch and distant wall remain visually aligned in the examined samples.',
'This correction freezes the leaves and keeps localized waterfall motion. Last-two/first-two waterfall samples show no obvious geometry jump; independently measured seam/typical ratio is 2.3273.'],
'aurora-cabin':[
'The hard-topped green sky patches identified in review 22 are removed. Source and sampled sky views preserve the original continuous aurora shape, stars, mountains and tree silhouette. The sky is effectively static, with crop mean temporal range 0.000071 on 0–255 values.',
'The stove retains a coherent changing flame mass inside its glass opening. Eight native crop samples and source/brightness-extreme comparisons retain the stove frame, door handle and log arrangement without an apparent duplicate rigid object or detached flame.',
'The replacement animates the stove, not the aurora. Sampled last-two/first-two stove frames show no obvious geometry jump; independent seam/typical ratio is 0.8344.']}
report={'reviewId':'26','reviewer':'scene_review_26','reviewedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Read original defects in reviews 24, 20, 19 and 22. Checked exact requested hashes, independently decoded every frame with ffmpeg, recomputed motion/seam/region metrics, inspected producer full-scene contact sheets and independently extracted native source/motion/seam crops using view_image. Checked hashes again before report writing.','limitations':['No continuous full-speed playback or audio audition performed.','Approval is limited to the exact-hash sampled visuals and full technical decode, not integrated experience or production readiness.'],'scenes':[]}
md=['# Independent corrected scene review 26','','All four exact candidates are `approved_visual_samples`. Independently decoded all 84 frames of each 1280×720, 24 fps, 3.5-second silent H.264 film. Reviewed the original defects, source comparisons, eight motion samples, brightness extremes and last-two/first-two seam crops.','','No continuous full-speed playback or audio audition. No assets, specs or mappings changed.','']
for name,m in metrics.items():
 p=root/'creative/nooks-animated-all/jobs'/name/'finished.mp4';sha=hashlib.sha256(p.read_bytes()).hexdigest();assert sha==m['videoSha256'];qa=json.loads(p.with_name('qa.json').read_text());assert sha==qa['videoSha256']
 report['scenes'].append({'sceneId':name,'videoPath':str(p.relative_to(root)),'videoSha256':sha,'qaMatchesVideo':True,'verdict':'approved_visual_samples','scope':'Exact-hash sampled visual review and independent full decode','quantitativeQa':qa,'independentMetrics':m,'findings':findings[name],'requiredChanges':[],'followUps':['Review repeated full-speed playback and integrated ambience in the product.'],'evidence':m['evidence']})
 md += [f'## {name}', '',f'- Verdict: `approved_visual_samples`',f'- SHA-256: `{sha}`',f'- Full decode: 84 frames; seam/typical: {m["seamVsTypical"]:.4f}', ''] + [x+'\n' for x in findings[name]] + [f'Evidence: `26-evidence/{name}-*-motion.png`, `*-source-seam.png`; independent metrics in `26-evidence/metrics.json`.','']
(base/'26.json').write_text(json.dumps(report,indent=2)+'\n');(base/'26.md').write_text('\n'.join(md)+'\n')
print('Wrote 26.json and 26.md; all four exact SHA-256 candidates approved_visual_samples')
