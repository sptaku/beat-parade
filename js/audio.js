'use strict';
/* AudioKit: Web Audio だけで全ての音（BGM・キュー音・効果音）を合成する */
const AudioKit = (() => {
  let ctx = null, master = null, noiseBuf = null, reverbIn = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // リバーブ(ノイズ減衰で生成したIRのコンボルバ)。全バスから薄くセンドして豪華に。
      const irLen = Math.floor(ctx.sampleRate * 1.6);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const dd = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.4);
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      reverbIn = ctx.createGain();
      reverbIn.gain.value = 0.33;
      reverbIn.connect(conv);
      conv.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const now = () => ensure().currentTime;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function newBus(vol = 1) {
    ensure();
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(master);
    g.connect(reverbIn);
    return g;
  }
  function killBus(bus) { try { bus.disconnect(); } catch (e) { /* already dead */ } }

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

  /* ---- ドラム / 伴奏 ---- */
  function kick(bus, t, vol = 0.5) { osc(bus, t, { type: 'sine', f: 150, f2: 45, dur: 0.13, vol, glideT: 0.1 }); }
  function snare(bus, t, vol = 0.25) {
    noise(bus, t, { dur: 0.12, vol, hp: 1400 });
    osc(bus, t, { type: 'triangle', f: 230, f2: 160, dur: 0.08, vol: vol * 0.6 });
  }
  function hat(bus, t, vol = 0.09, open = false) { noise(bus, t, { dur: open ? 0.22 : 0.045, vol, hp: 6500 }); }
  function crash(bus, t, vol = 0.15) {
    noise(bus, t, { dur: 0.6, vol, hp: 5000 });
    noise(bus, t, { dur: 0.3, vol: vol * 0.6, hp: 2500 });
  }
  function bassN(bus, t, midi, dur = 0.22, vol = 0.2) {
    osc(bus, t, { type: 'triangle', f: mtof(midi), dur, vol });
    osc(bus, t, { type: 'square', f: mtof(midi), dur: dur * 0.8, vol: vol * 0.25 });
  }
  function stab(bus, t, rootMidi, isMinor, dur = 0.16, vol = 0.05) {
    [0, isMinor ? 3 : 4, 7].forEach(s => osc(bus, t, { type: 'square', f: mtof(rootMidi + s), dur, vol }));
  }
  /* コードパッド: デチューンした三角波×2/音 + ローパスで、ふわっと敷く */
  function pad(bus, t, midis, dur = 1.8, vol = 0.05) {
    ensure();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.35, dur * 0.3));
    g.gain.linearRampToValueAtTime(vol * 0.85, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(bus);
    midis.forEach(m => [-6, 6].forEach(cents => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(m) * Math.pow(2, cents / 1200);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
    }));
  }
  /* アルペジオ用の短いプラック */
  function pluck(bus, t, midi, vol = 0.05) {
    osc(bus, t, { type: 'square', f: mtof(midi), dur: 0.11, vol });
    osc(bus, t, { type: 'sine', f: mtof(midi), dur: 0.16, vol: vol * 0.9 });
  }
  /* メロディ用ベル(倍音つきサイン) */
  function bell(bus, t, midi, vol = 0.07, dur = 0.45) {
    const f = mtof(midi);
    osc(bus, t, { type: 'sine', f, dur, vol });
    osc(bus, t, { type: 'sine', f: f * 2.01, dur: dur * 0.6, vol: vol * 0.35 });
    osc(bus, t, { type: 'sine', f: f * 3.02, dur: dur * 0.3, vol: vol * 0.15 });
  }
  /* リード楽器: ゲームごとに音色を切り替えるメロディ用。長い音にはビブラートがかかる */
  function lead(bus, t, midi, dur = 0.4, vol = 0.06, timbre = 'bell') {
    ensure();
    const f = mtof(midi);
    const sus = Math.max(0.18, dur);
    const mkEnv = (peak, attack = 0.01) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.linearRampToValueAtTime(peak * 0.75, t + sus * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sus);
      g.connect(bus);
      return g;
    };
    const mkOsc = (type, freq, dest) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      o.connect(dest);
      o.start(t); o.stop(t + sus + 0.05);
      return o;
    };
    const addVib = o => {
      if (sus < 0.35) return o;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = f * 0.007;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t + 0.15); lfo.stop(t + sus + 0.05);
      return o;
    };
    switch (timbre) {
      case 'chip':
        addVib(mkOsc('square', f, mkEnv(vol * 0.75)));
        break;
      case 'flute':
        addVib(mkOsc('sine', f, mkEnv(vol * 1.15, 0.05)));
        mkOsc('triangle', f, mkEnv(vol * 0.3, 0.05));
        break;
      case 'pluckL':
        osc(bus, t, { type: 'square', f, dur: 0.14, vol: vol * 0.8 });
        osc(bus, t, { type: 'sine', f, dur: 0.3, vol });
        osc(bus, t, { type: 'sine', f: f * 2.005, dur: 0.12, vol: vol * 0.3 });
        break;
      case 'sawL': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 2200;
        lp.connect(mkEnv(vol * 0.9, 0.02));
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f;
        o.connect(lp); o.start(t); o.stop(t + sus + 0.05);
        addVib(o);
        break;
      }
      default: // bell
        osc(bus, t, { type: 'sine', f, dur: Math.max(0.4, sus), vol });
        osc(bus, t, { type: 'sine', f: f * 2.01, dur: Math.max(0.25, sus * 0.6), vol: vol * 0.35 });
        osc(bus, t, { type: 'sine', f: f * 3.02, dur: 0.16, vol: vol * 0.13 });
    }
  }

  /* ---- 効果音 ---- */
  function sfx(bus, name, t, opt = {}) {
    ensure();
    switch (name) {
      case 'count':   osc(bus, t, { type: 'square', f: opt.last ? 1980 : 1320, dur: 0.06, vol: 0.22 }); break;
      case 'step':    osc(bus, t, { type: 'square', f: 660, f2: 520, dur: 0.07, vol: 0.2 }); break;
      case 'stomp':   kick(bus, t, 0.6); noise(bus, t, { dur: 0.08, vol: 0.18, hp: 2000 }); break;
      case 'throw':   noise(bus, t, { dur: 0.18, vol: 0.18, hp: 600 }); osc(bus, t, { type: 'sine', f: 700, f2: 250, dur: 0.18, vol: 0.16 }); break;
      case 'crack':   noise(bus, t, { dur: 0.1, vol: 0.45, hp: 1000 }); osc(bus, t, { type: 'square', f: 250, f2: 120, dur: 0.08, vol: 0.28 }); break;
      case 'homerun': [0, 4, 7, 12].forEach((s, i) => osc(bus, t + i * 0.06, { type: 'square', f: mtof(88 + s), dur: 0.1, vol: 0.11 })); break;
      case 'pip':     osc(bus, t, { type: 'square', f: opt.f || 880, dur: 0.14, vol: 0.2 }); break;
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
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => osc(bus, t + i * 0.09, { type: 'square', f: mtof(72 + s), dur: 0.2, vol: 0.13 }));
      kick(bus, t, 0.5); kick(bus, t + 0.36, 0.5);
      sfx(bus, 'sparkle', t + 0.7);
      sfx(bus, 'sparkle', t + 0.9);
    } else if (kind === 'clear') {
      [0, 4, 7, 12].forEach((s, i) => osc(bus, t + i * 0.11, { type: 'square', f: mtof(72 + s), dur: 0.2, vol: 0.13 }));
      kick(bus, t, 0.45);
    } else {
      osc(bus, t, { type: 'sawtooth', f: 392, f2: 196, dur: 0.55, vol: 0.13 });
      osc(bus, t + 0.1, { type: 'sawtooth', f: 330, f2: 165, dur: 0.55, vol: 0.11 });
    }
  }

  return { ensure, now, mtof, newBus, killBus, osc, noise, kick, snare, hat, crash, bassN, stab, pad, pluck, bell, lead, sfx, jingle };
})();
