// はやさ調整(0.5×〜10×、0.5きざみ)の テスト
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern, origE = Patterns.buildEndlessPattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
Patterns.buildEndlessPattern = def => (lastPattern = origE(def));
const ov = byId('game-overlay');
const codeOf = t => (t.kbd ? t.kbd : t.dir ? DIRKEY[t.dir] : 'Space');
const stepNotes = (notes, tFn) => {
  for (const n of notes) {
    const t = tFn(n.b), ht = n.hold ? tFn(n.b + n.hold) : null;
    if (!n.pressed && clock.t >= t) { n.pressed = true; key(n.code); if (!ht) { key(n.code, false); n.released = true; } }
    else if (n.pressed && !n.released && ht && clock.t >= ht) { n.released = true; key(n.code, false); }
  }
};
const mkNotes = () => lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ b: t.b, hold: t.hold || 0, pressed: false, released: false, code: codeOf(t) }));

console.log('--- 1) せってい: 0.5〜10、0.5きざみ、初期バージョンでは 1 ---');
ok(GameData.speed() === 1, 'はじめは 1.0');
ok(GameData.setSpeed(0.3) === 0.3 && GameData.setSpeed(10.7) === 10.7 && GameData.setSpeed(2.264) === 2.26 && GameData.setSpeed(2.265) === 2.27 && GameData.setSpeed('abc') === 1 && GameData.setSpeed(0) === 0.01 && GameData.setSpeed(11.5) === 11.11 && GameData.setSpeed(0.004) === 0.01 && GameData.setSpeed(11.11) === 11.11, 'クランプ 0.01〜11.11 と 0.01きざみ');
ok(GameData.SPEED_MIN === 0.01 && GameData.SPEED_MAX === 11.11 && GameData.SPEED_STEP === 0.01, '定数');
GameData.setSpeed(3); GameData.setVersion('v0'); ok(GameData.speed() === 1, '初期バージョンでは つねに 1'); GameData.setVersion('v1'); ok(GameData.speed() === 3, 'Ver.1 に もどすと 3');
ok(GameData.speedLabel() === '3.00×' && GameData.speedLabel(0.5) === '0.50×' && GameData.speedLabel(11.11) === '11.11×', 'ラベル(小数2けた)');
GameData.setSpeed(1);

