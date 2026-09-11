// いったんストップ(Esc / ⏸)の テスト
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
const shown = [];
for (const s of ['title', 'select', 'game']) byId('scr-' + s).classList.toggle = (cls, on) => { if (on) shown.push(s); };
const ov = byId('game-overlay');
const esc = () => { key('Escape'); key('Escape', false); };
const tap = (x, y) => byId('cv').fire('pointerdown', { pointerId: 9, offsetX: x, clientX: x, clientY: y });

console.log('--- 1) Esc で ストップ → メニュー、ゲームに もどる → 3・2・1 のあと つづきから ---');
{
  byId('btn-start').fire('click');
  const btn = { dataset: { s: '1', slot: '0' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.gameDef('omote', 1, 0);
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ b: t.b, hold: t.hold || 0, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  const first = Math.min(...notes.map(n => n.b));
  while (clock.t < beat0 + (first - 1) * spb) { clock.t += 0.004; frame(); }
  esc();
  const pauseAt = clock.t;
  ok(ov.innerHTML.includes('btn-resume') && ov.innerHTML.includes('btn-select') && ov.innerHTML.includes('btn-quit') && ov.innerHTML.includes('いったん ストップ'), 'メニューが でる');
  for (let i = 0; i < 2500; i++) { clock.t += 0.004; frame(); }   // 10びょう
  key('Space'); key('Space', false);   // ストップ中の キーは きかない
  byId('btn-resume').fire('click');
  ok(ov.innerHTML === '', 'メニューが きえて カウント開始');
  const resumeAt = clock.t + 1.5;
  let dt = null;
  while (dt == null) { clock.t += 0.004; frame(); if (clock.t >= resumeAt) dt = clock.t - pauseAt; }
  ok(dt > 10, 'とめていた 時間 ' + dt.toFixed(2) + 's');
  ok(H.drawn.some(s => s === '3') && H.drawn.some(s => s === '1') && H.drawn.some(s => s === 'さいかい！'), 'カウント 3・2・1 が えがかれる');
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) {
    clock.t += 0.004;
    for (const n of notes) {
      const t = beat0 + n.b * spb + dt, ht = n.hold ? beat0 + (n.b + n.hold) * spb + dt : null;
      if (!n.pressed && clock.t >= t) { n.pressed = true; key(n.code); if (!ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && ht && clock.t >= ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  ok(ov.innerHTML.includes('rank-face') && ov.innerHTML.includes('rk-superb'), 'さいかい後 ぜんぶ とれて superb', ov.innerHTML.slice(0, 160));
  ok(ov.innerHTML.includes('ミス 0') && ov.innerHTML.includes('おてつき 0'), 'ストップ中の スペースは おてつきに ならず、ミス 0', ov.innerHTML.match(/ピッタリ[^<]*/)?.[0]);
  ok(GameData.rank('omote:1:0') === 3, 'きろく ⭐');
  byId('btn-back').fire('click');
}
console.log('--- 2) Esc 2回 → ステージせんたくへ ---');
{
  const btn = { dataset: { s: '1', slot: '1' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  shown.length = 0;
  esc(); ok(ov.innerHTML.includes('btn-resume') && shown.length === 0, '1回目: ストップ(まだ もどらない)');
  esc(); ok(shown[shown.length - 1] === 'select' && ov.innerHTML === '', '2回目: ステージせんたくへ', shown.join(','));
}
console.log('--- 3) メニューの ボタン: ステージせんたく / ゲームを やめる(タイトル) ---');
{
  const btn = { dataset: { s: '1', slot: '1' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  esc(); shown.length = 0; byId('btn-select').fire('click');
  ok(shown[shown.length - 1] === 'select', 'ステージせんたくに もどる', shown.join(','));
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  esc(); shown.length = 0; byId('btn-quit').fire('click');
  ok(shown[shown.length - 1] === 'title', 'ゲームを やめる → タイトルへ', shown.join(','));
}
console.log('--- 4) 右下の ⏸ タップ / イントロでは Esc 1回で もどる / Esc の repeat は むし ---');
{
  byId('btn-start').fire('click');
  const btn = { dataset: { s: '1', slot: '2' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  ok(H.drawn.some(s => s === '⏸'), '⏸ が えがかれる');
  tap(928, 508);
  ok(ov.innerHTML.includes('btn-resume'), '⏸ タップで ストップ');
  shown.length = 0;
  (H.listeners.keydown || []).forEach(f => f({ code: 'Escape', repeat: true, preventDefault() {} }));
  ok(shown.length === 0 && ov.innerHTML.includes('btn-resume'), 'Esc の おしっぱなし(repeat)では もどらない');
  // ストップ中は おなじ ばしょが ▶(さいかい): タップで カウント開始
  ok(H.drawn.some(s => s === '▶') && H.drawn.some(s => s === 'さいかい'), 'ストップ中に ▶ さいかい ボタンが えがかれる');
  tap(928, 508);
  ok(ov.innerHTML === '' && shown.length === 0, '▶ タップで メニューが きえて さいかいの カウントへ');
  for (let i = 0; i < 400; i++) { clock.t += 0.004; frame(); }   // 1.6びょう → さいかい
  ok(H.drawn.some(s => s === '⏸'), 'さいかい後は ⏸ に もどる');
  tap(928, 508); ok(ov.innerHTML.includes('btn-resume'), 'もういちど ⏸ で ストップ');
  esc(); ok(shown[shown.length - 1] === 'select', 'Esc → ステージせんたくへ');
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  shown.length = 0; esc();
  ok(shown[shown.length - 1] === 'select', 'イントロでは Esc 1回で ステージせんたくへ');
}
console.log('--- 4b) やりなおし: おてつき後に ストップ → 🔁 で さいしょから(せいせきも リセット) / R キーでも ---');
{
  byId('btn-start').fire('click');
  const btn = { dataset: { s: '1', slot: '3' }, classList: { add() {}, remove() {} } };   // ステージ1は さいしょから あそべる
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click');
  const def = GameData.gameDef('omote', 1, 3);
  const spb = 60 / def.bpm;
  clock.t += 0.3 + 5 * spb; frame();
  key('Space'); key('Space', false); clock.t += 0.4; frame();   // わざと おてつき
  esc();
  ok(ov.innerHTML.includes('btn-restart') && ov.innerHTML.includes('やりなおす'), 'メニューに やりなおし');
  byId('btn-restart').fire('click');
  ok(ov.innerHTML === '' && H.drawn.length >= 0, 'やりなおし → イントロなしで すぐ カウントイン');
  const begin = clock.t;   // restart 時点が begin(ak.now)
  const beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) {
    clock.t += 0.004;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  ok(ov.innerHTML.includes('rk-superb') && ov.innerHTML.includes('おてつき 0'), 'やりなおし後は せいせき リセットで superb', ov.innerHTML.match(/ピッタリ[^<]*/)?.[0]);
  byId('btn-back').fire('click');
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  esc(); key('KeyR'); key('KeyR', false);
  ok(ov.innerHTML === '', 'ストップ中に R でも やりなおし');
  key('Escape'); key('Escape', false);
  ok(ov.innerHTML.includes('btn-resume'), 'やりなおし後も Esc で ストップできる');
  esc();
}
console.log('--- 5) エンドレスでも ストップ → さいかい(ライフが へらない) ---');
{
  const d = Object.assign(GameData.endlessDef('solo'), { segCount: 2, seed: 11 });
  Engine.play(d, { finish() {}, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / d.bpm, beat0 = begin + 0.3 + 4 * spb;
  while (clock.t < beat0 + 3 * spb) { clock.t += 0.004; frame(); }
  esc(); for (let i = 0; i < 1500; i++) { clock.t += 0.004; frame(); }
  byId('btn-resume').fire('click');
  const resumeAt = clock.t + 1.5;
  while (clock.t < resumeAt + 0.05) { clock.t += 0.004; frame(); }
  ok(H.drawn.some(s => s === '❤️❤️❤️'), 'さいかい直後も ライフ 3', H.drawn.filter(s => s.includes('❤')).slice(-2).join('|'));
  Engine.stop();
}
done();
