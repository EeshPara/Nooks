import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { safeBackgroundImage, getSpaceStyle, defaultSpace, themes, roomScenes, getRoomScene, getRoomImage } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

// Decode dimensions from the actual runtime RIFF chunks, not the conversion manifest.
// https://developers.google.com/speed/webp/docs/riff_container
function webpDimensions(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  assert.equal(data.readUInt32LE(4) + 8, data.length);
  for (let offset = 12; offset + 8 <= data.length;) {
    const type = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + size <= data.length, 'Truncated WebP chunk');
    if (type === 'VP8X') {
      assert.ok(size >= 10);
      return [data.readUIntLE(start + 4, 3) + 1, data.readUIntLE(start + 7, 3) + 1];
    }
    if (type === 'VP8 ') {
      assert.ok(size >= 10);
      assert.equal(data.subarray(start + 3, start + 6).toString('hex'), '9d012a');
      return [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff];
    }
    if (type === 'VP8L') {
      assert.ok(size >= 5); assert.equal(data[start], 0x2f);
      const packed = data.readUInt32LE(start + 1);
      return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    }
    offset = start + size + (size % 2);
  }
  assert.fail('WebP image dimensions are missing');
}

test('all 31 distinct selectable room backgrounds exist with their declared dimensions', () => {
  assert.equal(roomScenes.length, 31);
  assert.equal(new Set(roomScenes.map(room => room.id)).size, 31);
  assert.equal(new Set(roomScenes.map(room => room.image)).size, 31);
  for (const room of roomScenes) {
    const data = fs.readFileSync(new URL('../../public' + room.image, import.meta.url));
    assert.ok(room.image.endsWith('.webp'), room.id);
    assert.deepEqual(webpDimensions(data), [room.width, room.height], room.id);
    assert.equal(getRoomScene({ ...defaultSpace, room: room.id }).title, room.title);
    assert.equal(getRoomImage({ ...defaultSpace, room: room.id }), room.image);
  }
});

test('room selection preserves legacy theme fallback and safely handles custom artwork', () => {
  assert.equal(getRoomScene({ ...defaultSpace, theme: 'sky' }).id, 'midnight-train');
  assert.equal(getRoomScene({ ...defaultSpace, room: 'unknown', theme: 'sunrise' }).id, 'sakura-garden');
  const custom = getRoomScene({ ...defaultSpace, room: 'night-campus', backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(custom.title, 'Your own nook');
  assert.equal(custom.mood, 'none');
  assert.deepEqual(custom.segments, []);
  assert.equal(getRoomScene({ ...defaultSpace, room: 'night-campus', backgroundImage: 'https://tracking.example/image.png' }).id, 'night-campus');
});

test('background display accepts only capped raster data URLs', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(safeBackgroundImage(image), image);
  assert.equal(safeBackgroundImage('https://tracking.example/image.png'), undefined);
  assert.equal(safeBackgroundImage('javascript:alert(1)'), undefined);
  assert.equal(safeBackgroundImage('data:image/svg+xml;base64,PHN2Zz4='), undefined);
  assert.equal(safeBackgroundImage('data:image/png;base64,' + 'A'.repeat(1_000_000)), undefined);
});

test('all curated themes have distinct readable foregrounds and matching shell variables', () => {
  const backgrounds = new Set();
  for (const theme of themes) {
    const style = getSpaceStyle({ ...defaultSpace, theme: theme.id });
    backgrounds.add(style['--space-bg']);
    assert.equal(style['--space-bg'], style['--bg']);
    assert.equal(style['--space-ink'], style['--ink']);
    assert.notEqual(style['--space-ink'], style['--space-bg']);
  }
  assert.equal(backgrounds.size, 5);
  assert.equal(getSpaceStyle({ ...defaultSpace, theme: 'unknown' })['--space-bg'], getSpaceStyle(defaultSpace)['--space-bg']);
});

test('accent text maintains at least 4.5:1 contrast on every themed surface', () => {
  function luminance(hex) {
    const [r, g, b] = hex.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * b;
  }
  for (const theme of themes) for (const accent of ['#8bc8a7', '#e9ab86', '#b1a0d8', '#8cbad1', '#d7a0b1']) {
    const style = getSpaceStyle({ ...defaultSpace, theme: theme.id, accent });
    const first = luminance(style['--accent']), second = luminance(style['--surface']);
    const contrast = (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
    assert.ok(contrast >= 4.5, `${theme.id} ${accent}: ${contrast}`);
  }
});