console.log('--- 2) 2.0× / 0.5× / 10× で あそぶ: ノーツの 時刻が はやさに あわせて かわる ---');
function playAt(sp, def) {
  GameData.setSpeed(sp);
  let result = null;
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / def.bpm / sp, beat0 = begin + 0.3 + 4 * spb;
  const notes = mkNotes();
  const end = begin + 300;
  while (!result && clock.t < end) { clock.t += 0.002; stepNotes(notes, b => beat0 + b * spb); frame(); }
  return { result, dur: clock.t - begin };
}
const g = GameData.gameDef('omote', 2, 0);
const r2 = playAt(2, g); ok(r2.result && r2.result.rank === 'superb' && r2.result.miss === 0 && r2.result.whiff === 0, '2.0×: ぜんぶ とれて superb', JSON.stringify(r2.result));
ok(H.drawn.some(s => s === '⏩ 2.00×'), 'プレイ中 左上に ⏩ 2.00×');
const r1 = playAt(1, g); ok(r1.result && r1.result.rank === 'superb', '1.0×: superb');
const rh = playAt(0.5, g); ok(rh.result && rh.result.rank === 'superb' && rh.result.miss === 0, '0.5×: superb', JSON.stringify(rh.result));
ok(r2.dur < r1.dur * 0.6 && rh.dur > r1.dur * 1.6, 'ながさ: 2× は みじかく、0.5× は ながい', JSON.stringify({ d2: +r2.dur.toFixed(1), d1: +r1.dur.toFixed(1), dh: +rh.dur.toFixed(1) }));
ok(r2.result.speed === 2 && rh.result.speed === 0.5 && r1.result.speed === 1, 'result.speed');
const r10 = playAt(11.11, g); ok(r10.result && r10.result.miss === 0 && r10.result.whiff === 0 && r10.result.rank === 'superb' && r10.result.speed === 11.11, '11.11×: ジャストなら ぜんぶ とれる', JSON.stringify(r10.result));
const r37 = playAt(1.37, g); ok(r37.result && r37.result.rank === 'superb' && r37.result.speed === 1.37, '1.37×(0.01きざみ): superb');
{
  GameData.setSpeed(2); const e = Object.assign(GameData.endlessDef('solo'), { segCount: 3, seed: 4 });
  let result = null; Engine.play(e, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / e.bpm / 2, beat0 = begin + 0.3 + 4 * spb; const notes = mkNotes();
  while (!result && clock.t < begin + 100) { clock.t += 0.002; stepNotes(notes, b => beat0 + b * spb); frame(); }
  ok(result && result.survived && result.sections === 3, 'エンドレスも 2× で かんそう(テンポ区間 1つめ)', JSON.stringify(result && { s: result.survived, sec: result.sections }));
  GameData.setSpeed(1);
}

console.log('--- 3) ストップ中に はやさを かえる → いまの拍から 計算しなおし(メニューの ボタンは セレクトとは べつの id) ---');
{
  GameData.setSpeed(1);
  let result = null; const def = GameData.gameDef('omote', 3, 0);
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = mkNotes();
  const tOf1 = b => beat0 + b * spb;
  while (clock.t < tOf1(20.3)) { clock.t += 0.002; stepNotes(notes, tOf1); frame(); }
  for (const id of ['btn-pspd-down', 'btn-pspd-up', 'btn-pspd-down10', 'btn-pspd-up10', 'pspd-num']) byId(id).reset();   // メニューの ボタンは まいかい つくりなおされる
  key('Escape'); key('Escape', false);
  const pauseAt = clock.t, beatCur = (pauseAt - beat0) / spb;
  ok(ov.innerHTML.includes('id="btn-pspd-up"') && ov.innerHTML.includes('1.00×') && ov.innerHTML.includes('pspd-num') && !ov.innerHTML.includes('id="btn-spd-up"'), 'ストップメニューに はやさ(±0.01/±0.1/数値入力)');
  byId('btn-pspd-up').fire('click'); byId('btn-pspd-up').fire('click');
  ok(GameData.speed() === 1.02 && byId('pspd-now').textContent === '1.02×', '＋0.01 ×2 → 1.02×', GameData.speed() + ' ' + byId('pspd-now').textContent);
  byId('btn-pspd-up10').fire('click');
  ok(GameData.speed() === 1.12, '＋0.1 → 1.12×', GameData.speed());
  byId('pspd-num').value = '2'; byId('pspd-num').fire('change');
  ok(GameData.speed() === 2 && byId('pspd-now').textContent === '2.00×', '数値入力 2 → 2.00×', GameData.speed());
  byId('btn-resume').fire('click');
  const resumeAt = clock.t + 1.5; let dt = null;
  while (dt == null) { clock.t += 0.002; frame(); if (clock.t >= resumeAt) dt = clock.t - pauseAt; }
  const tOf2 = b => pauseAt + dt + (b - beatCur) * spb / 2;
  while (!result && clock.t < pauseAt + dt + 200) { clock.t += 0.002; stepNotes(notes, tOf2); frame(); }
  ok(result && result.rank === 'superb' && result.miss === 0 && result.whiff === 0, 'かえたあとの ノーツも ぜんぶ ジャスト → superb', JSON.stringify(result));
  ok(result && result.speed === 2, 'result.speed は 2');
  ok(clock.t < tOf2(72) + 2.5, 'おわりの 時刻も みじかく なる', JSON.stringify({ end: +clock.t.toFixed(2), expect: +tOf2(72).toFixed(2) }));
}
{
  GameData.setSpeed(1);
  let result = null; const def = GameData.gameDef('omote', 4, 1);
  Engine.play(def, { finish: r => { result = r; }, exit() {} }, 'solo');
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb; const notes = mkNotes(); const tOf1 = b => beat0 + b * spb;
  while (clock.t < tOf1(12.7)) { clock.t += 0.002; stepNotes(notes, tOf1); frame(); }
  for (const id of ['btn-pspd-down', 'btn-pspd-up', 'btn-pspd-down10', 'btn-pspd-up10', 'pspd-num']) byId(id).reset();
  key('Escape'); key('Escape', false);
  const pauseAt = clock.t, beatCur = (pauseAt - beat0) / spb;
  byId('pspd-num').value = '0.5'; byId('pspd-num').fire('change');
  ok(GameData.speed() === 0.5 && byId('pspd-now').textContent === '0.50×', '数値入力で 0.50×');
  byId('pspd-num').value = '0'; byId('pspd-num').fire('change');
  ok(GameData.speed() === 0.01, '0 は 0.01 に');
  byId('pspd-num').value = '0.5'; byId('pspd-num').fire('change');
  byId('btn-resume').fire('click');
  const resumeAt = clock.t + 1.5; let dt = null;
  while (dt == null) { clock.t += 0.002; frame(); if (clock.t >= resumeAt) dt = clock.t - pauseAt; }
  const tOf2 = b => pauseAt + dt + (b - beatCur) * spb * 2;
  while (!result && clock.t < pauseAt + dt + 400) { clock.t += 0.002; stepNotes(notes, tOf2); frame(); }
  ok(result && result.rank === 'superb' && result.miss === 0, '0.5× に さげても superb', JSON.stringify(result));
  GameData.setSpeed(1);
}

console.log('--- 4) セレクトの ボタン・スライダー・イントロ表示 ---');
{
  byId('btn-start').fire('click');
  ok(byId('spd-label').textContent === '⏩ はやさ 1.00×' && byId('speed-ctl').hidden === false && byId('spd-num').value === '1.00', 'ラベル 1.00× と 数値入力');
  byId('btn-spd-up').fire('click');
  ok(GameData.speed() === 1.01 && byId('spd-label').textContent === '⏩ はやさ 1.01×' && byId('spd-range').value === '1.01', '＋ → 1.01×');
  byId('spd-range').value = '4.44'; byId('spd-range').fire('input');
  ok(GameData.speed() === 4.44 && byId('spd-label').textContent === '⏩ はやさ 4.44×' && byId('spd-num').value === '4.44', 'スライダー → 4.44×');
  byId('spd-num').value = '7.77'; byId('spd-num').fire('change');
  ok(GameData.speed() === 7.77 && byId('spd-range').value === '7.77', '数値入力 → 7.77×');
  byId('btn-spd-down').fire('click');
  ok(GameData.speed() === 7.76, '− → 7.76×');
  GameData.setSpeed(11.11); byId('btn-spd-up').fire('click'); ok(GameData.speed() === 11.11, '11.11× より うえには いかない');
  GameData.setSpeed(0.01); byId('btn-spd-down').fire('click'); ok(GameData.speed() === 0.01, '0.01× より したには いかない');
  byId('spd-num').value = '99'; byId('spd-num').fire('change'); ok(GameData.speed() === 11.11, '数値入力 99 → 11.11');
  GameData.setSpeed(2);
  const btn = { dataset: { s: '1', slot: '0' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('⏩ はやさ 2.00×'), 'イントロに はやさ');
  Engine.stop();
  GameData.setVersion('v0'); byId('btn-start').fire('click');
  ok(byId('speed-ctl').hidden === true, '初期バージョンでは かくれる');
  GameData.setVersion('v1'); GameData.setSpeed(1);
}
done();
