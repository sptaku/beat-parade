// アローゲーム(40本)の テスト: ふめん・描画・ぜんノーツを ただしい ほうこうで とる
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));

console.log('--- 1) 40本の ふめん ---');
ok(GameData.SPECIALS.solo.length === 40 && new Set(GameData.SPECIALS.solo).size === 40, '40本(かぶりなし)', GameData.SPECIALS.solo.length);
for (const a of GameData.SPECIALS.solo) {
  const def = GameData.specialDef('solo', a);
  const pat = Patterns.buildGamePattern(def);
  const el = pat.targets.filter(t => t.kind !== 'bomb');
  const groups = new Map();
  for (const t of el) { const k = t.b.toFixed(3); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t.dir); }
  const dup = [...groups.values()].some(ds => new Set(ds).size !== ds.length);
  const noDir = el.filter(t => !t.dir).length;
  ok(el.length >= 10 && noDir === 0 && !dup && Patterns.ARCH[a].arrow, `${a}: ${el.length}本・ぜんぶ ほうこうつき・同時押しは べつほうこう`, JSON.stringify({ noDir, dup }));
}
console.log('--- 2) 描画が おちない(全ゲーム・全拍) ---');
{
  const errs = [];
  for (const a of GameData.SPECIALS.solo) {
    const def = GameData.specialDef('solo', a);
    try {
      Engine.play(def, { finish() {}, exit() {} }, 'solo'); frame();
      clock.t += 1; byId('btn-go').fire('click');
      const spb = 60 / def.bpm;
      for (let i = 0; i < 82 * 4; i++) { clock.t += spb / 4; frame(); }
    } catch (e) { errs.push(a + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); }
  }
  Engine.stop();
  ok(errs.length === 0, '例外なし', errs.join(' | '));
}
function run(def, maxSec = 120) {
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t;
  byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: DIRKEY[t.dir] }));
  const end = begin + maxSec;
  while (!result && clock.t < end) {
    clock.t += 0.004;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  return result;
}
console.log('--- 3) ただしい ほうこうで 全ゲーム superb ---');
for (const a of GameData.SPECIALS.solo) {
  const r = run(GameData.specialDef('solo', a));
  ok(r && r.rank === 'superb' && r.miss === 0 && r.whiff === 0, `${a}: superb`, JSON.stringify(r));
}
console.log('--- 4) UI: セレクトの 列に 40本 ---');
{
  byId('btn-start').fire('click');
  const list = byId('stage-list').innerHTML;
  ok((list.match(/data-sp="/g) || []).length === 40 && list.includes('✅ 0/40'), 'アローせんようの 列に 40本');
  ok(GameData.pcTargets('solo').length === 60 + 40 + 40, 'パーフェクト対象 140本', GameData.pcTargets('solo').length);
}
done();
