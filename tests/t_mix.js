// ノーツモード: アロー＆通常版 / キーボード＆通常版 / アロー＆キーボード版(＆通常版) / キーボード専用版
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY, WASDKEY } = H;
let lastPattern = null;
const origGame = Patterns.buildGamePattern, origEndless = Patterns.buildEndlessPattern;
Patterns.buildGamePattern = def => (lastPattern = origGame(def));
Patterns.buildEndlessPattern = def => (lastPattern = origEndless(def));
const group = t => t.b.toFixed(3) + ':' + t.owner;
function stats(targets, field) {
  const el = targets.filter(t => t.kind !== 'bomb' && t.owner !== -1);
  const withF = el.filter(t => t[field]).length, without = el.length - withF;
  const groups = new Map();
  for (const t of el) { const g = group(t); if (!groups.has(g)) groups.set(g, new Set()); groups.get(g).add(!!t[field]); }
  return { withF, without, inconsistent: [...groups.values()].filter(s => s.size > 1).length, total: el.length };
}
function run(def, mode, play, maxSec = 120) {
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, mode);
  clock.t += 1; const begin = clock.t;
  byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const plainKey = t => (mode === 'solo' ? 'Space' : t.owner === 1 ? 'KeyJ' : 'KeyF');
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({
    t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false,
    code: play === 'perfect' && t.kbd && (def.kbdOnly || !t.dir) ? t.kbd : play === 'perfect' && t.dir ? (t.owner === 1 ? WASDKEY[t.dir] : DIRKEY[t.dir]) : plainKey(t),
  }));
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

