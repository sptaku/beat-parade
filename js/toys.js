'use strict';
/* Toys: リズムおもちゃ(メダルで かいほうされる、スコアの ない じゆうな あそび)
   おもちゃ = { id, icon, title, need(メダル数), desc, help, bpm, setup(T), step(T, i, t), key(T, code), tap(T, x, y), draw(T, now) }
   step(i, t) は 16ぶおんぷごとに よばれる スケジューラ(t = 音の時刻)。Esc か 右上の ✕ で もどる */
const Toys = (() => {
  const W = 960, H = 540;
  let cv = null, c = null, T = null;
  const ak = () => AudioKit;
  const E = (ch, x, y, s) => Patterns.E(c, ch, x, y, s);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const PENTA = [0, 2, 4, 7, 9];
  const penta = i => 60 + PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
  function text(s, x, y, size = 18, col = '#fff', align = 'center') {
    c.save(); c.font = '900 ' + size + 'px sans-serif'; c.textAlign = align; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 4; c.fillStyle = col; c.strokeText(s, x, y); c.fillText(s, x, y); c.restore();
  }
  function box(x, y, w, h, col, r = 12) { c.fillStyle = col; c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); c.fill(); }
  const lit = (T2, id, now) => (T2.lit[id] != null && now - T2.lit[id] < 0.18);
  const flash = (id) => { T.lit[id] = ak().now(); };
  const bg = (a, b) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H); };

  /* ---------------- おもちゃ(22しゅるい) ---------------- */
  const DRUMS = [
    ['KeyA', 'A', 'キック', '🥁', (b, t) => ak().kick(b, t, 0.6)], ['KeyS', 'S', 'スネア', '🪘', (b, t) => ak().snare(b, t, 0.35)],
    ['KeyD', 'D', 'ハット', '🎩', (b, t) => ak().hat(b, t, 0.12)], ['KeyF', 'F', 'クラップ', '👏', (b, t) => ak().snare(b, t, 0.3, 'clap')],
    ['KeyG', 'G', 'タム', '🛢️', (b, t) => ak().perc(b, t, 'tom', 0.16)], ['KeyH', 'H', 'カウベル', '🔔', (b, t) => ak().perc(b, t, 'cowbell', 0.14)],
    ['KeyJ', 'J', 'コンガ', '🪇', (b, t) => ak().perc(b, t, 'conga', 0.16)], ['KeyK', 'K', 'クラッシュ', '💥', (b, t) => ak().crash(b, t, 0.2)],
  ];
  const WHITE = [['KeyA', 60], ['KeyS', 62], ['KeyD', 64], ['KeyF', 65], ['KeyG', 67], ['KeyH', 69], ['KeyJ', 71], ['KeyK', 72]];
  const BLACK = [['KeyW', 61, 0], ['KeyE', 63, 1], ['KeyT', 66, 3], ['KeyY', 68, 4], ['KeyU', 70, 5]];
  const TIMBRES = [['bell', 'ベル'], ['epiano', 'エレピ'], ['chip', 'チップ'], ['saw', 'シンセ'], ['flute', 'フルート'], ['marimba', 'マリンバ'], ['brass', 'ブラス']];
  const FROG_KEYS = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };
  const FROG_POS = [[480, 170], [250, 300], [710, 300], [480, 400]];
  const FROG_CHORDS = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
  const SEQ_ROWS = [['キック', (b, t) => ak().kick(b, t, 0.55)], ['スネア', (b, t) => ak().snare(b, t, 0.3)], ['ハット', (b, t) => ak().hat(b, t, 0.1)], ['クラップ', (b, t) => ak().snare(b, t, 0.25, 'clap')], ['ベル', (b, t, i) => ak().bell(b, t, penta(5 + (i * 3) % 7), 0.08)]];
  const SONGS = [
    ['きらきらぼし', [1, 1, 5, 5, 6, 6, 5, 4, 4, 3, 3, 2, 2, 1, 5, 5, 4, 4, 3, 3, 2, 5, 5, 4, 4, 3, 3, 2, 1, 1, 5, 5, 6, 6, 5, 4, 4, 3, 3, 2, 2, 1]],
    ['かえるのうた', [1, 2, 3, 4, 3, 2, 1, 3, 4, 5, 6, 5, 4, 3, 1, 1, 1, 1, 1, 2, 3, 4, 3, 2, 1]],
    ['メリーさんのひつじ', [3, 2, 1, 2, 3, 3, 3, 2, 2, 2, 3, 5, 5, 3, 2, 1, 2, 3, 3, 3, 3, 2, 2, 3, 2, 1]],
  ];
  const BELL_MIDI = [60, 62, 64, 65, 67, 69, 71, 72];
  const BELL_COL = ['#ff5d5d', '#ffa53d', '#ffe13d', '#7ee07e', '#5db3ff', '#7b8cff', '#b57bff', '#ff7bd0'];
  const KB_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const GTR = [['C', [48, 52, 55, 60, 64, 67]], ['G', [43, 47, 50, 55, 59, 67]], ['Am', [45, 52, 57, 60, 64, 69]], ['F', [41, 48, 53, 57, 60, 65]], ['Dm', [50, 57, 62, 65, 69, 74]], ['Em', [40, 47, 52, 55, 59, 64]]];
  const BBOX = [
    ['KeyB', 'B', 'ブン', (b, t) => { ak().kick(b, t, 0.6, '808'); }], ['KeyT', 'T', 'ツ', (b, t) => ak().hat(b, t, 0.14)],
    ['KeyK', 'K', 'カッ', (b, t) => ak().snare(b, t, 0.32, 'tight')], ['KeyP', 'P', 'プシュ', (b, t) => ak().hat(b, t, 0.14, true)],
    ['KeyD', 'D', 'ドゥン', (b, t) => ak().perc(b, t, 'tom', 0.2)],
  ];

  const LIST = [
    { id: 'drumpad', icon: '🥁', title: 'ドラムパッド', need: 1, bpm: 100,
      desc: 'A S D F G H J K の 8つの パッドで じゆうに ドラムを たたこう！スペースで メトロノームの ON/OFF。',
      setup(t) { t.s.metro = true; },
      step(t, i, time) { if (t.s.metro && i % 4 === 0) ak().sfx(t.bus, 'count', time, { last: i % 16 === 0 }); },
      key(t, code) { if (code === 'Space') { t.s.metro = !t.s.metro; return; } const k = DRUMS.findIndex(d => d[0] === code); if (k >= 0) { DRUMS[k][4](t.bus, ak().now()); flash('p' + k); } },
      tap(t, x, y) { for (let k = 0; k < 8; k++) { const px = 150 + (k % 4) * 220, py = 190 + Math.floor(k / 4) * 170; if (Math.abs(x - px) < 95 && Math.abs(y - py) < 70) { DRUMS[k][4](t.bus, ak().now()); flash('p' + k); } } },
      draw(t, now) {
        bg('#2b1b4a', '#6b3fa0');
        DRUMS.forEach((d, k) => { const px = 150 + (k % 4) * 220, py = 190 + Math.floor(k / 4) * 170, on = lit(t, 'p' + k, now); box(px - 95, py - 70, 190, 140, on ? '#ffd166' : 'rgba(255,255,255,.16)'); E(d[3], px, py - 14, on ? 56 : 46); text(d[1] + '  ' + d[2], px, py + 44, 16); });
        text('メトロノーム: ' + (t.s.metro ? 'ON' : 'OFF') + '（スペース）', 480, 500, 15);
      } },
    { id: 'piano', icon: '🎹', title: 'おとピアノ', need: 3, bpm: 100,
      desc: 'A〜K が ドレミファソラシド、W E T Y U が くろい けんばん。1〜7 の すうじで ねいろが かわるよ！',
      setup(t) { t.s.tim = 0; },
      key(t, code) {
        const m = /^Digit([1-7])$/.exec(code); if (m) { t.s.tim = Number(m[1]) - 1; return; }
        const w = WHITE.find(k => k[0] === code) || BLACK.find(k => k[0] === code);
        if (w) { ak().lead(t.bus, ak().now(), w[1] + 12, 0.5, 0.12, TIMBRES[t.s.tim][0], {}); flash(code); }
      },
      tap(t, x, y) {
        for (const b of BLACK) { const bx = 170 + b[2] * 80 + 80; if (y < 330 && Math.abs(x - bx) < 26) { this.key(t, b[0]); return; } }
        const i = Math.floor((x - 170) / 80); if (i >= 0 && i < 8 && y > 160) this.key(t, WHITE[i][0]);
      },
      draw(t, now) {
        bg('#16324f', '#3a7ca5');
        WHITE.forEach((w, i) => { box(170 + i * 80 + 2, 170, 76, 290, lit(t, w[0], now) ? '#ffd166' : '#fff', 8); text(w[0].slice(3), 170 + i * 80 + 40, 430, 20, '#333'); });
        BLACK.forEach(b => { const bx = 170 + b[2] * 80 + 80; box(bx - 26, 170, 52, 170, lit(t, b[0], now) ? '#ff9f43' : '#222', 6); text(b[0].slice(3), bx, 310, 16); });
        text('ねいろ（1〜7）: ' + TIMBRES.map((x, i) => (i === t.s.tim ? '【' + x[1] + '】' : x[1])).join(' '), 480, 120, 16);
      } },
    { id: 'frogs', icon: '🐸', title: 'カエルがっしょう', need: 5, bpm: 96,
      desc: '↑ ← → ↓ で 4ひきの カエルが うたう！ばんそうの コードに あわせて おとが かわるから、どう おしても ハモるよ。',
      step(t, i, time) {
        const bar = Math.floor(i / 16) % 4, ch = FROG_CHORDS[bar]; t.s.bar = bar;
        if (i % 16 === 0) ak().pad(t.bus, time, ch, t.spb * 3.9, 0.05, 'warm', []);
        if (i % 8 === 0) ak().bassN(t.bus, time, ch[0] - 24, t.spb * 0.9, 0.2, 'sub');
        if (i % 4 === 2) ak().perc(t.bus, time, 'shaker', 0.07);
        if (i % 8 === 4) ak().snare(t.bus, time, 0.16, 'rim');
      },
      key(t, code) { const k = FROG_KEYS[code]; if (k == null) return; const ch = FROG_CHORDS[t.s.bar || 0]; ak().lead(t.bus, ak().now(), ch[k] + 12, 0.35, 0.12, 'flute', {}); ak().sfx(t.bus, 'croak', ak().now()); flash('f' + k); },
      tap(t, x, y) { FROG_POS.forEach((p, k) => { if (Math.hypot(x - p[0], y - p[1]) < 70) this.key(t, Object.keys(FROG_KEYS)[k]); }); },
      draw(t, now) {
        bg('#0f5e4a', '#57c785');
        FROG_POS.forEach((p, k) => { const on = lit(t, 'f' + k, now); c.fillStyle = '#2e8b57'; c.beginPath(); c.ellipse(p[0], p[1] + 38, 80, 24, 0, 0, 7); c.fill(); E('🐸', p[0], p[1] - (on ? 26 : 0), on ? 84 : 70); if (on) E('🎵', p[0] + 56, p[1] - 70, 34); text(['↑', '←', '→', '↓'][k], p[0], p[1] + 74, 22); });
      } },
    { id: 'looper', icon: '🎛️', title: 'ループメーカー', need: 8, bpm: 112,
      desc: 'マスを クリックして じぶんの ビートを つくろう！スペース = さいせい/ストップ、C = ぜんぶ けす、←→ = テンポ。',
      setup(t) { t.s.on = true; t.s.grid = SEQ_ROWS.map((_, r) => Array.from({ length: 16 }, (_, i) => (r === 0 ? i % 4 === 0 : r === 1 ? i % 8 === 4 : r === 2 ? i % 2 === 0 : false))); },
      step(t, i, time) { if (!t.s.on) return; const col = i % 16; t.s.col = col; SEQ_ROWS.forEach((row, r) => { if (t.s.grid[r][col]) row[1](t.bus, time, col); }); },
      key(t, code) {
        if (code === 'Space') t.s.on = !t.s.on;
        else if (code === 'KeyC') t.s.grid.forEach(r => r.fill(false));
        else if (code === 'ArrowRight') setBpm(t.bpm + 4); else if (code === 'ArrowLeft') setBpm(t.bpm - 4);
      },
      tap(t, x, y) { const col = Math.floor((x - 160) / 46), r = Math.floor((y - 130) / 64); if (col >= 0 && col < 16 && r >= 0 && r < SEQ_ROWS.length) { t.s.grid[r][col] = !t.s.grid[r][col]; if (t.s.grid[r][col]) SEQ_ROWS[r][1](t.bus, ak().now(), col); } },
      draw(t) {
        bg('#1b1b2f', '#3d2c8d');
        SEQ_ROWS.forEach((row, r) => { text(row[0], 150, 130 + r * 64 + 28, 15, '#fff', 'right'); for (let i = 0; i < 16; i++) box(160 + i * 46 + 3, 130 + r * 64 + 4, 40, 52, t.s.grid[r][i] ? (t.s.on && t.s.col === i ? '#fff' : '#ffd166') : (i % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.12)'), 8); });
        if (t.s.on && t.s.col != null) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(160 + t.s.col * 46 + 1, 128, 44, SEQ_ROWS.length * 64); }
        text((t.s.on ? '▶ さいせいちゅう' : '⏸ ストップ') + '　♪ BPM ' + t.bpm, 480, 490, 17);
      } },
    { id: 'echo', icon: '🦜', title: 'やまびこバード', need: 12, bpm: 104,
      desc: '「きみの ばん」の 1しょうせつで すきな リズムを たたく(スペース/どのキーでも)と、つぎの しょうせつで とりが そっくり まねするよ！',
      setup(t) { t.s.rec = []; t.s.play = []; },
      step(t, i, time) {
        if (i % 4 === 0) ak().kick(t.bus, time, i % 16 === 0 ? 0.45 : 0.3);
        if (i % 4 === 2) ak().hat(t.bus, time, 0.06);
        if (i % 32 === 16) { t.s.play = t.s.rec.slice(); t.s.rec = []; t.s.playT0 = time; for (const off of t.s.play) ak().sfx(t.bus, 'pip', time + off, { f: 1320, dur: 0.1 }); }   // とりの ばんの あたまで まとめて よやく
        if (i % 32 === 0) { t.s.recT0 = time; t.s.play = []; }
      },
      key(t) { const now = ak().now(), pos = beatPos(now) % 8; ak().sfx(t.bus, 'clap', now); flash('me'); if (pos < 4 && t.s.recT0 != null) t.s.rec.push(now - t.s.recT0); },
      tap(t) { this.key(t); },
      draw(t, now) {
        bg('#3a1c71', '#d76d77');
        const pos = beatPos(now) % 8, mine = pos < 4;
        E('⭐', 300, 320 - (lit(t, 'me', now) ? 24 : 0), 80);
        const sing = !mine && t.s.play.some(off => Math.abs(now - (t.s.playT0 + off)) < 0.12);
        E('🦜', 660, 320 - (sing ? 24 : 0), 80); if (sing) E('🎵', 720, 240, 36);
        text(mine ? '🎤 きみの ばん！' : '🦜 とりの ばん', 480, 120, 34, mine ? '#ffd166' : '#fff');
        for (let b = 0; b < 4; b++) { c.beginPath(); c.arc(390 + b * 60, 190, Math.floor(pos % 4) === b ? 14 : 9, 0, 7); c.fillStyle = Math.floor(pos % 4) === b ? '#fff' : 'rgba(255,255,255,.4)'; c.fill(); }
        const list = mine ? t.s.rec : t.s.play;
        list.forEach(off => { c.beginPath(); c.arc(240 + (off / (t.spb * 4)) * 480, 460, 8, 0, 7); c.fillStyle = mine ? '#ffd166' : '#fff'; c.fill(); });
        c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(240, 474, 480, 3);
      } },
    { id: 'metro', icon: '⏱️', title: 'メトロノームどうじょう', need: 16, bpm: 100,
      desc: 'クリックに あわせて スペースを たたくと、なんミリびょう ズレたか おしえてくれる れんしゅうどうぐ。←→ = テンポ±2、↑↓ = ±10。',
      setup(t) { t.s.hist = []; },
      step(t, i, time) { if (i % 4 === 0) ak().sfx(t.bus, 'count', time, { last: i % 16 === 0 }); },
      key(t, code) {
        if (code === 'ArrowRight') return setBpm(t.bpm + 2); if (code === 'ArrowLeft') return setBpm(t.bpm - 2);
        if (code === 'ArrowUp') return setBpm(t.bpm + 10); if (code === 'ArrowDown') return setBpm(t.bpm - 10);
        const now = ak().now(), p = beatPos(now), off = (p - Math.round(p)) * t.spb * 1000;
        ak().sfx(t.bus, 'tick', now); t.s.hist.push(off); if (t.s.hist.length > 16) t.s.hist.shift(); t.s.last = off; flash('tap');
      },
      tap(t) { this.key(t, 'Space'); },
      draw(t, now) {
        bg('#0b132b', '#3a506b');
        const p = beatPos(now), fr = p - Math.floor(p);
        c.save(); c.translate(480, 330); c.rotate(Math.sin(p * Math.PI) * 0.5); box(-5, -230, 10, 230, '#ffd166', 4); c.beginPath(); c.arc(0, -150, 18, 0, 7); c.fillStyle = '#ff6fa5'; c.fill(); c.restore();
        c.beginPath(); c.arc(480, 330, 16 + (1 - fr) * 8, 0, 7); c.fillStyle = '#fff'; c.fill();
        text('♪ BPM ' + t.bpm, 480, 60, 30);
        if (t.s.last != null) { const a = Math.abs(t.s.last); text((a < 25 ? '🎯 ピッタリ！ ' : t.s.last < 0 ? '⏪ はやい ' : '⏩ おそい ') + (t.s.last >= 0 ? '+' : '') + t.s.last.toFixed(0) + ' ms', 480, 400, 28, a < 25 ? '#7ee0a0' : a < 60 ? '#ffd166' : '#ff9f9f'); }
        t.s.hist.forEach((off, i) => { const h = clamp(off, -120, 120) * 0.4; box(250 + i * 29, off >= 0 ? 470 : 470 + h, 22, Math.abs(h) || 2, Math.abs(off) < 25 ? '#7ee0a0' : Math.abs(off) < 60 ? '#ffd166' : '#ff9f9f', 3); });
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(245, 469, 470, 2);
        if (t.s.hist.length) text('へいきんの ズレ ' + (t.s.hist.reduce((s, x) => s + Math.abs(x), 0) / t.s.hist.length).toFixed(0) + ' ms', 480, 515, 15);
      } },
    { id: 'fireworks', icon: '🎆', title: 'はなびキーボード', need: 20, bpm: 90,
      desc: 'A〜Z・0〜9 の どのキーでも はなびが あがる！キーの ばしょで おとの たかさが かわるよ。がめんを タップしても OK。',
      setup(t) { t.s.fw = []; },
      step(t, i, time) { if (i % 16 === 0) ak().pad(t.bus, time, [48, 55, 60, 64], t.spb * 3.9, 0.04, 'warm', []); if (i % 8 === 0) ak().kick(t.bus, time, 0.25, 'soft'); },
      launch(t, col, row) { const now = ak().now(); ak().bell(t.bus, now, penta(col + (3 - row) * 2) + 12, 0.1, 0.8); ak().sfx(t.bus, 'whoosh', now); t.s.fw.push({ x: 90 + col * 86, y: 110 + row * 70, t: now, hue: (col * 36 + row * 50) % 360 }); if (t.s.fw.length > 24) t.s.fw.shift(); },
      key(t, code) { const ch = code.replace(/^Key|^Digit/, ''); for (let r = 0; r < 4; r++) { const k = KB_ROWS[r].indexOf(ch); if (k >= 0 && ch.length === 1) this.launch(t, k, r); } },
      tap(t, x, y) { this.launch(t, clamp(Math.floor((x - 47) / 86), 0, 9), clamp(Math.floor((y - 75) / 70), 0, 3)); },
      draw(t, now) {
        bg('#05051a', '#1a1a40');
        for (const f of t.s.fw) { const age = now - f.t; if (age > 1.6) continue; const r = age * 110, a = Math.max(0, 1 - age / 1.6); c.fillStyle = `hsla(${f.hue},90%,65%,${a.toFixed(2)})`; for (let i = 0; i < 16; i++) { const ang = i / 16 * 6.283; c.beginPath(); c.arc(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r + age * age * 30, 4, 0, 7); c.fill(); } }
        text('どのキーでも はなびが あがるよ 🎆', 480, 500, 16);
      } },
    { id: 'bells', icon: '🔔', title: 'ハンドベル', need: 25, bpm: 100,
      desc: '1〜8 の すうじキーが ドレミファソラシド の ベル。ひかっている ベルを じゅんに ならすと きょくに なるよ！←→ = きょくを かえる。',
      setup(t) { t.s.song = 0; t.s.pos = 0; },
      key(t, code) {
        if (code === 'ArrowRight' || code === 'ArrowLeft') { t.s.song = (t.s.song + (code === 'ArrowRight' ? 1 : SONGS.length - 1)) % SONGS.length; t.s.pos = 0; return; }
        const m = /^Digit([1-8])$/.exec(code); if (!m) return;
        const n = Number(m[1]); ak().bell(t.bus, ak().now(), BELL_MIDI[n - 1] + 12, 0.13, 1.0); flash('b' + n);
        const seq = SONGS[t.s.song][1]; if (seq[t.s.pos] === n) { t.s.pos++; if (t.s.pos >= seq.length) { t.s.pos = 0; ak().sfx(t.bus, 'twinkle', ak().now() + 0.3); t.s.doneAt = ak().now(); } }
      },
      tap(t, x, y) { const i = Math.floor((x - 120) / 90); if (i >= 0 && i < 8 && y > 180 && y < 420) this.key(t, 'Digit' + (i + 1)); },
      draw(t, now) {
        bg('#7b2d26', '#f0a04b');
        const seq = SONGS[t.s.song][1], next = seq[t.s.pos];
        for (let i = 0; i < 8; i++) { const x = 165 + i * 90, on = lit(t, 'b' + (i + 1), now); if (next === i + 1) { c.beginPath(); c.arc(x, 300, 52, 0, 7); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill(); } c.beginPath(); c.arc(x, 300, 38, 0, 7); c.fillStyle = BELL_COL[i]; c.fill(); E('🔔', x, 300 - (on ? 14 : 0), on ? 50 : 42); text(String(i + 1), x, 370, 20); text('ドレミファソラシド'.match(/ファ|./g)[i], x, 400, 14); }
        text('♪ ' + SONGS[t.s.song][0] + '（←→ で きょくを かえる）　' + t.s.pos + ' / ' + seq.length, 480, 120, 18);
        if (t.s.doneAt && now - t.s.doneAt < 2) text('🎉 さいごまで えんそう できた！', 480, 190, 26, '#ffd166');
      } },
    /* ---------------- 第2弾(14しゅるい) ---------------- */
    { id: 'guitar', icon: '🎸', title: 'コードギター', need: 30, bpm: 96,
      desc: '1〜6 で コード(C・G・Am・F・Dm・Em)を えらんで、↓ か スペースで ジャラーン、↑ で アップストローク！',
      setup(t) { t.s.ch = 0; },
      step(t, i, time) { if (i % 8 === 0) ak().kick(t.bus, time, 0.3, 'soft'); if (i % 4 === 2) ak().perc(t.bus, time, 'shaker', 0.05); },
      strum(t, up) { const notes = GTR[t.s.ch][1].slice(); if (up) notes.reverse(); const now = ak().now(); notes.forEach((m, k) => ak().pluck(t.bus, now + k * 0.022, m, 0.09, (k - 2.5) * 0.12)); flash(up ? 'up' : 'down'); t.s.strumAt = now; },
      key(t, code) { const m = /^Digit([1-6])$/.exec(code); if (m) { t.s.ch = Number(m[1]) - 1; this.strum(t, false); return; } if (code === 'ArrowDown' || code === 'Space') this.strum(t, false); else if (code === 'ArrowUp') this.strum(t, true); },
      tap(t, x, y) { if (y < 170) { const i = Math.floor((x - 120) / 120); if (i >= 0 && i < 6) { t.s.ch = i; this.strum(t, false); } } else this.strum(t, y < 330); },
      draw(t, now) {
        bg('#5a3a1e', '#c98b4a');
        GTR.forEach((g, i) => { box(126 + i * 120, 90, 108, 60, i === t.s.ch ? '#ffd166' : 'rgba(255,255,255,.18)'); text((i + 1) + '  ' + g[0], 180 + i * 120, 120, 20, i === t.s.ch ? '#333' : '#fff'); });
        const age = t.s.strumAt ? now - t.s.strumAt : 9;
        for (let s2 = 0; s2 < 6; s2++) { const y = 240 + s2 * 32, wob = age < 0.5 ? Math.sin(now * 60 + s2) * 5 * (1 - age / 0.5) : 0; c.strokeStyle = '#f5e6c8'; c.lineWidth = 1.5 + s2 * 0.5; c.beginPath(); c.moveTo(100, y); c.quadraticCurveTo(480, y + wob, 860, y); c.stroke(); }
        E('🎸', 480, 470, 50); text('↓ / スペース = ダウン　↑ = アップ', 480, 200, 15);
      } },
    { id: 'beatbox', icon: '🎤', title: 'ビートボックス', need: 35, bpm: 92,
      desc: 'くちで ドラム！B = ブン、T = ツ、K = カッ、P = プシュ、D = ドゥン。スペースで メトロノーム。',
      setup(t) { t.s.metro = true; t.s.say = ''; },
      step(t, i, time) { if (t.s.metro && i % 4 === 0) ak().sfx(t.bus, 'tick', time); },
      key(t, code) {
        if (code === 'Space') { t.s.metro = !t.s.metro; return; }
        const b = BBOX.find(x => x[0] === code); if (!b) return;
        b[3](t.bus, ak().now()); t.s.say = b[2]; t.s.sayAt = ak().now(); flash('mouth');
      },
      tap(t, x, y) { const i = Math.floor((x - 130) / 140); if (y > 400 && i >= 0 && i < 5) this.key(t, BBOX[i][0]); },
      draw(t, now) {
        bg('#232526', '#414345');
        const on = lit(t, 'mouth', now);
        E(on ? '😮' : '😗', 480, 230, on ? 150 : 130); E('🎤', 600, 300, 60);
        if (t.s.sayAt && now - t.s.sayAt < 0.4) text(t.s.say, 480, 90, 44, '#ffd166');
        BBOX.forEach((b, i) => { box(136 + i * 140, 410, 128, 70, 'rgba(255,255,255,.16)'); text(b[1] + ' = ' + b[2], 200 + i * 140, 445, 18); });
        text('メトロノーム: ' + (t.s.metro ? 'ON' : 'OFF') + '（スペース）', 480, 510, 14);
      } },
    { id: 'rain', icon: '🌧️', title: 'あまおとオルゴール', need: 40, bpm: 80,
      desc: 'あめつぶが かってに メロディを かなでる いやしの おもちゃ。←→ = あめの つよさ、↑↓ = おとの たかさ。タップで しずくを おとせるよ。',
      setup(t) { t.s.den = 3; t.s.oct = 1; t.s.drops = []; t.s.r = Patterns.rngFor('rain'); },
      drop(t, time, col) { const m = penta(col + t.s.oct * 5); ak().bell(t.bus, time, m, 0.06, 1.2); t.s.drops.push({ x: 80 + col * 80, t: time }); if (t.s.drops.length > 40) t.s.drops.shift(); },
      step(t, i, time) { if (i % 16 === 0) ak().pad(t.bus, time, [48, 55, 64, 67], t.spb * 3.9, 0.035, 'warm', []); if (i % 2 === 0 && t.s.r() < t.s.den / 8) this.drop(t, time, Math.floor(t.s.r() * 11)); },
      key(t, code) { if (code === 'ArrowRight') t.s.den = clamp(t.s.den + 1, 0, 8); else if (code === 'ArrowLeft') t.s.den = clamp(t.s.den - 1, 0, 8); else if (code === 'ArrowUp') t.s.oct = clamp(t.s.oct + 1, 0, 3); else if (code === 'ArrowDown') t.s.oct = clamp(t.s.oct - 1, 0, 3); },
      tap(t, x) { this.drop(t, ak().now(), clamp(Math.floor((x - 40) / 80), 0, 10)); },
      draw(t, now) {
        bg('#1f3044', '#52688a');
        for (const d of t.s.drops) { const age = now - d.t; if (age < 0 || age > 1.4) continue; if (age < 0.4) E('💧', d.x, 60 + age / 0.4 * 360, 26); else { c.strokeStyle = `rgba(255,255,255,${(1 - (age - 0.4)).toFixed(2)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(d.x, 440, (age - 0.4) * 70, (age - 0.4) * 18, 0, 0, 7); c.stroke(); } }
        E('☁️', 200, 50, 70); E('☁️', 480, 40, 90); E('☁️', 760, 50, 70);
        text('あめの つよさ ' + '💧'.repeat(t.s.den) + '（←→）　たかさ ' + (t.s.oct + 1) + '（↑↓）', 480, 505, 15);
      } },
    { id: 'train', icon: '🚂', title: 'タップ きかんしゃ', need: 45, bpm: 100,
      desc: 'スペースを すきな はやさで たたくと、その テンポで きかんしゃが はしりだす！はやく たたけば はやく、ゆっくりなら ゆっくり。',
      setup(t) { t.s.taps = []; t.s.x = 0; },
      step(t, i, time) { if (i % 2 === 0) ak().noise(t.bus, time, { dur: 0.06, vol: i % 8 === 0 ? 0.16 : 0.08, hp: 800, lp: 3500 }); if (i % 32 === 28) ak().sfx(t.bus, 'whistle', time); },
      key(t) {
        const now = ak().now(); ak().sfx(t.bus, 'tick', now); flash('tap');
        t.s.taps = t.s.taps.filter(x => now - x < 3).concat(now);
        if (t.s.taps.length >= 3) { const iv = []; for (let k = 1; k < t.s.taps.length; k++) iv.push(t.s.taps[k] - t.s.taps[k - 1]); const avg = iv.reduce((a, b) => a + b, 0) / iv.length; if (avg > 0.2) setBpm(60 / avg); }
      },
      tap(t) { this.key(t); },
      draw(t, now) {
        bg('#87ceeb', '#d8f0c0');
        c.fillStyle = '#6b4f3a'; c.fillRect(0, 400, W, 10); for (let i = 0; i < 25; i++) c.fillRect(((i * 40 - (beatPos(now) * 40) % 40) + 960) % 960, 408, 10, 16);
        const bob = Math.abs(Math.sin(beatPos(now) * Math.PI)) * 6;
        E('🚂', 300, 360 - bob, 90); E('🚃', 420, 366 - bob * 0.6, 76); E('🚃', 520, 366 - bob * 0.4, 76);
        if (Math.floor(beatPos(now) * 2) % 2 === 0) E('💨', 250, 290 - bob, 36);
        text('♪ BPM ' + t.bpm, 480, 90, 40); text('スペースを 3かい いじょう たたくと テンポが かわるよ', 480, 150, 16);
      } },
    { id: 'taiko', icon: '🪘', title: 'おまつり だいこ', need: 50, bpm: 108,
      desc: 'F・J = ドン(まんなか)、D・K = カッ(ふち)。おはやしに あわせて じゆうに たたこう！',
      step(t, i, time) { if (i % 16 === 0) ak().perc(t.bus, time, 'woodblock', 0.1); if (i % 4 === 2) ak().perc(t.bus, time, 'clave', 0.05); if (i % 16 === 0) { const m = [72, 74, 77, 79][Math.floor(i / 16) % 4]; ak().lead(t.bus, time, m, t.spb * 1.8, 0.05, 'flute', {}); } },
      key(t, code) {
        const now = ak().now();
        if (code === 'KeyF' || code === 'KeyJ') { ak().perc(t.bus, now, 'timpani', 0.2); ak().kick(t.bus, now, 0.5); t.s.say = 'ドン！'; flash('don'); }
        else if (code === 'KeyD' || code === 'KeyK') { ak().perc(t.bus, now, 'woodblock', 0.22); ak().snare(t.bus, now, 0.12, 'rim'); t.s.say = 'カッ！'; flash('ka'); }
        else return; t.s.sayAt = now;
      },
      tap(t, x, y) { this.key(t, Math.hypot(x - 480, y - 300) < 110 ? 'KeyF' : 'KeyD'); },
      draw(t, now) {
        bg('#7a1f1f', '#e08e45');
        for (let i = 0; i < 7; i++) E('🏮', 90 + i * 130, 70 + Math.sin(now * 2 + i) * 5, 40);
        c.beginPath(); c.arc(480, 300, 150, 0, 7); c.fillStyle = lit(t, 'ka', now) ? '#ffd166' : '#8b1a1a'; c.fill();
        c.beginPath(); c.arc(480, 300, 110, 0, 7); c.fillStyle = lit(t, 'don', now) ? '#fff' : '#f5e6c8'; c.fill();
        text('F J = ドン', 480, 300, 22, '#8b1a1a'); text('D K = カッ', 480, 470, 18);
        if (t.s.sayAt && now - t.s.sayAt < 0.35) text(t.s.say, 760, 220, 46, '#ffd166');
      } },
    { id: 'arp', icon: '🎹', title: 'アルペジエーター', need: 60, bpm: 120,
      desc: 'A〜K で おとを ON/OFF すると、えらんだ おとを きかいが 16ぶおんぷで くりかえす！↑↓ = ならしかた、←→ = テンポ、C = ぜんぶ けす。',
      setup(t) { t.s.on = [true, false, true, false, true, false, false, true]; t.s.mode = 0; t.s.k = 0; },
      step(t, i, time) {
        const act = t.s.on.map((v, k) => (v ? k : -1)).filter(k => k >= 0); if (!act.length) return;
        const n = act.length, mode = t.s.mode; let idx;
        if (mode === 0) idx = i % n; else if (mode === 1) idx = n - 1 - (i % n); else if (mode === 2) { const p = n > 1 ? i % (2 * n - 2) : 0; idx = p < n ? p : 2 * n - 2 - p; } else idx = Math.floor(t.s.r ? t.s.r() * n : 0);
        const k = act[idx]; t.s.cur = k; ak().pluck(t.bus, time, WHITE[k][1] + 12, 0.07, (k - 3.5) * 0.15);
        if (i % 4 === 0) ak().kick(t.bus, time, 0.3); if (i % 4 === 2) ak().hat(t.bus, time, 0.05);
      },
      key(t, code) {
        if (!t.s.r) t.s.r = Patterns.rngFor('arp');
        const k = WHITE.findIndex(w => w[0] === code); if (k >= 0) { t.s.on[k] = !t.s.on[k]; return; }
        if (code === 'ArrowUp') t.s.mode = (t.s.mode + 1) % 4; else if (code === 'ArrowDown') t.s.mode = (t.s.mode + 3) % 4; else if (code === 'ArrowRight') setBpm(t.bpm + 4); else if (code === 'ArrowLeft') setBpm(t.bpm - 4); else if (code === 'KeyC') t.s.on.fill(false);
      },
      tap(t, x, y) { const i = Math.floor((x - 170) / 80); if (i >= 0 && i < 8 && y > 160) this.key(t, WHITE[i][0]); },
      draw(t) {
        bg('#0f2027', '#2c5364');
        WHITE.forEach((w, i) => { box(172 + i * 80, 200, 76, 220, t.s.on[i] ? (t.s.cur === i ? '#fff' : '#ffd166') : 'rgba(255,255,255,.14)', 10); text(w[0].slice(3), 210 + i * 80, 390, 20, t.s.on[i] ? '#333' : '#fff'); text('ドレミファソラシド'.match(/ファ|./g)[i], 210 + i * 80, 230, 15, t.s.on[i] ? '#333' : '#fff'); });
        text('ならしかた（↑↓）: ' + ['のぼり', 'くだり', 'いったりきたり', 'ランダム'][t.s.mode] + '　♪ BPM ' + t.bpm + '（←→）', 480, 130, 17);
      } },
    { id: 'bubbles', icon: '🫧', title: 'シャボンだま', need: 70, bpm: 100,
      desc: 'どのキーでも(タップでも) シャボンだまが うまれて、つぎの 8ぶおんぷで「ぽん！」と はじける。てきとうに おしても リズムに なるよ！',
      setup(t) { t.s.b = []; },
      add(t, x, y) { const now = ak().now(); t.s.b.push({ x, y, t: now, pop: null, hue: Math.floor(x / 960 * 300) }); if (t.s.b.length > 30) t.s.b.shift(); },
      step(t, i, time) {
        if (i % 4 === 0) ak().kick(t.bus, time, 0.22, 'soft');
        if (i % 2 === 0) { const q = t.s.b.find(b => b.pop == null && b.t < time - 0.05); if (q) { q.pop = time; ak().lead(t.bus, time, penta(Math.floor(q.x / 960 * 10)) + 12, 0.25, 0.1, 'marimba', {}); ak().sfx(t.bus, 'plip', time); } }
      },
      key(t, code) { const ch = code.replace(/^Key|^Digit/, ''); let col = 5, row = 1; for (let r = 0; r < 4; r++) { const k = KB_ROWS[r].indexOf(ch); if (k >= 0 && ch.length === 1) { col = k; row = r; } } this.add(t, 90 + col * 86, 380 - row * 50); },
      tap(t, x, y) { this.add(t, x, y); },
      draw(t, now) {
        bg('#89f7fe', '#66a6ff');
        for (const b of t.s.b) {
          if (b.pop != null && now >= b.pop) { const a = now - b.pop; if (a < 0.3) { c.strokeStyle = `hsla(${b.hue},90%,85%,${(1 - a / 0.3).toFixed(2)})`; c.lineWidth = 3; for (let k = 0; k < 8; k++) { const an = k / 8 * 6.283; c.beginPath(); c.moveTo(b.x + Math.cos(an) * 20, b.yy + Math.sin(an) * 20); c.lineTo(b.x + Math.cos(an) * (30 + a * 80), b.yy + Math.sin(an) * (30 + a * 80)); c.stroke(); } } continue; }
          const age = now - b.t; b.yy = b.y - age * 40; const r = 18 + Math.min(14, age * 20);
          c.beginPath(); c.arc(b.x + Math.sin(age * 3) * 8, b.yy, r, 0, 7); c.fillStyle = `hsla(${b.hue},90%,85%,.45)`; c.fill(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.stroke();
        }
        text('どのキーでも シャボンだま 🫧', 480, 505, 16);
      } },
    { id: 'dj', icon: '🎚️', title: 'DJミキサー', need: 80, bpm: 118,
      desc: '1 = ドラム、2 = ベース、3 = コード、4 = メロディ を ON/OFF して じぶんの ミックスを つくろう！スペース = もりあげ、←→ = テンポ。',
      setup(t) { t.s.on = [true, true, false, false]; t.s.mel = [0, 2, 4, 2, 5, 4, 2, 0, 4, 5, 7, 5, 4, 2, 4, 0]; },
      step(t, i, time) {
        const bar = Math.floor(i / 16) % 4, ch = FROG_CHORDS[bar], s16 = i % 16;
        if (t.s.on[0]) { if (s16 % 4 === 0) ak().kick(t.bus, time, 0.5); if (s16 % 8 === 4) ak().snare(t.bus, time, 0.25, 'clap'); if (s16 % 2 === 0) ak().hat(t.bus, time, s16 % 4 === 2 ? 0.08 : 0.04, s16 % 8 === 6); }
        if (t.s.on[1] && s16 % 2 === 0) ak().bassN(t.bus, time, ch[0] - 24 + (s16 % 4 === 2 ? 12 : 0), t.spb * 0.4, 0.2, 'saw');
        if (t.s.on[2] && (s16 === 0 || s16 === 6 || s16 === 10)) ak().stab(t.bus, time, ch, 0.2, 0.06, 'epiano');
        if (t.s.on[3] && s16 % 2 === 0) { const d = t.s.mel[(i / 2) % 16 | 0]; ak().lead(t.bus, time, penta(5 + d % 8), t.spb * 0.45, 0.06, 'saw', {}); }
        if (t.s.fill && i >= t.s.fill && i < t.s.fill + 8) ak().snare(t.bus, time, 0.1 + (i - t.s.fill) * 0.03, 'tight');
        if (t.s.fill && i === t.s.fill + 8) { ak().crash(t.bus, time, 0.2); t.s.fill = 0; }
        t.s.i = i;
      },
      key(t, code) { const m = /^Digit([1-4])$/.exec(code); if (m) { const k = Number(m[1]) - 1; t.s.on[k] = !t.s.on[k]; flash('l' + k); } else if (code === 'Space') { t.s.fill = Math.ceil(((t.s.i || 0) + 1) / 8) * 8; ak().riser(t.bus, ak().now(), t.spb * 2, 0.1); } else if (code === 'ArrowRight') setBpm(t.bpm + 4); else if (code === 'ArrowLeft') setBpm(t.bpm - 4); },
      tap(t, x, y) { const i = Math.floor((x - 140) / 170); if (i >= 0 && i < 4 && y > 330) this.key(t, 'Digit' + (i + 1)); else if (y < 300) this.key(t, 'Space'); },
      draw(t, now) {
        bg('#200122', '#6f0000');
        const rot = beatPos(now) * 0.8;
        for (const x of [300, 660]) { c.save(); c.translate(x, 200); c.rotate(rot); c.beginPath(); c.arc(0, 0, 110, 0, 7); c.fillStyle = '#111'; c.fill(); c.fillStyle = '#ffd166'; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(-3, -108, 6, 40); c.restore(); }
        ['🥁 ドラム', '🎸 ベース', '🎹 コード', '🎺 メロディ'].forEach((n, i) => { box(146 + i * 170, 350, 158, 90, t.s.on[i] ? '#7ee0a0' : 'rgba(255,255,255,.14)'); text((i + 1) + '  ' + n, 225 + i * 170, 395, 18, t.s.on[i] ? '#113' : '#fff'); });
        text('スペース = もりあげ　♪ BPM ' + t.bpm + '（←→）', 480, 490, 16);
      } },
    { id: 'dice', icon: '🎲', title: 'サイコロ メロディ', need: 90, bpm: 110,
      desc: 'スペースで サイコロを ふると、あたらしい メロディが うまれて ループする！↑↓ = たかさ、←→ = テンポ、R = ぎゃくさいせい。',
      setup(t) { t.s.r = Patterns.rngFor('dice' + Math.floor(ak().now() * 1000)); t.s.tr = 0; this.roll(t); },
      roll(t) { let p = 4; t.s.mel = Array.from({ length: 8 }, () => { p = clamp(p + Math.floor(t.s.r() * 5) - 2, 0, 9); return t.s.r() < 0.15 ? -1 : p; }); t.s.rollAt = ak().now(); },
      step(t, i, time) { if (i % 2) return; const k = (i / 2) % 8; t.s.cur = k; const d = t.s.mel[k]; if (d >= 0) ak().lead(t.bus, time, penta(d + 3) + t.s.tr, t.spb * 0.45, 0.09, 'epiano', {}); if (i % 8 === 0) ak().kick(t.bus, time, 0.3, 'soft'); if (i % 8 === 4) ak().perc(t.bus, time, 'shaker', 0.08); },
      key(t, code) { if (code === 'Space') { this.roll(t); ak().sfx(t.bus, 'shk', ak().now()); } else if (code === 'KeyR') t.s.mel.reverse(); else if (code === 'ArrowUp') t.s.tr = clamp(t.s.tr + 1, -12, 12); else if (code === 'ArrowDown') t.s.tr = clamp(t.s.tr - 1, -12, 12); else if (code === 'ArrowRight') setBpm(t.bpm + 4); else if (code === 'ArrowLeft') setBpm(t.bpm - 4); },
      tap(t) { this.key(t, 'Space'); },
      draw(t, now) {
        bg('#134e5e', '#71b280');
        const spin = t.s.rollAt && now - t.s.rollAt < 0.4;
        t.s.mel.forEach((d, k) => { const x = 165 + k * 90; box(x - 38, 200, 76, 200, 'rgba(255,255,255,.12)'); if (d >= 0) { c.beginPath(); c.arc(x, 380 - d * 18, t.s.cur === k ? 18 : 13, 0, 7); c.fillStyle = t.s.cur === k ? '#fff' : '#ffd166'; c.fill(); } else text('・', x, 300, 20); });
        E('🎲', 480, 120, spin ? 80 + Math.sin(now * 40) * 10 : 70);
        text('スペース = ふりなおす　R = ぎゃく　たかさ ' + (t.s.tr >= 0 ? '+' : '') + t.s.tr + '（↑↓）　♪ BPM ' + t.bpm, 480, 470, 15);
      } },
    { id: 'glass', icon: '🥂', title: 'グラスハープ', need: 100, bpm: 72,
      desc: '1〜8 の グラスを ならそう。↑↓ で さいごに ならした グラスの みずの りょうが かわって、おとの たかさも かわるよ！',
      setup(t) { t.s.w = BELL_MIDI.map(m => m + 12); t.s.sel = 0; },
      ring(t, k) { t.s.sel = k; const f = ak().mtof(t.s.w[k]); ak().osc(t.bus, ak().now(), { type: 'sine', f, dur: 1.6, vol: 0.14, attack: 0.08 }); ak().osc(t.bus, ak().now(), { type: 'sine', f: f * 2.01, dur: 1.0, vol: 0.04, attack: 0.1 }); flash('g' + k); },
      key(t, code) { const m = /^Digit([1-8])$/.exec(code); if (m) { this.ring(t, Number(m[1]) - 1); return; } if (code === 'ArrowUp') { t.s.w[t.s.sel] = clamp(t.s.w[t.s.sel] - 1, 60, 96); this.ring(t, t.s.sel); } else if (code === 'ArrowDown') { t.s.w[t.s.sel] = clamp(t.s.w[t.s.sel] + 1, 60, 96); this.ring(t, t.s.sel); } },
      tap(t, x, y) { const i = Math.floor((x - 120) / 90); if (i >= 0 && i < 8 && y > 150) this.ring(t, i); },
      draw(t, now) {
        bg('#2c3e50', '#bdc3c7');
        for (let i = 0; i < 8; i++) {
          const x = 165 + i * 90, lvl = clamp((96 - t.s.w[i]) / 36, 0.08, 1), on = lit(t, 'g' + i, now), wob = on ? Math.sin(now * 50) * 2 : 0;
          c.strokeStyle = i === t.s.sel ? '#ffd166' : '#fff'; c.lineWidth = 3; c.strokeRect(x - 30 + wob, 180, 60, 200);
          c.fillStyle = 'rgba(120,200,255,.65)'; c.fillRect(x - 28 + wob, 378 - 196 * lvl, 56, 196 * lvl);
          c.fillStyle = '#fff'; c.fillRect(x - 3, 380, 6, 50); c.fillRect(x - 24, 430, 48, 6);
          text(String(i + 1), x, 465, 20);
        }
        text('↑ = みずを ふやす(ひくく)　↓ = へらす(たかく)', 480, 120, 16);
      } },
    { id: 'clap10', icon: '👏', title: '10びょう れんだ', need: 110, bpm: 100,
      desc: 'スペース(どのキーでも)を 10びょうかんで なんかい たたける？さいしょの 1かいで スタート！',
      setup(t) { t.s.n = 0; t.s.best = 0; t.s.start = null; },
      key(t) {
        const now = ak().now();
        if (t.s.start != null && now - t.s.start >= 10) { if (now - t.s.start < 11.5) return; t.s.start = null; }
        if (t.s.start == null) { t.s.start = now; t.s.n = 0; }
        t.s.n++; ak().sfx(t.bus, 'clap', now); flash('c');
      },
      tap(t) { this.key(t); },
      draw(t, now) {
        bg('#f12711', '#f5af19');
        const el = t.s.start == null ? 0 : Math.min(10, now - t.s.start), done2 = t.s.start != null && el >= 10;
        if (done2 && t.s.n > t.s.best) { t.s.best = t.s.n; ak().sfx(t.bus, 'twinkle', now); }
        E('👏', 480, 250, lit(t, 'c', now) ? 170 : 140);
        text(String(t.s.n) + ' かい', 480, 90, 56);
        box(180, 400, 600, 24, 'rgba(0,0,0,.3)', 12); box(180, 400, 600 * (el / 10), 24, '#fff', 12);
        text(t.s.start == null ? 'たたくと スタート！' : done2 ? '⏰ おわり！ 1びょうに ' + (t.s.n / 10).toFixed(1) + ' かい　（もういちど たたくと リトライ）' : 'のこり ' + (10 - el).toFixed(1) + ' びょう', 480, 455, 18);
        text('🏆 きょうの ベスト ' + t.s.best + ' かい', 480, 500, 15);
      } },
    { id: 'parade', icon: '🎺', title: 'パレード マーチ', need: 120, bpm: 116,
      desc: 'A = ラッパ、S = こだいこ、D = おおだいこ、F = シンバル。おすと つぎの しょうせつの あたまから その パートが 1しょうせつ えんそうする！',
      setup(t) { t.s.q = [0, 0, 0, 0]; t.s.play = [0, 0, 0, 0]; },
      step(t, i, time) {
        const s16 = i % 16, bar = Math.floor(i / 16);
        if (s16 === 0) { t.s.play = t.s.q.map((q, k) => (q ? bar : t.s.play[k])); t.s.q = [0, 0, 0, 0]; }
        if (s16 % 8 === 0) ak().bassN(t.bus, time, 36 + (s16 ? 7 : 0), t.spb * 0.8, 0.16, 'sub');
        const on = k => t.s.play[k] === bar && bar > 0;
        if (on(0) && [0, 3, 4, 8, 10, 12].includes(s16)) ak().lead(t.bus, time, [72, 72, 76, 79, 76, 84][[0, 3, 4, 8, 10, 12].indexOf(s16)], t.spb * 0.4, 0.09, 'brass', {});
        if (on(1) && (s16 % 2 === 0 || s16 >= 12)) ak().snare(t.bus, time, s16 >= 12 ? 0.12 : 0.2, 'tight');
        if (on(2) && s16 % 4 === 0) ak().perc(t.bus, time, 'timpani', 0.16);
        if (on(3) && (s16 === 0 || s16 === 8)) ak().crash(t.bus, time, 0.14);
        t.s.bar = bar;
      },
      key(t, code) { const k = ['KeyA', 'KeyS', 'KeyD', 'KeyF'].indexOf(code); if (k >= 0) { t.s.q[k] = 1; flash('q' + k); ak().sfx(t.bus, 'uiclick', ak().now()); } },
      tap(t, x) { const k = clamp(Math.floor((x - 100) / 190), 0, 3); this.key(t, ['KeyA', 'KeyS', 'KeyD', 'KeyF'][k]); },
      draw(t, now) {
        bg('#56ccf2', '#2f80ed');
        c.fillStyle = '#7ed957'; c.fillRect(0, 400, W, 140);
        [['🎺', 'A ラッパ'], ['🥁', 'S こだいこ'], ['🪘', 'D おおだいこ'], ['💥', 'F シンバル']].forEach((p, k) => {
          const x = 195 + k * 190, playing = t.s.play[k] === t.s.bar && t.s.bar > 0, queued = !!t.s.q[k];
          const step2 = Math.abs(Math.sin(beatPos(now) * Math.PI)) * (playing ? 22 : 6);
          E('🧍', x, 330 - step2, 70); E(p[0], x + 34, 300 - step2, playing ? 56 : 40);
          text(p[1], x, 440, 17, playing ? '#ffd166' : '#fff'); if (queued) text('つぎの しょうせつ！', x, 470, 13, '#fff');
        });
      } },
    { id: 'xy', icon: '🌈', title: 'にじいろ シンセ', need: 135, bpm: 124,
      desc: 'がめんを タップした ばしょで おとが きまる！よこ = たかさ、たて = ねいろの あかるさ。スペース = ならす/とめる、やじるしキーでも うごかせるよ。',
      setup(t) { t.s.x = 480; t.s.y = 270; t.s.on = true; t.s.trail = []; },
      step(t, i, time) {
        if (i % 4 === 0) ak().kick(t.bus, time, 0.3); if (i % 4 === 2) ak().hat(t.bus, time, 0.05);
        if (!t.s.on) return;
        const deg = Math.floor(t.s.x / 960 * 12), bright = 1 - t.s.y / 540, up = [0, 2, 1, 3][i % 4];
        ak().lead(t.bus, time, penta(deg + up), t.spb * 0.22, 0.05 + bright * 0.04, bright > 0.66 ? 'saw' : bright > 0.33 ? 'chip' : 'marimba', {});
      },
      key(t, code) { if (code === 'Space') t.s.on = !t.s.on; else if (code === 'ArrowLeft') t.s.x = clamp(t.s.x - 80, 0, 959); else if (code === 'ArrowRight') t.s.x = clamp(t.s.x + 80, 0, 959); else if (code === 'ArrowUp') t.s.y = clamp(t.s.y - 60, 0, 539); else if (code === 'ArrowDown') t.s.y = clamp(t.s.y + 60, 0, 539); },
      tap(t, x, y) { t.s.x = clamp(x, 0, 959); t.s.y = clamp(y, 0, 539); },
      draw(t, now) {
        for (let i = 0; i < 12; i++) { c.fillStyle = `hsl(${i * 30},70%,${t.s.on && Math.floor(t.s.x / 80) === i ? 60 : 38}%)`; c.fillRect(i * 80, 0, 80, H); }
        t.s.trail.push({ x: t.s.x, y: t.s.y, t: now }); if (t.s.trail.length > 30) t.s.trail.shift();
        for (const p of t.s.trail) { c.beginPath(); c.arc(p.x, p.y, 10 + (now - p.t) * 30, 0, 7); c.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.6 - (now - p.t)).toFixed(2)})`; c.lineWidth = 2; c.stroke(); }
        c.beginPath(); c.arc(t.s.x, t.s.y, 18 + Math.abs(Math.sin(beatPos(now) * Math.PI * 2)) * 6, 0, 7); c.fillStyle = '#fff'; c.fill();
        text((t.s.on ? '▶ なっている' : '⏸ とまっている') + '（スペース）', 480, 510, 16);
      } },
    { id: 'fortune', icon: '🔮', title: 'リズムうらない', need: 150, bpm: 100,
      desc: 'スペースを おなじ はやさで 8かい たたこう。どれだけ あんていして たたけたかで きょうの リズムうんせいを うらなうよ！',
      setup(t) { t.s.taps = []; t.s.res = null; },
      key(t) {
        const now = ak().now();
        if (t.s.res) { if (now - t.s.resAt < 1) return; t.s.res = null; t.s.taps = []; }
        if (t.s.taps.length && now - t.s.taps[t.s.taps.length - 1] > 3) t.s.taps = [];
        t.s.taps.push(now); ak().sfx(t.bus, 'tick', now); flash('orb');
        if (t.s.taps.length >= 8) {
          const iv = []; for (let k = 1; k < 8; k++) iv.push(t.s.taps[k] - t.s.taps[k - 1]);
          const avg = iv.reduce((a, b) => a + b, 0) / iv.length, sd = Math.sqrt(iv.reduce((a, b) => a + (b - avg) * (b - avg), 0) / iv.length) * 1000;
          const rank = sd < 12 ? ['🌟 だいだいきち', 'メトロノームの うまれかわり！'] : sd < 25 ? ['🎉 だいきち', 'きょうは ぜっこうちょう！'] : sd < 45 ? ['😊 ちゅうきち', 'いい ノリだね！'] : sd < 80 ? ['🙂 しょうきち', 'かたの ちからを ぬいてみよう'] : ['🍀 すえきち', 'ゆっくり いきを すって もういちど'];
          t.s.res = { rank, sd, bpm: 60 / avg }; t.s.resAt = now; ak().sfx(t.bus, 'twinkle', now + 0.1);
        }
      },
      tap(t) { this.key(t); },
      draw(t, now) {
        bg('#0f0c29', '#302b63');
        E('🔮', 480, 250, lit(t, 'orb', now) ? 170 : 150);
        if (t.s.res) { text(t.s.res.rank[0], 480, 90, 44, '#ffd166'); text(t.s.res.rank[1], 480, 400, 22); text('ズレの ばらつき ' + t.s.res.sd.toFixed(0) + ' ms　テンポ ' + t.s.res.bpm.toFixed(0) + ' BPM　（たたくと もういちど）', 480, 450, 15); }
        else { text('あと ' + (8 - t.s.taps.length) + ' かい', 480, 90, 36); for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(305 + k * 50, 420, 12, 0, 7); c.fillStyle = k < t.s.taps.length ? '#ffd166' : 'rgba(255,255,255,.3)'; c.fill(); } }
      } },
  ];
  const byKey = id => LIST.find(x => x.id === id);   // ※ おもちゃの なまえは id(key は キー入力の 関数)

  /* ---------------- わくぐみ ---------------- */
  const beatPos = now => (now - T.t0) / T.spb;
  function setBpm(v) {   // いまの拍を うごかさずに テンポを かえる
    const now = ak().now(), p = beatPos(now);
    T.bpm = clamp(Math.round(v), 40, 240); T.spb = 60 / T.bpm;
    T.t0 = now - p * T.spb;
    T.stepI = Math.ceil(p * 4 - 1e-6);
  }
  function overlay() { return document.getElementById('game-overlay'); }
  function open(key, onExit) {
    close(true);
    const def = byKey(key); if (!def) return;
    T = { def, onExit, s: {}, lit: {}, bus: null, raf: 0, timer: null, phase: 'intro', bpm: def.bpm || 100, spb: 60 / (def.bpm || 100), t0: 0, stepI: 0 };
    overlay().innerHTML = `
      <div class="card intro">
        <div class="g-icon">${def.icon}</div>
        <h2>${def.title}</h2>
        <p class="desc">${def.desc}</p>
        <p class="meta">🧸 リズムおもちゃ（スコアは ないよ。すきなだけ あそぼう！）</p>
        <button class="go-btn" id="btn-toy-go">▶ あそぶ</button>
        <p class="hint">Esc か 右上の ✕ = もどる</p>
      </div>`;
    const b = document.getElementById('btn-toy-go'); if (b) b.addEventListener('click', start);
    T.raf = requestAnimationFrame(loop);
  }
  function start() {
    if (!T || T.phase !== 'intro') return;
    overlay().innerHTML = '';
    ak().ensure();
    T.bus = ak().newBus(0.9);
    T.t0 = ak().now() + 0.2; T.stepI = 0;
    if (T.def.setup) T.def.setup(T);
    T.timer = setInterval(schedule, 25);
    T.phase = 'play';
  }
  function schedule() {
    if (!T || T.phase !== 'play') return;
    const horizon = ak().now() + 0.12;
    let guard = 0;
    while (T.t0 + T.stepI * T.spb / 4 < horizon && guard++ < 64) {
      const time = T.t0 + T.stepI * T.spb / 4;
      if (T.def.step) { try { T.def.step(T, T.stepI, time); } catch (e) { /* audio glitch は むし */ } }
      T.stepI++;
    }
  }
  function close(silent) {
    if (!T) return;
    const cb = T.onExit;
    if (T.timer) clearInterval(T.timer);
    if (T.raf) cancelAnimationFrame(T.raf);
    if (T.bus) ak().killBus(T.bus);
    overlay().innerHTML = '';
    T = null;
    if (!silent && cb) cb();
  }
  function loop() {
    if (!T) return;
    const now = ak().now();
    if (T.phase === 'play') {
      T.def.draw(T, now);
      text(T.def.icon + ' ' + T.def.title, 16, 24, 18, '#fff', 'left');
      c.beginPath(); c.arc(924, 36, 22, 0, 7); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
      text('✕', 924, 37, 20);
    } else { bg('#2b1b4a', '#6b3fa0'); }
    if (T) T.raf = requestAnimationFrame(loop);
  }
  function init(canvas) {
    cv = canvas; c = cv.getContext('2d');
    window.addEventListener('keydown', e => {
      if (!T) return;
      if (e.code === 'Escape') { e.preventDefault(); close(); return; }
      if (e.repeat) return;
      if (T.phase === 'intro') { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); start(); } return; }
      e.preventDefault();
      T.def.key(T, e.code);
    });
    cv.addEventListener('pointerdown', e => {
      if (!T || T.phase !== 'play') return;
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const x = (e.clientX - rect.left) * W / rect.width, y = (e.clientY - rect.top) * H / rect.height;
      if (Math.hypot(x - 924, y - 36) < 30) { close(); return; }
      if (T.def.tap) T.def.tap(T, x, y);
    });
  }
  return { LIST, init, open, close, isOpen: () => !!T, byKey };
})();
