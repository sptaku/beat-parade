// エンドレス: おてつき→ライフ減 / パーフェクトちょうせん(ライフ1) / UIの えらびカードと リザルト
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, drawn } = H;
let lastPattern = null;
const origBuild = Patterns.buildEndlessPattern;
Patterns.buildEndlessPattern = def => (lastPattern = origBuild(def));

function run(def, mode, { whiffs = [], perfect = false, whiffP = 0, maxSec = 60 } = {}) {
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, mode);
  clock.t += 1; const begin = clock.t;
  byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const tOf = b => beat0 + b * spb;
  const pending = whiffs.map(b => ({ t: tOf(b), done: false }));
  const keyFor = p => (mode === 'solo' ? 'Space' : p === 1 ? 'KeyJ' : 'KeyF');
  const notes = perfect ? lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: tOf(t.b), ht: t.hold ? tOf(t.b + t.hold) : null, owner: t.owner, pressed: false, released: false })) : [];
  const end = begin + maxSec;
  while (!result && clock.t < end) {
    clock.t += 0.004;
    for (const w of pending) if (!w.done && clock.t >= w.t) { w.done = true; const k = whiffP === 1 ? 'KeyJ' : keyFor(0); key(k); key(k, false); }
    for (const n of notes) {
      const p = n.owner === -1 ? 0 : (n.owner || 0);
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(keyFor(p)); if (!n.ht) { key(keyFor(p), false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(keyFor(p), false); }
    }
    frame();
  }
  return result;
}
const small = d => Object.assign(d, { segCount: 3, seed: 7 });
const perfectify = d => Object.assign({}, d, { perfectEndless: true, lives: 1 });

console.log('--- 1) ふつうのエンドレス: おてつきで ライフが へる ---');
{
  const r = run(small(GameData.endlessDef('solo')), 'solo', { whiffs: [1, 2, 3] });
  ok(r && r.endless && !r.survived && r.lives[0] === 0 && r.sections === 0, 'おてつき3回で ゲームオーバー・ライフ0', JSON.stringify(r && { l: r.lives, sec: r.sections }));
  ok(r && r.players[0].whiff === 3 && r.players[0].miss === 0 && r.endlessKey === 'solo', 'おてつき3・ミス0・キー solo');
  const r2 = run(small(GameData.endlessDef('solo')), 'solo', { whiffs: [1], perfect: true });
  ok(r2 && r2.survived && r2.lives[0] === 2 && r2.sections === 3 && r2.players[0].miss === 0, 'おてつき1回 → ライフ2で かんそう', JSON.stringify(r2 && { s: r2.survived, l: r2.lives, st: r2.players[0] }));
}
console.log('--- 2) ミスでも ライフが へる ---');
{
  const r = run(small(GameData.endlessDef('solo')), 'solo', {});
  ok(r && !r.survived && r.lives[0] === 0 && r.players[0].miss === 3, 'ミス3回で ゲームオーバー', JSON.stringify(r && { l: r.lives, st: r.players[0] }));
}
console.log('--- 3) パーフェクトちょうせん(ライフ1) ---');
{
  drawn.length = 0;
  const r = run(perfectify(small(GameData.endlessDef('solo'))), 'solo', { whiffs: [2] });
  ok(r && !r.survived && r.lives[0] === 0 && r.players[0].whiff === 1 && r.endlessKey === 'solo:perfect', 'おてつき1つで しゅうりょう・キー solo:perfect', JSON.stringify(r && { l: r.lives, k: r.endlessKey }));
  ok(drawn.some(s => s.includes('💯 パーフェクト') && s.includes('セクション')) && drawn.some(s => s === '❤️'), 'HUDに 💯 と ハート1つ');
  const r2 = run(perfectify(small(GameData.endlessDef('solo'))), 'solo', {});
  ok(r2 && !r2.survived && r2.players[0].miss === 1, 'ミス1つで しゅうりょう');
  const r3 = run(perfectify(small(GameData.endlessDef('solo'))), 'solo', { perfect: true });
  ok(r3 && r3.survived && r3.sections === 3 && r3.lives[0] === 1 && r3.points > 0, 'ノーミスなら かんそう(たっせい)', JSON.stringify(r3 && { s: r3.survived, l: r3.lives }));
}
console.log('--- 4) 協力/対戦の パーフェクト ---');
{
  const r = run(perfectify(small(GameData.endlessDef('coop'))), 'coop', { whiffs: [2], whiffP: 1 });
  ok(r && !r.survived && r.lives.length === 1 && r.lives[0] === 0 && r.players[1].whiff === 1 && r.endlessKey === 'coop:perfect', '協力: 2Pの おてつき1つで しゅうりょう(共有1)');
  const v = run(perfectify(small(GameData.endlessDef('versus'))), 'versus', { whiffs: [2] });
  ok(v && !v.survived && v.winner === 1 && v.lives[0] === 0 && v.lives[1] === 1, '対戦: 1Pが しっぱい → 2Pの かち');
}
console.log('--- 5) UI: エンドレスボタン → えらびカード → パーフェクトで ちょうせん → リザルト ---');
{
  for (let s = 1; s <= 20; s++) { if (s <= 15) for (let k = 0; k < 4; k++) GameData.setResult(`omote:${s}:${k}`, 2); GameData.setResult(`omote:${s}:R`, 2); }
  ok(GameData.endlessOpen('solo'), '1人エンドレス 解放');
  byId('btn-start').fire('click');
  const ov = byId('game-overlay');
  const btn = { dataset: { endless: '1' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('btn-pend') && ov.innerHTML.includes('パーフェクトで ちょうせん') && ov.innerHTML.includes('btn-normal'), 'えらびカードに ふつう/パーフェクト');
  Patterns.buildEndlessPattern = def => { def.segCount = 3; lastPattern = origBuild(def); return lastPattern; };
  byId('btn-pend').fire('click');
  ok(ov.innerHTML.includes('パーフェクトちょうせん') && ov.innerHTML.includes('btn-go'), 'イントロに せつめい');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / GameData.endlessDef('solo').bpm; const tw = begin + 0.3 + 6 * spb;
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 20000) { clock.t += 0.004; if (clock.t >= tw && clock.t < tw + 0.005) { key('Space'); key('Space', false); } frame(); }
  ok(ov.innerHTML.includes('ざんねん…（💯 パーフェクトちょうせん）') && ov.innerHTML.includes('セクション 0 / 3 とうたつ'), 'リザルト: ざんねん + セクション', ov.innerHTML.slice(0, 200));
  byId('btn-retry').fire('click');
  ok(ov.innerHTML.includes('パーフェクトちょうせん') && ov.innerHTML.includes('btn-go'), 'もういちど → パーフェクトのまま');
  Engine.stop();
  const cbtn = { dataset: { sp: 'crane' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => cbtn } });
  ok(ov.innerHTML.includes('btn-endless') && ov.innerHTML.includes('btn-pend'), 'クレーンの カードに ♾️💯');
  Engine.stop();
}
done();
