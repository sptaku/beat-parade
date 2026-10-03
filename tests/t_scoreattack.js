// うらの スコアアタック: ON/OFF・スコア計算・ランク・ハイスコア・ラリー・はやさ こてい
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, drawn, DIRKEY } = H;
let lastPattern = null;
const origG = Patterns.buildGamePattern, origR = Patterns.buildRemixPattern;
Patterns.buildGamePattern = def => (lastPattern = origG(def));
Patterns.buildRemixPattern = def => (lastPattern = origR(def));
const ov = byId('game-overlay');
const list = () => byId('stage-list').innerHTML;
const click = ds => byId('stage-list').fire('click', { target: { closest: () => ({ dataset: ds, classList: { add() {}, remove() {} } }) } });

/* イントロが でている ゲームを あそぶ。opt.skip = おとす ノーツの ばんごう、opt.whiffAt = その拍で からうち */
function play(bpm, opt = {}) {
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').sort((a, b) => a.b - b.b)
    .map(t => ({ t: beat0 + t.b * spb, ht: t.hold ? beat0 + (t.b + t.hold) * spb : null, pressed: false, released: false, code: t.dir ? DIRKEY[t.dir] : t.kbd || 'Space' }));
  for (const i of opt.skip || []) notes[i].pressed = notes[i].released = true;
  let whiffDone = opt.whiffAt == null;
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 60000) {
    clock.t += 0.004;
    if (!whiffDone && clock.t >= beat0 + opt.whiffAt * spb) { whiffDone = true; key('KeyQ'); key('KeyQ', false); key('Space'); key('Space', false); }
    for (const n of notes) {
      if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); if (!n.ht) { key(n.code, false); n.released = true; } }
      else if (n.pressed && !n.released && n.ht && clock.t >= n.ht) { n.released = true; key(n.code, false); }
    }
    frame();
  }
  const html = ov.innerHTML;
  return { html, notes: notes.length };
}

