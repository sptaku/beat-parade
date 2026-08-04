'use strict';
/* GameData: ステージ構成・解放条件・セーブデータ。
   構成: ステージ1〜15 = ミニゲーム4つ + リミックス。
        リミックス16〜20 = 前のリミックスをクリアすると解放されるEXリミックス。
   裏モード: おもてのリミックス8をクリアすると解放。 */
const GameData = (() => {

  const POOL = ['march', 'batting', 'echo', 'jump', 'shoot', 'clap', 'frog', 'chop', 'train', 'flower', 'robot', 'star'];

  const STAGES = [
    { name: 'スターひろば',        key: 60, minor: false, bg1: '#8fdcff', bg2: '#fff3b0', ground: '#7ed957', accent: '#ff6fa5' },
    { name: 'もりのおんがくかい',  key: 62, minor: false, bg1: '#b6e388', bg2: '#fdf6c3', ground: '#5cb85c', accent: '#ff9f43' },
    { name: 'うみのカーニバル',    key: 64, minor: false, bg1: '#7fd8ff', bg2: '#c9f7f0', ground: '#f6d76b', accent: '#ff7f7f' },
    { name: 'うちゅうステーション', key: 57, minor: false, bg1: '#223a7a', bg2: '#4a5fb5', ground: '#2c2c54', accent: '#9b8cff' },
    { name: 'さばくのだいぼうけん', key: 59, minor: false, bg1: '#ffd97a', bg2: '#ffe9b8', ground: '#e0a34e', accent: '#e2574c' },
    { name: 'ゆきのおまつり',      key: 65, minor: false, bg1: '#bfe6ff', bg2: '#eef8ff', ground: '#ffffff', accent: '#6fb1ff' },
    { name: 'まちのやたい',        key: 60, minor: false, bg1: '#ffb26b', bg2: '#ffe0c2', ground: '#8d6e63', accent: '#ff5d8f' },
    { name: 'おばけのやかた',      key: 57, minor: true,  bg1: '#4a3f6b', bg2: '#6b5b95', ground: '#3e3552', accent: '#b39ddb' },
    { name: 'そらのサーカス',      key: 62, minor: false, bg1: '#9ad0ff', bg2: '#ffe8f7', ground: '#f0f4ff', accent: '#ff8f5e' },
    { name: 'はなのらくえん',      key: 64, minor: false, bg1: '#ffd3e8', bg2: '#fff6d8', ground: '#96d96c', accent: '#ff5d9e' },
    { name: 'こうじょうけんがく',  key: 59, minor: false, bg1: '#9fb4c7', bg2: '#d7e1ea', ground: '#6c7a89', accent: '#ffc107' },
    { name: 'でんせつのやま',      key: 60, minor: false, bg1: '#8bc3ff', bg2: '#d9f0e2', ground: '#7a9e7e', accent: '#e67e22' },
    { name: 'ときのとけいとう',    key: 57, minor: true,  bg1: '#6c5b7b', bg2: '#c06c84', ground: '#4a4062', accent: '#f8b195' },
    { name: 'にじのかいだん',      key: 65, minor: false, bg1: '#a4f3ff', bg2: '#ffe7fb', ground: '#b8f28c', accent: '#7c4dff' },
    { name: 'ビートパレード',    key: 60, minor: false, bg1: '#ffd86b', bg2: '#ff9de2', ground: '#ffe9a8', accent: '#ff3d81' },
    { name: 'ギャラクシーゲート',      key: 62, minor: false, bg1: '#1f2a6b', bg2: '#5b3f8f', ground: '#2c2c54', accent: '#7c9bff' },
    { name: 'ながれぼしハイウェイ',    key: 64, minor: false, bg1: '#14213d', bg2: '#3a4a8f', ground: '#22304f', accent: '#ffd166' },
    { name: 'ダークネビュラ',          key: 57, minor: true,  bg1: '#241734', bg2: '#4b2e64', ground: '#2c1b3d', accent: '#c471ed' },
    { name: 'コスモパレード',          key: 65, minor: false, bg1: '#2d3a8c', bg2: '#8f5bd1', ground: '#3a2f6b', accent: '#ff8fd8' },
    { name: 'グランドフィナーレ',      key: 60, minor: false, bg1: '#ffb0e0', bg2: '#ffe9a8', ground: '#ffd1f0', accent: '#ff2d78' },
  ];

  function scaleHz(key, minor) {
    const offs = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    return offs.map(o => 440 * Math.pow(2, (key + 12 + o - 69) / 12));
  }

  function bpmFor(s, kind, ura) {
    let base = s <= 15 ? 100 + (s - 1) * 3 : 146 + (s - 16) * 6;
    if (kind === 'remix' && s <= 15) base += 4;
    if (ura) base = Math.round(base * 1.12);
    return Math.min(base, 190);
  }

  function archAt(s, k) {
    const idx = (s - 1) * 4 + k;
    return { arch: POOL[idx % 12], level: Math.floor(idx / 12) + 1 };
  }
  function archName(arch, level) {
    return Patterns.ARCH[arch].base + (level > 1 ? ' ' + level : '');
  }

  function gameDef(side, s, k) {
    const meta = STAGES[s - 1];
    const { arch, level } = archAt(s, k);
    const ura = side === 'ura';
    return {
      id: `${side}:${s}:${k}`, kind: 'game', side, stage: s, slot: k,
      arch, level,
      title: (ura ? '裏・' : '') + archName(arch, level),
      icon: Patterns.ARCH[arch].icon,
      desc: Patterns.ARCH[arch].desc + (ura ? '（裏: テンポアップ＆とちゅうで 見えなくなる！）' : ''),
      stageLabel: `ステージ${s} ${meta.name}`,
      bpm: bpmFor(s, 'game', ura),
      d: s + (ura ? 3 : 0),
      ura,
      theme: meta,
      scale: scaleHz(meta.key, meta.minor),
      music: { root: meta.key, minor: meta.minor },
    };
  }

  function remixDef(side, s) {
    const meta = STAGES[s - 1];
    const ura = side === 'ura';
    let games;
    if (s <= 15) {
      games = [0, 1, 2, 3].map(k => ({ arch: archAt(s, k).arch, d: s + 1 + (ura ? 3 : 0) }));
    } else {
      const rng = Patterns.rngFor(`remixpool:${side}:${s}`);
      const pool = POOL.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const d = 12 + (s - 16) * 2 + (ura ? 3 : 0);
      games = pool.slice(0, 8).map(a => ({ arch: a, d }));
    }
    return {
      id: `${side}:${s}:R`, kind: 'remix', side, stage: s, slot: 'R',
      title: (ura ? '裏リミックス' : 'リミックス') + s,
      icon: s <= 15 ? '🎵' : '🌈',
      desc: s <= 15
        ? 'このステージの 4つの ゲームが つぎつぎ とうじょう！ながれに のっていこう！'
        : 'いままでの ゲームたちが オールスターで とうじょうする スペシャルリミックス！',
      stageLabel: s <= 15 ? `ステージ${s} ${meta.name}` : `EX ${meta.name}`,
      bpm: bpmFor(s, 'remix', ura),
      d: s + (ura ? 3 : 0),
      ura,
      theme: meta,
      scale: scaleHz(meta.key, meta.minor),
      music: { root: meta.key, minor: meta.minor },
      games,
    };
  }

  /* ---------- ふたりせんよう ミニゲーム ---------- */
  const SPECIALS = {
    coop: ['mochi', 'mikoshi', 'volley', 'rocket', 'chorus'],
    versus: ['duel', 'tug', 'mole', 'gunman', 'pingpong'],
  };
  function specialDef(mode2, arch) {
    const themeIdx = { mochi: 6, mikoshi: 6, volley: 2, rocket: 3, chorus: 1, duel: 14, tug: 11, mole: 9, gunman: 4, pingpong: 8 }[arch];
    const bpmMap = { gunman: 112, pingpong: 118, rocket: 120 };
    const meta = STAGES[themeIdx];
    const a = Patterns.ARCH[arch];
    return {
      id: `2p:${mode2}:${arch}`, kind: 'game', side: 'omote', stage: 0,
      slot: SPECIALS[mode2].indexOf(arch),
      arch, level: 1, title: a.base, icon: a.icon, desc: a.desc,
      stageLabel: mode2 === 'coop' ? 'ふたりせんよう（協力）' : 'ふたりせんよう（対戦）',
      bpm: bpmMap[arch] || 124, d: 6, ura: false, theme: meta,
      scale: scaleHz(meta.key, meta.minor),
      music: { root: meta.key, minor: meta.minor },
      special: mode2,
    };
  }

  /* ---------- セーブ ---------- */
  const KEY = 'miracleStars.save.v1';
  let save = { ranks: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) save = JSON.parse(raw);
    if (!save.ranks) save.ranks = {};
  } catch (e) { save = { ranks: {} }; }

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
  function wipe() { save = { ranks: {} }; try { localStorage.removeItem(KEY); } catch (e) {} }

  const rank = id => save.ranks[id] || 0;          // 0=未 1=やりなおし 2=クリア 3=ハイレベル
  const cleared = id => rank(id) >= 2;
  function setResult(id, r) {
    if (r > rank(id)) { save.ranks[id] = r; persist(); }
    else if (!(id in save.ranks)) { save.ranks[id] = r; persist(); }
  }

  /* ---------- 解放条件 ---------- */
  const DEBUG = () => (typeof location !== 'undefined' && location.hash.indexOf('debug') >= 0);
  const uraOpen = () => DEBUG() || cleared('omote:8:R');
  const allGames = (side, s) => [0, 1, 2, 3].every(k => cleared(`${side}:${s}:${k}`));

  function unlocked(side, s, slot) {
    if (DEBUG()) return true;
    if (side === 'ura' && !uraOpen()) return false;
    if (slot === 'R') {
      if (s <= 15) return allGames(side, s);            // リミックスは4ゲームクリアで解放
      return cleared(`${side}:${s - 1}:R`);             // 16以降は前のリミックスクリアで解放
    }
    if (s > 15) return false;                           // 16以降にミニゲームは無い
    if (s === 1) return true;                           // ステージ1は最初から
    return cleared(`${side}:${s - 1}:R`);               // ゲームは前のリミックスクリアで解放
  }

  function medals() {
    let n = 0;
    for (const k in save.ranks) if (save.ranks[k] === 3) n++;
    return n;
  }

  /* 解放状態のスナップショット（クリア後に「なにが新しく解放されたか」を出すため） */
  function unlockSnapshot() {
    const set = new Set();
    if (uraOpen()) set.add('URA');
    for (const side of ['omote', 'ura']) {
      for (let s = 1; s <= 20; s++) {
        if (s <= 15) for (let k = 0; k < 4; k++) if (unlocked(side, s, k)) set.add(`${side}:${s}:${k}`);
        if (unlocked(side, s, 'R')) set.add(`${side}:${s}:R`);
      }
    }
    return set;
  }

  return { POOL, STAGES, SPECIALS, gameDef, remixDef, specialDef, rank, cleared, setResult, unlocked, uraOpen, allGames, medals, unlockSnapshot, wipe, DEBUG };
})();
