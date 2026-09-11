// 音楽: 17ジャンルの 生成と 再生(スタブ)が おちない / ぜんゲームで ジャンルが きまる / イントロ・リザルトに 表示
import { boot } from './harness.js';
const H = boot();
const { Engine, GameData, Patterns, byId, key, frame, clock, ok, done } = H;
const ov = byId('game-overlay');
const STYLES = ['chip', 'funk', 'house', 'bossa', 'rock', 'lofi', 'swing', 'edm', 'jpop', 'samba', 'march', 'reggae', 'synthwave', 'hiphop', 'folk', 'orchestra', 'disco'];

function sweep(def, mode = 'solo', beats = 82) {
  let result = null, err = null;
  try {
    Engine.play(def, { finish: r => { result = r; }, exit() {} }, mode); frame();
    clock.t += 1; byId('btn-go').fire('click');
    const spb = 60 / def.bpm;
    for (let i = 0; i < beats * 8 && !result; i++) { clock.t += spb / 8; frame(); }
  } catch (e) { err = (e.stack || e.message).split('\n').slice(0, 3).join(' '); }
  return { result, err };
}
console.log('--- 1) ぜんゲームを さいごまで 再生(BGMイベントの 関数も 実行) ---');
{
  const defs = [];
  for (let s = 1; s <= 15; s++) for (let k = 0; k < 4; k++) defs.push(GameData.gameDef('omote', s, k));
  for (let s = 1; s <= 20; s++) defs.push(GameData.remixDef('omote', s));
  for (const a of GameData.SPECIALS.solo) defs.push(GameData.specialDef('solo', a));
  for (const a of GameData.KBD_GAMES) defs.push(GameData.kbdGameDef(a));
  for (const a of GameData.SPECIALS.coop) defs.push(Object.assign(GameData.specialDef('coop', a), { _mode: 'coop' }));
  const seen = new Map(); const errs = [];
  let n = 0;
  for (const def of defs) {
    const { result, err } = sweep(def, def._mode || 'solo');
    if (err) errs.push(def.id + ': ' + err);
    else if (!result) errs.push(def.id + ': けっかが でない');
    else { seen.set(result.style, (seen.get(result.style) || 0) + 1); n++; }
  }
  ok(errs.length === 0, `${n}本 再生して 例外なし`, errs.slice(0, 3).join(' | '));
  const missing = STYLES.filter(s => !seen.has(s));
  ok(missing.length === 0, '17ジャンル ぜんぶ つかわれる: ' + [...seen.entries()].map(([k, v]) => k + ':' + v).join(' '), 'missing ' + missing.join(','));
  ok([...seen.values()].every(v => v >= 2), 'どの ジャンルも 2本いじょう');
}
console.log('--- 2) エンドレス(1人/協力/対戦)と うらモードも おちない ---');
{
  for (const m of ['solo', 'coop', 'versus']) {
    const d = Object.assign(GameData.endlessDef(m), { segCount: 4, seed: 9 });
    const { result, err } = sweep(d, m, 4 + 4 * 8 + 6);
    ok(!err && result && result.endless, 'エンドレス ' + m + ' ' + (result ? result.styleLabel : ''), err || '');
  }
  const u = GameData.gameDef('ura', 3, 2);
  const { result, err } = sweep(u);
  ok(!err && result, 'うらモード ' + (result ? result.styleLabel : ''), err || '');
}
console.log('--- 3) おなじ ゲームは 毎回おなじ ジャンル / イントロ・リザルトに 表示 ---');
{
  const d = GameData.gameDef('omote', 1, 0);
  const a = sweep(d).result.style, b = sweep(d).result.style;
  ok(a === b, '毎回おなじ: ' + a);
  byId('btn-start').fire('click');
  const btn = { dataset: { s: '1', slot: '0' }, classList: { add() {}, remove() {} } };
  byId('stage-list').fire('click', { target: { closest: () => btn } });
  ok(/♪ [^ <]+ BPM/.test(ov.innerHTML), 'イントロに ♪ジャンル', ov.innerHTML.match(/♪[^<]*/)?.[0]);
  clock.t += 1; byId('btn-go').fire('click');
  const spb = 60 / d.bpm; let guard = 0;
  while (!ov.innerHTML.includes('rank-face') && guard++ < 5000) { clock.t += spb / 4; frame(); }
  ok(/♪ [^<]+<\/div>/.test(ov.innerHTML), 'リザルトに ♪ジャンル', ov.innerHTML.match(/♪[^<]*/)?.[0]);
  byId('btn-back').fire('click');
}
done();
