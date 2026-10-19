"""Fail closed unless all 50 shipped films match independent frame-review evidence.

This verifies reviewed bytes and snapshot parity, not listening or continuous
playback quality. Run after publishing locally and before either deployment.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify():
    expected = {item['id'] for item in read(ROOT / 'creative/nooks-50-backgrounds/scenes.json')}
    assert len(expected) == 50, 'Expected the complete 50-room catalog'
    manifest = {item['roomId']: item for item in read(ROOT / 'creative/nooks-animated-all/manifest.json')['clips']}
    assert set(manifest) == expected, f'Missing final metadata: {sorted(expected - set(manifest))}'
    reviews = []
    for path in sorted((HERE / 'scene-reviews').glob('*.json')):
        # Only independent review reports, not authors' correction handoffs.
        if not (path.stem.isdecimal() or path.stem.startswith('corrections-')):
            continue
        report = read(path)
        for scene in report.get('scenes', []):
            reviews.append((path, scene))
    mapping = read(ROOT / 'web/ui/src/world/nookFilms.json')
    assert set(mapping) == expected, f'Film mapping incomplete: {sorted(expected - set(mapping))}'
    targets = [ROOT / name for name in ('web', 'app', 'cloud')]
    native = ROOT.parent / 'nooks-site-update'
    if native.exists():
        targets.append(native)
    results = []
    for name in sorted(expected):
        clip = manifest[name]
        film = mapping[name]
        video = ROOT / 'web/ui/public' / film['video'].lstrip('/')
        artwork = ROOT / 'web/ui/public' / film['image'].lstrip('/')
        digest = sha(video)
        assert clip['qa']['technicalPass'], f'{name}: technical gate failed'
        assert clip['qa']['videoSha256'] == digest, f'{name}: stale video metadata'
        assert clip['qa']['sourceArtworkSha256'] == sha(artwork), f'{name}: stale artwork'
        matching = [(path, scene) for path, scene in reviews
                    if scene.get('sceneId', scene.get('roomId')) == name
                    and scene.get('videoSha256') == digest]
        approved = [path for path, scene in matching
                    if scene.get('verdict') in ('approved', 'approved_visual_samples')]
        rejected = [path for path, scene in matching
                    if any(term in str(scene.get('verdict', '')).lower()
                           for term in ('reject', 'revision', 'fail', 'needs_', 'requires_', 'changes_required'))]
        assert approved and not rejected, f'{name}: missing or conflicting independent exact-hash approval'
        for target in targets:
            assert read(target / 'ui/src/world/nookFilms.json') == mapping, f'{target.name}: mapping drift'
            assert sha(target / 'ui/public' / film['video'].lstrip('/')) == digest, f'{target.name}/{name}: video drift'
            assert sha(target / 'ui/public' / film['image'].lstrip('/')) == sha(artwork), f'{target.name}/{name}: artwork drift'
        results.append({'roomId': name, 'sha256': digest,
                        'independentReports': [str(path.relative_to(ROOT)) for path in approved]})
    result = {'passed': True, 'rooms': len(results), 'targets': [str(t) for t in targets],
              'scope': 'Exact bytes, full-decode metadata, independent frame samples, source artwork and target parity; no continuous playback or listening claim',
              'scenes': results}
    (HERE / 'media-release-verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'PASS: {len(results)} independently reviewed films match all {len(targets)} source targets')


if __name__ == '__main__':
    verify()