console.log('--- 1) うら・1人モードだけに スコアアタックの 行(はじめは OFF) ---');
{
  GameData.setResult('omote:8:R', 2);   // うら かいほう
  byId('btn-start').fire('click');
  ok(!list().includes('data-satoggle'), 'おもてには ない');
  byId('btn-side').fire('click');
  ok(list().includes('🏆 スコアアタック') && list().includes('スコアアタック: OFF') && list().includes('data-sacourse') && list().includes('裏スコアアタック・ラリー'), 'うらに 行・OFF・ラリー');
  ok(!GameData.saOn(), 'はじめは OFF');
  // OFF なら ふつうの ゲーム
  click({ s: '1', slot: '0' });
  ok(ov.innerHTML.includes('btn-go') && !ov.innerHTML.includes('スコアアタック'), 'OFF: ふつうの イントロ');
  Engine.stop(); byId('btn-back') && null;
}
console.log('--- 2) ON → うらの ゲームが スコアアタック。ぜんぶ ジャストで SSS・ハイスコア・ふつうの きろくも のこる ---');
let best1 = 0;
{
  click({ satoggle: '1' });
  ok(GameData.saOn() && list().includes('スコアアタック: ON'), 'ON に なる');
  GameData.setSpeed(3);   // はやさは こてい されるはず
  click({ s: '1', slot: '0' });
  ok(ov.innerHTML.includes('🏆 <b>スコアアタック</b>') && ov.innerHTML.includes('1.00× こてい') && !ov.innerHTML.includes('⏩ はやさ 3.00×'), 'イントロに スコアアタックの せつめい(はやさ こてい)');
  const def = GameData.gameDef('ura', 1, 0);
  drawn.length = 0;
  const r = play(def.bpm);
  ok(r.html.includes('rank-face') && r.html.includes('>SSS<'), '1.00× の タイミングで ぜんぶ とれて SSS', r.html.slice(0, 200));
  ok(r.html.includes('ハイスコア こうしん') && r.html.includes('はじめての きろく') && r.html.includes('フルコンボ') && r.html.includes('100.0%'), 'ハイスコア こうしん・フルコンボ・りろんちの 100%');
  ok(drawn.some(s => s.startsWith('🏆 ')) && drawn.some(s => s.includes('コンボ　×')) && drawn.some(s => s.includes('JUST!')), 'HUD: スコア・コンボ・JUST');
  const rec = GameData.saBest('ura:1:0');
  best1 = rec.s;
  ok(rec && rec.r === 'SSS' && rec.fc === 1 && rec.c === r.notes && rec.s > r.notes * 120, 'きろく: SSS・フルコンボ・さいだいコンボ = ノーツすう', JSON.stringify(rec));
  ok(GameData.rank('ura:1:0') === 3, 'ふつうの クリアきろく(ハイレベル)も のこる');
  byId('btn-back').fire('click');
  ok(list().includes('🏆SSS') && list().includes('ごうけい ' + best1.toLocaleString()), 'セレクト: ボタンに 🏆SSS・ごうけい');
}
console.log('--- 3) ミス・おてつきで コンボが きれて スコアが さがる。ハイスコアは へらない ---');
{
  click({ s: '1', slot: '0' });
  const def = GameData.gameDef('ura', 1, 0);
  drawn.length = 0;
  const r = play(def.bpm, { skip: [5], whiffAt: 1 });
  const m = r.html.match(/([\d,]+) てん/);
  const score = m ? Number(m[1].replace(/,/g, '')) : -1;
  ok(score > 0 && score < best1 && !r.html.includes('フルコンボ') && !r.html.includes('ハイスコア こうしん'), 'スコアが ひくい・フルコンボ なし・こうしん なし', score + ' / ' + best1);
  ok(r.html.includes('🏅 ハイスコア ' + best1.toLocaleString()), 'リザルトに いまの ハイスコア');
  ok(drawn.some(s => s === '-10'), 'おてつきで −10');
  ok(GameData.saBest('ura:1:0').s === best1, 'ハイスコアは そのまま');
  ok(/ミス 1/.test(r.html), 'ミス 1');
  byId('btn-back').fire('click');
}
console.log('--- 4) ストップメニューに はやさの ボタンは でない / やりなおしても スコアアタック ---');
{
  click({ s: '1', slot: '1' });
  clock.t += 1; byId('btn-go').fire('click'); clock.t += 1; frame();
  key('Escape'); key('Escape', false);
  ok(ov.innerHTML.includes('btn-resume') && !ov.innerHTML.includes('btn-pspd-up') && ov.innerHTML.includes('1.00× こてい'), 'ストップメニュー: はやさは こてい');
  byId('btn-restart').fire('click'); clock.t += 0.5; drawn.length = 0; frame();
  ok(drawn.some(s => s === '🏆 0'), 'やりなおし後も スコア HUD(0てんから)');
  Engine.stop();
}
console.log('--- 5) おもての ゲームは ON でも ふつう ---');
{
  byId('btn-side').fire('click');
  click({ s: '1', slot: '0' });
  ok(ov.innerHTML.includes('btn-go') && !ov.innerHTML.includes('スコアアタック'), 'おもては ふつう');
  Engine.stop();
  byId('btn-side').fire('click');
}
console.log('--- 6) うら スコアアタック・ラリー(16セクション・ハイスコアだけ のこる) ---');
{
  GameData.setSaOn(false);   // ラリーは OFF でも スコアアタック
  click({ sacourse: '1' });
  ok(ov.innerHTML.includes('裏スコアアタック・ラリー') && ov.innerHTML.includes('🏆 <b>スコアアタック</b>') && ov.innerHTML.includes('🎨 ネオン'), 'イントロ(ネオンの デザイン)');
  ok(lastPattern.segments.length === 16 && new Set(lastPattern.segments.map(s => s.arch)).size === 12, '16セクション・12しゅるい');
  const cd = GameData.saCourseDef();
  const r = play(cd.bpm);
  ok(r.html.includes('>SSS<') && GameData.saBest('ura:SA') && GameData.saBest('ura:SA').r === 'SSS', 'ラリーで SSS', r.html.slice(0, 160));
  ok(GameData.rank('ura:SA') === 0, 'ラリーは ふつうの クリアきろくを つくらない(メダルにも ならない)');
  byId('btn-back').fire('click');
  ok(list().includes('裏スコアアタック・ラリー　🏆SSS'), 'セレクトの ラリーに ハイスコア');
}
console.log('--- 7) セーブ: とりこみは たかい ほう / 初期バージョンには ない ---');
{
  GameData.importSave({ ranks: {}, sa: { 'ura:2:0': { s: 999, r: 'A', c: 5, fc: 0 }, 'ura:1:0': { s: 1, r: 'C', c: 1, fc: 0 } } });
  ok(GameData.saBest('ura:2:0').s === 999 && GameData.saBest('ura:1:0').s === best1, 'たかい ほうを とる');
  ok(GameData.saCount('S') === 2 && GameData.saCount('C') === 3, 'S いじょうの かず');
  GameData.setVersion('v0'); byId('btn-start').fire('click');
  ok(!list().includes('data-satoggle') && !GameData.saOn(), 'v0 には ない');
  GameData.setVersion('v1');
}
done();
