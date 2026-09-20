// パーフェクトキャンペーンが リミックスにも 出る
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY } = H;
let lastPattern = null;
const origR = Patterns.buildRemixPattern;
Patterns.buildRemixPattern = def => (lastPattern = origR(def));
const ov = byId('game-overlay');
const realRandom = Math.random;
function playCurrent(def, perfect) {
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  if (!perfect) notes[0].pressed = notes[0].released = true;
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) {
    clock.t += 0.004;
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  return ov.innerHTML;
}
console.log('--- 1) たいしょうに おもての リミックス 1〜20 ---');
{
  const t = GameData.pcTargets('solo');
  ok([...Array(20)].every((_, i) => t.includes(`omote:${i + 1}:R`)) && !t.some(id => id.startsWith('ura:')), 'omote:1:R 〜 omote:20:R が はいる(うらは なし)');
  ok(GameData.perfectTotal('solo') === 320, 'ぜんぶで 320本', GameData.perfectTotal('solo'));
}
console.log('--- 2) クリアずみの リミックスが ちゅうせんされ、セレクトから ちょうせんできる ---');
{
  for (let k = 0; k < 4; k++) { GameData.setResult(`omote:1:${k}`, 2); GameData.importSave({ ranks: {}, pf: { [`omote:1:${k}`]: 1 } }); }   // ミニゲームは パーフェクトずみ → のこりは リミックスだけ
  GameData.setResult('omote:1:R', 2);
  Math.random = () => 0;
  const offer = GameData.pcMaybeOffer('solo');
  Math.random = realRandom;
  ok(offer && offer.id === 'omote:1:R' && offer.tries === 3, 'リミックス1が かいさいされる', JSON.stringify(offer));
  byId('btn-start').fire('click');
  const list = byId('stage-list').innerHTML;
  ok(list.includes('data-pc="1"') && list.includes('リミックス1') && list.includes('🎯'), 'セレクトに ちょうせんの 行と 🎯');
  const def = GameData.remixDef('omote', 1);
  // しっぱい(1つ ミス) → その場で しゅうりょう、チャンスが へる
  byId('stage-list').fire('click', { target: { closest: () => ({ dataset: { pc: '1' }, classList: { add() {}, remove() {} } }) } });
  ok(ov.innerHTML.includes('パーフェクトキャンペーン') && ov.innerHTML.includes('リミックス1'), 'イントロに パーフェクトキャンペーン');
  let h = playCurrent(def, false);
  ok(h.includes('ざんねん') && GameData.pcActive() && GameData.pcActive().tries === 2 && !GameData.isPerfect('omote:1:R'), 'ミスで しっぱい → のこり 2かい', h.slice(0, 120));
  byId('btn-back').fire('click');
  // せいこう
  byId('stage-list').fire('click', { target: { closest: () => ({ dataset: { pc: '1' }, classList: { add() {}, remove() {} } }) } });
  h = playCurrent(def, true);
  ok(h.includes('パーフェクト たっせい') && GameData.isPerfect('omote:1:R') && !GameData.pcActive(), 'ノーミスで たっせい → 💯', h.slice(0, 160));
  byId('btn-back').fire('click');
  ok(/data-slot="R"[^>]*>[^<]*リミックス1[^<]*💯/.test(byId('stage-list').innerHTML) || byId('stage-list').innerHTML.includes('💯'), 'リミックスの ボタンに 💯');
}
console.log('--- 3) たっせいずみの リミックスを えらぶと「ふつう / パーフェクトに ちょうせん」を えらべる ---');
{
  const btn = { dataset: { s: '1', slot: 'R' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('btn-pcgo') && ov.innerHTML.includes('btn-normal'), 'えらびカード');
  byId('btn-pcgo').fire('click');
  ok(ov.innerHTML.includes('パーフェクトキャンペーン') || ov.innerHTML.includes('ミス・おてつき・ボムが'), 'パーフェクトちょうせんの イントロ');
  Engine.stop();
}
done();
