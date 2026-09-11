// ミックス せんよう ゲーム(4ファミリー × 40本)の テスト
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
const KINDS = { am: ['dir', 'plain'], km: ['kbd', 'plain'], ak: ['dir', 'kbd'], akm: ['dir', 'kbd', 'plain'] };
const kindOf = t => (t.dir ? 'dir' : t.kbd ? 'kbd' : 'plain');
const FAMS = Object.keys(GameData.MIX_GAMES);

console.log('--- 1) 160本の ふめん: ゆるされた しゅるいだけ・ぜんしゅるい 出る・同時押しは べつ・バリエーションどおり ---');
ok(FAMS.length === 4 && FAMS.every(f => GameData.MIX_GAMES[f].length === 40 && new Set(GameData.MIX_GAMES[f]).size === 40), '4ファミリー × 40本');
{
  const bad = [];
  for (const fam of FAMS) for (const sub of GameData.MIX_GAMES[fam]) {
    const def = GameData.mixGameDef(fam, sub);
    const pat = Patterns.buildGamePattern(def);
    const el = pat.targets.filter(t => t.kind !== 'bomb'), bombs = pat.targets.length - el.length;
    const kinds = new Set(el.map(kindOf));
    const allowed = [...kinds].every(k => KINDS[fam].includes(k)), allPresent = KINDS[fam].every(k => kinds.has(k));
    const groups = new Map(); for (const t of el) { const k = t.b.toFixed(3); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    const dup = [...groups.values()].some(g => g.length > 1 && (new Set(g.map(t => t.dir ? 'd' + t.dir : t.kbd ? 'k' + t.kbd : 'p')).size !== g.length));
    const chords = [...groups.values()].filter(g => g.length > 1).length, holds = el.filter(t => t.hold).length;
    const v = sub.slice(-1);
    const varOK = v === 'c' ? holds > 0 : v === 'd' ? (chords > 0 && bombs > 0) : (holds === 0 && bombs === 0 && chords === 0);
    const noL = el.every(t => t.kbd !== 'KeyL');
    const secretOK = sub.startsWith('memory') ? el.every(t => t.secret) : el.every(t => !t.secret);
    if (!(el.length >= 10 && allowed && allPresent && !dup && varOK && noL && secretOK && def.id === fam + ':' + sub && Patterns.ARCH[def.arch].mixGame === fam)) bad.push(def.id + JSON.stringify({ n: el.length, allowed, allPresent, dup, varOK, noL, secretOK }));
  }
  ok(bad.length === 0, '160本 ぜんぶ OK', bad.slice(0, 4).join(' | '));
}
console.log('--- 2) 描画が おちない(160本・全拍) ---');
{
  const errs = [];
  for (const fam of FAMS) for (const sub of GameData.MIX_GAMES[fam]) {
    const def = GameData.mixGameDef(fam, sub);
    try {
      Object.assign(def, { fixedNotes: true, kbdMode: fam !== 'am', arrowMode: fam === 'ak' || fam === 'akm', mix: fam !== 'ak' });
      Engine.play(def, { finish() {}, exit() {} }, 'solo'); frame();
      clock.t += 1; byId('btn-go').fire('click');
      const spb = 60 / def.bpm;
      for (let i = 0; i < 82 * 3; i++) { clock.t += spb / 3; frame(); }
    } catch (e) { errs.push(def.id + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); }
  }
  Engine.stop();
  ok(errs.length === 0, '例外なし', errs.slice(0, 3).join(' | '));
}
function run(def) {
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t;
  byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : t.kbd ? t.kbd : 'Space' }));
  const end = begin + 120;
  while (!result && clock.t < end) {
    clock.t += 0.006;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  return result;
}
console.log('--- 3) ただしい 入力で 160本 superb(UI の startGame と おなじ フラグ) ---');
{
  const bad = [];
  for (const fam of FAMS) for (const sub of GameData.MIX_GAMES[fam]) {
    const def = GameData.mixGameDef(fam, sub);
    Object.assign(def, { fixedNotes: true, kbdMode: fam !== 'am', arrowMode: fam === 'ak' || fam === 'akm', mix: fam !== 'ak' });
    const r = run(def);
    if (!(r && r.rank === 'superb' && r.miss === 0 && r.whiff === 0)) bad.push(def.id + ' ' + JSON.stringify(r));
  }
  ok(bad.length === 0, '160本 superb', bad.slice(0, 4).join(' | '));
}
console.log('--- 4) UI: 4つの 列・きろく・ノーツモードとは 無関係 ---');
{
  byId('btn-start').fire('click');
  const list = byId('stage-list').innerHTML;
  ok((list.match(/data-mix="/g) || []).length === 160 && list.includes('アロー＆通常 せんよう') && list.includes('アロー＆キーボード＆通常 せんよう') && (list.match(/✅ 0\/40/g) || []).length >= 4, '4つの 列に 160本');
  GameData.setNoteMode('kbdonly');   // ノーツモードが ONでも 無関係
  const ov = byId('game-overlay');
  const btn = { dataset: { mix: 'akm:belt_d' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('アロー＆キーボード＆通常 せんよう') && ov.innerHTML.includes('btn-go') && !ov.innerHTML.includes('キーボード専用版'), 'イントロ');
  ok(lastPattern.targets.some(t => t.dir) && lastPattern.targets.some(t => t.kbd) && lastPattern.targets.some(t => !t.dir && !t.kbd && t.kind !== 'bomb'), 'kbdonly が ONでも 3しゅるい のまま');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.mixGameDef('akm', 'belt_d');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : t.kbd ? t.kbd : 'Space' }));
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 40000) {
    clock.t += 0.006;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  ok(ov.innerHTML.includes('rk-superb') && GameData.rank('akm:belt_d') === 3 && GameData.rank('akm:belt_d#kbdonly') === 0, 'UI経由で superb・きろく akm:belt_d', ov.innerHTML.slice(0, 120));
  byId('btn-back').fire('click');
  ok(byId('stage-list').innerHTML.includes('✅ 1/40'), '進捗 1/40');
  GameData.setNoteMode('off');
  ok(GameData.defFromId('km:drums_c').id === 'km:drums_c' && GameData.pcTargets('solo').length === 60 + 40 + 40 + 160, 'defFromId / パーフェクト対象 300本', GameData.pcTargets('solo').length);
}
done();
