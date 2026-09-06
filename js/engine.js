'use strict';
/* Engine: コンダクター(Web Audioクロック同期)・入力判定・描画ループ・BGM生成 */
const Engine = (() => {
  const W = 960, H = 540;
  const PERF_W = { omote: 0.075, ura: 0.058 };   // ピッタリ判定(秒)
  const OK_W = { omote: 0.15, ura: 0.12 };       // セーフ判定(秒)

  let cv = null, c = null;
  let S = null; // 現在のセッション
  const P_COLORS = ['#47a8ff', '#ff8c42'];   // 1P=青 / 2P=オレンジ
  const NEUTRAL_COLOR = '#ffd166';           // 対戦の「とりあい」ノーツ

  /* タイミングレーンの表示設定(保存される)。ゲーム中は Lキー でいつでも切替 */
  let laneOn = true;
  try { laneOn = localStorage.getItem('miracleStars.lane.v1') !== '0'; } catch (e) { /* private mode */ }
  const laneShown = () => laneOn && (typeof GameData === 'undefined' || GameData.feat('lane'));   // 初期バージョンには レーンが ない
  function setLane(v) {
    laneOn = !!v;
    try { localStorage.setItem('miracleStars.lane.v1', laneOn ? '1' : '0'); } catch (e) {}
  }
  function toggleLane() {
    setLane(!laneOn);
    AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
    if (S) S.laneToast = AudioKit.now();
  }

  function init(canvas) {
    cv = canvas;
    c = cv.getContext('2d');
    const DIRKEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const WASD = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
    /* キー → { p: プレイヤー, dir: ほうこう }。ゲーム入力でなければ null
       1人: スペース/J/F/G = アクション、↑↓←→ か WASD = ほうこう
       2人: 1P = F/G と ↑↓←→ ／ 2P = J/K と WASD */
    function keyInput(code) {
      if (S.def.kbdMode) {   // キーボード版: A〜Z・0〜9 が ノーツのキー(2人は 左半分=1P / 右半分=2P)
        if (S.def.arrowMode) {   // アロー＆キーボード版: ↑↓←→ = 1Pの ほうこう、WASD = 2Pの ほうこう(1人では ただの キー)、L = レーン切替
          if (DIRKEY[code]) return { p: 0, dir: DIRKEY[code] };
          if (S.mode !== 'solo' && WASD[code]) return { p: 1, dir: WASD[code] };
          if (code === 'KeyL') return null;
        }
        if (/^(Key[A-Z]|Digit[0-9])$/.test(code)) return { p: S.mode === 'solo' ? 0 : (KBD_LEFT_SET.has(code) ? 0 : 1), dir: null };
        return code === 'Space' && S.mode === 'solo' && !S.def.kbdOnly ? { p: 0, dir: null } : null;   // 専用版は A〜Z・0〜9 だけ
      }
      const arrowsOn = GameData.feat('arrows');   // 初期バージョンでは アローキー/WASD は つかわない
      const arrow = arrowsOn ? (DIRKEY[code] || null) : null, wasd = arrowsOn ? (WASD[code] || null) : null;
      if (S.mode === 'solo') {
        if (code === 'Space' || code === 'KeyJ' || code === 'KeyF' || code === 'KeyG') return { p: 0, dir: null };
        return (arrow || wasd) ? { p: 0, dir: arrow || wasd } : null;
      }
      if (arrow) return { p: 0, dir: arrow };
      if (code === 'KeyF' || code === 'KeyG') return { p: 0, dir: null };
      if (wasd) return { p: 1, dir: wasd };
      if (code === 'KeyJ' || code === 'KeyK') return { p: 1, dir: null };
      return null;
    }
    window.addEventListener('keydown', e => {
      if (!S) return;
      if (e.code === 'Escape') { quit(); return; }
      const laneArrows = laneByArrows(S.def);
      if (laneArrows && DIRKEY[e.code]) { e.preventDefault(); if (!e.repeat && GameData.feat('lane')) toggleLane(); return; }   // キーボード版: アローキーは レーン切替
      if (e.code === 'KeyL' && !laneArrows) { e.preventDefault(); if (!e.repeat && GameData.feat('lane')) toggleLane(); return; }
      const ki = keyInput(e.code);
      if (ki) { e.preventDefault(); if (!e.repeat) press(ki.p, ki.dir, e.code); return; }
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && S.phase === 'intro') begin(); }
    });
    window.addEventListener('keyup', e => {   // ながおしの おわり
      if (!S) return;
      const ki = keyInput(e.code);
      if (ki) release(ki.p, e.code);
    });
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!S) return;
      if (S.def.kbdOnly && S.phase === 'play') return;   // キーボード専用版: タップは つかえない(スタートだけ OK)
      const hit = padAt(e);   // ほうこうパッドに あたれば その プレイヤー・ほうこう
      const p = hit ? hit.p : (S.mode === 'solo' ? 0 : (e.offsetX < cv.clientWidth / 2 ? 0 : 1));   // 左半分タップ=1P / 右半分=2P
      const k = 'ptr:' + e.pointerId;
      S.ptr[k] = p;
      press(p, hit ? hit.dir : null, k);
    });
    const ptrUp = e => {
      if (!S) return;
      const k = 'ptr:' + e.pointerId;
      if (k in S.ptr) { release(S.ptr[k], k); delete S.ptr[k]; }
    };
    cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', ptrUp);
    window.addEventListener('pointerup', ptrUp);
  }

  /* ほうこうパッド: 1人=がめん右 / 2人=1Pが がめん左・2Pが がめん右。タップでも ほうこうを 入力できる */
  const PAD_SETS = {
    right: { up: [870, 262], left: [818, 318], right: [922, 318], down: [870, 374] },
    left:  { up: [90, 262], left: [38, 318], right: [142, 318], down: [90, 374] },
  };
  const PAD_R = 27;
  function padSetsFor() { return S.mode === 'solo' ? [[0, PAD_SETS.right]] : [[0, PAD_SETS.left], [1, PAD_SETS.right]]; }
  function padAt(e) {   // → { p, dir } | null
    if (!S || !S.hasDir || !GameData.feat('arrows')) return null;
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * W / rect.width, y = (e.clientY - rect.top) * H / rect.height;
    for (const [p, set] of padSetsFor()) for (const dir in set) {
      const [px, py] = set[dir];
      if ((x - px) ** 2 + (y - py) ** 2 <= (PAD_R + 6) ** 2) return { p, dir };
    }
    return null;
  }
  const DIR_GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

  function overlay() { return document.getElementById('game-overlay'); }

  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return `rgb(${r},${g},${b})`;
  }
  function themeFor(def) {
    const t = def.theme;
    const night = typeof GameData !== 'undefined' && GameData.nightOn();
    if (!def.ura) {
      return night
        ? { bg1: darken(t.bg1, 0.30), bg2: darken(t.bg2, 0.38), ground: darken(t.ground, 0.34), accent: t.accent, night: true }
        : { bg1: t.bg1, bg2: t.bg2, ground: t.ground, accent: t.accent, night: false };
    }
    const f = night ? 0.6 : 1;   // うら + ナイトは さらに ふかい やみ
    return {
      bg1: night ? '#080513' : '#1a1038',
      bg2: darken(t.bg2, 0.45 * f), ground: darken(t.ground, 0.5 * f), accent: t.accent, night,
    };
  }

  /* ---------- テンポ ----------
     ふつうの曲は一定。エンドレスは 一定拍ごとに BPM が上がっていくので、
     拍↔時刻の変換を くぎり(セクション)ごとの一次関数で行う。 */
  function tempoSections(def, totalBeats) {
    const base = 60 / def.bpm;
    if (def.kind !== 'endless') return [{ b0: -8, spb: base }];
    const secs = [{ b0: -8, spb: base }];
    const growth = def.growth || 1.04, step = def.tempoStep || 32, cap = def.bpmMax || 190;
    for (let b = step, i = 1; b < totalBeats + step; b += step, i++) {
      secs.push({ b0: b, spb: 60 / Math.min(cap, def.bpm * Math.pow(growth, i)) });
    }
    return secs;
  }
  function secAt(beat) {
    const secs = S.tempo;
    let i = 0;
    while (i + 1 < secs.length && secs[i + 1].b0 <= beat) i++;
    return secs[i];
  }
  const spbAt = beat => secAt(beat).spb;
  function bt(beat) { const s = secAt(beat); return s.t + (beat - s.b0) * s.spb; }   // 拍 → 時刻
  function tb(time) {                                                               // 時刻 → 拍
    const secs = S.tempo;
    let i = 0;
    while (i + 1 < secs.length && secs[i + 1].t <= time) i++;
    return secs[i].b0 + (time - secs[i].t) / secs[i].spb;
  }

  /* ---------- 起動 ---------- */
  function play(def, cbs, mode = 'solo') {
    stop();
    const pattern = def.kind === 'endless' ? Patterns.buildEndlessPattern(def)
      : def.kind === 'remix' ? Patterns.buildRemixPattern(def)
        : Patterns.buildGamePattern(def);
    if (mode === 'solo') pattern.targets.forEach(t => { if (t.owner === undefined) t.owner = 0; });
    else assignOwners(pattern.targets);
    const plan = notePlan(pattern.targets, def);               // ＆通常版 / アロー＆キーボード版: かたまりごとの まぜかた
    if (def.arrowMode) assignDirs(pattern.targets, def, plan);   // アロー版: ノーツに ↑↓←→ を つける
    if (def.kbdMode) assignKeys(pattern.targets, def, mode, plan);   // キーボード版: ノーツに A〜Z・0〜9 の キーを つける
    S = {
      def, cbs, pattern, mode,
      theme: themeFor(def),
      phase: 'intro',
      bus: null, evts: [], evtI: 0, timer: null, raf: 0,
      spb: 60 / def.bpm, beat0: 0, endT: 0, tempo: [{ b0: -8, spb: 60 / def.bpm, t: 0 }],
      perfW: def.ura ? PERF_W.ura : PERF_W.omote,
      okW: def.ura ? OK_W.ura : OK_W.omote,
      stats: [
        { perfect: 0, ok: 0, miss: 0, whiff: 0 },
        { perfect: 0, ok: 0, miss: 0, whiff: 0 },
      ],
      lockUntil: [-1, -1],   // おてつき硬直(連打対策)の解除時刻
      fx: [], lastPress: -9, lastDir: null, finished: false,
      hasDir: !def.kbdOnly && pattern.targets.some(t => t.dir),   // ↑↓←→ を つかう ゲームか(専用版では ほうこうは キーに おきかわる)
      hasHold: pattern.targets.some(t => t.hold), // ながおしノーツが あるか
      holding: [null, null], ptr: {},             // プレイヤーごとの ながおし中ノーツ / ポインタ→プレイヤー
      // パーフェクトキャンペーン: ミス・おてつき・ボムが1つでも出たら その場でしゅうりょう
      perfect: def.perfectChallenge ? { failed: false, at: 0 } : null,
      // エンドレス: ライフ制(協力=ふたりで共有 / 1人・対戦=それぞれ)
      endless: def.kind === 'endless' ? {
        max: def.lives,
        lives: def.lifeMode === 'shared' ? [def.lives] : [def.lives, def.lives],
        over: false, loser: -1, endBeat: 0, lastLoss: -9,
      } : null,
    };
    showIntro(def);
    S.raf = requestAnimationFrame(loop);
  }

  /* ノーツモードの きろく名: '' / 'arrow' / 'arrowmix' / 'kbd' / 'kbdmix'(GameData.noteTag と おなじ きまり) */
  const noteTagOf = def => (def.kbdGame ? '' : def.kbdOnly ? 'kbdonly' : def.arrowMode && def.kbdMode ? (def.mix ? 'arrowkbdmix' : 'arrowkbd') : def.arrowMode ? (def.mix ? 'arrowmix' : 'arrow') : def.kbdMode ? (def.mix ? 'kbdmix' : 'kbd') : '');
  const NOTE_LABEL = { arrow: '🎮アロー版', arrowmix: '🎮アロー＆通常版', kbd: '⌨️キーボード版', kbdmix: '⌨️キーボード＆通常版', arrowkbd: '🎮⌨️アロー＆キーボード版', arrowkbdmix: '🎮⌨️アロー＆キーボード＆通常版', kbdonly: '⌨️キーボード専用版' };
  /* キーボード版(アローなし)だけ アローキーが レーン切替(L は ノーツ用)。それ以外は Lキー */
  const laneByArrows = def => !!def.kbdMode && !def.arrowMode;

  /* アロー版: ほうこうの ない ノーツに ↑↓←→ を わりふる(ゲームごとに 毎回おなじ)。
     おなじ拍・おなじ人の ノーツ(同時押し)は べつの ほうこうに する */
  const DIRS4 = ['up', 'down', 'left', 'right'];
  const groupKey = t => t.b.toFixed(3) + ':' + t.owner;   // 同時押しの ひとかたまり(おなじ拍・おなじ人)

  /* ノーツモードの わりふり計画(アロー＆通常版 / キーボード＆通常版 / アロー＆キーボード版 / アロー＆キーボード＆通常版)。
     同時押しの ひとかたまりごとに kinds('arrow' / 'kbd' / 'plain')の どれかを だいたい 同じ割合で きめる(ゲームごとに 毎回おなじ)。
     kinds の どれも かならず 1つは でるように する。kinds が 1つだけ(アロー版 / キーボード版)なら 計画は いらない(null = ぜんぶ その しゅるい) */
  function notePlan(targets, def) {
    const kinds = [];
    if (def.arrowMode) kinds.push('arrow');
    if (def.kbdMode) kinds.push('kbd');
    if (def.mix) kinds.push('plain');
    if (kinds.length < 2) return null;
    const rng = Patterns.rngFor(def.id + ':plan:' + kinds.join('+'));
    const keys = [], seen = new Set();
    for (const t of targets) {
      if (t.dir || t.kbd || t.kind === 'bomb') continue;   // もともと ほうこう/キーが ある ノーツ(アローゲーム・キーボードゲーム)は そのまま
      const k = groupKey(t);
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
    const plan = new Map();
    for (const k of keys) plan.set(k, kinds[Math.floor(rng() * kinds.length)]);
    if (keys.length >= kinds.length) {
      for (const kind of kinds) {   // たりない しゅるいは、いちばん おおい しゅるいから 1かたまり もらう
        if ([...plan.values()].includes(kind)) continue;
        const count = x => keys.filter(k => plan.get(k) === x).length;
        const most = kinds.reduce((x, y) => (count(y) > count(x) ? y : x));
        const from = keys.filter(k => plan.get(k) === most);
        plan.set(from[Math.floor(from.length / 2)], kind);
      }
    }
    return plan;
  }
  const planSkips = (plan, t, kind) => !!plan && plan.get(groupKey(t)) !== kind;

  /* アロー版: ほうこうの ない ノーツに ↑↓←→ を わりふる(ゲームごとに 毎回おなじ)。
     おなじ拍・おなじ人の ノーツ(同時押し)は べつの ほうこうに する。plan が あれば 'arrow' の かたまりだけ */
  function assignDirs(targets, def, plan) {
    const rng = Patterns.rngFor(def.id + ':arrow');
    const used = new Map();
    for (const t of targets) {
      if (t.dir || t.kind === 'bomb') continue;
      if (planSkips(plan, t, 'arrow')) continue;   // この かたまりは キー か ふつうノーツ
      const k = groupKey(t);
      const taken = used.get(k) || [];
      const cand = DIRS4.filter(d => !taken.includes(d));
      const d = cand.length ? cand[Math.floor(rng() * cand.length)] : DIRS4[Math.floor(rng() * 4)];
      t.dir = d; taken.push(d); used.set(k, taken);
    }
  }

  /* キーボード版: ノーツに A〜Z・0〜9 の キーを わりふる(ゲームごとに 毎回おなじ)。
     同時押しは べつのキー、直前と おなじキーは さける。2人は 左半分=1P / 右半分=2P。
     とりあいノーツ(owner -1)は キーなし = どのキーでも。plan が あれば 'kbd' の かたまりだけ。
     アロー＆キーボード版では L を レーン切替に のこし、2人では W・A・S・D を 2Pの ほうこう用に あけておく */
  const KBD_LEFT = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'];
  const KBD_RIGHT = ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyN', 'KeyM'];
  const KBD_ALL = KBD_LEFT.concat(KBD_RIGHT);
  const KBD_LEFT_SET = new Set(KBD_LEFT);
  const keyLabel = code => code.replace(/^Key|^Digit/, '');
  function assignKeys(targets, def, mode, plan) {
    const rng = Patterns.rngFor(def.id + ':kbd');
    const excl = new Set(def.arrowMode ? (mode === 'solo' ? ['KeyL'] : ['KeyL', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) : []);
    const pools = { all: KBD_ALL.filter(c => !excl.has(c)), left: KBD_LEFT.filter(c => !excl.has(c)), right: KBD_RIGHT.filter(c => !excl.has(c)) };
    const used = new Map(), last = {};
    for (const t of targets) {
      if (t.kind === 'bomb' || t.owner === -1 || t.kbd) continue;   // キーボードゲームの ノーツは 最初から キーつき
      if (planSkips(plan, t, 'kbd')) continue;   // この かたまりは ほうこう か ふつうノーツ
      const pool = mode === 'solo' ? pools.all : (t.owner === 1 ? pools.right : pools.left);
      const k = groupKey(t);
      const taken = used.get(k) || [];
      const cand = pool.filter(c2 => !taken.includes(c2) && c2 !== last[t.owner]);
      const from = cand.length ? cand : pool;
      const c3 = from[Math.floor(rng() * from.length)];
      t.kbd = c3; taken.push(c3); used.set(k, taken); last[t.owner] = c3;
    }
  }

  /* 2人モード: フレーズ(同じ合図のひとかたまり)単位で交互に割りふり、
     ノーツ数が偏らないようにする。ふたりせんようゲームは owner 指定済み(0/1/-1)なのでそのまま。 */
  function assignOwners(targets) {
    const counts = [0, 0];
    let lastKey = null, lastOwner = 1;
    for (const t of targets) {
      if (t.owner !== undefined) {
        if (t.owner === 0 || t.owner === 1) counts[t.owner]++;
        continue;
      }
      const key = t.arch + ':' + t.cueB;
      if (key !== lastKey) {
        lastKey = key;
        lastOwner = counts[0] === counts[1] ? 1 - lastOwner : (counts[0] < counts[1] ? 0 : 1);
      }
      t.owner = lastOwner;
      counts[lastOwner]++;
    }
  }

  function showIntro(def) {
    const mode = S.mode;
    const p1 = `<b style="color:${P_COLORS[0]}">1P = Fキー・↑↓←→・左タップ（青ノーツ）</b>`;
    const p2 = `<b style="color:${P_COLORS[1]}">2P = J/Kキー・WASD・右タップ（オレンジノーツ）</b>`;
    const modeLine = mode === 'coop'
      ? `<p class="desc" style="font-size:13px">🤝 きょうりょくプレイ！<br>${p1}<br>${p2}<br>じぶんの色のノーツを たたいて、ふたりのスコアで クリアをめざそう！<br>⚠ れんだは「おてつき」で しばらく おせなくなるぞ！</p>`
      : mode === 'versus'
        ? `<p class="desc" style="font-size:13px">⚔ たいせんプレイ！<br>${p1}<br>${p2}<br>きいろの ノーツは とりあい！スコアが たかい ほうの かち！<br>⚠ れんだは「おてつき」で しばらく おせなくなるぞ！</p>`
        : '';
    const combo = !!(def.kbdMode && def.arrowMode);   // アロー＆キーボード版(＆通常版)
    const keyHint = combo
      ? (mode === 'solo' ? '↑↓←→ = ほうこう　　A〜Z・0〜9 = キー' : '1P = ↑↓←→ と キーボード左半分　　2P = WASD と 右半分') + (def.mix ? '（●ノーツは どのキーでも）' : '') + '　　L = レーン切替　　Esc = もどる'
      : def.kbdOnly ? 'A〜Z・0〜9 = ノーツのキー（スペース・タップは つかえない）　　↑↓←→ = レーン切替　　Esc = もどる'
      : def.kbdMode ? 'A〜Z・0〜9 = ノーツのキー' + (def.mix ? '（キーなしの ●ノーツは どのキーでも）' : '') + '　　↑↓←→ = レーン切替　　Esc = もどる' : mode === 'solo'
      ? (GameData.feat('lane') ? 'スペース / アローキー / タップ = アクション　　L = レーン切替　　Esc = もどる' : 'スペース / J / F / クリック / タップ = アクション　　Esc = もどる')
      : '1P = F・↑↓←→・左タップ　　2P = J/K・WASD・右タップ　　L = レーン切替　　Esc = もどる';
    const modeTag = (mode === 'coop' ? '　🤝協力' : mode === 'versus' ? '　⚔対戦' : '') + (noteTagOf(def) ? '　' + NOTE_LABEL[noteTagOf(def)] : '');
    const endlessLine = def.kind === 'endless'
      ? `<p class="desc" style="font-size:13px;background:rgba(255,183,3,.15);border-radius:10px;padding:8px">
           ♾️ ライフ ${'❤️'.repeat(def.lives)}${def.lifeMode === 'shared' ? '（ふたりで きょうゆう）' : mode === 'versus' ? '（それぞれ）' : ''}
           ${def.perfectEndless
             ? '<b>💯 パーフェクトちょうせん</b>: ミス・おてつき・ボムが 1つでも 出たら その場で しゅうりょう！'
             : 'ミス・おてつき・ボムの たびに 1つ へって、0で しゅうりょう。'}<br>
           ぜんぶで ${def.segCount} セクション。すすむほど テンポアップ（BPM ${def.bpm} → さいだい ${def.bpmMax}）！</p>`
      : '';
    const kbdLine = def.kbdMode
      ? `<p class="desc" style="font-size:13px;background:rgba(255,183,3,.16);border-radius:10px;padding:8px">
           ${def.kbdGame
             ? '⌨️ <b>キーボードせんよう ゲーム</b>: A〜Z・0〜9 の キーで あそぶ ゲーム！キャラの上に つぎの キーが ならぶよ（「?」は じぶんで かんがえる／おぼえる キー）。<br>'
             : combo
             ? (def.mix
               ? '🎮⌨️ <b>アロー＆キーボード＆通常版</b>: ノーツに ↑↓←→ か A〜Z・0〜9 が <b>ついたり、つかなかったり</b>！ついていない ●ノーツは いつもの キー（スペース/F/J など）で OK。<br>'
               : '🎮⌨️ <b>アロー＆キーボード版</b>: ぜんぶの ノーツに ↑↓←→ か A〜Z・0〜9 の <b>どちらか</b>が つく！<br>')
               + 'キーの ノーツは その キーを ジャストで。キャラの上に つぎの やじるし・キー' + (def.mix ? '・●' : '') + ' が ならぶよ。<br>'
             : def.kbdOnly
               ? '⌨️ <b>キーボード専用版</b>: ぜんぶの ノーツ' + (def.arrow ? '（この アローゲームの ↑↓←→ も）' : '') + 'が <b>A〜Z・0〜9</b> の キーに なる！<b>スペースや タップは つかえない</b>。キャラの上に つぎの キーが でるよ。<br>'
             : def.mix
               ? '⌨️ <b>キーボード＆通常版</b>: ノーツの <b>いちぶ</b>に <b>A〜Z・0〜9</b> の キーが つく！キーの ある ノーツは その キーで、キーの ない ●ノーツは <b>どのキーでも OK</b>（キャラの上に つぎの キー・● が ならぶよ）。<br>'
               : '⌨️ <b>キーボード版</b>: ノーツに <b>A〜Z・0〜9</b> の キーが つく！その キーを ジャストで おそう（キャラの上に つぎの キーが でるよ）。<br>'}
           ${mode === 'solo' ? '' : combo
             ? '<b>1P = 左半分</b>（1〜5・Q・E・R・T・F・G・Z〜B）、<b>2P = 右半分</b>（6〜0・Y〜P・H〜K・N・M）。W・A・S・D は 2Pの ほうこう用。'
             : '<b>1P = 左半分</b>（1〜5・Q〜T・A〜G・Z〜B）、<b>2P = 右半分</b>（6〜0・Y〜P・H〜L・N・M）。'}${combo ? 'レーンの ON/OFF は Lキー（L は ノーツに つかわない）。' : 'アローキー(↑↓←→)は レーンの ON/OFF に つかうよ。'}</p>`
      : '';
    const arrowLine = (def.arrow || def.arrowMode) && !def.kbdOnly
      ? `<p class="desc" style="font-size:13px;background:rgba(122,162,255,.16);border-radius:10px;padding:8px">
           ${def.arrowMode && !combo ? (def.mix
             ? '🎮 <b>アロー＆通常版</b>: ノーツの <b>いちぶ</b>に ほうこうが つく！ほうこうの ない ●ノーツは いつもの キー（スペース/F/J など）や どの ほうこうでも OK。キャラの上に つぎの やじるし・● が ならぶよ。<br>'
             : '🎮 <b>アロー版</b>: このゲームの ぜんぶの ノーツに ほうこうが つく！キャラの上に つぎの やじるしが でるよ。<br>') : ''}↑↓←→ の ノーツは <b>その ほうこうの キー</b> で！${mode === 'solo'
             ? '（アローキー か WASD。がめん右の パッドを タップでも OK）'
             : '<b>1P = ↑↓←→</b>、<b>2P = W(↑) A(←) S(↓) D(→)</b>（パッドは 1Pが がめん左、2Pが がめん右）'}<br>
           ちがう ほうこうでは とれず「ほうこう ちがい」に なるよ。</p>`
      : '';
    const holdLine = S.hasHold
      ? `<p class="desc" style="font-size:13px;background:rgba(126,224,160,.16);border-radius:10px;padding:8px">
           ⏸ <b>ながおしノーツ</b>(バーつき)は おしたまま、バーの おわりで はなす！はやく はなすと ミスだよ。</p>`
      : '';
    const pcLine = def.perfectChallenge
      ? `<p class="desc pc-box">💯 <b>パーフェクトキャンペーン</b>　のこりチャンス ${'★'.repeat(def.pcTries || 1)}<br>
           ミス・おてつき・ボムが <b>1つでも</b> 出たら その場で しゅうりょう！ノーミスで さいごまで いこう！</p>`
      : '';
    overlay().innerHTML = `
      <div class="card intro">
        <div class="g-icon">${def.icon}</div>
        <h2>${def.title}</h2>
        <p class="desc">${def.desc}</p>
        ${arrowLine}
        ${kbdLine}
        ${holdLine}
        ${pcLine}
        ${endlessLine}
        ${modeLine}
        <p class="desc" style="font-size:13px;opacity:.8">${!GameData.feat('lane')
          ? '🎯 あいずの あと、ジャストの タイミングで おそう！' + (def.ura ? '（裏は テンポアップ＆とちゅうで 見えなくなる！）' : '')
          : laneOn
            ? '🎯 がめん下の わっかに ●が ピッタリ かさなった しゅんかんに おそう！' + (def.ura ? '（裏では ●が とちゅうで きえる！）' : '')
            : '🎯 タイミングレーンは OFF ちゅう。' + (laneByArrows(def) ? 'アローキー' : 'Lキー') + 'で いつでも ひょうじできるよ！'}</p>
        <p class="meta">${def.stageLabel}　♪ BPM ${def.bpm}${def.ura ? '　🌙うらモード' : ''}${modeTag}</p>
        <button class="go-btn" id="btn-go">▶ スタート！</button>
        <p class="hint">${keyHint}</p>
      </div>`;
    document.getElementById('btn-go').addEventListener('click', begin);
  }

  function begin() {
    if (!S || S.phase !== 'intro') return;
    overlay().innerHTML = '';
    const ak = AudioKit;
    ak.ensure();
    S.bus = ak.newBus(0.9);
    // テンポくぎりの開始時刻を先に確定させる(カウントイン1つめ = 拍-4 が now+0.3)
    S.tempo = tempoSections(S.def, S.pattern.totalBeats);
    S.tempo[0].t = ak.now() + 0.3 - 4 * S.tempo[0].spb;
    for (let i = 1; i < S.tempo.length; i++) {
      const pv = S.tempo[i - 1];
      S.tempo[i].t = pv.t + (S.tempo[i].b0 - pv.b0) * pv.spb;
    }
    S.beat0 = bt(0);                                // 1小節カウントインの後が0拍目
    for (const t of S.pattern.targets) { t.t = bt(t.b); if (t.hold) t.ht = bt(t.b + t.hold); }
    S.endT = bt(S.pattern.totalBeats) + 0.4;
    buildEvents();
    S.timer = setInterval(schedule, 25);
    S.phase = 'play';
    S.ignoreUntil = ak.now() + 0.25;                // スタート直後の誤爆を無視
    S.laneEverOn = laneShown();                     // レーンを 一度でも つけたか(ナイトモード解放の判定)
  }

  /* ---------- BGM・キュー音のイベント生成 ---------- */
  function buildEvents() {
    const ak = AudioKit, bus = S.bus, def = S.def;
    const ev = [];
    const push = (beat, f) => ev.push({ t: bt(beat), f });
    const root = def.music.root, minor = def.music.minor;
    const mrng = Patterns.rngFor(def.id + ':music2');   // 曲想はゲームIDから固定生成(毎回同じ曲)
    const pick = arr => arr[Math.floor(mrng() * arr.length)];

    /* ---- ジャンル: ドラム・ベース・パッド・リード・アルペジオ・ディレイが ひとそろい ---- */
    const H8 = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const S16 = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75];
    const STYLES = {
      chip:  { kick: [0, 2], snare: [1, 3], snareStyle: 'snare', hats: H8, bass: 'square', bassPat: 'oct8', pad: 'chip', leads: ['chip', 'pluck'], arp: 'up8', perc: null, clapOn: [], delay: 0.5, swing: 0, stab: 'chip' },
      funk:  { kick: [0, 1.75, 2.5], snare: [1, 3], snareStyle: 'snare', hats: [0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.5, 2.75, 3, 3.5], bass: 'slap', bassPat: 'funk', pad: 'organ', leads: ['saw', 'organ'], arp: 'off', perc: ['shaker', S16], clapOn: [1, 3], delay: 0.75, swing: 0, stab: 'saw' },
      house: { kick: [0, 1, 2, 3], snare: [1, 3], snareStyle: 'clap', hats: [0.5, 1.5, 2.5, 3.5], openHat: true, bass: 'sub', bassPat: 'oct8', pad: 'super', leads: ['saw', 'bell'], arp: 'up8', perc: ['shaker', S16], clapOn: [], delay: 0.75, swing: 0, stab: 'saw' },
      bossa: { kick: [0, 1.5, 2, 3.5], snare: [0.5, 2, 3.5], snareStyle: 'rim', hats: [], bass: 'sub', bassPat: 'bossa', pad: 'warm', leads: ['flute', 'bell'], arp: 'sparse', perc: ['shaker', H8], clapOn: [], delay: 0.5, swing: 0, stab: 'saw' },
      rock:  { kick: [0, 2, 2.5], snare: [1, 3], snareStyle: 'snare', hats: H8, bass: 'saw', bassPat: 'drive', pad: 'super', leads: ['saw', 'chip'], arp: 'none', perc: null, clapOn: [], delay: 0.5, swing: 0, stab: 'saw' },
      lofi:  { kick: [0, 2.5], snare: [1, 3], snareStyle: 'rim', hats: H8, bass: 'sub', bassPat: 'sparse', pad: 'warm', leads: ['bell', 'flute'], arp: 'off', perc: null, clapOn: [], delay: 0.75, swing: 1, stab: 'chip' },
      swing: { kick: [0, 2], snare: [1, 3], snareStyle: 'snare', hats: H8, bass: 'sub', bassPat: 'walk', pad: 'organ', leads: ['bell', 'organ'], arp: 'none', perc: null, clapOn: [], delay: 0.75, swing: 1, stab: 'saw' },
    };
    const styleName = pick(Object.keys(STYLES));
    const st = STYLES[styleName];
    S.styleName = styleName;
    ak.setDelay(spbAt(0) * st.delay);                                           // ディレイを 拍に同期
    const sw = o => (st.swing && Math.abs(o % 1 - 0.5) < 0.01 ? o + 0.17 : o); // スウィング: 8分ウラだけ遅らせる

    /* ---- コード進行(テンションつき): 4小節ループ ---- */
    const Q = { maj: [0, 4, 7, 12], add9: [0, 4, 7, 14], maj7: [0, 4, 7, 11], min: [0, 3, 7, 12], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus4: [0, 5, 7, 12], min9: [0, 3, 7, 14] };
    const PROGS = minor ? [
      [[0, 'min9'], [8, 'maj7'], [3, 'add9'], [10, 'dom7']],
      [[0, 'min'], [5, 'min7'], [8, 'maj7'], [7, 'dom7']],
      [[0, 'min7'], [10, 'maj'], [8, 'maj7'], [7, 'sus4']],
      [[0, 'min'], [3, 'maj7'], [10, 'add9'], [8, 'maj7']],
    ] : [
      [[0, 'add9'], [9, 'min7'], [5, 'maj7'], [7, 'dom7']],
      [[0, 'maj'], [7, 'sus4'], [9, 'min7'], [5, 'add9']],
      [[0, 'maj7'], [5, 'maj7'], [2, 'min7'], [7, 'dom7']],
      [[9, 'min7'], [5, 'maj7'], [0, 'add9'], [7, 'sus4']],
      [[5, 'maj7'], [7, 'dom7'], [4, 'min7'], [9, 'min7']],
      [[0, 'add9'], [4, 'min7'], [5, 'maj7'], [7, 'sus4']],
    ];
    const prog = pick(PROGS);
    const chordAt = m => { const [deg, q] = prog[m % 4]; const cr = root + deg; return { cr, notes: Q[q].map(x => cr + x), pcs: Q[q].map(x => x % 12) }; };

    /* ---- スケール・リード音色 ---- */
    const SCALES = minor
      ? [[0, 3, 5, 7, 10], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 8, 11]]
      : [[0, 2, 4, 7, 9], [0, 2, 4, 5, 7, 9, 11], [0, 2, 4, 5, 7, 9, 10]];
    const sc = pick(SCALES), NS = sc.length;
    const degMidi = idx => root + 24 + sc[idx % NS] + 12 * Math.floor(idx / NS);
    const timbre = st.leads[(Math.floor(mrng() * st.leads.length) + (def.slot === 'R' ? 1 : (def.slot | 0))) % st.leads.length];

    /* ---- メロディ: モチーフ2つを A A'(おわりを変奏) B A''(着地) で展開 ---- */
    const RHYTHMS = [
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2], [4, 1], [5, 1], [6, 2]],
      [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1], [4, 2], [6.5, 0.5], [7, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1], [4, 1.5], [5.5, 0.5], [6, 2]],
      [[0, 1], [2, 1], [3, 0.5], [3.5, 0.5], [4, 1], [6, 1], [7, 1]],
      [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 2]],
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1]],
    ];
    function makeMotif() {
      const rhy = pick(RHYTHMS);
      let pos = NS + Math.floor(mrng() * NS);   // 中音域スタート
      return rhy.map(([o, d], i) => {
        if (i > 0) pos = Math.max(0, Math.min(2 * NS - 1, pos + [-3, -2, -1, -1, 0, 1, 1, 2, 3][Math.floor(mrng() * 9)]));
        return { o, d, pos };
      });
    }
    const motifA = makeMotif(), motifB = makeMotif();
    const variantEnd = motifA.map((n, i) => i >= motifA.length - 2 ? Math.max(0, Math.min(2 * NS - 1, n.pos + Math.floor(mrng() * 5) - 2)) : n.pos);

    /* ---- セクション: イントロ → A → ブレイク → B(フル+パーカス)。エンドレスは 8小節ブロックで めぐる ---- */
    const M = S.pattern.totalBeats / 4;
    const endless = def.kind === 'endless';
    const sectionOf = m => {
      if (m < 2) return 'intro';
      if (!endless) return (m === 10 || m === 11) ? 'break' : m >= 12 ? 'B' : 'A';
      const blk = Math.floor(m / 8), inb = m % 8;
      if (blk % 3 === 2 && inb < 2) return 'break';
      return blk % 2 ? 'B' : 'A';
    };

    /* ---- ベース型(n = コードルートからの半音) / アルペジオ型 ---- */
    const BASSPATS = {
      oct8:   [[0, 0], [0.5, 12], [1, 0], [1.5, 12], [2, 0], [2.5, 12], [3, 0], [3.5, 12]],
      funk:   [[0, 0], [0.75, 0], [1.5, 7], [2, 0], [2.5, 10], [2.75, 12], [3.5, 7]],
      bossa:  [[0, 0], [1.5, 7], [2, 0], [3.5, 7]],
      drive:  [[0, 0], [0.5, 0], [1, 0], [1.5, 0], [2, 0], [2.5, 0], [3, 0], [3.5, 7]],
      sparse: [[0, 0], [2.5, 7], [3, 0]],
      walk:   [[0, 0], [1, 4], [2, 7], [3, 10]],
    };
    const bassPat = BASSPATS[st.bassPat];
    const ARPS = { up8: H8, off: [0.5, 1.5, 2.5, 3.5], sparse: [0, 2.5], none: [] };
    const apat = pick([[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 3, 2, 1, 0], [0, 1, 2, 1, 3, 1, 2, 1]]);

    // カウントイン: クリック4つ + スネアロール + ライザー
    for (let i = 0; i < 4; i++) { const last = i === 3; push(-4 + i, t => ak.sfx(bus, 'count', t, { last })); }
    [[-1, 0.06], [-0.75, 0.09], [-0.5, 0.12], [-0.25, 0.16]].forEach(([o, v]) => push(o, t => ak.snare(bus, t, v)));
    push(-1.5, t => ak.riser(bus, t, spbAt(0) * 1.5, 0.1));

    let prevLead = null;
    for (let m = 0; m < M; m++) {
      const base = m * 4, spbM = spbAt(base), sec = sectionOf(m), nextSec = sectionOf(m + 1);
      const { cr, notes } = chordAt(m);
      const full = sec === 'A' || sec === 'B';
      const kickT = st.kick.map(o => bt(base + o));

      // セクションの あたまに クラッシュ、直前に ライザー
      if (m > 0 && sec !== sectionOf(m - 1) && sec !== 'break') push(base, t => ak.crash(bus, t, 0.14));
      if (nextSec !== sec && (nextSec === 'A' || nextSec === 'B')) push(base + 2, t => ak.riser(bus, t, spbM * 2, 0.09));

      // ドラム
      if (full) {
        st.kick.forEach(o => push(base + o, t => ak.kick(bus, t, o === 0 ? 0.5 : 0.4)));
        st.snare.forEach(o => push(base + o, t => ak.snare(bus, t, st.snareStyle === 'rim' ? 0.22 : 0.3, st.snareStyle)));
        st.clapOn.forEach(o => push(base + o, t => ak.snare(bus, t, 0.2, 'clap')));
        if (m % 8 === 7) [3.25, 3.5, 3.75].forEach((o, i) => push(base + o, t => i === 2 ? ak.perc(bus, t, 'tom', 0.12) : ak.snare(bus, t, 0.2)));
        if (sec === 'B' && m % 4 === 3) push(base + 3.5, t => ak.perc(bus, t, 'tom', 0.1));
      }
      if (sec !== 'intro' || m === 1) st.hats.forEach(o => push(base + sw(o), t => ak.hat(bus, t, o % 1 ? 0.05 : 0.075, false)));
      if (st.openHat && full) [1.5, 3.5].forEach(o => push(base + o, t => ak.hat(bus, t, 0.08, true)));
      if (st.perc && (sec === 'B' || sec === 'break' || styleName === 'bossa')) st.perc[1].forEach(o => push(base + sw(o), t => ak.perc(bus, t, st.perc[0], 0.06)));
      if (sec === 'B' && styleName === 'funk' && m % 2 === 0) push(base + 2.5, t => ak.perc(bus, t, 'cowbell', 0.06));

      // ベース(ブレイクでは ルートを のばすだけ)
      if (full) bassPat.forEach(([o, n]) => push(base + sw(o), t => ak.bassN(bus, t, cr - 24 + n, spbM * 0.45, 0.22, st.bass)));
      else if (sec === 'break') push(base, t => ak.bassN(bus, t, cr - 24, spbM * 3.5, 0.18, 'sub'));

      // パッド(キックで ダッキング) + スタブ
      const padVol = sec === 'intro' ? 0.05 : sec === 'break' ? 0.065 : 0.045;
      push(base, t => ak.pad(bus, t, notes, spbM * 3.95, padVol, st.pad, full ? kickT : []));
      if (full && st.arp !== 'none') {
        push(base + sw(1.5), t => ak.stab(bus, t, notes, 0.14, 0.05, st.stab));
        if (m % 2 === 0) push(base + 3, t => ak.stab(bus, t, notes, 0.14, 0.05, st.stab));
      }
      if (sec === 'break' || styleName === 'rock') push(base + sw(1.5), t => ak.stab(bus, t, notes, 0.22, 0.055, st.stab));

      // アルペジオ(左右に ふりわけ)
      if (sec !== 'intro' || m === 1) ARPS[st.arp].forEach((o, i) => {
        const nn = notes[apat[i % apat.length] % notes.length] + 12;
        push(base + sw(o), t => ak.pluck(bus, t, nn, 0.042, i % 2 ? 0.45 : -0.45));
      });

      // リード(イントロは なし、ブレイクは しっとり)
      if (m % 2 === 0 && sec !== 'intro') {
        const kind = ['A', 'A2', 'B', 'A3'][(m / 2) % 4];
        const motif = kind === 'B' ? motifB : motifA;
        motif.forEach((nt, ni) => {
          const pos = kind === 'A2' ? variantEnd[ni] : kind === 'A3' ? Math.min(2 * NS - 1, nt.pos + 2) : nt.pos;
          let midi = degMidi(pos);
          const ch = chordAt(m + (nt.o >= 4 ? 1 : 0));
          if (nt.o % 4 === 0 || nt.o % 4 === 2) {   // 強拍は コードトーンへ
            for (const adj of [0, -1, 1, -2, 2]) { if (ch.pcs.includes((((midi + adj - ch.cr) % 12) + 12) % 12)) { midi += adj; break; } }
          }
          const last = ni === motif.length - 1;
          if (kind === 'A3' && last) midi = ch.cr + 24;   // フレーズのしめは ルートに着地
          const dur = nt.d * spbM * (last ? 1.3 : 0.92);
          const vol = sec === 'break' ? 0.05 : 0.07;
          const glideFrom = (timbre === 'chip' || timbre === 'saw') && prevLead != null && Math.abs(prevLead - midi) <= 4 && nt.o % 1 === 0.5 ? prevLead : null;
          prevLead = midi;
          const mm = midi;
          push(base + nt.o, t => ak.lead(bus, t, mm, dur, vol, timbre, { pan: 0.15, glideFrom }));
          if (timbre === 'chip' && last && mrng() < 0.5) push(base + nt.o - 0.25, t => ak.lead(bus, t, mm + 2, spbM * 0.2, 0.05, 'chip', {}));   // かざりの音
        });
      }
    }
    // しめ: クラッシュ + ロングコード + リードの着地
    push(S.pattern.totalBeats, t => {
      const fin = chordAt(0);
      ak.kick(bus, t, 0.55); ak.crash(bus, t, 0.18);
      ak.pad(bus, t, fin.notes, 1.8, 0.07, st.pad, []);
      ak.stab(bus, t, fin.notes, 1.2, 0.06, st.stab);
      ak.lead(bus, t, root + 24, 1.0, 0.09, timbre, {});
      ak.bassN(bus, t, root - 24, 1.4, 0.22, st.bass);
    });

    for (const cu of S.pattern.cues) {
      const sfx = cu.sfx, opt = cu.opt;
      push(cu.beat, t => ak.sfx(bus, sfx, t, opt || {}));
    }

    ev.sort((a2, b2) => a2.t - b2.t);
    S.evts = ev; S.evtI = 0;
  }

  function schedule() {
    if (!S || S.phase !== 'play') return;
    const horizon = AudioKit.now() + 0.15;
    while (S.evtI < S.evts.length && S.evts[S.evtI].t < horizon) {
      const e = S.evts[S.evtI++];
      try { e.f(e.t); } catch (err) { /* audio glitch は無視 */ }
    }
  }

  /* ---------- 入力・判定 ---------- */
  function press(p, dir = null, key = null) {
    if (!S) return;
    if (S.phase === 'intro') { begin(); return; }
    if (S.phase !== 'play') return;
    const now = AudioKit.now();
    if (now < S.ignoreUntil) return;
    // おてつき硬直中: ノーツは取れず、連打すると硬直がのびる(連打で全ノーツ拾い/横取りできない)
    if (now < S.lockUntil[p]) {
      S.lockUntil[p] = now + lockDur();
      AudioKit.sfx(S.bus, 'whiffS', now);
      return;
    }
    S.lastPress = now; S.lastDir = dir; S.lastP = p;
    const beat = tb(now);
    if (beat < -0.5) return;
    // 方向ノーツ(↑↓←→)は 1人モードでは その ほうこうの アローキーでしか 取れない。
    // スペース/F/タップは ほうこうなし → 方向ノーツには あたらない。2人モードでは 方向を 問わない(2Pに アローキーが 無いため)。
    const dirMatters = true;   // 1P=↑↓←→ / 2P=WASD で ほうこうを 入力する
    let best = null, bd = 1e9, wrongDir = null, wd = 1e9;
    for (const t of S.pattern.targets) {
      if (t.judged) continue;
      if (S.mode !== 'solo' && t.owner !== p && t.owner !== -1) continue;  // 自分のノーツか、とりあいノーツだけ
      const d = Math.abs(now - t.t);
      if (dirMatters && !S.def.kbdOnly && t.dir && t.dir !== dir) { if (d < wd) { wd = d; wrongDir = t; } continue; }   // 専用版では ほうこうは みない(キーだけ)
      if (t.kbd && t.kbd !== key) { if (d < wd) { wd = d; wrongDir = t; } continue; }   // キーボード版: その キーだけ
      if (d < bd) { bd = d; best = t; }
    }
    if (best && bd <= S.okW) {
      if (best.kind === 'bomb') {
        // ボムを叩いてしまった: おてつき2回ぶんのペナルティ + ながめの硬直
        best.judged = 'bombed'; best.jt = now;
        S.stats[p].whiff += 2;
        S.lockUntil[p] = now + lockDur() * 1.5;
        AudioKit.sfx(S.bus, 'boom', now);
        S.fx.push({ sec: now, res: 'bomb', p });
        if (S.endless) loseLife(p, now);   // エンドレスでは ボムも ライフ1つ
        if (S.perfect) perfectFail(now);
      } else {
        judge(best, bd <= S.perfW ? 'perfect' : 'ok', now, p);
        if (best.hold) startHold(best, p, key);   // ながおしノーツ: はなすまで つづく
      }
    } else if (beat > 0 && beat < S.pattern.totalBeats - 1) {
      S.stats[p].whiff++;
      S.lockUntil[p] = now + lockDur();
      AudioKit.sfx(S.bus, 'whiffS', now);
      // 方向ノーツの すぐそばで ちがう ほうこう(または ほうこうなし)を おした → 「ほうこう ちがい」
      S.fx.push({ sec: now, res: wrongDir && wd <= S.okW ? (wrongDir.kbd ? 'wrongkey' : 'wrongdir') : 'whiff', p, dir: wrongDir ? wrongDir.dir : null, kbd: wrongDir ? wrongDir.kbd : null });
      if (S.endless) { loseLife(p, now); if (S.endless.over) return; }   // エンドレス: おてつきでも ライフ1つ
      if (S.perfect) perfectFail(now);
    }
  }

  /* ---------- ながおし ----------
     あたまは ふつうに判定。そのあと おしたままにして、バーの おわり(±セーフ幅)で はなせば せいこう。
     はやく はなすと ミス扱い。おわりを すぎても おしていれば 自動で せいこう。 */
  function startHold(t, p, key) { t.holding = true; t.holdKey = key; S.holding[p] = t; }
  function release(p, key) {
    if (!S || S.phase !== 'play') return;
    const t = S.holding[p];
    if (!t || !t.holding) return;
    if (t.holdKey && key && t.holdKey !== key) return;   // べつのキーを はなしただけ
    endHold(t, p, AudioKit.now());
  }
  function endHold(t, p, now) {
    t.holding = false; S.holding[p] = null;
    if (now >= t.ht - S.okW) {
      t.holdDone = true;
      AudioKit.sfx(S.bus, 'sparkle', now);
      S.fx.push({ sec: now, res: 'holdok', p });
      return;
    }
    t.holdFail = true;
    S.stats[p][t.judged === 'perfect' ? 'perfect' : 'ok']--;
    S.stats[p].miss++;
    t.judged = 'miss'; t.jt = now;
    AudioKit.sfx(S.bus, 'buzz', now);
    S.fx.push({ sec: now, res: 'early', p });
    if (S.endless) loseLife(p, now);
    if (S.perfect) perfectFail(now);
  }

  /* おてつき硬直の長さ: 基本0.3秒、テンポが速い曲では短めに */
  function lockDur() { return Math.min(0.3, spbAt(tb(AudioKit.now())) * 0.6); }

  /* パーフェクトキャンペーン中の しくじり: その場で ちゅうだん */
  function perfectFail(now) {
    if (!S.perfect || S.perfect.failed) return;
    S.perfect.failed = true;
    S.perfect.at = now;
    AudioKit.sfx(S.bus, 'uino', now + 0.1);
    finishRun();
  }

  /* エンドレス: ライフを1つ へらす。0になったら そこで しゅうりょう。 */
  function loseLife(p, now) {
    const E = S.endless;
    if (!E || E.over) return;
    E.lastLoss = now;
    const shared = S.def.lifeMode === 'shared';
    const idx = shared ? 0 : (p < 0 ? 0 : p);
    E.lives[idx] = Math.max(0, E.lives[idx] - 1);
    if (E.lives[idx] > 0) { AudioKit.sfx(S.bus, 'uino', now); return; }
    E.over = true;
    E.loser = shared ? -1 : idx;
    E.endBeat = tb(now);
    AudioKit.sfx(S.bus, 'boom', now);
    finishRun();
  }

  function judge(t, res, now, p) {
    t.judged = res; t.jt = now;
    if (t.owner === -1) t.takenBy = p;   // とりあいノーツは早いもの勝ち
    S.stats[p][res === 'perfect' ? 'perfect' : 'ok']++;
    const arch = Patterns.ARCH[t.arch];
    arch.hit(AudioKit, S.bus, now, t, res === 'perfect');
    if (res === 'perfect') AudioKit.sfx(S.bus, 'sparkle', now + 0.02);
    S.fx.push({ sec: now, res, p });
  }

  function autoMiss(now) {
    for (const t of S.pattern.targets) {
      if (t.judged || now <= t.t + S.okW + 0.02) continue;
      if (t.kind === 'bomb') { t.judged = 'passed'; t.jt = now; continue; }  // ボムは放置が正解
      t.judged = 'miss'; t.jt = now;
      if (t.owner === -1) { S.stats[0].miss++; S.stats[1].miss++; }
      else S.stats[t.owner].miss++;
      AudioKit.sfx(S.bus, 'buzz', now);
      S.fx.push({ sec: now, res: 'miss', p: t.owner === -1 ? -1 : t.owner });
      if (S.endless) {
        if (t.owner === -1) { loseLife(0, now); loseLife(1, now); }   // とりあいノーツは両者のミス
        else loseLife(t.owner, now);
        if (S.endless.over) return;
      }
      if (S.perfect) { perfectFail(now); return; }
    }
  }

  /* ---------- 終了 ---------- */
  function finishRun() {
    S.phase = 'result';
    clearInterval(S.timer); S.timer = null;
    const targets = S.pattern.targets.filter(t => t.kind !== 'bomb');   // ボムはスコア対象外
    const calc = (st, total) => {
      const raw = total > 0 ? (st.perfect + 0.6 * st.ok - 0.15 * st.whiff) / total * 100 : 0;
      const score = Math.round(Math.max(0, Math.min(100, raw)));
      return { ...st, total, score, rank: score >= 85 ? 'superb' : score >= 60 ? 'clear' : 'fail' };
    };
    // とりあいノーツ(owner -1)は両者の「とれたかもしれない全ノーツ」として数える
    const perPlayer = [0, 1].map(p =>
      calc(S.stats[p], targets.filter(t => t.owner === p || t.owner === -1).length));
    const now = AudioKit.now();
    let result;
    if (S.endless) {
      // エンドレス: スコアではなく「どこまで いけたか」と ポイント(ピッタリ2/セーフ1)で きそう
      const E = S.endless;
      const totalSeg = S.pattern.segments.length;
      const endB = E.over ? E.endBeat : S.pattern.totalBeats;
      const sections = Math.max(0, Math.min(totalSeg, Math.ceil((endB - 4) / 8)));
      const pts = p => S.stats[p].perfect * 2 + S.stats[p].ok;
      const players = [0, 1].map(p => ({ ...S.stats[p], points: pts(p) }));
      // 記録: 1人=じぶんの点 / 協力=ふたりの合計 / 対戦=つよいほうの点
      const points = S.mode === 'coop' ? pts(0) + pts(1) : S.mode === 'versus' ? Math.max(pts(0), pts(1)) : pts(0);
      let winner = -1;
      if (S.mode === 'versus') {
        if (E.loser === 0) winner = 1;
        else if (E.loser === 1) winner = 0;
        else if (players[0].points !== players[1].points) winner = players[0].points > players[1].points ? 0 : 1;
      }
      result = {
        mode: S.mode, endless: true, endlessKey: (S.def.endlessKey || S.mode) + (noteTagOf(S.def) ? ':' + noteTagOf(S.def) : '') + (S.def.perfectEndless ? ':perfect' : ''), sections, totalSections: totalSeg,
        points, players, winner, survived: !E.over, lives: E.lives.slice(),
      };
      AudioKit.jingle(S.bus, now + 0.3, !E.over ? 'superb' : sections >= Math.ceil(totalSeg / 3) ? 'clear' : 'fail');
    } else if (S.mode === 'versus') {
      // 同点ならピッタリ数 → セーフ数 → おてつき+ミスの少なさ でタイブレーク
      const [pa, pb] = perPlayer;
      let winner = -1;
      if (pa.score !== pb.score) winner = pa.score > pb.score ? 0 : 1;
      else if (pa.perfect !== pb.perfect) winner = pa.perfect > pb.perfect ? 0 : 1;
      else if (pa.ok !== pb.ok) winner = pa.ok > pb.ok ? 0 : 1;
      else if (pa.whiff + pa.miss !== pb.whiff + pb.miss) winner = pa.whiff + pa.miss < pb.whiff + pb.miss ? 0 : 1;
      result = { mode: 'versus', players: perPlayer, winner };
      AudioKit.jingle(S.bus, now + 0.3, winner === -1 ? 'clear' : 'superb');
    } else {
      const sum = { perfect: 0, ok: 0, miss: 0, whiff: 0 };
      for (const p of [0, 1]) for (const k in sum) sum[k] += S.stats[p][k];
      const r = calc(sum, targets.length);
      result = { mode: S.mode, ...r, players: S.mode === 'coop' ? perPlayer : null };
      AudioKit.jingle(S.bus, now + 0.3, S.perfect ? (S.perfect.failed ? 'fail' : 'superb') : r.rank);
    }
    if (S.perfect) {
      result.perfectChallenge = true;
      result.perfectAchieved = !S.perfect.failed;
      result.campaign = !!S.def.pcCampaign;
      result.noLane = !S.laneEverOn;               // レーンを 一度も つけずに やりきったか
    }
    const cbs = S.cbs;
    setTimeout(() => { if (S && S.phase === 'result') cbs.finish(result); }, 1100);
  }

  function quit() {
    const cbs = S ? S.cbs : null;
    stop();
    if (cbs && cbs.exit) cbs.exit();
  }

  function stop() {
    if (!S) return;
    if (S.timer) clearInterval(S.timer);
    if (S.raf) cancelAnimationFrame(S.raf);
    if (S.bus) AudioKit.killBus(S.bus);
    overlay().innerHTML = '';
    S = null;
  }

  /* ---------- 描画 ---------- */
  function loop() {
    if (!S) return;
    const now = AudioKit.now();
    if (S.phase === 'play') {
      if (laneShown()) S.laneEverOn = true;
      autoMiss(now);
      if (S.phase === 'play') for (const p of [0, 1]) { const th = S.holding[p]; if (th && th.holding && now > th.ht) endHold(th, p, now); }
      if (now > S.endT) finishRun();
    }
    drawFrame(now);
    if (S) S.raf = requestAnimationFrame(loop);
  }

  function currentSeg(beat) {
    const segs = S.pattern.segments;
    if (!segs) return null;
    for (const s of segs) if (beat >= s.start && beat < s.end) return s;
    return beat < segs[0].start ? segs[0] : segs[segs.length - 1];
  }

  function drawFrame(now) {
    const playing = S.phase === 'play' || S.phase === 'result';
    const beat = playing ? tb(now) : -4;
    const seg = S.pattern.segments ? currentSeg(Math.max(beat, 0)) : null;
    const arch = seg ? seg.arch : S.def.arch;
    const theme = S.theme;

    // 背景
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (S.def.ura || theme.night) {
      c.fillStyle = 'rgba(255,255,255,.7)';
      const rs = Patterns.rngFor('stars');
      const nStars = theme.night ? 70 : 40;
      for (let i = 0; i < nStars; i++) {
        const x = rs() * W, y = rs() * 380;
        const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
        c.globalAlpha = 0.3 + tw * 0.5;
        c.fillRect(x, y, 2.5, 2.5);
      }
      c.globalAlpha = 1;
      if (theme.night) Patterns.E(c, '🌙', 96, 92, 62);
    }
    c.fillStyle = theme.ground;
    c.fillRect(0, H - 120, W, 120);

    // ビートパルス(4分ドット)
    const bi = ((Math.floor(beat) % 4) + 4) % 4;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(W / 2 - 54 + i * 36, 36, i === bi && beat > -4.5 ? 11 : 7, 0, 7);
      c.fillStyle = i === bi && beat > -4.5 ? theme.accent : 'rgba(255,255,255,.55)';
      c.fill();
    }

    // シーン
    const v = {
      W, H, beat, sec: now, spb: spbAt(beat), ura: S.def.ura, theme,
      targets: S.pattern.segments ? S.pattern.targets.filter(t => t.arch === arch) : S.pattern.targets,
      cues: S.pattern.segments ? S.pattern.cues.filter(u => u.arch === arch) : S.pattern.cues,
      pressAge: now - S.lastPress,
    };
    Patterns.ARCH[arch].draw(c, v);

    // タイミングレーン(●が左のわっかに重なった瞬間 = 押す瞬間)。設定でOFFにできる
    if (playing && laneShown()) drawLane(now, beat, theme);

    // レーン切替のトースト
    if (S.laneToast && now - S.laneToast < 1.3) {
      const age = now - S.laneToast;
      c.save();
      c.globalAlpha = Math.min(1, 1.3 - age);
      c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5;
      c.fillStyle = '#fff';
      const txt = 'タイミングレーン ' + (laneOn ? 'ひょうじ' : 'ひひょうじ') + (laneByArrows(S.def) ? '（アローキーで切替）' : '（Lキーで切替）');
      c.strokeText(txt, W / 2, 452);
      c.fillText(txt, W / 2, 452);
      c.restore();
    }

    // タイトル・進捗
    c.save();
    c.font = 'bold 17px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 4;
    const label = S.def.title + (seg ? '  ▶ ' + Patterns.ARCH[arch].base : '');
    c.strokeText(label, 14, 12);
    c.fillText(label, 14, 12);
    c.restore();
    const prog = Patterns.clamp(beat / S.pattern.totalBeats, 0, 1);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, H - 6, W, 6);
    c.fillStyle = theme.accent; c.fillRect(0, H - 6, W * prog, 6);

    // リミックス: 次のゲーム予告
    if (seg && beat > 0) {
      const nxt = S.pattern.segments.find(s2 => s2.start > beat);
      if (nxt && nxt.start - beat < 1.6 && nxt.arch !== arch) {
        const a2 = Patterns.ARCH[nxt.arch];
        c.save();
        c.font = '900 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 6;
        const txt = 'つぎ→ ' + a2.icon + ' ' + a2.base;
        c.strokeText(txt, W / 2, 90);
        c.fillText(txt, W / 2, 90);
        c.restore();
      }
    }

    // カウントイン
    if (playing && beat < 0 && beat > -4.5) {
      const n = Math.min(4, Math.floor(beat) + 5);
      const fr = beat - Math.floor(beat);
      c.save();
      c.globalAlpha = 1 - fr * 0.6;
      c.font = '900 110px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 10;
      c.strokeText(String(n), W / 2, H / 2 - 30);
      c.fillText(String(n), W / 2, H / 2 - 30);
      c.restore();
    }

    // おてつき硬直中の表示(連打対策の見える化)
    if (S.phase === 'play') {
      for (const p of (S.mode === 'solo' ? [0] : [0, 1])) {
        if (now < S.lockUntil[p]) {
          const x = S.mode === 'solo' ? 660 : p === 0 ? 280 : 680;
          c.save();
          c.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(now * 12));
          c.font = '900 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 5;
          c.fillStyle = '#ff8f8f';
          c.strokeText('💦 おてつきちゅう…', x, 202);
          c.fillText('💦 おてつきちゅう…', x, 202);
          c.restore();
        }
      }
    }

    // エンドレス: ライフ・セクション表示
    if (S.endless && playing) drawEndlessHud(now, beat);

    // パーフェクトキャンペーン: ちょうせん中の表示と、しくじった ときの「ざんねん」
    if (S.perfect && playing) {
      c.save();
      c.font = '900 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5;
      c.fillStyle = S.perfect.failed ? '#ff8f8f' : '#ffd54a';
      const tag = S.perfect.failed ? '💥 パーフェクト しっぱい…' : '💯 パーフェクトキャンペーン ちょうせんちゅう！';
      c.strokeText(tag, W / 2, 58);
      c.fillText(tag, W / 2, 58);
      if (S.perfect.failed) {
        const age = now - S.perfect.at;
        c.globalAlpha = Math.max(0, 1 - age / 1.4);
        c.fillStyle = 'rgba(0,0,0,.45)';
        c.fillRect(0, 0, W, H);
        c.font = '900 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 9;
        c.strokeText('ざんねん…', W / 2, H / 2);
        c.fillText('ざんねん…', W / 2, H / 2);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    // アロー版: シーンは ほうこうを しらないので、つぎの ↑↓←→ を キャラの上に ならべて出す(ちかいほど 大きく)
    if (S.phase === 'play' && (S.def.arrowMode || S.def.kbdMode)) {
      const ARROWG = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
      const per = [[], []];
      for (const t of S.pattern.targets) {
        const dt = t.b - beat;
        if (dt > 2.2) break;
        if (dt > -0.1 && !t.judged && ((t.dir && !S.def.kbdOnly) || t.kbd || S.def.mix) && t.kind !== 'bomb') per[S.mode !== 'solo' && t.owner === 1 ? 1 : 0].push(t);   // ＆通常版は ふつうノーツも ● で ならべる
      }
      per.forEach((list, p) => {
        const cx = S.mode === 'solo' ? 660 : p === 0 ? 280 : 680;
        const n = Math.min(list.length, 4);
        list.slice(0, 4).forEach((t, i) => {
          const k = Patterns.clamp(1 - (t.b - beat) / 2.2, 0, 1);
          c.save(); c.globalAlpha = 0.35 + k * 0.65;
          const gx = cx + i * 44 - (n - 1) * 22, gy = 262 - k * 16, gs = 22 + k * 22;
          if (t.dir && !S.def.kbdOnly) Patterns.E(c, ARROWG[t.dir], gx, gy, gs);
          else {   // キーボード版: 文字で ／ ＆通常版の ふつうノーツ: ●
            const label = t.kbd ? (t.secret ? '?' : keyLabel(t.kbd)) : '●';   // secret = かんがえる/おぼえる キー
            c.font = '900 ' + Math.round(gs * (t.kbd ? 1.15 : 0.95)) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 5; c.fillStyle = t.kbd ? '#fff' : (S.mode === 'solo' ? '#ffd166' : P_COLORS[p]);
            c.strokeText(label, gx, gy); c.fillText(label, gx, gy);
          }
          c.restore();
        });
      });
    }

    // ほうこうパッド(方向ノーツがある ゲーム)。1人=右 / 2人=左が1P・右が2P。タップでも ほうこうを 入力できる
    if (playing && S.hasDir && GameData.feat('arrows')) {
      c.save();
      for (const [p, set] of padSetsFor()) {
        for (const dir in set) {
          const [px, py] = set[dir];
          const hot = S.lastP === p && S.lastDir === dir && now - S.lastPress < 0.15;
          c.beginPath(); c.arc(px, py, PAD_R, 0, 7);
          c.fillStyle = hot ? theme.accent : S.mode === 'solo' ? 'rgba(0,0,0,.28)' : p === 0 ? 'rgba(71,168,255,.38)' : 'rgba(255,140,66,.38)';
          c.fill();
          c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
          c.fillStyle = '#fff'; c.font = '900 24px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(DIR_GLYPH[dir], px, py + 1);
        }
        if (S.mode !== 'solo') {
          c.font = 'bold 12px sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(p === 0 ? '1P ↑↓←→' : '2P WASD', set.up[0], set.up[1] - 40);
        }
      }
      c.restore();
    }

    // ながおし中の ゲージ
    if (S.phase === 'play') {
      for (const p of (S.mode === 'solo' ? [0] : [0, 1])) {
        const th = S.holding[p];
        if (!th || !th.holding) continue;
        const prog = Patterns.clamp((now - th.t) / Math.max(0.01, th.ht - th.t), 0, 1);
        const x = S.mode === 'solo' ? 660 : p === 0 ? 280 : 680;
        c.save();
        c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(x, 236, 26, 0, 7); c.stroke();
        c.strokeStyle = theme.accent; c.beginPath(); c.arc(x, 236, 26, -Math.PI / 2, -Math.PI / 2 + prog * 2 * Math.PI); c.stroke();
        c.font = '900 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
        c.fillText(prog >= 1 ? 'はなせ！' : 'おしたまま', x, 236);
        c.restore();
      }
    }

    // 判定表示
    drawJudgeFx(now);
  }

  /* エンドレスのHUD: のこりライフ(❤)と いまのセクション・BPM */
  function drawEndlessHud(now, beat) {
    const E = S.endless;
    const total = S.pattern.segments.length;
    const seg = Math.max(0, Math.min(total, Math.ceil((beat - 4) / 8)));
    c.save();
    c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 4;
    c.fillStyle = '#fff';
    const txt = `${S.def.perfectEndless ? '💯 パーフェクト　' : ''}セクション ${seg} / ${total}　♪ BPM ${Math.round(60 / spbAt(beat))}`;
    c.strokeText(txt, W / 2, 58);
    c.fillText(txt, W / 2, 58);

    const flash = now - E.lastLoss < 0.5 && Math.floor((now - E.lastLoss) * 12) % 2 === 0;
    const hearts = (x, align, n, label) => {
      let s = '';
      for (let i = 0; i < E.max; i++) s += i < n ? '❤️' : '🖤';
      c.textAlign = align; c.font = '18px sans-serif';
      c.globalAlpha = flash ? 0.3 : 1;
      c.fillText(s, x, 34);
      c.globalAlpha = 1;
      if (label) {
        c.font = 'bold 12px sans-serif';
        c.fillText(label, x + (align === 'right' ? -E.max * 20 - 4 : E.max * 20 + 4), 38);
      }
    };
    if (S.def.lifeMode === 'shared') hearts(14, 'left', E.lives[0], 'ふたりの ライフ');
    else if (S.mode === 'versus') { hearts(14, 'left', E.lives[0], '1P'); hearts(W - 14, 'right', E.lives[1], '2P'); }
    else hearts(W - 14, 'right', E.lives[0], null);
    c.restore();
  }

  /* タイミングレーン: ノーツ●が右から流れ、左のわっかに重なった瞬間が押すタイミング */
  function drawLane(now, beat, theme) {
    const y = 492, mx = 170, ppb = 140, xEnd = 890;
    const win = (xEnd - mx) / ppb;
    c.save();
    c.fillStyle = 'rgba(10,10,25,.32)';
    c.beginPath();
    if (c.roundRect) c.roundRect(70, y - 26, xEnd - 50, 52, 26); else c.rect(70, y - 26, xEnd - 50, 52);
    c.fill();
    // 拍の目盛り(4拍ごとに濃く)
    for (let k = Math.max(0, Math.ceil(beat)); k <= beat + win; k++) {
      const x = mx + (k - beat) * ppb;
      if (x > xEnd) break;
      c.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.18)';
      c.fillRect(x - 1.5, y - 15, 3, 30);
    }
    // ノーツ(裏モードでは わっかに近づくと消える)。おなじ拍のノーツ = 同時押しは まとめて見せる
    const multi = S.mode !== 'solo';
    const chords = new Map();   // 拍 → その拍の ノーツたち
    for (const t of S.pattern.targets) {
      const dt = t.b - beat;
      if (dt > win) break;
      if (dt < -0.2 || t.judged || t.hidden || t.kind === 'bomb') continue;
      const k = t.b.toFixed(3);
      if (!chords.has(k)) chords.set(k, []);
      chords.get(k).push(t);
    }
    const rowOf = t => !multi ? 0 : t.owner === 0 ? -8 : t.owner === 1 ? 8 : 0;   // 1P上段 / 2P下段 / とりあい中央
    for (const t of S.pattern.targets) {
      const dt = t.b - beat;
      if (dt > win) break;
      if (t.hidden) continue;   // hidden = はやうち系(レーンに出すとネタバレ)
      let yOff = rowOf(t);
      if (t.hold) {   // ながおしバー(あたま → おわり)。おしている あいだは わっかから のびる
        const xe = Math.min(xEnd, mx + (t.b + t.hold - beat) * ppb);
        if (t.holding) {
          c.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(now * 10));
          c.fillStyle = theme.accent; c.fillRect(mx, y + yOff - 6, Math.max(0, xe - mx), 12);
          c.globalAlpha = 1;
          continue;
        }
        if (!t.judged && dt > -0.2) { const xs = mx + dt * ppb; c.fillStyle = 'rgba(255,255,255,.42)'; c.fillRect(xs, y + yOff - 5, Math.max(0, xe - xs), 10); }
      }
      if (dt < -0.2 || t.judged) continue;
      let alpha = 1;
      if (S.def.ura) alpha = Patterns.clamp((dt - 0.45) * 2.2, 0, 1);
      if (alpha <= 0) continue;
      const x = mx + dt * ppb;
      c.globalAlpha = alpha;
      // 同時押しの レイアウト
      const grp = t.kind === 'bomb' ? null : chords.get(t.b.toFixed(3));
      let r = multi ? 11 : 13, glyph = t.dir && !S.def.kbdOnly ? DIR_GLYPH[t.dir] : (t.kbd ? (t.secret ? '?' : keyLabel(t.kbd)) : ''), glyphSize = multi ? 14 : 17;
      if (grp && grp.length > 1) {
        if (!multi) {   // 1人: たてに ならべて バーで つなぐ(DDRの ジャンプふう)
          const gi = grp.indexOf(t), n = grp.length;
          yOff = (gi - (n - 1) / 2) * 26; r = 11;
          if (gi === 0) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 4, y - (n - 1) / 2 * 26, 8, (n - 1) * 26); }
        } else {        // 2人: 1P と 2P が おなじ拍なら 2段を バーで つなぐ。おなじ人の 2つは 1つの まるに まとめる
          const first = grp[0];
          if (t === first && grp.some(u => u.owner !== first.owner)) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 4, y - 8, 8, 16); }
          const mates = grp.filter(u => u.owner === t.owner);
          if (mates.length > 1) {
            if (t !== mates[0]) { c.globalAlpha = 1; continue; }
            r = 14; glyph = mates.map(u => u.dir && !S.def.kbdOnly ? DIR_GLYPH[u.dir] : u.kbd ? (u.secret ? '?' : keyLabel(u.kbd)) : '●').join(''); glyphSize = 11;
          }
        }
      }
      c.beginPath(); c.arc(x, y + yOff, r, 0, 7);
      if (t.kind === 'bomb') {
        c.fillStyle = '#2d2d3a'; c.fill();
        c.lineWidth = 3; c.strokeStyle = '#ff5d5d'; c.stroke();
        c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('💣', x, y + yOff);
      } else {
        c.fillStyle = !multi ? theme.accent : t.owner === -1 ? NEUTRAL_COLOR : P_COLORS[t.owner];
        c.fill();
        c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
        if (glyph) {   // ↑↓←→ ノーツ: どの ほうこうか レーンでも わかるように(同時押しは 2つ ならべる)
          c.fillStyle = '#fff'; c.font = '900 ' + glyphSize + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(glyph, x, y + yOff + 1);
        }
      }
      c.globalAlpha = 1;
    }
    // 判定わっか(押した結果の色でフラッシュ)
    let ring = 'rgba(255,255,255,.95)';
    const lastFx = S.fx.length ? S.fx[S.fx.length - 1] : null;
    if (lastFx && now - lastFx.sec < 0.25) {
      ring = lastFx.res === 'perfect' ? '#ffb703' : lastFx.res === 'ok' ? '#5be37d' : '#ff5d5d';
    }
    const pulse = beat > -4.5 ? 1 - (((beat % 1) + 1) % 1) : 0;
    c.lineWidth = 5;
    c.strokeStyle = ring;
    c.beginPath(); c.arc(mx, y, 19 + pulse * 4, 0, 7); c.stroke();
    c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillText('ここで おす！', mx, y + 26);
    // 2人モード: 色の凡例
    if (S.mode !== 'solo') {
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = P_COLORS[0]; c.beginPath(); c.arc(795, y - 40, 7, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText('1P', 807, y - 40);
      c.fillStyle = P_COLORS[1]; c.beginPath(); c.arc(845, y - 40, 7, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText('2P', 857, y - 40);
    }
    c.restore();
  }

  function drawJudgeFx(now) {
    for (let i = S.fx.length - 1; i >= 0; i--) {
      const f = S.fx[i];
      const age = now - f.sec;
      if (age > 0.7) { S.fx.splice(i, 1); continue; }
      const conf = f.res === 'perfect'
        ? { t: 'ピッタリ！', col: '#ffb703', size: 36 }
        : f.res === 'ok'
          ? { t: 'セーフ', col: '#4cc9f0', size: 28 }
          : f.res === 'bomb'
            ? { t: 'ボカン！', col: '#ff5d5d', size: 34 }
            : f.res === 'whiff'
              ? { t: 'おてつき', col: '#ff9f9f', size: 22 }
              : f.res === 'holdok'
                ? { t: 'ながおし OK！', col: '#7ee0a0', size: 24 }
              : f.res === 'early'
                ? { t: 'はなすの はやい！', col: '#ff9f9f', size: 24 }
              : f.res === 'wrongkey'
                ? { t: 'ちがうキー！' + (f.kbd ? keyLabel(f.kbd) : ''), col: '#ff9f9f', size: 24 }
              : f.res === 'wrongdir'
                ? { t: 'ほうこう ちがい！' + (f.dir ? DIR_GLYPH[f.dir] : ''), col: '#ff9f9f', size: 24 }
                : { t: 'ミス…', col: '#aab4c8', size: 28 };
      const multi = S.mode !== 'solo';
      const fxX = !multi ? 660 : f.p === 0 ? 280 : f.p === 1 ? 680 : 480;   // 1P左 / 2P右
      const label = multi && (f.p === 0 || f.p === 1) ? (f.p + 1) + 'P ' : '';
      c.save();
      c.globalAlpha = 1 - age / 0.7;
      c.font = '900 ' + conf.size + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 6;
      c.fillStyle = conf.col;
      let stack = 0;   // 同時押しの判定は かさならないよう 上に ずらす
      for (let j = 0; j < i; j++) { const g2 = S.fx[j]; if (g2.p === f.p && Math.abs(g2.sec - f.sec) < 0.12) stack++; }
      const fy = 160 - age * 70 - stack * 30;
      c.strokeText(label + conf.t, fxX, fy);
      c.fillText(label + conf.t, fxX, fy);
      c.restore();
    }
  }

  return { init, play, stop, setLane, getLane: () => laneOn };
})();
