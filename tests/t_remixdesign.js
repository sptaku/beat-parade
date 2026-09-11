// リミックス用デザイン: リミックス/エンドレスは リボン + セグメント表示、ふつうの ゲームは いままでどおり
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, byId, frame, clock, ok, done, drawn } = H;
function sweep(def, mode = 'solo', beats = 30) {
  let err = null;
  try {
    Engine.play(def, { finish() {}, exit() {} }, mode); frame();
    clock.t += 1; byId('btn-go').fire('click');
    const spb = 60 / def.bpm;
    for (let i = 0; i < beats * 4; i++) { clock.t += spb / 4; frame(); }
  } catch (e) { err = (e.stack || e.message).split('\n').slice(0, 3).join(' '); }
  return err;
}
console.log('--- 1) リミックス(おもて 1〜20 / うら) ---');
{
  const errs = [];
  for (let s = 1; s <= 20; s++) {
    drawn.length = 0;
    const def = GameData.remixDef('omote', s);
    const err = sweep(def, 'solo', 14);
    if (err) errs.push(def.id + ': ' + err);
    else if (!drawn.some(x => x === '🎵 ' + def.title) || !drawn.some(x => /^▶ .+ /.test(x))) errs.push(def.id + ': リボン/ゲーム名が ない');
  }
  ok(errs.length === 0, 'おもて 1〜20: リボン(🎵 タイトル)と いまの ゲーム名、例外なし', errs.slice(0, 3).join(' | '));
  drawn.length = 0;
  const u = GameData.remixDef('ura', 8);
  ok(!sweep(u, 'solo', 14) && drawn.some(x => x === '🎵 裏リミックス8'), 'うらリミックスも おなじ デザイン');
}
console.log('--- 2) エンドレスも リミックス用デザイン / ふつうの ゲームは いままでどおり ---');
{
  drawn.length = 0;
  const e = Object.assign(GameData.endlessDef('solo'), { segCount: 3, seed: 2 });
  ok(!sweep(e, 'solo', 14) && drawn.some(x => x.startsWith('🎵 ')), 'エンドレスに リボン');
  drawn.length = 0;
  const g = GameData.gameDef('omote', 2, 1);
  ok(!sweep(g, 'solo', 10) && !drawn.some(x => x.startsWith('🎵 ')) && drawn.some(x => x === g.title), 'ふつうの ゲームは タイトルの 文字だけ');
  drawn.length = 0;
  GameData.setNight(true); GameData.unlockNight && GameData.unlockNight();
  ok(!sweep(GameData.remixDef('omote', 3), 'solo', 10), 'ナイトモードでも 例外なし');
  GameData.setNight(false);
  Engine.stop();
}
console.log('--- 3) 10しゅるいの デザイン: ばんごうで かわり、おもて/うら/エンドレスで ぜんぶ つかわれる・イントロに 🎨 ---');
{
  const ov = byId('game-overlay');
  // イントロ(begin まえ)の 🎨 ラベルを よむ
  const introLabel = (def, mode = 'solo') => { Engine.play(def, { finish() {}, exit() {} }, mode); const m = ov.innerHTML.match(/🎨 ([^　<]+)/); Engine.stop(); return m ? m[1] : null; };
  const labels = new Set();
  const errs = [];
  for (const side of ['omote', 'ura']) for (let s = 1; s <= 20; s++) {
    const def = GameData.remixDef(side, s);
    const lab = introLabel(def);
    if (lab) labels.add(lab); else errs.push(def.id + ': 🎨 なし');
    const err = sweep(def, 'solo', 9);
    if (err) errs.push(def.id + ': ' + err);
  }
  ok(errs.length === 0, 'おもて/うら 40本 例外なし・イントロに 🎨', errs.slice(0, 3).join(' | '));
  ok(labels.size === 10, '10しゅるい ぜんぶ つかわれる: ' + [...labels].join('/'), labels.size);
  const l1 = introLabel(GameData.remixDef('omote', 1)), l2 = introLabel(GameData.remixDef('omote', 2)), l11 = introLabel(GameData.remixDef('omote', 11)), u1 = introLabel(GameData.remixDef('ura', 1));
  ok(l1 !== l2 && l1 === l11 && u1 !== l1, `1≠2、1=11、うら1≠おもて1 (${l1}/${l2}/${u1})`);
  for (const m of ['solo', 'coop', 'versus']) { const d = Object.assign(GameData.endlessDef(m), { segCount: 2, seed: 1 }); const lab = introLabel(d, m); ok(lab && !sweep(d, m, 6), 'エンドレス ' + m + ': ' + lab); }
  GameData.setNight(true);
  const errs2 = []; for (let s = 1; s <= 10; s++) { const e = sweep(GameData.remixDef('ura', s), 'solo', 6); if (e) errs2.push(s + ': ' + e); }
  GameData.setNight(false);
  ok(errs2.length === 0, 'うら + ナイトでも 10しゅるい 例外なし', errs2.join(' | '));
  Engine.stop();
}
done();
