import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = source => import('data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64'));
const source = fs.readFileSync(new URL('./useWorkspaceTransition.ts', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replace('export function', 'function');
const { create } = await load(`export const create=({useRef,useLayoutEffect,window})=>{${source};return useWorkspaceTransition;};`);

function harness({ reduced = false, unsupported = false, fails = false } = {}) {
  const refs = [], effects = [], pending = [], animations = [], listeners = new Set();
  let refIndex = 0, effectIndex = 0, widgetSlots = false;
  const preference = { matches: reduced, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) };
  const element = { querySelector: selector => selector === '.workspace-widget-slot' && widgetSlots ? {} : null, animate: unsupported ? undefined : (frames, options) => {
    if (fails) throw new Error('Animation unavailable');
    const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation); return animation;
  } };
  const use = create({
    useRef: value => refs[refIndex++] ||= { current: value },
    useLayoutEffect: (run, deps) => {
      const index = effectIndex++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pending.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
    },
    window: { matchMedia: () => preference },
  });
  return {
    animations, listeners,
    widgets(present) { widgetSlots = present; },
    render(key, enabled = true) { refIndex = 0; effectIndex = 0; const ref = use(key, enabled); ref.current = element; pending.splice(0).forEach(run => run()); return ref; },
    reduce() { preference.matches = true; listeners.forEach(listener => listener()); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('committed note-to-quiz navigation animates the same surface without remounting or replaying autosave', () => {
  const h = harness();
  const surface = h.render('artifact:note:notes');
  h.render('artifact:note:notes'); assert.equal(h.animations.length, 0);
  assert.equal(h.render('artifact:quiz:quiz'), surface);
  assert.equal(h.animations.length, 1); assert.equal(h.animations[0].options.duration, 240);
  assert.equal(h.animations[0].options.fill, 'none', 'no animation can leave the live surface hidden');
  h.render('artifact:quiz:quiz'); assert.equal(h.animations.length, 1);
});

test('rapid navigation cancels the prior animation and leaves only the newest destination animating', () => {
  const h = harness(); h.render('study:welcome'); h.render('artifact:note:1'); h.render('artifact:quiz:2');
  assert.equal(h.animations.length, 2); assert.equal(h.animations[0].cancelled, true); assert.equal(h.animations[1].cancelled, false);
  h.unmount(); assert.equal(h.animations[1].cancelled, true); assert.equal(h.listeners.size, 0);
});

test('returning home with movable widgets fades without creating a fixed-position containing block', () => {
  const h = harness(); h.widgets(true); const surface = h.render('home');
  h.widgets(false); h.render('library');
  assert.ok(h.animations[0].frames.some(frame => frame.translate), 'ordinary document transitions retain their motion');
  h.widgets(true); assert.equal(h.render('home'), surface);
  assert.deepEqual(h.animations[1].frames, [{ opacity: .72 }, { opacity: 1 }]);
  assert.equal(h.animations[0].cancelled, true);
  assert.equal(h.animations[1].options.fill, 'none');
});

test('reduced motion, disabled transitions, and missing animation support keep navigation immediate', () => {
  for (const options of [{ reduced: true }, { unsupported: true }, { fails: true }]) {
    const h = harness(options); h.render('note'); assert.doesNotThrow(() => h.render('quiz')); assert.equal(h.animations.length, 0);
  }
  const h = harness(); h.render('note'); h.render('quiz', false); h.render('quiz', true); assert.equal(h.animations.length, 0, 'reenabling motion does not replay an earlier navigation');
  h.render('cards'); h.reduce(); assert.equal(h.animations[0].cancelled, true, 'a live reduced-motion change stops motion immediately');
});