console.log('--- 1) アロー＆通常版 ---');
{
  const bad = [];
  for (let s = 1; s <= 6; s++) for (let k = 0; k < 4; k++) {
    const def = Object.assign(GameData.gameDef('omote', s, k), { arrowMode: true, mix: true });
    Engine.play(def, { finish() {}, exit() {} }, 'solo');
    const st = stats(lastPattern.targets, 'dir');
    if (!(st.withF > 0 && st.without > 0) || st.inconsistent) bad.push(def.id + JSON.stringify(st));
  }
  ok(bad.length === 0, '24ゲームすべて 方向あり/なし 両方・同時押しは そろう', bad.join(' '));
  const def = Object.assign(GameData.gameDef('omote', 3, 1), { arrowMode: true, mix: true });
  Engine.play(def, { finish() {}, exit() {} }, 'solo'); const a = lastPattern.targets.map(t => t.dir || '-').join('');
  Engine.play(def, { finish() {}, exit() {} }, 'solo'); const b = lastPattern.targets.map(t => t.dir || '-').join('');
  ok(a === b && /-/.test(a) && /[a-z]/.test(a), '毎回おなじ わりふり');
  const full = Object.assign(GameData.gameDef('omote', 3, 1), { arrowMode: true, mix: false });
  Engine.play(full, { finish() {}, exit() {} }, 'solo');
  ok(stats(lastPattern.targets, 'dir').without === 0, 'アロー版は ぜんぶに ほうこう');
  const r = run(Object.assign(GameData.gameDef('omote', 1, 0), { arrowMode: true, mix: true }), 'solo', 'perfect');
  ok(r && r.rank === 'superb' && r.miss === 0 && r.whiff === 0, 'ただしい キーで superb', JSON.stringify(r));
  const r2 = run(Object.assign(GameData.gameDef('omote', 1, 0), { arrowMode: true, mix: true }), 'solo', 'space');
  ok(r2 && r2.whiff > 0 && r2.miss > 0 && r2.ok + r2.perfect > 0, 'ぜんぶ スペース → ほうこうノーツだけ だめ');
  ok(H.drawn.some(s => s === '●'), 'よこくに ●');
  Engine.stop();
}
console.log('--- 2) キーボード＆通常版 ---');
{
  const def = Object.assign(GameData.gameDef('omote', 2, 2), { kbdMode: true, mix: true });
  Engine.play(def, { finish() {}, exit() {} }, 'solo');
  const st = stats(lastPattern.targets, 'kbd');
  ok(st.withF > 0 && st.without > 0 && st.inconsistent === 0 && lastPattern.targets.every(t => !t.dir), 'キーあり/なし 両方・ほうこうなし', JSON.stringify(st));
  let picked = null;
  for (const a of GameData.SPECIALS.versus) {
    const vs = Object.assign(GameData.specialDef('versus', a), { kbdMode: true, mix: true });
    Engine.play(vs, { finish() {}, exit() {} }, 'versus');
    const neutral = lastPattern.targets.filter(t => t.owner === -1), stv = stats(lastPattern.targets, 'kbd');
    if (neutral.length && stv.total >= 4) { picked = a; ok(neutral.every(t => !t.kbd) && stv.withF > 0 && stv.without > 0, '対戦: とりあいは キーなし・じぶんのは まざる (' + a + ')'); break; }
  }
  ok(picked, '対戦ゲームが えらべた');
  const r = run(Object.assign(GameData.gameDef('omote', 1, 1), { kbdMode: true, mix: true }), 'solo', 'perfect');
  ok(r && r.rank === 'superb' && r.miss === 0 && r.whiff === 0, 'ただしい キー(●は スペース)で superb', JSON.stringify(r));
  Engine.stop();
}
console.log('--- 3) エンドレスの きろくキー ---');
{
  const d = Object.assign(GameData.endlessDef('solo'), { segCount: 2, seed: 3, arrowMode: true, mix: true });
  const r = run(d, 'solo', 'space', 30); ok(r && r.endlessKey === 'solo:arrowmix', 'solo:arrowmix', r && r.endlessKey);
  const d2 = Object.assign(GameData.endlessDef('solo'), { segCount: 2, seed: 3, kbdMode: true, mix: true, perfectEndless: true, lives: 1 });
  const r2 = run(d2, 'solo', 'space', 30); ok(r2 && r2.endlessKey === 'solo:kbdmix:perfect', 'solo:kbdmix:perfect', r2 && r2.endlessKey);
  const d3 = Object.assign(GameData.endlessDef('solo'), { segCount: 2, seed: 3, arrowMode: true, kbdMode: true, mix: true });
  const r3 = run(d3, 'solo', 'space', 30); ok(r3 && r3.endlessKey === 'solo:arrowkbdmix', 'solo:arrowkbdmix', r3 && r3.endlessKey);
  const d4 = Object.assign(GameData.endlessGameDef('crane', 'solo'), { segCount: 2, seed: 5, kbdOnly: true, kbdMode: true });
  const r4 = run(d4, 'solo', 'space', 30); ok(r4 && r4.endlessKey === 'game:crane:solo:kbdonly', 'game:crane:solo:kbdonly', r4 && r4.endlessKey);
}
console.log('--- 4) アロー＆キーボード版 ---');
{
  const def = Object.assign(GameData.gameDef('omote', 2, 0), { arrowMode: true, kbdMode: true, mix: false });
  Engine.play(def, { finish() {}, exit() {} }, 'solo');
  const el = lastPattern.targets.filter(t => t.kind !== 'bomb');
  const nd = el.filter(t => t.dir).length, nk = el.filter(t => t.kbd).length, both = el.filter(t => t.dir && t.kbd).length, none = el.filter(t => !t.dir && !t.kbd).length;
  ok(nd > 0 && nk > 0 && both === 0 && none === 0 && el.every(t => t.kbd !== 'KeyL'), 'ほうこう か キーの どちらか・L は つかわない', JSON.stringify({ nd, nk, both, none }));
  const r = run(def, 'solo', 'perfect'); ok(r && r.rank === 'superb' && r.whiff === 0, '1人: superb', JSON.stringify(r));
  const r2 = run(def, 'solo', 'space'); ok(r2 && r2.whiff > 0 && r2.perfect + r2.ok === 0, '1人: スペースでは とれない');
  Engine.play(def, { finish() {}, exit() {} }, 'solo'); clock.t += 1; byId('btn-go').fire('click');
  const lane0 = Engine.getLane(); key('KeyL'); key('KeyL', false); ok(Engine.getLane() !== lane0, 'L で レーン切替'); Engine.setLane(lane0);
  key('ArrowUp'); key('ArrowUp', false); ok(Engine.getLane() === lane0, 'アローキーでは レーンは かわらない');
  Engine.stop();
  const d2 = Object.assign(GameData.gameDef('omote', 2, 1), { arrowMode: true, kbdMode: true, mix: false });
  Engine.play(d2, { finish() {}, exit() {} }, 'coop');
  const el2 = lastPattern.targets.filter(t => t.kind !== 'bomb');
  const p1 = el2.filter(t => t.owner === 0 && t.kbd).map(t => t.kbd), p2 = el2.filter(t => t.owner === 1 && t.kbd).map(t => t.kbd);
  ok(p1.length && p1.every(k => !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyL'].includes(k)) && p2.every(k => k !== 'KeyL'), '2人: 1Pの キーに W・A・S・D・L は ない');
  const rc = run(d2, 'coop', 'perfect'); ok(rc && rc.rank === 'superb' && rc.whiff === 0 && rc.miss === 0, '協力: superb', JSON.stringify(rc && { rank: rc.rank, w: rc.whiff, m: rc.miss }));
  let all3 = 0;
  for (let s = 1; s <= 5; s++) for (let k = 0; k < 4; k++) {
    const d3 = Object.assign(GameData.gameDef('omote', s, k), { arrowMode: true, kbdMode: true, mix: true });
    Engine.play(d3, { finish() {}, exit() {} }, 'solo');
    const e3 = lastPattern.targets.filter(t => t.kind !== 'bomb');
    if (e3.some(t => t.dir) && e3.some(t => t.kbd) && e3.some(t => !t.dir && !t.kbd)) all3++;
  }
  ok(all3 === 20, '＆通常版: 20ゲームすべて 3しゅるい', all3);
  Engine.stop();
}
console.log('--- 5) キーボード専用版 ---');
{
  const crane = Object.assign(GameData.specialDef('solo', 'crane'), { kbdOnly: true, kbdMode: true, arrowMode: false, mix: false });
  Engine.play(crane, { finish() {}, exit() {} }, 'solo');
  const el = lastPattern.targets.filter(t => t.kind !== 'bomb');
  ok(el.length > 0 && el.every(t => t.kbd) && el.some(t => t.dir), 'クレーンの ぜんノーツに キー(ほうこうは のこる)');
  ok(byId('game-overlay').innerHTML.includes('キーボード専用版'), 'イントロに 専用版');
  const r = run(crane, 'solo', 'perfect'); ok(r && r.rank === 'superb' && r.whiff === 0 && r.miss === 0, 'キーだけで superb', JSON.stringify(r));
  const r2 = run(crane, 'solo', 'space'); ok(r2 && r2.whiff === 0 && r2.perfect + r2.ok === 0 && r2.miss > 0, 'スペースは むし(ミスだけ)');
  let out = null; Engine.play(crane, { finish: x => { out = x; }, exit() {} }, 'solo'); clock.t += 1; const b = clock.t; byId('btn-go').fire('click');
  while (!out && clock.t < b + 60) { clock.t += 0.004; if (Math.abs(clock.t - (b + 2)) < 0.003) byId('cv').fire('pointerdown', { pointerId: 2, offsetX: 100, clientX: 100, clientY: 100 }); frame(); }
  ok(out && out.whiff === 0, 'プレイ中の タップは おてつきに ならない');
}
console.log('--- 6) UI: ボタンは どれか ひとつ・きろくと バッジ ---');
{
  byId('btn-start').fire('click');
  const seq = [['btn-arrowmix', 'arrowmix', '🕹️'], ['btn-kbd', 'kbd', '⌨️'], ['btn-kbdmix', 'kbdmix', '🔤'], ['btn-arrowkbd', 'arrowkbd', '🎹'], ['btn-arrowkbdmix', 'arrowkbdmix', '🎲'], ['btn-kbdonly', 'kbdonly', '🔠']];
  for (const [id, m] of seq) { byId(id).fire('click'); ok(GameData.noteMode() === m && byId(id).textContent.endsWith(': ON'), id + ' → ' + m); }
  byId('btn-kbdonly').fire('click'); ok(GameData.noteMode() === 'off', 'おなじ ボタンで OFF');
  const ov = byId('game-overlay');
  let slot = 0;
  for (const [id, m, badge] of seq) {
    byId(id).fire('click');
    const btn = { dataset: { s: '1', slot: String(slot) }, classList: { add() {}, remove() {} } };
    byId('stage-list').fire('click', { target: { closest: () => btn } });
    clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
    const def = GameData.gameDef('omote', 1, slot);
    const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
    const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.kbd && (m === 'kbdonly' || !t.dir) ? t.kbd : t.dir ? DIRKEY[t.dir] : 'Space' }));
    let guard = 0;
    while (!ov.innerHTML.includes('rank-face') && guard++ < 60000) {
      clock.t += 0.004;
      for (const n of notes) {
        if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
        else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
      }
      frame();
    }
    ok(GameData.rank(`omote:1:${slot}#${m}`) >= 2, `きろく omote:1:${slot}#${m}`);
    byId('btn-back').fire('click');
    ok(byId('stage-list').innerHTML.includes(badge), `バッジ ${badge}`);
    slot = (slot + 1) % 4;
  }
  byId('btn-kbdonly').fire('click');
}
done();
