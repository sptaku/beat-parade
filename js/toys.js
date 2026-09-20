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

  /* ---------------- おもちゃ 8しゅるい ---------------- */
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
