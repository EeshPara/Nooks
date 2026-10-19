import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path.cwd();base=Path('creative/nooks-release/scene-reviews');m=json.loads((base/'19-evidence/metrics.json').read_text())
findings={
'sumeru-akademiya':[
'Native-source crops, eight motion samples, last-two/first-two seam samples and full-scene contact views were inspected. Columns, arches, lamps, manuscripts and foreground furniture retain stable geometry.',
'The hanging leaf mask introduces faint offset translucent leaf silhouettes in the blue-sky gaps beside the original dark leaves. In enlarged source/frame comparisons, the retained crisp leaves coexist with a softer moving foliage layer. This reads as ghosted foliage rather than singular leaves swaying.',
'The distant waterfall changes gently within its existing drop; surrounding structures and waterfall lip remain coherent in the sampled frames. No obvious hard mask edge or large seam jump was seen. Passing seam and outside-mask metrics do not detect the foliage compositing defect.'
],
'mage-archive':[
'Native-source crops, eight motion samples, last-two/first-two seam samples and full-scene contact views were inspected. Books, chair, cup rim, fireplace grate, ladder, window and meadow retain stable geometry.',
'Fire variation remains inside the hearth opening behind the grate and foreground books. Samples show a coherent flame mass without an offset duplicate candle or detached flame. The hearth brightness and scale suit the room.',
'Tea steam is fine and low contrast; it does not visibly distort the chair or book edges behind the cup. Sampled loop-boundary frames have no obvious extra geometry discontinuity.'
]}
report={'reviewId':'19','reviewer':'scene_review_19','reviewedAtUtc':datetime.now(timezone.utc).isoformat(),'method':'Inspected source artwork crops, masks and full-scene contact views; independently fully decoded all frames, calculated seam/inside/outside-mask/brightness metrics, and viewed native-resolution motion crops plus enlarged source and boundary comparisons. SHA-256 checked before/after decode and before report writing.','limitations':['No full-speed playback or audio audition performed.','Approval applies only to sampled visuals of the exact hash, not integrated product quality or production readiness.'],'scenes':[]}
for sid,data in m.items():
 path=Path('creative/nooks-animated-all/jobs')/sid/'finished.mp4';assert hashlib.sha256(path.read_bytes()).hexdigest()==data['videoSha256']
 verdict='needs_revision' if sid=='sumeru-akademiya' else 'approved_visual_samples'
 changes=['Freeze the hanging leaf mask while retaining the distant waterfall, or repair foliage compositing so each leaf is singular; independently review the new hash.'] if verdict=='needs_revision' else []
 report['scenes'].append({'sceneId':sid,'videoPath':str(path),'videoSha256':data['videoSha256'],'qaMatchesVideo':data['qaMatchesVideo'],'verdict':verdict,'scope':'Exact-SHA sampled visuals and independent full-decode metrics; no full-speed playback or audio audition','quantitativeQa':data['quantitativeQa'],'independentMetrics':{k:v for k,v in data.items() if k!='quantitativeQa'},'findings':findings[sid],'requiredChanges':changes,'followUps':['Verify repeated full-speed playback and audition integrated ambience.'],'evidence':[str(p) for p in sorted((base/'19-evidence').glob(sid+'-*.png'))]+[f'creative/nooks-animated-all/jobs/{sid}/mask-review.jpg',f'creative/nooks-animated-all/jobs/{sid}/review-contact.jpg']})
(base/'19.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Scene review 19','',report['method'],'','No full-speed playback or audio audition. Exact-hash visual samples only.','']
for s in report['scenes']:
 d=s['independentMetrics'];lines.extend([f"## {s['sceneId']}: {s['verdict']}",'',f"SHA-256: `{s['videoSha256']}`",'',f"Full decode: {d['frames']} frames, 1280×720, 24 fps, 3.5 seconds, no audio. Seam/typical {d['seamVsTypical']:.4f}; outside-mask change {d['outsideMaskChange']:.8f}. Producer QA matches exact video.",''])
 lines.extend('- '+v for v in s['findings']);lines.append('');lines.extend('- Required: '+v for v in s['requiredChanges']);lines.extend(['',f"Evidence: `19-evidence/{s['sceneId']}-*-motion.png`, `*-seam.png`, and `*-source-compare.png`; metrics in `19-evidence/metrics.json`.",''])
(base/'19.md').write_text('\n'.join(lines))
print('Wrote 19.json and 19.md; exact hashes unchanged.')
