// れんぞくパーフェクト 3かい → にじいろハート & 超ナイトモード(まっくろ)
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, drawn, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern, origE = Patterns.buildEndlessPattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
Patterns.buildEndlessPattern = def => (lastPattern = origE(def));
const ov = byId('game-overlay');
/* UI から ステージ1の slot を あそぶ。perfect=false なら 1つ わざと おとす */
function playUI(slot, perfect = true) {
  const btn = { dataset: { s: '1', slot: String(slot) }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  if (ov.innerHTML.includes('btn-normal')) byId('btn-normal').fire('click');   // パーフェクトずみの えらびカード
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.gameDef('omote', 1, slot);
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  if (!perfect) notes[0].pressed = notes[0].released = true;   // 1つ ミス
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) {
    clock.t += 0.004;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  const html = ov.innerHTML;
  byId('btn-back').fire('click');
  return html;
}
console.log('--- 1) れんぞくの かぞえかた ---');
{
  byId('btn-start').fire('click');
  ok(GameData.perfectStreak() === 0 && !GameData.superNightUnlocked() && !GameData.rainbowHearts() && byId('btn-snight').hidden === true, 'はじめ: 0・みかいほう・ボタンは かくれている');
  ok(byId('medal-count').textContent.includes('🤍🤍🤍'), 'セレクトに 🤍🤍🤍');
  let h = playUI(0);
  ok(GameData.perfectStreak() === 1 && h.includes('れんぞくパーフェクト 1かいめ') && h.includes('あと 2かい'), '1かいめ', h.match(/れんぞく[^<]*/)?.[0]);
  ok(byId('medal-count').textContent.includes('❤️🤍🤍'), 'セレクトに ❤️🤍🤍');
  h = playUI(1);
  ok(GameData.perfectStreak() === 2 && h.includes('2かいめ'), '2かいめ');
  h = playUI(2, false);
  ok(GameData.perfectStreak() === 0 && !h.includes('れんぞくパーフェクト') && !GameData.superNightUnlocked(), 'ミスが あると 0に もどる');
  // とちゅうで やめても かわらない
  playUI(0); ok(GameData.perfectStreak() === 1, 'また 1かいめ');
  const btn = { dataset: { s: '1', slot: '1' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  if (ov.innerHTML.includes('btn-normal')) byId('btn-normal').fire('click');
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  key('Escape'); key('Escape', false); key('Escape'); key('Escape', false);
  ok(GameData.perfectStreak() === 1, 'とちゅうで やめても れんぞくは そのまま');
}
console.log('--- 2) 3かい れんぞく → にじいろハート & 超ナイトモード かいほう ---');
{
  playUI(1);
  const h = playUI(3);
  ok(GameData.perfectStreak() === 3 && GameData.superNightUnlocked() && GameData.rainbowHearts(), '3れんぞくで かいほう');
  ok(h.includes('超ナイトモード') && h.includes('にじいろ') && h.includes('❤️🧡💛💚💙💜'), 'リザルトに かいほうの おしらせ', h.match(/🌈[^<]*/)?.[0]);
  ok(byId('btn-snight').hidden === false && byId('btn-snight').textContent === '🌑 超ナイト: OFF' && !GameData.superNightOn(), 'ボタンが でる(はじめは OFF)');
  ok(byId('medal-count').textContent.includes('❤️🧡💛💚💙💜') && GameData.hearts(3) === '❤️🧡💛', 'セレクトの ハートが にじいろ');
  playUI(0, false);
  ok(GameData.rainbowHearts() && GameData.superNightUnlocked() && GameData.perfectStreak() === 0, 'そのあと ミスしても にじいろ・かいほうは そのまま');
}
console.log('--- 3) エンドレスの ライフが にじいろ ---');
{
  drawn.length = 0;
  const d = Object.assign(GameData.endlessDef('solo'), { segCount: 2, seed: 3 });
  Engine.play(d, { finish() {}, exit() {} }, 'solo');
  ok(ov.innerHTML.includes('❤️🧡💛'), 'イントロの ライフが にじいろ');
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 0.5; frame();
  ok(drawn.some(s => /[🧡💛💚💙💜]/u.test(s) && !s.includes('🖤')), 'HUDの ハートが にじいろ', drawn.filter(s => /[❤🧡💛💚💙💜]/u.test(s)).slice(0, 2).join('|'));
  Engine.stop();
}
console.log('--- 4) 超ナイトモード ON: ゲームの がめんは まっくろ(シーン・レーン・タイトルを えがかない)、はんていは 出る ---');
{
  byId('btn-snight').fire('click');
  ok(GameData.superNightOn() && byId('btn-snight').textContent === '🌑 超ナイト: ON', 'ボタンで ON');
  Engine.setLane(true);
  drawn.length = 0;
  const btn = { dataset: { s: '1', slot: '0' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  if (ov.innerHTML.includes('btn-normal')) byId('btn-normal').fire('click');
  ok(ov.innerHTML.includes('超ナイトモード') && ov.innerHTML.includes('まっくろ'), 'イントロに 超ナイトの せつめい');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.gameDef('omote', 1, 0);
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, pressed: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) {
    clock.t += 0.004;
    for (const n of notes) if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); key(n.code, false); }
    frame();
  }
  ok(!drawn.some(s => s === def.title) && !drawn.some(s => s.includes('イチ') || s.includes('ハイッ')), 'タイトル・シーンの 文字は えがかれない', drawn.filter(s => s.length > 2).slice(0, 4).join('|'));
  ok(drawn.some(s => s.includes('ピッタリ')), 'はんていの 文字は 出る', [...new Set(drawn)].slice(0, 6).join('|'));
  ok(ov.innerHTML.includes('rk-superb'), 'まっくろでも あそべて superb');
  byId('btn-back').fire('click');
  byId('btn-snight').fire('click');
  ok(!GameData.superNightOn(), 'もういちど おすと OFF');
  GameData.setSuperNight(true); GameData.setVersion('v0'); byId('btn-start').fire('click');
  ok(!GameData.superNightOn() && byId('btn-snight').hidden === true && GameData.hearts(2) === '❤️❤️', '初期バージョンには ない');
  GameData.setVersion('v1'); GameData.setSuperNight(false);
}
done();
