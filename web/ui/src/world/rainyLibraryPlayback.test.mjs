import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./rainyLibraryPlayback.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createRainyLibraryPlayback, usesRainyLibraryFilm } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function harness(options = {}) {
  const ready = [], requests = [], plays = [];
  let currentSrc = '', paused = true;
  const video = {
    muted: false, loop: false, playsInline: false,
    get src() { return currentSrc; },
    set src(value) { currentSrc = value; requests.push(value); },
    play() { paused = false; return new Promise((resolve, reject) => plays.push({ resolve, reject })); },
    pause() { paused = true; },
    load() {},
    removeAttribute(attribute) { assert.equal(attribute, 'src'); currentSrc = ''; },
  };
  const player = createRainyLibraryPlayback({
    video, src: '/media/nooks/rainy-library-loop-v1.mp4', enabled: true,
    reducedMotion: false, hidden: false, onReady: value => ready.push(value), ...options,
  });
  return { player, video, ready, requests, plays, get paused() { return paused; } };
}

test('disabled motion, reduced motion, and initially hidden tabs do not fetch video', () => {
  for (const options of [{ enabled: false }, { reducedMotion: true }, { hidden: true }]) {
    const h = harness(options);
    assert.deepEqual(h.requests, []);
    assert.equal(h.video.src, '');
    assert.equal(h.paused, true);
    h.player.dispose();
  }
});

test('a visible permitted film is silent, loops inline, and only replaces its still after playback', () => {
  const h = harness();
  assert.equal(h.requests.length, 1);
  assert.equal(h.video.muted, true);
  assert.equal(h.video.loop, true);
  assert.equal(h.video.playsInline, true);
  assert.deepEqual(h.ready, []);
  h.player.playing();
  assert.deepEqual(h.ready, [true]);
});

test('pause and hidden tab preserve the frame without fetching or restarting the asset', () => {
  const h = harness(); h.player.playing();
  h.player.enabled(false);
  assert.equal(h.paused, true);
  assert.equal(h.ready.at(-1), true);
  h.player.enabled(true);
  assert.equal(h.paused, false);
  h.player.visibility(true);
  assert.equal(h.paused, true);
  h.player.visibility(false);
  assert.equal(h.paused, false);
  assert.equal(h.requests.length, 1);
});

test('live reduced motion returns to the still and releases video', () => {
  const h = harness(); h.player.playing();
  h.player.reduceMotion(true);
  assert.equal(h.paused, true);
  assert.equal(h.video.src, '');
  assert.equal(h.ready.at(-1), false);
  h.player.visibility(false);
  assert.equal(h.requests.length, 1);
});

test('autoplay denial and media failure fall back to the still without repeated requests', async () => {
  const h = harness();
  h.plays[0].reject(new Error('NotAllowedError'));
  await Promise.resolve();
  assert.equal(h.video.src, '');
  assert.equal(h.ready.at(-1), false);
  h.player.visibility(true); h.player.visibility(false);
  assert.equal(h.requests.length, 1);
  h.player.enabled(false); h.player.enabled(true);
  assert.equal(h.requests.length, 2, 'an explicit resume allows one new attempt');
  h.player.playing(); h.player.failed();
  assert.equal(h.video.src, '');
  assert.equal(h.ready.at(-1), false);
});

test('late rejection after pause or disposal cannot erase a frame or restart playback', async () => {
  const h = harness(); h.player.playing(); h.player.enabled(false);
  h.plays[0].reject(new Error('AbortError'));
  await Promise.resolve();
  assert.equal(h.ready.at(-1), true);
  assert.equal(h.requests.length, 1);
  h.player.enabled(true); h.player.dispose();
  h.plays.at(-1).reject(new Error('AbortError'));
  await Promise.resolve();
  h.player.visibility(false); h.player.enabled(true); h.player.playing();
  assert.equal(h.video.src, '');
  assert.equal(h.ready.at(-1), false);
  assert.equal(h.requests.length, 1);
});

test('the film is restricted to canonical Rainy Library artwork', () => {
  const scene = { workspaceReady: true, roomId: 'rainy-library', sceneImage: '/images/lofi-rainy-library.webp', customArtwork: false, alternateScene: false, customNook: false };
  assert.equal(usesRainyLibraryFilm(scene), true);
  for (const change of [{ workspaceReady: false }, { roomId: 'midnight-train' }, { sceneImage: '/images/custom.webp' }, { customArtwork: true }, { alternateScene: true }, { customNook: true }]) {
    assert.equal(usesRainyLibraryFilm({ ...scene, ...change }), false);
  }
});

test('a placeholder library never starts media before the saved scene has loaded', () => {
  const initial={workspaceReady:false,roomId:'rainy-library',sceneImage:'/images/lofi-rainy-library.webp',customArtwork:false,alternateScene:false,customNook:false};
  for(const saved of [{roomId:'midnight-train',sceneImage:'/images/lofi-midnight-train.webp'},{customArtwork:true,sceneImage:'/images/custom.webp'},{customNook:true},{}]){
    let mediaStarts=0;
    for(const scene of [initial,{...initial,workspaceReady:true,...saved}]){
      if(usesRainyLibraryFilm(scene)){
        const h=harness();mediaStarts+=h.requests.length;h.player.dispose();
      }
    }
    assert.equal(mediaStarts,Object.keys(saved).length?0:1);
  }
});
