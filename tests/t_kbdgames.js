// キーボードせんよう ゲーム(16本)の テスト
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
const KEYRE = /^(Key[A-Z]|Digit[0-9])$/;

console.log('--- 1) 16本の ふめん ---');
ok(GameData.KBD_GAMES.length === 40 && new Set(GameData.KBD_GAMES).size === 40, '40本(かぶりなし)', GameData.KBD_GAMES.length);
for (const a of GameData.KBD_GAMES) {
  const def = GameData.kbdGameDef(a);
  const pat = Patterns.buildGamePattern(def);
  const el = pat.targets.filter(t => t.kind !== 'bomb');
  const bad = el.filter(t => !KEYRE.test(t.kbd || ''));
  const groups = new Map();
  for (const t of el) { const k = t.b.toFixed(3); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t.kbd); }
  const dup = [...groups.values()].some(ks => new Set(ks).size !== ks.length);
  const holds = el.filter(t => t.hold).length, bombs = pat.targets.length - el.length, secret = el.filter(t => t.secret).length;
  ok(el.length >= 10 && bad.length === 0 && !dup && def.id === 'kbd:' + a && Patterns.ARCH[a].kbdGame, `${a}: ${el.length}本 (hold ${holds} / bomb ${bombs} / ? ${secret})`, JSON.stringify({ bad: bad.length, dup }));
  if (a === 'morsecode') ok(holds > 0, 'モールスに ながおし');
  if (a === 'keymole') ok(bombs > 0, 'もぐらに ボム');
  if (['math', 'nextone', 'spellbee', 'neighbor', 'password', 'dicesum', 'clock', 'initials', 'spellpic', 'shiritori', 'count', 'bigger', 'oddeven', 'rowpos', 'kuku', 'sortabc', 'simon'].includes(a)) ok(secret === el.length, a + ': ぜんぶ secret');
  if (a === 'organ' || a === 'morseword') ok(holds > 0, a + ': ながおし');
  if (a === 'twinmole') ok(bombs > 0 && [...groups.values()].some(ks => ks.length === 2), 'ふたご: ボム + 同時押し');
  if (a === 'chordpiano') ok([...groups.values()].some(ks => ks.length === 2), 'わおん: 同時押し');
  if (a === 'romaji' || a === 'countdown') ok([...groups.values()].some(ks => ks.length === 2), a + ': 同時押しが ある');
}
console.log('--- 2) 描画が おちない(全ゲーム・全拍) ---');
{
  const errs = [];
  for (const a of GameData.KBD_GAMES) {
    const def = GameData.kbdGameDef(a);
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
function run(def, play, maxSec = 120) {
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t;
  byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: play === 'perfect' ? t.kbd : 'Space' }));
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
console.log('--- 3) ただしい キーで 全ゲーム superb ---');
for (const a of GameData.KBD_GAMES) {
  const r = run(Object.assign(GameData.kbdGameDef(a), { kbdMode: true }), 'perfect');
  ok(r && r.rank === 'superb' && r.miss === 0 && r.whiff === 0, `${a}: superb`, JSON.stringify(r));
}
{
  const r = run(Object.assign(GameData.kbdGameDef('typing'), { kbdMode: true }), 'space');
  ok(r && r.whiff > 0 && r.perfect + r.ok === 0, 'スペースでは とれない');
  ok(H.drawn.some(s => s === '?'), 'よこく/レーンに ? が でる(secret)');
}
console.log('--- 4) UI ---');
{
  byId('btn-start').fire('click');
  const list = byId('stage-list').innerHTML;
  ok(list.includes('⌨️ キーボードせんよう') && (list.match(/data-kbd="/g) || []).length === 40 && list.includes('✅ 0/40'), 'キーボードせんようの 列に 40本');
  GameData.setNoteMode('arrow');
  const btn = { dataset: { kbd: 'typing' }, classList: { add() {}, remove() {} } };
  const ov = byId('game-overlay');
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('キーボードせんよう ゲーム') && ov.innerHTML.includes('btn-go') && !ov.innerHTML.includes('アロー版'), 'イントロ');
  ok(lastPattern.targets.every(t => !t.dir) && lastPattern.targets.every(t => t.kbd), 'アロー版ONでも キーのまま');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.kbdGameDef('typing');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.kbd }));
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 60000) {
    clock.t += 0.004;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  ok(GameData.rank('kbd:typing') === 3 && GameData.rank('kbd:typing#arrow') === 0, 'きろくは kbd:typing');
  byId('btn-back').fire('click');
  ok(byId('stage-list').innerHTML.includes('✅ 1/40'), '進捗 1/40');
  GameData.setNoteMode('off');
  ok(GameData.defFromId('kbd:math').id === 'kbd:math' && GameData.pcTargets('solo').includes('kbd:math'), 'defFromId / パーフェクト対象');
}
done();
