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
    window.addEventListener('keydown', e => {
      if (!S) return;
      if (e.code === 'Escape') { quit(); return; }
      if (e.code === 'KeyL') { e.preventDefault(); if (!e.repeat) toggleLane(); return; }
      if (S.mode === 'solo') {
        if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyF') {
          e.preventDefault();
          if (!e.repeat) press(0);
        }
      } else {
        if (e.code === 'KeyF' || e.code === 'KeyD') { e.preventDefault(); if (!e.repeat) press(0); }
        else if (e.code === 'KeyJ' || e.code === 'KeyK') { e.preventDefault(); if (!e.repeat) press(1); }
        else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && S.phase === 'intro') begin(); }
      }
    });
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!S) return;
      if (S.mode === 'solo') press(0);
      else press(e.offsetX < cv.clientWidth / 2 ? 0 : 1);   // 左半分タップ=1P / 右半分=2P
    });
  }

  function overlay() { return document.getElementById('game-overlay'); }

  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return `rgb(${r},${g},${b})`;
  }
  function themeFor(def) {
    const t = def.theme;
    if (!def.ura) return { bg1: t.bg1, bg2: t.bg2, ground: t.ground, accent: t.accent };
    return { bg1: '#1a1038', bg2: darken(t.bg2, 0.45), ground: darken(t.ground, 0.5), accent: t.accent };
  }

  /* ---------- 起動 ---------- */
  function play(def, cbs, mode = 'solo') {
    stop();
    const pattern = def.kind === 'remix' ? Patterns.buildRemixPattern(def) : Patterns.buildGamePattern(def);
    if (mode === 'solo') pattern.targets.forEach(t => { if (t.owner === undefined) t.owner = 0; });
    else assignOwners(pattern.targets);
    S = {
      def, cbs, pattern, mode,
      theme: themeFor(def),
      phase: 'intro',
      bus: null, evts: [], evtI: 0, timer: null, raf: 0,
      spb: 60 / def.bpm, beat0: 0, endT: 0,
      perfW: def.ura ? PERF_W.ura : PERF_W.omote,
      okW: def.ura ? OK_W.ura : OK_W.omote,
      stats: [
        { perfect: 0, ok: 0, miss: 0, whiff: 0 },
        { perfect: 0, ok: 0, miss: 0, whiff: 0 },
      ],
      lockUntil: [-1, -1],   // おてつき硬直(連打対策)の解除時刻
      fx: [], lastPress: -9, finished: false,
    };
    showIntro(def);
    S.raf = requestAnimationFrame(loop);
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
    const p1 = `<b style="color:${P_COLORS[0]}">1P = F/Dキー・左タップ（青ノーツ）</b>`;
    const p2 = `<b style="color:${P_COLORS[1]}">2P = J/Kキー・右タップ（オレンジノーツ）</b>`;
    const modeLine = mode === 'coop'
      ? `<p class="desc" style="font-size:13px">🤝 きょうりょくプレイ！<br>${p1}<br>${p2}<br>じぶんの色のノーツを たたいて、ふたりのスコアで クリアをめざそう！<br>⚠ れんだは「おてつき」で しばらく おせなくなるぞ！</p>`
      : mode === 'versus'
        ? `<p class="desc" style="font-size:13px">⚔ たいせんプレイ！<br>${p1}<br>${p2}<br>きいろの ノーツは とりあい！スコアが たかい ほうの かち！<br>⚠ れんだは「おてつき」で しばらく おせなくなるぞ！</p>`
        : '';
    const keyHint = mode === 'solo'
      ? 'スペース / タップ = アクション　　L = レーン切替　　Esc = もどる'
      : '1P = F/D・左タップ　　2P = J/K・右タップ　　L = レーン切替　　Esc = もどる';
    const modeTag = mode === 'coop' ? '　🤝協力' : mode === 'versus' ? '　⚔対戦' : '';
    overlay().innerHTML = `
      <div class="card intro">
        <div class="g-icon">${def.icon}</div>
        <h2>${def.title}</h2>
        <p class="desc">${def.desc}</p>
        ${modeLine}
        <p class="desc" style="font-size:13px;opacity:.8">${laneOn
          ? '🎯 がめん下の わっかに ●が ピッタリ かさなった しゅんかんに おそう！' + (def.ura ? '（裏では ●が とちゅうで きえる！）' : '')
          : '🎯 タイミングレーンは OFF ちゅう。Lキーで いつでも ひょうじできるよ！'}</p>
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
    const t0 = ak.now() + 0.3;
    S.beat0 = t0 + 4 * S.spb;                       // 1小節カウントインの後が0拍目
    for (const t of S.pattern.targets) t.t = S.beat0 + t.b * S.spb;
    S.endT = S.beat0 + S.pattern.totalBeats * S.spb + 0.4;
    buildEvents(t0);
    S.timer = setInterval(schedule, 25);
    S.phase = 'play';
    S.ignoreUntil = ak.now() + 0.25;                // スタート直後の誤爆を無視
  }

  /* ---------- BGM・キュー音のイベント生成 ---------- */
  function buildEvents(t0) {
    const ak = AudioKit, bus = S.bus, spb = S.spb, b0 = S.beat0, def = S.def;
    const ev = [];
    const push = (beat, f) => ev.push({ t: b0 + beat * spb, f });

    // カウントイン: クリック4つ + 直前にスネアロールのピックアップ
    for (let i = 0; i < 4; i++) {
      const last = i === 3;
      push(-4 + i, t => ak.sfx(bus, 'count', t, { last }));
    }
    [[-1, 0.06], [-0.75, 0.09], [-0.5, 0.12], [-0.25, 0.16]].forEach(([o, v]) =>
      push(o, t => ak.snare(bus, t, v)));

    const root = def.music.root, minor = def.music.minor;
    const mrng = Patterns.rngFor(def.id + ':melody');   // 曲想はゲームIDから固定生成(毎回同じ曲)

    // コード進行・アルペジオ型・リード音色・スケールをゲームごとに選ぶ
    const PROGS = minor
      ? [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 7], [0, 3, 8, 10]]
      : [[0, 9, 5, 7], [0, 5, 9, 7], [0, 7, 9, 5], [0, 2, 5, 7], [0, 4, 9, 5]];
    const prog = PROGS[Math.floor(mrng() * PROGS.length)];
    const qual = d2 => minor ? (d2 === 0 || d2 === 5) : (d2 === 9 || d2 === 2 || d2 === 4); // マイナーコードか
    const APATS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 3, 2, 1, 0], [0, 1, 2, 1, 3, 1, 2, 1]];
    const apat = APATS[Math.floor(mrng() * APATS.length)];
    const TIMBRES = ['bell', 'chip', 'flute', 'pluckL', 'sawL'];
    // スロット番号を混ぜて、同じステージの4ゲームで音色がかぶりにくくする
    const timbre = TIMBRES[(Math.floor(mrng() * TIMBRES.length) + (def.slot === 'R' ? 4 : def.slot)) % TIMBRES.length];
    const SCALES = minor
      ? [[0, 3, 5, 7, 10], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 8, 11]]
      : [[0, 2, 4, 7, 9], [0, 2, 4, 5, 7, 9, 11], [0, 2, 4, 5, 7, 9, 10]];
    const sc = SCALES[Math.floor(mrng() * SCALES.length)];
    const NS = sc.length;
    const degMidi = idx => root + 24 + sc[idx % NS] + 12 * Math.floor(idx / NS);

    // メロディは「モチーフ」方式: 2小節のフレーズを2つ作り A A' B A'' と展開する
    const RHYTHMS = [
      [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2], [4, 1], [5, 1], [6, 2]],
      [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1], [4, 2], [6.5, 0.5], [7, 1]],
      [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1], [4, 1.5], [5.5, 0.5], [6, 2]],
      [[0, 1], [2, 1], [3, 0.5], [3.5, 0.5], [4, 1], [6, 1], [7, 1]],
      [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 2]],
      [[0, 2], [2, 1], [3, 1], [4, 2], [6, 1], [7, 1]],
    ];
    function makeMotif() {
      const rhy = RHYTHMS[Math.floor(mrng() * RHYTHMS.length)];
      let pos = NS + Math.floor(mrng() * NS);   // 中音域スタート
      return rhy.map(([o, d], i) => {
        if (i > 0) {
          const step = [-3, -2, -1, -1, 0, 1, 1, 2, 3][Math.floor(mrng() * 9)];
          pos = Math.max(0, Math.min(2 * NS - 1, pos + step));
        }
        return { o, d, pos };
      });
    }
    const motifA = makeMotif(), motifB = makeMotif();
    const M = S.pattern.totalBeats / 4;

    for (let m = 0; m < M; m++) {
      const base = m * 4, deg = prog[m % 4];
      const isMin = qual(deg);
      const cr = root + deg;
      const chord = [cr, cr + (isMin ? 3 : 4), cr + 7, cr + 12];

      // ドラム
      if (m % 4 === 0) push(base, t => ak.crash(bus, t, m === 0 ? 0.18 : 0.11));
      push(base, t => ak.kick(bus, t, 0.42));
      push(base + 2, t => ak.kick(bus, t, 0.36));
      if (def.d >= 8 && m % 2 === 1) push(base + 2.5, t => ak.kick(bus, t, 0.25));
      if (m >= 2) { push(base + 1, t => ak.snare(bus, t)); push(base + 3, t => ak.snare(bus, t)); }
      for (let e8 = 0; e8 < 8; e8++) push(base + e8 * 0.5, t => ak.hat(bus, t, e8 % 2 ? 0.05 : 0.075, false));
      if (m % 2 === 1) push(base + 3.5, t => ak.hat(bus, t, 0.09, true));
      if (m % 8 === 7) [3.25, 3.5, 3.75].forEach(o => push(base + o, t => ak.snare(bus, t, 0.2)));

      // ベース(ルート-5度で動くライン)
      [[0, 0], [0.75, 0], [1.5, 7], [2, 0], [2.75, 0], [3.5, m % 4 === 3 ? 10 : 7]].forEach(([o, n]) =>
        push(base + o, t => ak.bassN(bus, t, cr - 24 + n, 0.2)));

      // コードパッド + スタブ
      push(base, t => ak.pad(bus, t, chord, spb * 3.9, 0.045));
      push(base + 1.5, t => ak.stab(bus, t, cr, isMin));
      if (m % 2 === 0) push(base + 3, t => ak.stab(bus, t, cr, isMin));

      // 8分のキラキラアルペジオ(型はゲームごと)
      for (let e8 = 0; e8 < 8; e8++) {
        const nn = chord[apat[e8]] + 12;
        push(base + e8 * 0.5, t => ak.pluck(bus, t, nn, 0.038));
      }

      // リードのメロディ: 2小節ブロックを A A'(移調) B A''(着地) の順で展開
      if (m % 2 === 0) {
        const kind = ['A', 'A2', 'B', 'A3'][(m / 2) % 4];
        const motif = kind === 'B' ? motifB : motifA;
        const shift = kind === 'A2' ? 1 : kind === 'A3' ? 2 : 0;
        motif.forEach((nt, ni) => {
          let midi = degMidi(Math.min(2 * NS - 1, nt.pos + shift));
          // モチーフは2小節にまたがるので、その音が乗る小節のコードを見る
          const degHere = prog[(m + (nt.o >= 4 ? 1 : 0)) % 4];
          const crHere = root + degHere;
          // 強拍(各小節の1・3拍目)はコードトーンにスナップ
          if (nt.o % 4 === 0 || nt.o % 4 === 2) {
            const pcs = [0, qual(degHere) ? 3 : 4, 7];
            for (const adj of [0, -1, 1, -2, 2]) {
              if (pcs.includes((((midi + adj - crHere) % 12) + 12) % 12)) { midi += adj; break; }
            }
          }
          // フレーズのしめ(A''の最後の音)はコードのルートに着地
          if (kind === 'A3' && ni === motif.length - 1) midi = crHere + 24;
          push(base + nt.o, t => ak.lead(bus, t, midi, nt.d * spb * 0.92, 0.06, timbre));
        });
      }
    }
    // しめのコード
    push(S.pattern.totalBeats, t => {
      ak.kick(bus, t, 0.5);
      ak.crash(bus, t, 0.18);
      ak.pad(bus, t, [root, root + (minor ? 3 : 4), root + 7, root + 12], 1.6, 0.07);
      ak.lead(bus, t, root + 24, 0.9, 0.09, timbre);
    });

    for (const cu of S.pattern.cues) {
      const sfx = cu.sfx, opt = cu.opt;
      push(cu.beat, t => ak.sfx(bus, sfx, t, opt || {}));
    }

    ev.sort((a, b) => a.t - b.t);
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
  function press(p) {
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
    S.lastPress = now;
    const beat = (now - S.beat0) / S.spb;
    if (beat < -0.5) return;
    let best = null, bd = 1e9;
    for (const t of S.pattern.targets) {
      if (t.judged) continue;
      if (S.mode !== 'solo' && t.owner !== p && t.owner !== -1) continue;  // 自分のノーツか、とりあいノーツだけ
      const d = Math.abs(now - t.t);
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
      } else {
        judge(best, bd <= S.perfW ? 'perfect' : 'ok', now, p);
      }
    } else if (beat > 0 && beat < S.pattern.totalBeats - 1) {
      S.stats[p].whiff++;
      S.lockUntil[p] = now + lockDur();
      AudioKit.sfx(S.bus, 'whiffS', now);
      S.fx.push({ sec: now, res: 'whiff', p });
    }
  }

  /* おてつき硬直の長さ: 基本0.3秒、テンポが速い曲では短めに */
  function lockDur() { return Math.min(0.3, S.spb * 0.6); }

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
    if (S.mode === 'versus') {
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
      AudioKit.jingle(S.bus, now + 0.3, r.rank);
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
      autoMiss(now);
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
    const beat = playing ? (now - S.beat0) / S.spb : -4;
    const seg = S.pattern.segments ? currentSeg(Math.max(beat, 0)) : null;
    const arch = seg ? seg.arch : S.def.arch;
    const theme = S.theme;

    // 背景
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (S.def.ura) {
      c.fillStyle = 'rgba(255,255,255,.7)';
      const rs = Patterns.rngFor('stars');
      for (let i = 0; i < 40; i++) {
        const x = rs() * W, y = rs() * 380;
        const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
        c.globalAlpha = 0.3 + tw * 0.5;
        c.fillRect(x, y, 2.5, 2.5);
      }
      c.globalAlpha = 1;
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
      W, H, beat, sec: now, spb: S.spb, ura: S.def.ura, theme,
      targets: S.pattern.segments ? S.pattern.targets.filter(t => t.arch === arch) : S.pattern.targets,
      cues: S.pattern.segments ? S.pattern.cues.filter(u => u.arch === arch) : S.pattern.cues,
      pressAge: now - S.lastPress,
    };
    Patterns.ARCH[arch].draw(c, v);

    // タイミングレーン(●が左のわっかに重なった瞬間 = 押す瞬間)。設定でOFFにできる
    if (playing && laneOn) drawLane(now, beat, theme);

    // レーン切替のトースト
    if (S.laneToast && now - S.laneToast < 1.3) {
      const age = now - S.laneToast;
      c.save();
      c.globalAlpha = Math.min(1, 1.3 - age);
      c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5;
      c.fillStyle = '#fff';
      const txt = 'タイミングレーン ' + (laneOn ? 'ひょうじ' : 'ひひょうじ') + '（Lキーで切替）';
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

    // 判定表示
    drawJudgeFx(now);
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
    // ノーツ(裏モードでは わっかに近づくと消える)
    for (const t of S.pattern.targets) {
      const dt = t.b - beat;
      if (dt > win) break;
      if (dt < -0.2 || t.judged || t.hidden) continue;   // hidden = はやうち系(レーンに出すとネタバレ)
      let alpha = 1;
      if (S.def.ura) alpha = Patterns.clamp((dt - 0.45) * 2.2, 0, 1);
      if (alpha <= 0) continue;
      const x = mx + dt * ppb;
      const multi = S.mode !== 'solo';
      const yOff = !multi ? 0 : t.owner === 0 ? -8 : t.owner === 1 ? 8 : 0;   // 1P上段 / 2P下段 / とりあい中央
      c.globalAlpha = alpha;
      c.beginPath(); c.arc(x, y + yOff, multi ? 11 : 13, 0, 7);
      if (t.kind === 'bomb') {
        c.fillStyle = '#2d2d3a'; c.fill();
        c.lineWidth = 3; c.strokeStyle = '#ff5d5d'; c.stroke();
        c.font = '14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('💣', x, y + yOff);
      } else {
        c.fillStyle = !multi ? theme.accent : t.owner === -1 ? NEUTRAL_COLOR : P_COLORS[t.owner];
        c.fill();
        c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
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
      c.strokeText(label + conf.t, fxX, 160 - age * 70);
      c.fillText(label + conf.t, fxX, 160 - age * 70);
      c.restore();
    }
  }

  return { init, play, stop, setLane, getLane: () => laneOn };
})();
