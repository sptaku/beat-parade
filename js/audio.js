'use strict';
/* AudioKit: Web Audio だけで全ての音（BGM・キュー音・効果音）を合成する。
   マスターにコンプレッサ、リバーブ/テンポ同期ディレイのセンド、ステレオパン、
   フィルターエンベロープつきの楽器群で「打ち込み感」を出す。 */
const AudioKit = (() => {
  let ctx = null, master = null, noiseBuf = null, reverbIn = null, delayIn = null, delayNode = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.85;
      // マスターコンプレッサ: 音数が増えても割れず、まとまりが出る
      if (ctx.createDynamicsCompressor) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
        master.connect(comp); comp.connect(ctx.destination);
      } else master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // リバーブ(ノイズ減衰で生成したIRのコンボルバ)。全バスから薄くセンド
      const irLen = Math.floor(ctx.sampleRate * 1.8);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const dd = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      reverbIn = ctx.createGain(); reverbIn.gain.value = 0.28;
      reverbIn.connect(conv); conv.connect(master);
      // テンポ同期ディレイ(リード・アルペジオ・スタブが送る)。曲ごとに setDelay で拍に合わせる
      if (ctx.createDelay) {
        delayIn = ctx.createGain(); delayIn.gain.value = 1;
        delayNode = ctx.createDelay(2.0); delayNode.delayTime.value = 0.3;
        const fb = ctx.createGain(); fb.gain.value = 0.32;
        const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
        const wet = ctx.createGain(); wet.gain.value = 0.5;
        delayIn.connect(delayNode); delayNode.connect(dlp); dlp.connect(fb); fb.connect(delayNode); dlp.connect(wet); wet.connect(master);
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const now = () => ensure().currentTime;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function setDelay(sec) { ensure(); if (delayNode) delayNode.delayTime.setValueAtTime(Math.min(1.5, Math.max(0.05, sec)), ctx.currentTime); }

  function newBus(vol = 1) {
    ensure();
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(master);
    g.connect(reverbIn);
    return g;
  }
  function killBus(bus) { try { bus.disconnect(); } catch (e) { /* already dead */ } }

  /* ---- 共通部品 ---- */
  const outNode = (dest, pan) => {   // パンつきの出口(未対応ブラウザは そのまま)
    if (!pan || !ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest); return p;
  };
  function sendDelay(node, amt) { if (!delayIn || !amt) return; const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(delayIn); }
  function env(t, peak, attack, sustain, dur) {   // ADSR風: attack→peak, dur*0.7 で peak*sustain, dur で消える
    const g = ctx.createGain();
    const a = Math.min(attack, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * sustain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function osc(bus, t, { type = 'sine', f = 440, f2 = null, dur = 0.2, vol = 0.3, glideT = null, attack = 0.005 }) {
    ensure();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f), t);
    if (f2 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + (glideT || dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(bus, t, { dur = 0.1, vol = 0.3, hp = null, lp = null, attack = 0.001 }) {
    ensure();
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    let node = s;
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  /* ---- ドラム ---- */
  function kick(bus, t, vol = 0.5, style = 'punch') {
    if (style === '808') {   // ヒップホップ: ながく のびる サブ
      osc(bus, t, { type: 'sine', f: 160, f2: 45, dur: 0.55, vol: vol * 1.1, glideT: 0.09 });
      osc(bus, t, { type: 'square', f: 80, f2: 40, dur: 0.02, vol: vol * 0.2, glideT: 0.02 });
      return;
    }
    if (style === 'soft') {   // フォーク/ローファイ: まるい キック
      osc(bus, t, { type: 'sine', f: 150, f2: 50, dur: 0.22, vol: vol * 0.9, glideT: 0.1 });
      noise(bus, t, { dur: 0.01, vol: vol * 0.15, hp: 2000 });
      return;
    }
    osc(bus, t, { type: 'sine', f: 175, f2: 42, dur: 0.2, vol, glideT: 0.12 });
    osc(bus, t, { type: 'square', f: 90, f2: 40, dur: 0.03, vol: vol * 0.25, glideT: 0.03 });   // アタックのパンチ
    noise(bus, t, { dur: 0.012, vol: vol * 0.35, hp: 3000 });                                   // クリック
  }
  function snare(bus, t, vol = 0.28, style = 'snare') {
    if (style === 'tight') { osc(bus, t, { type: 'triangle', f: 240, f2: 180, dur: 0.06, vol: vol * 0.7 }); noise(bus, t, { dur: 0.09, vol: vol * 0.9, hp: 1500, lp: 9000 }); return; }
    if (style === 'big') {   // シンセウェーブ: ながい ゲートリバーブ風の しっぽ
      osc(bus, t, { type: 'triangle', f: 200, f2: 140, dur: 0.12, vol: vol * 0.7 });
      noise(bus, t, { dur: 0.2, vol, hp: 800, lp: 7000 });
      noise(bus, t + 0.02, { dur: 0.34, vol: vol * 0.45, hp: 600, lp: 4500, attack: 0.01 });
      return;
    }
    if (style === 'clap') { [0, 0.012, 0.026].forEach((d, i) => noise(bus, t + d, { dur: i === 2 ? 0.16 : 0.03, vol: vol * 0.8, hp: 1100, lp: 6500 })); return; }
    if (style === 'rim') { osc(bus, t, { type: 'square', f: 900, dur: 0.02, vol: vol * 0.5 }); noise(bus, t, { dur: 0.03, vol: vol * 0.6, hp: 2500 }); return; }
    osc(bus, t, { type: 'triangle', f: 215, f2: 150, dur: 0.1, vol: vol * 0.7 });
    noise(bus, t, { dur: 0.17, vol, hp: 900, lp: 7500 });
    noise(bus, t, { dur: 0.05, vol: vol * 0.5, hp: 4000 });
  }
  function hat(bus, t, vol = 0.08, open = false) {
    noise(bus, t, { dur: open ? 0.3 : 0.045, vol, hp: 7500 });
    osc(bus, t, { type: 'square', f: 9000, dur: 0.012, vol: vol * 0.35 });
  }
  function crash(bus, t, vol = 0.15) {
    noise(bus, t, { dur: 1.1, vol, hp: 4500 });
    noise(bus, t, { dur: 0.5, vol: vol * 0.7, hp: 9000 });
    noise(bus, t, { dur: 0.25, vol: vol * 0.5, hp: 2500 });
  }
  function perc(bus, t, kind, vol = 0.1) {
    switch (kind) {
      case 'shaker':  noise(bus, t, { dur: 0.05, vol, hp: 6000, attack: 0.008 }); break;
      case 'tom':     osc(bus, t, { type: 'sine', f: 170, f2: 90, dur: 0.22, vol: vol * 2.2, glideT: 0.18 }); break;
      case 'cowbell': osc(bus, t, { type: 'square', f: 560, dur: 0.12, vol: vol * 0.7 }); osc(bus, t, { type: 'square', f: 845, dur: 0.1, vol: vol * 0.5 }); break;
      case 'tamb':    noise(bus, t, { dur: 0.08, vol, hp: 8000 }); osc(bus, t, { type: 'square', f: 6200, dur: 0.03, vol: vol * 0.4 }); break;
      case 'conga':   osc(bus, t, { type: 'sine', f: 340, f2: 230, dur: 0.16, vol: vol * 1.8, glideT: 0.1 }); noise(bus, t, { dur: 0.01, vol: vol * 0.3, hp: 2000 }); break;
      case 'clave':   osc(bus, t, { type: 'square', f: 2500, dur: 0.035, vol: vol * 0.6 }); osc(bus, t, { type: 'sine', f: 1800, dur: 0.05, vol: vol * 0.5 }); break;
      case 'ride':    noise(bus, t, { dur: 0.28, vol: vol * 0.6, hp: 5500 }); osc(bus, t, { type: 'sine', f: 5200, dur: 0.12, vol: vol * 0.25 }); osc(bus, t, { type: 'square', f: 7800, dur: 0.02, vol: vol * 0.2 }); break;
      case 'timpani': osc(bus, t, { type: 'sine', f: 120, f2: 72, dur: 0.6, vol: vol * 3, glideT: 0.25 }); noise(bus, t, { dur: 0.03, vol: vol * 0.4, hp: 800, lp: 3000 }); break;
      case 'woodblock': osc(bus, t, { type: 'square', f: 1200, dur: 0.03, vol: vol * 0.5 }); osc(bus, t, { type: 'sine', f: 900, dur: 0.05, vol: vol * 0.6 }); break;
    }
  }
  /* セクション前の もりあげ(ノイズの上昇スイープ) */
  function riser(bus, t, dur = 1.5, vol = 0.12) {
    ensure();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.1);
  }

  /* ---- ベース: sub(サイン) / saw(フィルターエンベロープの うねり) / square(チップ) / slap ---- */
  function bassN(bus, t, midi, dur = 0.22, vol = 0.22, style = 'sub') {
    ensure();
    const f = mtof(midi);
    if (style === 'saw') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(Math.min(4000, f * 9), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 1.6), t + Math.max(0.08, dur * 0.6));
      const g = env(t, vol * 0.8, 0.004, 0.6, dur);
      o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
      osc(bus, t, { type: 'sine', f: f / 2, dur, vol: vol * 0.6 });
      return;
    }
    if (style === 'square') { osc(bus, t, { type: 'square', f, dur: dur * 0.9, vol: vol * 0.45 }); osc(bus, t, { type: 'sine', f, dur, vol: vol * 0.7 }); return; }
    if (style === '808') {   // 808ベース: ピッチが すべりこむ サブ + ほんの すこし 倍音
      osc(bus, t, { type: 'sine', f: f * 1.6, f2: f, dur, vol: vol * 1.3, glideT: 0.05 });
      osc(bus, t, { type: 'square', f, dur: Math.min(dur, 0.12), vol: vol * 0.12 });
      return;
    }
    if (style === 'slap') { osc(bus, t, { type: 'triangle', f, dur: dur * 0.7, vol }); noise(bus, t, { dur: 0.015, vol: vol * 0.5, hp: 2500 }); osc(bus, t, { type: 'sine', f: f * 2, dur: 0.06, vol: vol * 0.4 }); return; }
    osc(bus, t, { type: 'sine', f, dur, vol });
    osc(bus, t, { type: 'triangle', f: f * 2, dur: dur * 0.7, vol: vol * 0.25 });
  }

  /* ---- コードパッド: warm(三角波) / super(スーパーソー) / chip(矩形波) / organ。ducks= キックで沈ませる時刻 ---- */
  function pad(bus, t, midis, dur = 1.8, vol = 0.05, style = 'warm', ducks = []) {
    ensure();
    if (style === 'epiano') { midis.forEach((m, i) => epiano(bus, t + i * 0.012, m, dur * 0.9, vol * 0.9, i % 2 ? 0.3 : -0.3)); return; }   // エレピの コード
    const v = vol * (style === 'super' ? 0.5 : style === 'organ' ? 0.8 : style === 'chip' ? 0.7 : style === 'strings' ? 0.6 : style === 'choir' ? 0.9 : 1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const cut = style === 'super' ? 900 : style === 'chip' ? 1800 : style === 'organ' ? 3000 : style === 'strings' ? 1500 : style === 'choir' ? 1300 : 1100;
    lp.frequency.setValueAtTime(cut * 0.7, t); lp.frequency.linearRampToValueAtTime(cut * 1.3, t + dur * 0.6);
    const atk = style === 'strings' ? Math.min(0.6, dur * 0.35) : style === 'choir' ? Math.min(0.5, dur * 0.3) : Math.min(0.35, dur * 0.3);
    const g = env(t, v, atk, 0.85, dur);
    const duck = ctx.createGain(); duck.gain.value = 1;
    for (const td of ducks) { if (td < t || td > t + dur) continue; duck.gain.setValueAtTime(0.45, td); duck.gain.linearRampToValueAtTime(1, td + 0.2); }
    lp.connect(g); g.connect(duck); duck.connect(bus);
    let dest = lp;
    if (style === 'choir') { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8; bp.connect(lp); dest = bp; }   // フォルマント風
    const voices = style === 'super' ? [-14, -6, 6, 14] : style === 'strings' ? [-9, -3, 3, 9] : style === 'chip' || style === 'choir' ? [-5, 5] : style === 'organ' ? [0] : [-6, 6];
    const type = style === 'super' || style === 'strings' ? 'sawtooth' : style === 'chip' ? 'square' : style === 'organ' || style === 'choir' ? 'sine' : 'triangle';
    const wide = style === 'super' || style === 'strings';
    midis.forEach(m => voices.forEach((cents, vi) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m) * Math.pow(2, cents / 1200);
      o.connect(outNode(dest, wide ? (vi % 2 ? 0.5 : -0.5) : 0));
      if (style === 'choir' && vi === 0) { const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = mtof(m); const g3 = ctx.createGain(); g3.gain.value = 0.35; o3.connect(g3); g3.connect(dest); o3.start(t); o3.stop(t + dur + 0.05); }
      o.start(t); o.stop(t + dur + 0.05);
      if (style === 'organ') [2, 3].forEach((h, k) => {
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m) * h;
        const g2 = ctx.createGain(); g2.gain.value = k ? 0.25 : 0.5;
        o2.connect(g2); g2.connect(lp); o2.start(t); o2.stop(t + dur + 0.05);
      });
    }));
  }
  /* コードスタブ: フィルターが閉じていく短いコード。声部を左右にひろげる */
  function stab(bus, t, midis, dur = 0.16, vol = 0.05, style = 'saw') {
    ensure();
    if (style === 'epiano') { midis.forEach((m, i) => epiano(bus, t, m, dur * 1.5, vol * 0.9, i % 2 ? 0.3 : -0.3)); return; }
    if (style === 'brass') { midis.forEach((m, i) => lead(bus, t, m, dur * 1.2, vol * 0.7, 'brass', { pan: i % 2 ? 0.3 : -0.3, delay: 0.1 })); return; }
    if (style === 'organ') {   // レゲエの スカンク / サンバの コード: サイン倍音の みじかい オルガン
      midis.forEach((m, i) => {
        const g = env(t, vol * 0.8, 0.004, 0.6, dur); g.connect(outNode(bus, i % 2 ? 0.3 : -0.3));
        [[1, 1], [2, 0.5], [3, 0.25]].forEach(([h, k]) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m) * h; const gg = ctx.createGain(); gg.gain.value = k; o.connect(gg); gg.connect(g); o.start(t); o.stop(t + dur + 0.05); });
      });
      return;
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = env(t, vol, 0.004, 0.5, dur);
    lp.connect(g); g.connect(bus); sendDelay(g, 0.25);
    midis.forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = style === 'chip' ? 'square' : 'sawtooth'; o.frequency.value = mtof(m);
      o.connect(outNode(lp, i % 2 ? 0.35 : -0.35)); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  /* アルペジオ用プラック: カットオフが すばやく閉じる + ディレイ */
  function pluck(bus, t, midi, vol = 0.05, pan = 0) {
    ensure();
    const f = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 6), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.18);
    const g = env(t, vol, 0.003, 0.4, 0.22);
    lp.connect(g); g.connect(outNode(bus, pan)); sendDelay(g, 0.35);
    [['square', f, 1], ['sine', f, 0.8], ['triangle', f * 2, 0.25]].forEach(([type, ff, k]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = ff;
      const gg = ctx.createGain(); gg.gain.value = k; o.connect(gg); gg.connect(lp); o.start(t); o.stop(t + 0.3);
    });
  }
  function bell(bus, t, midi, vol = 0.07, dur = 0.45) { lead(bus, t, midi, dur, vol, 'bell', {}); }
  /* エレピ: 1:1 の FM(モジュレータが 減衰) + アタックの ティン。Jポップ/ローファイ/ヒップホップの コードと リード */
  function epiano(bus, t, midi, dur = 0.5, vol = 0.07, pan = 0) {
    ensure();
    const f = mtof(midi), sus = Math.max(0.2, dur);
    const out = outNode(bus, pan);
    const g = env(t, vol, 0.004, 0.55, sus); g.connect(out); sendDelay(g, 0.2);
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 0.9, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + Math.max(0.25, sus * 0.6));
    mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    car.start(t); car.stop(t + sus + 0.05); mod.start(t); mod.stop(t + sus + 0.05);
    osc(out, t, { type: 'sine', f: f * 4, dur: 0.08, vol: vol * 0.25 });
  }

  /* ---- リード: bell(FM) / chip(デチューン矩形波+ビブラート+ポルタメント) / saw(フィルターエンベロープ) / flute / organ / pluck ---- */
  function lead(bus, t, midi, dur = 0.4, vol = 0.06, timbre = 'bell', opt = {}) {
    ensure();
    const f = mtof(midi), sus = Math.max(0.18, dur);
    const out = outNode(bus, opt.pan || 0);
    const mk = (peak, attack = 0.01) => { const g = env(t, peak, attack, 0.75, sus); g.connect(out); sendDelay(g, opt.delay == null ? 0.3 : opt.delay); return g; };
    const mkOsc = (type, freq, dest, glideFrom) => {
      const o = ctx.createOscillator(); o.type = type;
      if (glideFrom) { o.frequency.setValueAtTime(glideFrom, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.07); } else o.frequency.value = freq;
      o.connect(dest); o.start(t); o.stop(t + sus + 0.05); return o;
    };
    const vib = (o, depth = 0.007, rate = 5.5) => {
      if (sus < 0.3) return o;
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * depth, t + 0.25);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + sus + 0.05); return o;
    };
    const gl = opt.glideFrom ? mtof(opt.glideFrom) : null;
    switch (timbre) {
      case 'chip': { const g = mk(vol * 0.55); vib(mkOsc('square', f * Math.pow(2, -4 / 1200), g, gl)); mkOsc('square', f * Math.pow(2, 4 / 1200), g, gl); break; }
      case 'saw': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(Math.min(8000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.2), t + Math.min(0.35, sus));
        lp.connect(mk(vol * 0.8, 0.015));
        vib(mkOsc('sawtooth', f, lp, gl)); mkOsc('sawtooth', f * Math.pow(2, 7 / 1200), lp, gl);
        break;
      }
      case 'flute': {
        vib(mkOsc('sine', f, mk(vol * 1.15, 0.06)), 0.009, 5);
        mkOsc('triangle', f, mk(vol * 0.28, 0.06));
        noise(out, t, { dur: Math.min(0.12, sus), vol: vol * 0.12, hp: 2500, lp: 6000, attack: 0.02 });
        break;
      }
      case 'organ': {
        const g = mk(vol * 0.9, 0.012);
        [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]].forEach(([h, k]) => { const gg = ctx.createGain(); gg.gain.value = k; gg.connect(g); mkOsc('sine', f * h, gg); });
        const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 6.5; tg.gain.value = vol * 0.25;
        trem.connect(tg); tg.connect(g.gain); trem.start(t); trem.stop(t + sus);
        break;
      }
      case 'pluck': pluck(bus, t, midi, vol * 1.3, opt.pan || 0); break;
      case 'epiano': epiano(bus, t, midi, dur, vol * 1.1, opt.pan || 0); break;
      case 'super': {   // スーパーソー: 7声 デチューン + ひらいて とじる フィルター
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
        lp.frequency.setValueAtTime(Math.min(9000, f * 8), t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.5), t + Math.min(0.5, sus));
        lp.connect(mk(vol * 0.5, 0.02));
        [-18, -12, -6, 0, 6, 12, 18].forEach((cents, i) => mkOsc('sawtooth', f * Math.pow(2, cents / 1200), outNode(lp, ((i - 3) / 3) * 0.6), gl));
        break;
      }
      case 'brass': {   // ブラス: のこぎり波 2声 + オクターブ下、フィルターが ゆっくり ひらく
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
        lp.frequency.setValueAtTime(Math.max(300, f * 1.5), t); lp.frequency.linearRampToValueAtTime(Math.min(7000, f * 6), t + Math.min(0.12, sus * 0.5));
        lp.connect(mk(vol * 0.75, 0.05));
        vib(mkOsc('sawtooth', f, lp, gl), 0.005, 5); mkOsc('sawtooth', f * Math.pow(2, 5 / 1200), lp, gl); mkOsc('square', f / 2, lp, gl ? gl / 2 : null);
        break;
      }
      case 'marimba': {   // マリンバ: サイン + 4倍音、すばやい 減衰
        const g = mk(vol * 1.2, 0.003);
        osc(g, t, { type: 'sine', f, dur: Math.min(sus, 0.35), vol: 1 });
        osc(g, t, { type: 'sine', f: f * 4, dur: 0.08, vol: 0.35 });
        osc(g, t, { type: 'sine', f: f * 10, dur: 0.03, vol: 0.15 });
        break;
      }
      default: {   // bell: FM(3.5倍のモジュレータが減衰) + オクターブ上のサイン
        const g = mk(vol, 0.004);
        const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
        const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 3.5;
        const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.04, t + Math.max(0.3, sus));
        mod.connect(mg); mg.connect(car.frequency); car.connect(g);
        car.start(t); car.stop(t + sus + 0.05); mod.start(t); mod.stop(t + sus + 0.05);
        osc(out, t, { type: 'sine', f: f * 2, dur: Math.max(0.2, sus * 0.5), vol: vol * 0.2 });
      }
    }
  }

  /* ---- 効果音(ゲームの合図・判定。名前はそのまま) ---- */
  function sfx(bus, name, t, opt = {}) {
    ensure();
    switch (name) {
      case 'count':   osc(bus, t, { type: 'square', f: opt.last ? 1980 : 1320, dur: 0.06, vol: 0.22 }); break;
      case 'step':    osc(bus, t, { type: 'square', f: 660, f2: 520, dur: 0.07, vol: 0.2 }); break;
      case 'stomp':   kick(bus, t, 0.6); noise(bus, t, { dur: 0.08, vol: 0.18, hp: 2000 }); break;
      case 'throw':   noise(bus, t, { dur: 0.18, vol: 0.18, hp: 600 }); osc(bus, t, { type: 'sine', f: 700, f2: 250, dur: 0.18, vol: 0.16 }); break;
      case 'crack':   noise(bus, t, { dur: 0.1, vol: 0.45, hp: 1000 }); osc(bus, t, { type: 'square', f: 250, f2: 120, dur: 0.08, vol: 0.28 }); break;
      case 'homerun': [0, 4, 7, 12].forEach((s, i) => osc(bus, t + i * 0.06, { type: 'square', f: mtof(88 + s), dur: 0.1, vol: 0.11 })); break;
      case 'pip':     osc(bus, t, { type: 'square', f: opt.f || 880, dur: opt.dur || 0.14, vol: 0.2 }); break;
      case 'whoosh':  noise(bus, t, { dur: 0.16, vol: 0.15, hp: 400, lp: 4500 }); break;
      case 'boing':   osc(bus, t, { type: 'sine', f: 220, f2: 740, dur: 0.16, vol: 0.28 }); break;
      case 'beep2':   osc(bus, t, { type: 'square', f: 740, dur: 0.07, vol: 0.18 }); osc(bus, t + 0.1, { type: 'square', f: 1046, dur: 0.07, vol: 0.18 }); break;
      case 'pew':     osc(bus, t, { type: 'sawtooth', f: 1400, f2: 220, dur: 0.15, vol: 0.22 }); break;
      case 'boom':    noise(bus, t, { dur: 0.28, vol: 0.35, lp: 900 }); kick(bus, t, 0.5); break;
      case 'clap':    noise(bus, t, { dur: 0.07, vol: 0.33, hp: 1200, lp: 6500 }); break;
      case 'croak':   osc(bus, t, { type: 'square', f: 170, f2: 95, dur: 0.14, vol: 0.28 }); break;
      case 'whistle': osc(bus, t, { type: 'sine', f: 880, dur: 0.5, vol: 0.15 }); osc(bus, t, { type: 'sine', f: 892, dur: 0.5, vol: 0.11 }); break;
      case 'shk':     noise(bus, t, { dur: 0.09, vol: 0.28, hp: 2500 }); break;
      case 'plip':    osc(bus, t, { type: 'sine', f: 980, f2: 420, dur: 0.1, vol: 0.22 }); break;
      case 'bloom':   [0, 7, 12].forEach((s, i) => osc(bus, t + i * 0.05, { type: 'sine', f: mtof(84 + s), dur: 0.15, vol: 0.13 })); break;
      case 'ratchet': for (let i = 0; i < 3; i++) noise(bus, t + i * 0.055, { dur: 0.03, vol: 0.2, hp: 3000 }); break;
      case 'tick':    osc(bus, t, { type: 'square', f: 1870, dur: 0.04, vol: 0.2 }); noise(bus, t, { dur: 0.03, vol: 0.13, hp: 5000 }); break;
      case 'twinkle': [12, 7, 4, 0].forEach((s, i) => osc(bus, t + i * 0.07, { type: 'sine', f: mtof(84 + s), dur: 0.12, vol: 0.09 })); break;
      case 'ding':    osc(bus, t, { type: 'sine', f: 1319, dur: 0.3, vol: 0.2 }); osc(bus, t, { type: 'sine', f: 1976, dur: 0.2, vol: 0.09 }); break;
      case 'sparkle': osc(bus, t, { type: 'sine', f: 1568, dur: 0.09, vol: 0.11 }); osc(bus, t + 0.06, { type: 'sine', f: 2093, dur: 0.12, vol: 0.11 }); break;
      case 'buzz':    osc(bus, t, { type: 'sawtooth', f: 110, f2: 70, dur: 0.22, vol: 0.15 }); break;
      case 'whiffS':  noise(bus, t, { dur: 0.05, vol: 0.1, hp: 1000, lp: 3000 }); break;
      case 'uiclick': osc(bus, t, { type: 'square', f: 1200, dur: 0.04, vol: 0.12 }); break;
      case 'uino':    osc(bus, t, { type: 'square', f: 300, f2: 220, dur: 0.12, vol: 0.12 }); break;
    }
  }

  /* ---- リザルトジングル ---- */
  function jingle(bus, t, kind) {
    ensure();
    if (kind === 'superb') {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => lead(bus, t + i * 0.085, 72 + s, 0.25, 0.09, 'bell', { pan: i % 2 ? 0.4 : -0.4 }));
      stab(bus, t, [60, 64, 67, 71], 0.5, 0.06); stab(bus, t + 0.7, [65, 69, 72, 76], 0.9, 0.06);
      kick(bus, t, 0.5); kick(bus, t + 0.35, 0.5); crash(bus, t + 0.7, 0.14);
      sfx(bus, 'sparkle', t + 0.75); sfx(bus, 'sparkle', t + 0.95);
    } else if (kind === 'clear') {
      [0, 4, 7, 12].forEach((s, i) => lead(bus, t + i * 0.11, 72 + s, 0.25, 0.09, 'chip', {}));
      stab(bus, t, [60, 64, 67], 0.5, 0.05); kick(bus, t, 0.45);
    } else {
      lead(bus, t, 67, 0.5, 0.08, 'saw', { glideFrom: 72 }); lead(bus, t + 0.35, 63, 0.7, 0.08, 'saw', { glideFrom: 67 });
      bassN(bus, t, 43, 0.8, 0.2, 'saw');
    }
  }

  return { ensure, now, mtof, setDelay, newBus, killBus, osc, noise, kick, snare, hat, crash, perc, riser, bassN, stab, pad, pluck, bell, epiano, lead, sfx, jingle };
})();
