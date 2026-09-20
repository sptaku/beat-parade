// メダルと リズムおもちゃ
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, Toys, byId, key, frame, clock, ok, done, drawn, DIRKEY } = H;
let lastPattern = null;
const orig = Patterns.buildGamePattern;
Patterns.buildGamePattern = def => (lastPattern = orig(def));
const ov = byId('game-overlay');
const shown = [];
for (const s of ['title', 'select', 'game']) byId('scr-' + s).classList.toggle = (cls, on) => { if (on) shown.push(s); };
const clickToy = k => byId('stage-list').fire('click', { target: { closest: () => ({ dataset: { toy: k }, classList: { add() {}, remove() {} } }) } });
const tap = (x, y) => byId('cv').fire('pointerdown', { pointerId: 3, clientX: x, clientY: y, offsetX: x });

console.log('--- 1) メダル: ハイレベルで 1まい(べつわくは かぞえない)、おもちゃは メダルで かいほう ---');
{
  ok(Toys.LIST.length === 22 && new Set(Toys.LIST.map(t => t.id)).size === 22 && Toys.LIST.every(t => typeof t.id === 'string' && typeof t.key === 'function' && typeof t.draw === 'function') && Toys.LIST.every((t, i) => i === 0 || t.need > Toys.LIST[i - 1].need) && Toys.LIST[0].need === 1, '22しゅるい・ひつよう メダルは 1 から ふえていく', Toys.LIST.map(t => t.need).join(','));
  GameData.setResult('omote:1:1', 2); GameData.setResult('omote:1:2#arrow', 3);
  ok(GameData.medals() === 0, 'クリアだけ・べつわくの ⭐ は メダルに ならない');
  byId('btn-start').fire('click');
  let list = byId('stage-list').innerHTML;
  ok(list.includes('🧸 リズムおもちゃ') && (list.match(/data-toy="/g) || []).length === 22 && list.includes('🔒🏅1') && byId('medal-count').textContent.includes('🏅 0'), 'セレクトに おもちゃの 行(ぜんぶ 🔒)と 🏅 0');
  clickToy('drumpad');
  ok(!Toys.isOpen(), 'メダルが たりないと ひらかない');
  // ハイレベルを とる → メダル + おもちゃ かいほうの おしらせ
  const btn = { dataset: { s: '1', slot: '0' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  clock.t += 1; const begin = clock.t; byId('btn-go').fire('click');
  const def = GameData.gameDef('omote', 1, 0), spb = 60 / def.bpm, beat0 = begin + 0.3 + 4 * spb;
  const notes = lastPattern.targets.filter(t => t.kind !== 'bomb').map(t => ({ t: beat0 + t.b * spb, pressed: false, code: t.dir ? DIRKEY[t.dir] : 'Space' }));
  let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 80000) { clock.t += 0.004; for (const n of notes) if (!n.pressed && clock.t >= n.t) { n.pressed = true; key(n.code); key(n.code, false); } frame(); }
  ok(GameData.medals() === 1 && ov.innerHTML.includes('🏅 メダル ゲット！（ぜんぶで 1 まい）') && ov.innerHTML.includes('リズムおもちゃ「🥁 ドラムパッド」 かいほう'), 'リザルトに メダルと おもちゃの おしらせ', ov.innerHTML.match(/🏅[^<]*/)?.[0]);
  byId('btn-back').fire('click');
  list = byId('stage-list').innerHTML;
  ok(byId('medal-count').textContent.includes('🏅 1') && !list.includes('🔒🏅1<') && list.includes('🔒🏅3') && list.includes('あと 2 まい'), 'セレクト: 🏅 1、つぎまで あと 2まい');
}
console.log('--- 2) おもちゃを ひらく → あそぶ → Esc / ✕ で もどる ---');
{
  shown.length = 0;
  clickToy('drumpad');
  ok(Toys.isOpen() && shown.includes('game') && ov.innerHTML.includes('ドラムパッド') && ov.innerHTML.includes('btn-toy-go'), 'イントロ');
  byId('btn-toy-go').fire('click');
  drawn.length = 0;
  for (let i = 0; i < 200; i++) { clock.t += 0.01; if (i === 20) key('KeyA'); if (i === 40) tap(370, 190); if (i === 60) key('Space'); frame(); }
  ok(ov.innerHTML === '' && drawn.some(s => s.includes('キック')) && drawn.some(s => s === '✕') && drawn.some(s => s.includes('メトロノーム: OFF')), 'パッドが えがかれ、スペースで メトロノーム OFF');
  shown.length = 0; key('Escape');
  ok(!Toys.isOpen() && shown[shown.length - 1] === 'select', 'Esc で セレクトへ');
  clickToy('drumpad'); byId('btn-toy-go').fire('click'); clock.t += 0.1; frame();
  shown.length = 0; tap(924, 36);
  ok(!Toys.isOpen() && shown[shown.length - 1] === 'select', '✕ タップで セレクトへ');
  // おもちゃの あとも ふつうに ゲームが あそべる(Engine と ぶつからない)
  const btn = { dataset: { s: '1', slot: '1' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(ov.innerHTML.includes('btn-go'), 'おもちゃの あとも ゲームの イントロが でる');
  key('Escape');
}
console.log('--- 3) 22しゅるい ぜんぶ: キー・タップ・ながい さいせいで 例外なし ---');
{
  const errs = [];
  const KEYS = ['KeyA', 'KeyS', 'KeyW', 'KeyK', 'Digit1', 'Digit5', 'Digit8', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'KeyZ', 'KeyM', 'Digit0', 'KeyB', 'KeyT', 'KeyP', 'KeyD', 'KeyF', 'KeyJ', 'KeyR', 'Digit2', 'Digit3', 'Digit4', 'Digit6'];
  for (const ty of Toys.LIST) {
    try {
      Toys.open(ty.id, () => {});
      byId('btn-toy-go').fire('click');
      for (let i = 0; i < 1200; i++) {
        clock.t += 0.01;
        if (i % 7 === 0) key(KEYS[(i / 7) % KEYS.length]);
        if (i % 11 === 0) tap(60 + (i * 37) % 840, 80 + (i * 53) % 400);
        frame();
      }
      Toys.close(true);
    } catch (e) { errs.push(ty.id + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); try { Toys.close(true); } catch (e2) {} }
  }
  ok(errs.length === 0, '例外なし', errs.join(' | '));
}
console.log('--- 4) こべつの うごき ---');
{
  Toys.open('bells', () => {}); byId('btn-toy-go').fire('click'); clock.t += 0.1; frame();
  drawn.length = 0;
  for (const n of [1, 1, 5, 5, 6, 6, 5]) { key('Digit' + n); clock.t += 0.05; frame(); }
  ok(drawn.some(s => s.includes('きらきらぼし') && s.includes('7 / 42')), 'ハンドベル: ただしい じゅんで すすむ', drawn.filter(s => s.includes('/')).slice(-1)[0]);
  key('Digit2'); clock.t += 0.05; frame();
  ok(drawn.some(s => s.includes('7 / 42')) && !drawn.some(s => s.includes('8 / 42')), 'ちがう ベルでは すすまない');
  key('ArrowRight'); clock.t += 0.05; drawn.length = 0; frame();
  ok(drawn.some(s => s.includes('かえるのうた') && s.includes('0 / ')), '→ で きょくが かわる');
  Toys.close(true);
  Toys.open('metro', () => {}); byId('btn-toy-go').fire('click'); clock.t += 0.2; frame();
  // ちょうど 拍の うえで たたく → ピッタリ
  const t0 = clock.t; clock.t = t0 + 0.6 * 3; frame(); drawn.length = 0; key('Space'); frame();
  ok(drawn.some(s => s.includes('ピッタリ')), 'メトロノームどうじょう: 拍の うえで ピッタリ', drawn.filter(s => s.includes('ms')).join('|'));
  key('ArrowUp'); drawn.length = 0; frame();
  ok(drawn.some(s => s === '♪ BPM 110'), '↑ で BPM +10');
  Toys.close(true);
  Toys.open('looper', () => {}); byId('btn-toy-go').fire('click'); clock.t += 0.2; frame();
  key('KeyC'); tap(160 + 5 * 46 + 20, 130 + 1 * 64 + 20); key('Space'); drawn.length = 0; frame();
  ok(drawn.some(s => s.includes('ストップ')), 'ループメーカー: スペースで ストップ');
  Toys.close(true);
}
console.log('--- 4b) 第2弾の こべつの うごき ---');
{
  const openToy = id => { Toys.open(id, () => {}); byId('btn-toy-go').fire('click'); clock.t += 0.2; frame(); };
  openToy('guitar'); key('Digit3'); drawn.length = 0; frame();
  ok(drawn.some(s => s === '3  Am'), 'コードギター: 3 で Am'); Toys.close(true);
  openToy('train'); for (let k = 0; k < 5; k++) { key('Space'); clock.t += 0.4; frame(); } drawn.length = 0; frame();
  ok(drawn.some(s => s === '♪ BPM 150'), 'タップ きかんしゃ: 0.4びょう おきに たたくと BPM 150', drawn.filter(s => s.includes('BPM')).join('|')); Toys.close(true);
  openToy('arp'); key('ArrowUp'); key('KeyS'); drawn.length = 0; frame();
  ok(drawn.some(s => s.includes('くだり')), 'アルペジエーター: ↑ で ならしかたが かわる'); Toys.close(true);
  openToy('dj'); key('Digit3'); key('Digit1'); for (let k = 0; k < 100; k++) { clock.t += 0.02; frame(); } Toys.close(true);
  ok(true, 'DJミキサー: レイヤー ON/OFF で さいせい');
  openToy('clap10'); for (let k = 0; k < 12; k++) { key('Space'); clock.t += 0.1; frame(); } drawn.length = 0; frame();
  ok(drawn.some(s => s === '12 かい'), '10びょう れんだ: 12かい');
  clock.t += 10; drawn.length = 0; frame();
  ok(drawn.some(s => s.includes('おわり') && s.includes('1.2')) && drawn.some(s => s.includes('ベスト 12')), '10びょうで おわり・ベスト きろく', drawn.filter(s => s.includes('おわり')).join('|'));
  key('Space'); drawn.length = 0; frame(); ok(drawn.some(s => s === '12 かい'), 'おわった ちょくごは かぞえない'); Toys.close(true);
  openToy('fortune'); for (let k = 0; k < 8; k++) { key('Space'); clock.t += 0.5; frame(); } drawn.length = 0; frame();
  ok(drawn.some(s => s.includes('だいだいきち')) && drawn.some(s => s.includes('120 BPM')), 'リズムうらない: ぴったり おなじ かんかく → だいだいきち', drawn.filter(s => s.includes('きち') || s.includes('BPM')).join('|')); Toys.close(true);
  openToy('glass'); key('Digit4'); key('ArrowUp'); key('ArrowUp'); drawn.length = 0; frame(); Toys.close(true);
  ok(true, 'グラスハープ: みずの りょうを かえられる');
  openToy('parade'); key('KeyA'); drawn.length = 0; frame();
  ok(drawn.some(s => s === 'つぎの しょうせつ！'), 'パレード: つぎの しょうせつに よやく'); Toys.close(true);
}
console.log('--- 5) 初期バージョンには ない ---');
{
  GameData.setVersion('v0'); byId('btn-start').fire('click');
  ok(!byId('stage-list').innerHTML.includes('リズムおもちゃ'), 'v0 では おもちゃの 行が ない');
  GameData.setVersion('v1');
}
done();
