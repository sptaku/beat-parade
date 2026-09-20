// セーブ: いくつもの タブで ひらいていても、ふるい タブが あたらしい きろくを けさない
import { boot } from './harness.js';
const H = boot();
const { GameData: A, ok, done, listeners } = H;
const KEY = 'miracleStars.save.v1';
const src = ['patterns.js', 'data.js'].map(f => Deno.readTextFileSync(new URL('../js/' + f, import.meta.url))).join('\n');
const newTab = () => new Function(src + ';return GameData;')();
const stored = () => JSON.parse(localStorage.getItem(KEY));

console.log('--- 1) ふるい タブが あとから ほぞんしても、あたらしい きろくは きえない ---');
{
  A.setResult('omote:1:0', 3);
  const B = newTab();                       // このとき B は omote:1:0 だけ しっている
  A.setResult('ura:3:1', 2); A.setResult('ura:3:0', 3);   // A が すすめる
  B.setResult('omote:1:1', 2);              // ふるい B が ほぞん
  const r = stored().ranks;
  ok(r['ura:3:1'] === 2 && r['ura:3:0'] === 3 && r['omote:1:1'] === 2 && r['omote:1:0'] === 3, 'りょうほうの きろくが のこる', JSON.stringify(r));
  ok(B.rank('ura:3:1') === 2, 'B にも とりこまれる');
  B.setResult('ura:3:0', 2);
  ok(stored().ranks['ura:3:0'] === 3, 'ランクは さがらない');
}
console.log('--- 2) storage イベント: ほかの タブの ほぞん/けす が つたわる ---');
{
  const before = (listeners.storage || []).length;
  ok(before >= 1, 'storage リスナーが ある');
  const C = newTab();
  const fake = JSON.parse(localStorage.getItem(KEY)); fake.ranks['omote:9:R'] = 3; fake.snight = { got: 1, on: 0 };
  (listeners.storage || []).forEach(f => f({ key: KEY, newValue: JSON.stringify(fake) }));
  ok(A.rank('omote:9:R') === 3 && C.rank('omote:9:R') === 3 && A.superNightUnlocked(), 'ほかの タブの きろく・かいほうが つたわる');
  (listeners.storage || []).forEach(f => f({ key: 'other', newValue: null }));
  ok(A.rank('omote:1:0') === 3, 'べつの キーは むし');
  A.wipe();
  (listeners.storage || []).forEach(f => f({ key: KEY, newValue: null }));
  ok(localStorage.getItem(KEY) === null && C.rank('omote:1:0') === 0 && A.rank('omote:1:0') === 0, 'けしたら ほかの タブも けす');
  C.setResult('omote:2:0', 2);
  ok(Object.keys(stored().ranks).length === 1, 'けした あとに ふるい きろくが よみがえらない', JSON.stringify(stored().ranks));
}
console.log('--- 3) かきだし / よみこみ(とりこみ) ---');
{
  A.wipe(); (listeners.storage || []).forEach(f => f({ key: KEY, newValue: null }));
  A.setResult('omote:1:0', 2);
  const old = { ranks: { 'omote:1:0': 3, 'ura:3:1': 2 }, best: { 'endless:solo': 40 }, pf: { 'omote:1:0': 1 }, night: { got: 1, on: 1 } };   // ふるい かたちの セーブ(streak/snight なし)
  const n = A.importSave(JSON.stringify(old));
  ok(n === 2 && A.rank('omote:1:0') === 3 && A.rank('ura:3:1') === 2 && A.bestEndless('solo') === 40 && A.isPerfect('omote:1:0') && A.nightUnlocked(), 'ふるい かたちでも とりこめる');
  ok(JSON.parse(A.exportSave()).ranks['ura:3:1'] === 2 && stored().ranks['ura:3:1'] === 2, 'かきだし・ほぞん');
  let threw = false; try { A.importSave('{"x":1}'); } catch (e) { threw = true; }
  ok(threw && A.rank('ura:3:1') === 2, 'へんな データは ことわる');
  A.wipe();
}
done();
