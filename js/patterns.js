'use strict';
/* Patterns: 12種類のミニゲームの「譜面生成」と「描画」。
   全ゲーム共通ルール: キュー(合図)→ 決まった拍後にボタン、の1ボタン制。 */
const Patterns = (() => {

  /* ---------- 乱数（ゲームIDから決定的に生成 = 譜面は毎回同じで覚えられる） ---------- */
  function hashStr(s) {
    let h = 1779033703;
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rngFor = id => mulberry32(hashStr(id));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  /* ---------- 描画ヘルパー ---------- */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const bounce = b => Math.abs(Math.sin(b * Math.PI));
  function E(c, ch, x, y, s, rot = 0) {
    c.save(); c.translate(x, y);
    if (rot) c.rotate(rot);
    c.font = s + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, 0, 0);
    c.restore();
  }
  /* 裏モードでは飛んでくる物が途中で見えなくなる（体内リズム勝負） */
  function fadeUra(v, p) { return v.ura ? clamp(1 - (p - 0.5) * 3, 0, 1) : 1; }
  function jumpOffset(v, targets) {
    let best = null;
    for (const t of targets) {
      if (t.judged && t.judged !== 'miss') {
        const dt = v.sec - t.jt;
        if (dt >= 0 && dt < 0.45 && (best == null || dt < best)) best = dt;
      }
    }
    return best == null ? 0 : Math.sin((best / 0.45) * Math.PI) * 80;
  }
  /* 2人用: プレイヤー pi の直近ヒットからの経過秒(0.5s以内)。とりあいノーツは取った人が対象 */
  function lastHitAge(v, pi) {
    let best = null;
    for (const t of v.targets) {
      if (!t.judged || t.judged === 'miss') continue;
      const who = t.owner === -1 ? t.takenBy : t.owner;
      if (who !== pi) continue;
      const dt = v.sec - t.jt;
      if (dt >= 0 && dt < 0.5 && (best == null || dt < best)) best = dt;
    }
    return best;
  }
  const P_COL = ['#47a8ff', '#ff8c42'];
  function pLabel(c, x, y, pi) {
    c.save();
    c.font = '900 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4;
    c.fillStyle = P_COL[pi];
    c.strokeText((pi + 1) + 'P', x, y);
    c.fillText((pi + 1) + 'P', x, y);
    c.restore();
  }
  function scoreTag(c, x, y, pi, txt) {
    c.save();
    c.font = '900 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 5;
    c.fillStyle = P_COL[pi];
    c.strokeText((pi + 1) + 'P ' + txt, x, y);
    c.fillText((pi + 1) + 'P ' + txt, x, y);
    c.restore();
  }
  function speech(c, x, y, txt) {
    c.save();
    c.font = 'bold 24px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 26;
    c.fillStyle = 'rgba(255,255,255,.92)';
    c.beginPath();
    if (c.roundRect) c.roundRect(x - w / 2, y - 22, w, 44, 14); else c.rect(x - w / 2, y - 22, w, 44);
    c.fill();
    c.fillStyle = '#333';
    c.fillText(txt, x, y + 1);
    c.restore();
  }

  /* ================= アーキタイプ定義 =================
     phrase(d, rng, scale) -> { span, cues:[{o,sfx,opt?}], hits:[{o, ...meta}] }
     d: 難易度(ステージが進む/裏で上がる), o: フレーズ先頭からの拍オフセット */
  const ARCH = {};

  ARCH.march = {
    base: 'スターマーチ', icon: '🥁',
    desc: '「イチ・ニ・サン」のつぎは…「ハイッ！」で ドン！とふみならそう！',
    hit(ak, bus, t) { ak.sfx(bus, 'stomp', t); },
    phrase(d, r) {
      if (d >= 6 && r() < 0.35)
        return { span: 4, cues: [{ o: 0, sfx: 'step' }, { o: 1, sfx: 'step' }, { o: 2, sfx: 'step' }], hits: [{ o: 3 }, { o: 3.5 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'step' }, { o: 1, sfx: 'step' }, { o: 2, sfx: 'step' }], hits: [{ o: 3 }] };
    },
    draw(c, v) {
      for (let i = 0; i < 3; i++) E(c, '🌟', 250 + i * 105, 395 - bounce(v.beat) * 12, 52);
      E(c, '⭐', 720, 392 - jumpOffset(v, v.targets), 70);
      for (const t of v.targets) {
        if (t.b - t.cueB !== 3) continue;
        const rel = v.beat - t.cueB;
        if (rel < 0 || rel >= 4) continue;
        const idx = Math.floor(rel), fr = rel - idx;
        if (fr > 0.7) continue;
        const words = ['イチ', 'ニ', 'サン', 'ハイッ！'];
        c.save();
        c.globalAlpha = 1 - fr * 0.8;
        c.font = '900 ' + (idx === 3 ? 56 : 40) + 'px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 7;
        c.fillStyle = idx === 3 ? v.theme.accent : '#fff';
        c.strokeText(words[idx], 480, 140);
        c.fillText(words[idx], 480, 140);
        c.restore();
      }
    }
  };

  ARCH.batting = {
    base: 'スターバッティング', icon: '⚾',
    desc: 'ボールが バットに とどく しゅんかんに フルスイング！はやい球に ちゅうい！',
    hit(ak, bus, t, tg, perfect) { ak.sfx(bus, 'crack', t); if (perfect) ak.sfx(bus, 'homerun', t + 0.05); },
    phrase(d, r) {
      if (d >= 4 && r() < 0.25) return { span: 4, cues: [{ o: 0, sfx: 'throw' }], hits: [{ o: 2.5, kind: 'curve' }] }; // ゆるいカーブ
      const fast = d >= 5 && r() < clamp(0.1 + d * 0.03, 0, 0.5);
      return fast
        ? { span: 4, cues: [{ o: 0, sfx: 'throw' }], hits: [{ o: 1.5, kind: 'fast' }] }
        : { span: 4, cues: [{ o: 0, sfx: 'throw' }], hits: [{ o: 2 }] };
    },
    draw(c, v) {
      E(c, '🐻', 165, 380, 62);
      const swing = v.pressAge < 0.18;
      E(c, '⭐', 700, 382, 64);
      E(c, '🏏', 660, 360, 52, swing ? -2.4 : -0.5);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.08) {
            const x = lerp(200, 685, clamp(p, 0, 1.08));
            const y = 345 - Math.sin(clamp(p, 0, 1) * Math.PI) * (t.kind === 'fast' ? 40 : 110);
            c.globalAlpha = fadeUra(v, p);
            E(c, '⚾', x, y, 40);
            c.globalAlpha = 1;
          }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.6) E(c, '⚾', 685 + dt * 700, 340 - dt * 620, 40 - dt * 20);
        } else {
          const dt = v.sec - t.jt;
          if (dt < 0.5) E(c, '⚾', 685 + dt * 260, 425, 34);
        }
      }
    }
  };

  ARCH.echo = {
    base: 'ものまねバード', icon: '🐦',
    desc: 'とりさんの メロディが とんでくる！2はく おくれで おなじリズムを まねっこ！ながい音は おしたまま のばそう！',
    hit(ak, bus, t, tg) { ak.sfx(bus, 'pip', t, { f: tg.f || 880 }); },
    phrase(d, r, scale) {
      if (d >= 3 && r() < 0.28) {   // ロングトーン: おしたまま のばす
        const fi = Math.floor(r() * scale.length), f = scale[fi];
        return { span: 4, cues: [{ o: 0, sfx: 'pip', opt: { f, dur: 0.7 } }], hits: [{ o: 2, f, fi, hold: 1.5 }] };
      }
      const n = d < 4 ? 2 : (d < 8 ? (r() < 0.5 ? 2 : 3) : 3);
      const offs = n === 2 ? pick(r, [[0, 1], [0, 0.5], [0.5, 1], [0, 1.5], [0.5, 1.5]]) : pick(r, [[0, 0.5, 1], [0, 1, 1.5], [0, 0.5, 1.5], [0.5, 1, 1.5]]);
      const notes = offs.map(o => { const fi = Math.floor(r() * scale.length); return { o, fi, f: scale[fi] }; });
      return {
        span: 4,
        cues: notes.map(nn => ({ o: nn.o, sfx: 'pip', opt: { f: nn.f } })),
        hits: notes.map(nn => ({ o: nn.o + 2, f: nn.f, fi: nn.fi }))
      };
    },
    draw(c, v) {
      c.fillStyle = '#8b5a2b';
      c.fillRect(185, 350, 115, 10);
      c.fillRect(645, 358, 110, 10);
      E(c, '🐦', 240, 322, 56);
      E(c, '🐤', 700, 330, 50);
      for (const t of v.targets) {
        if (t.judged) continue;
        const p = (v.beat - (t.b - 2)) / 2;
        if (p < 0 || p > 1.05) continue;
        const pp = clamp(p, 0, 1);
        c.globalAlpha = fadeUra(v, pp);
        E(c, '🎵', lerp(240, 700, pp), (300 - (t.fi || 0) * 24) - Math.sin(pp * Math.PI) * 40, 34);
        c.globalAlpha = 1;
      }
      for (const t of v.targets) if (t.holding) {   // のばしている音
        E(c, '🎵', 700, 262, 34);
        c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(716, 259, 36 + ((v.sec * 70) % 34), 6);
      }
    }
  };

  ARCH.jump = {
    base: 'なわとびラビット', icon: '🐇',
    desc: 'ロープが 足もとに くるたびに ジャンプ！はやまわしに ちゅうい！',
    hit(ak, bus, t) { ak.sfx(bus, 'boing', t); },
    phrase(d, r) {
      const fast = d >= 6 && r() < clamp(0.15 + d * 0.02, 0, 0.5);
      if (fast) return {
        span: 8,
        cues: [{ o: 0, sfx: 'whoosh' }, { o: 1.5, sfx: 'whoosh' }, { o: 2.5, sfx: 'whoosh' }, { o: 3.5, sfx: 'whoosh' }, { o: 4.5, sfx: 'whoosh' }],
        hits: [{ o: 2, kind: 'fast' }, { o: 3, kind: 'fast' }, { o: 4, kind: 'fast' }, { o: 5, kind: 'fast' }]
      };
      return {
        span: 8,
        cues: [{ o: 0, sfx: 'whoosh' }, { o: 1.5, sfx: 'whoosh' }, { o: 3.5, sfx: 'whoosh' }, { o: 5.5, sfx: 'whoosh' }],
        hits: [{ o: 2 }, { o: 4 }, { o: 6 }]
      };
    },
    draw(c, v) {
      let cur = null, cd = 1e9;
      for (const t of v.targets) {
        const dd = t.b - v.beat;
        if (dd > -1 && dd < 2.5 && Math.abs(dd) < cd) { cd = Math.abs(dd); cur = t; }
      }
      E(c, '🐰', 262, 378, 56);
      E(c, '🐰', 698, 378, 56);
      if (cur) {
        const per = cur.kind === 'fast' ? 1 : 2;
        const depth = Math.cos((v.beat - cur.b) / per * 2 * Math.PI);
        c.strokeStyle = cur.kind === 'fast' ? '#ff5d5d' : v.theme.accent;
        c.lineWidth = 7;
        c.globalAlpha = v.ura ? 0.45 : 1;
        c.beginPath();
        for (let i = 0; i <= 24; i++) {
          const s = i / 24;
          const x = lerp(284, 676, s), y = 330 + Math.sin(Math.PI * s) * 95 * depth;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
        c.globalAlpha = 1;
      }
      E(c, '🐇', 480, 384 - jumpOffset(v, v.targets), 62);
    }
  };

  ARCH.shoot = {
    base: 'うちゅうシューター', icon: '👾',
    desc: 'エイリアンが「ピコッ」と出たら、2はく あとに シュート！',
    hit(ak, bus, t, tg, perfect) { ak.sfx(bus, 'pew', t); ak.sfx(bus, 'boom', t + 0.08); },
    phrase(d, r) {
      const x1 = 170 + r() * 620;
      if (d >= 6 && r() < 0.35) {
        const x2 = 170 + r() * 620;
        return { span: 4, cues: [{ o: 0, sfx: 'beep2' }, { o: 1, sfx: 'beep2' }], hits: [{ o: 2, x: x1 }, { o: 3, x: x2 }] };
      }
      return { span: 4, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 2, x: x1 }] };
    },
    draw(c, v) {
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.fillRect(452, 442, 56, 44);
      E(c, '⭐', 480, 428, 56);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.1) {
            const sc = clamp((v.beat - t.cueB) * 3, 0, 1);
            E(c, '👾', t.x, 165, 54 * sc);
            const r2 = lerp(150, 26, clamp(p, 0, 1));
            c.strokeStyle = v.theme.accent;
            c.lineWidth = 4;
            c.globalAlpha = 0.9 * fadeUra(v, p);
            c.beginPath(); c.arc(t.x, 165, r2, 0, 7); c.stroke();
            c.globalAlpha = 1;
          }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.12) { c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(480, 420); c.lineTo(t.x, 180); c.stroke(); }
          if (dt < 0.4) E(c, '💥', t.x, 165, 56 + dt * 100);
        } else {
          const dt = v.sec - t.jt;
          if (dt < 0.5) E(c, '👾', t.x, 165 - dt * 160, 54);
        }
      }
    }
  };

  ARCH.clap = {
    base: 'はくしゅマスター', icon: '👏',
    desc: 'みんなの はくしゅに つづいて、まが あいたら パチン！と いれよう！',
    hit(ak, bus, t) { ak.sfx(bus, 'clap', t); },
    phrase(d, r) {
      if (d >= 5 && r() < 0.3) // うら拍はくしゅ
        return { span: 4, cues: [{ o: 0, sfx: 'clap' }, { o: 1, sfx: 'clap' }], hits: [{ o: 1.5 }, { o: 2.5 }] };
      if (d >= 6 && r() < 0.4)
        return { span: 4, cues: [{ o: 0, sfx: 'clap' }, { o: 0.5, sfx: 'clap' }], hits: [{ o: 1 }, { o: 1.5 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'clap' }, { o: 1, sfx: 'clap' }], hits: [{ o: 2 }] };
    },
    draw(c, v) {
      for (let i = 0; i < 3; i++) E(c, '🐹', 290 + i * 100, 390 - bounce(v.beat) * 8, 54);
      E(c, '⭐', 700, 388, 64);
      for (const cu of v.cues) {
        const d = v.beat - cu.beat;
        if (d >= 0 && d < 0.3) E(c, '👏', 290 + (Math.floor(cu.beat * 2) % 3) * 100, 322, 40);
      }
      if (v.pressAge < 0.18) E(c, '👏', 700, 320, 44);
    }
  };

  ARCH.frog = {
    base: 'ケロケロホッパー', icon: '🐸',
    desc: '「ケロッ」で 1かい、「ケロケロッ」なら 2かい、つぎのはくで ジャンプ！',
    hit(ak, bus, t) { ak.sfx(bus, 'boing', t); },
    phrase(d, r) {
      if (d >= 7 && r() < 0.22) // 3れんケロ
        return { span: 4, cues: [{ o: 0, sfx: 'croak' }, { o: 0.5, sfx: 'croak' }, { o: 1, sfx: 'croak' }], hits: [{ o: 1.5 }, { o: 2 }, { o: 2.5 }] };
      const dbl = r() < clamp(0.15 + d * 0.04, 0, 0.6);
      if (dbl) return { span: 4, cues: [{ o: 0, sfx: 'croak' }, { o: 0.5, sfx: 'croak' }], hits: [{ o: 1 }, { o: 1.5 }] };
      return { span: 2, cues: [{ o: 0, sfx: 'croak' }], hits: [{ o: 1 }] };
    },
    draw(c, v) {
      let inflate = 1, said = null;
      for (const cu of v.cues) {
        const d = v.beat - cu.beat;
        if (d >= 0 && d < 0.35) inflate = 1.25;
        if (d >= 0 && d < 0.7) said = cu;
      }
      E(c, '🐸', 250, 370, 92 * inflate);
      if (said) speech(c, 330, 290, 'ケロッ');
      E(c, '🐸', 650, 382 - jumpOffset(v, v.targets), 58);
    }
  };

  ARCH.chop = {
    base: 'からてスター', icon: '🥊',
    desc: 'とんでくる ものを ど まんなかで パンチ！われたら きもちいい！',
    hit(ak, bus, t) { ak.sfx(bus, 'crack', t); },
    phrase(d, r) {
      const icons = ['🏺', '🪨', '💡', '🎃'];
      if (d >= 7 && r() < 0.4)
        return { span: 4, cues: [{ o: 0, sfx: 'whoosh' }, { o: 1, sfx: 'whoosh' }], hits: [{ o: 2, obj: pick(r, icons) }, { o: 3, obj: pick(r, icons) }] };
      return { span: 4, cues: [{ o: 0, sfx: 'whoosh' }], hits: [{ o: 2, obj: pick(r, icons) }] };
    },
    draw(c, v) {
      const punch = v.pressAge < 0.15;
      E(c, '⭐', 430, 380, 66);
      c.strokeStyle = '#ffb703'; c.lineWidth = 10;
      c.beginPath(); c.moveTo(450, 378); c.lineTo(punch ? 540 : 470, 374); c.stroke();
      E(c, '👊', punch ? 560 : 486, 374, 36);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.1) {
            const x = lerp(940, 520, clamp(p, 0, 1.1));
            const y = 340 - Math.sin(clamp(p, 0, 1) * Math.PI) * 50;
            c.globalAlpha = fadeUra(v, p);
            E(c, t.obj || '🏺', x, y, 46);
            c.globalAlpha = 1;
          }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.5) {
            E(c, t.obj || '🏺', 520 - dt * 160, 330 - dt * 260, 30, -dt * 4);
            E(c, t.obj || '🏺', 520 + dt * 80, 330 - dt * 180, 30, dt * 4);
            E(c, '💥', 520, 330, 46 * (1 - dt));
          }
        } else {
          const dt = v.sec - t.jt;
          if (dt < 0.5) E(c, t.obj || '🏺', 520 - dt * 420, 355 + dt * 90, 46, dt * 3);
        }
      }
    }
  };

  ARCH.train = {
    base: 'シュッポーきかんしゃ', icon: '🚂',
    desc: 'きてき「ポォ〜ッ」の あと、1はくはん おくれて せきたんを ポイッ！バーつきは おしたまま きてきを ながく ならそう！',
    hit(ak, bus, t) { ak.sfx(bus, 'shk', t); },
    phrase(d, r) {
      if (d >= 3 && r() < 0.3) return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5, hold: 1.5 }] };   // ながおし: きてきを ながく
      if (d >= 8 && r() < 0.35)
        return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5 }, { o: 2.5 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5 }] };
    },
    draw(c, v) {
      const wob = bounce(v.beat) * 4;
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(0, 432, 960, 8);
      E(c, '🚂', 200, 380 - wob, 108);
      c.fillStyle = v.theme.accent;
      c.fillRect(300, 358, 200, 62);
      E(c, '⚙️', 335, 428, 34, v.beat * 2);
      E(c, '⚙️', 465, 428, 34, v.beat * 2);
      let heat = 0;
      for (const t of v.targets) if (t.judged && t.judged !== 'miss' && v.sec - t.jt < 2.5) heat++;
      E(c, '🔥', 330, 372 - wob, 26 + heat * 8);
      E(c, '⭐', 435, 348 - wob, 58);
      if (v.pressAge < 0.2) E(c, '🪨', 380, 345, 30);
      for (const t of v.targets) if (t.holding) { E(c, '💨', 250, 232, 56 + ((v.sec * 8) % 12)); speech(c, 320, 190, 'ポォォォ〜ッ'); }
      for (const cu of v.cues) {
        const d = v.beat - cu.beat;
        if (d >= 0 && d < 0.9) {
          E(c, '💨', 250, 290 - d * 70, 40 + d * 30);
          if (d < 0.7) speech(c, 300, 250, 'ポォ〜ッ');
        }
      }
    }
  };

  ARCH.flower = {
    base: 'スマイルフラワー', icon: '🌸',
    desc: 'たねが ポトン…めが すくすく…3はくめに パッ！と さく しゅんかんに タッチ！バーつきは おしたまま みずやりして、さく しゅんかんに はなす！',
    hit(ak, bus, t) { ak.sfx(bus, 'bloom', t); },
    phrase(d, r) {
      if (d >= 3 && r() < 0.3) return { span: 4, cues: [{ o: 0, sfx: 'plip' }], hits: [{ o: 1, hold: 2, slot: 0 }] };   // ながおし: みずやり
      if (d >= 7 && r() < 0.35)
        return { span: 6, cues: [{ o: 0, sfx: 'plip' }, { o: 1, sfx: 'plip' }], hits: [{ o: 3, slot: 0 }, { o: 4, slot: 1 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'plip' }], hits: [{ o: 3, slot: 0 }] };
    },
    draw(c, v) {
      E(c, '🧚', 700, 250 - bounce(v.beat * 0.5) * 14, 54);
      for (const t of v.targets) {
        const x = t.slot ? 580 : 380;
        const cb = t.cueB + (t.slot ? 1 : 0);
        const rel = v.beat - cb;
        if (rel < 0 || rel > 7) continue;
        E(c, '🪴', x, 402, 54);
        if (t.hold && t.holding) {   // みずやり中: そだつ
          const hp = clamp((v.sec - t.t) / Math.max(0.01, t.ht - t.t), 0, 1);
          E(c, '🚿', x + 48, 302, 40, -0.5);
          E(c, '🌱', x, 376, 26 + hp * 30);
        } else if (t.judged) {
          if (t.judged !== 'miss') {
            E(c, '🌸', x, 358, 58);
            if (v.sec - t.jt < 0.4) E(c, '✨', x, 318, 40);
          } else {
            E(c, '🥀', x, 366, 44);
          }
        } else if (rel < 1) {
          E(c, '🌰', x, lerp(60, 372, rel), 30);
        } else if (v.beat < t.b) {
          const gp = (v.beat - cb - 1) / (t.b - cb - 1);
          E(c, '🌱', x, 376, 26 + gp * 26);
        } else {
          E(c, '🌸', x, 360, 52);
        }
      }
    }
  };

  ARCH.robot = {
    base: 'ネジまきロボ', icon: '🤖',
    desc: '「ウィーン」の あいずで、タ・タ・タン！と れんぞくで ネジしめ！バーつきは おしたまま ぐるぐる まわそう！',
    hit(ak, bus, t) { ak.sfx(bus, 'tick', t); },
    phrase(d, r) {
      if (d >= 3 && r() < 0.3) return { span: 4, cues: [{ o: 0, sfx: 'ratchet' }], hits: [{ o: 2, hold: 1.5 }] };   // ながおし: ぐるぐる
      if (d < 5) return { span: 4, cues: [{ o: 0, sfx: 'ratchet' }], hits: [{ o: 2 }, { o: 3 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'ratchet' }], hits: [{ o: 2 }, { o: 2.5 }, { o: 3 }] };
    },
    draw(c, v) {
      E(c, '🤖', 480, 345, 118);
      const grp = v.targets.filter(t => v.beat >= t.cueB - 0.2 && v.beat <= t.b + 1);
      grp.slice(0, 3).forEach((t, i) => {
        const x = 400 + i * 80;
        if (t.judged && t.judged !== 'miss') E(c, '✅', x, 205, 36);
        else if (t.judged === 'miss') E(c, '❌', x, 205, 36);
        else E(c, '🔩', x, 205, 36);
      });
      if (grp.length && v.beat < grp[0].b && v.beat >= grp[0].cueB) E(c, '⚡', 480, 250, 34 + bounce(v.beat * 2) * 10);
      const spinning = v.targets.some(t => t.holding);
      E(c, '🔧', 565, 330, 46, spinning ? (v.sec * 12) % 6.283 : v.pressAge < 0.15 ? -1.1 : -0.2);
      if (spinning) speech(c, 480, 208, 'ウィ〜〜ン');
    }
  };

  ARCH.star = {
    base: 'スターキャッチ', icon: '🌠',
    desc: 'ながれぼしを おさらで キャッチ！あかい ほうき星は はやいぞ！',
    hit(ak, bus, t) { ak.sfx(bus, 'ding', t); },
    phrase(d, r) {
      const fast = d >= 5 && r() < clamp(0.1 + d * 0.035, 0, 0.5);
      const x = 200 + r() * 560;
      if (fast) return { span: 2, cues: [{ o: 0, sfx: 'twinkle' }], hits: [{ o: 1, x, kind: 'fast' }] };
      return { span: 4, cues: [{ o: 0, sfx: 'twinkle' }], hits: [{ o: 2, x }] };
    },
    draw(c, v) {
      let nxt = null;
      for (const t of v.targets) if (!t.judged && t.b >= v.beat - 0.3 && (!nxt || t.b < nxt.b)) nxt = t;
      const px = nxt ? nxt.x : 480;
      E(c, '⭐', px, 432, 56);
      c.strokeStyle = '#fff'; c.lineWidth = 6;
      c.beginPath(); c.arc(px, 384, 36, 0, Math.PI); c.stroke();
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.08) {
            c.globalAlpha = fadeUra(v, p);
            E(c, t.kind === 'fast' ? '☄️' : '🌠', t.x + Math.sin(p * 9) * 8, lerp(-30, 366, clamp(p, 0, 1.08)), 44);
            c.globalAlpha = 1;
          }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.5) { E(c, '⭐', t.x, 376, 40); E(c, '✨', t.x, 344, 36); }
        } else {
          const dt = v.sec - t.jt;
          if (dt < 0.4) E(c, '💫', t.x, 435, 36);
        }
      }
    }
  };

  /* ======== ふたりせんよう ミニゲーム (owner: 0=1P / 1=2P / -1=とりあい) ======== */

  ARCH.mochi = {
    base: 'もちつきペッタン', icon: '🍡', twoP: 'coop',
    desc: '1Pが「ぺったん」と ついたら、2Pが「こねっ」と かえす！こうごの リズムで おもちを つくろう！',
    hit(ak, bus, t, tg) { ak.sfx(bus, tg.owner === 0 ? 'stomp' : 'plip', t); },
    phrase(d, r) {
      if (r() < 0.35)
        return {
          span: 4, cues: [{ o: 0, sfx: 'stomp' }, { o: 0.5, sfx: 'plip' }],
          hits: [{ o: 2, owner: 0 }, { o: 2.5, owner: 1 }, { o: 3, owner: 0 }, { o: 3.5, owner: 1 }]
        };
      return {
        span: 4, cues: [{ o: 0, sfx: 'stomp' }, { o: 1, sfx: 'plip' }],
        hits: [{ o: 2, owner: 0 }, { o: 3, owner: 1 }]
      };
    },
    draw(c, v) {
      c.fillStyle = '#a4633a';
      c.beginPath(); c.ellipse(480, 412, 88, 30, 0, 0, 7); c.fill();
      c.fillStyle = '#7c4526';
      c.beginPath(); c.ellipse(480, 402, 70, 20, 0, 0, 7); c.fill();
      const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
      const sq = a0 != null && a0 < 0.2 ? 1 - (1 - a0 / 0.2) * 0.4 : 1;
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(480, 396, 52 / Math.sqrt(sq), 22 * sq, 0, 0, 7); c.fill();
      E(c, '⭐', 320, 378, 62);
      E(c, '🔨', 388, 332, 56, a0 != null && a0 < 0.25 ? 1.0 : -0.5);
      E(c, '⭐', 640, 378, 62);
      E(c, '✋', 585, a1 != null && a1 < 0.25 ? 372 : 344, 44, -0.6);
      pLabel(c, 320, 330, 0); pLabel(c, 640, 330, 1);
      for (const cu of v.cues) {
        const d2 = v.beat - cu.beat;
        if (cu.sfx === 'stomp' && d2 >= 0 && d2 < 0.8) speech(c, 480, 258, 'ぺったん♪');
      }
    }
  };

  ARCH.mikoshi = {
    base: 'おみこしワッショイ', icon: '⛩️', twoP: 'coop',
    desc: '「せ〜の」の あいずの 2はくあと、ふたり どうじに ワッショイ！ぴったり あわせて おみこしを かつげ！',
    hit(ak, bus, t) { ak.sfx(bus, 'stomp', t); },
    phrase(d, r) {
      if (r() < 0.4)
        return {
          span: 4, cues: [{ o: 0, sfx: 'beep2' }],
          hits: [{ o: 2, owner: 0 }, { o: 2, owner: 1 }, { o: 3, owner: 0 }, { o: 3, owner: 1 }]
        };
      return { span: 4, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 2, owner: 0 }, { o: 2, owner: 1 }] };
    },
    draw(c, v) {
      const hop = jumpOffset(v, v.targets);
      const y = 352 - bounce(v.beat) * 6 - hop * 0.45;
      c.fillStyle = '#c9861f';
      c.fillRect(320, y, 320, 12);
      E(c, '⛩️', 480, y - 32, 66);
      E(c, '⭐', 362, y + 42, 56);
      E(c, '⭐', 598, y + 42, 56);
      pLabel(c, 362, y - 8, 0); pLabel(c, 598, y - 8, 1);
      const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
      if (a0 != null && a1 != null && a0 < 0.35 && a1 < 0.35) speech(c, 480, y - 92, 'ワッショイ！');
      for (const cu of v.cues) {
        const d2 = v.beat - cu.beat;
        if (d2 >= 0 && d2 < 1.2) speech(c, 480, 218, 'せ〜の…');
      }
    }
  };

  ARCH.duel = {
    base: 'はやどりスター', icon: '✨', twoP: 'versus',
    desc: 'まんなかに ながれぼし！ジャストで さきに おした ほうが ゲット！はやすぎ・おそすぎは おてつきだ！',
    hit(ak, bus, t) { ak.sfx(bus, 'ding', t); },
    phrase(d, r) {
      const x = 340 + r() * 280;
      if (r() < 0.35) {
        const x2 = 340 + r() * 280;
        return {
          span: 4, cues: [{ o: 0, sfx: 'twinkle' }, { o: 1, sfx: 'twinkle' }],
          hits: [{ o: 2, owner: -1, x }, { o: 3, owner: -1, x: x2 }]
        };
      }
      return { span: 4, cues: [{ o: 0, sfx: 'twinkle' }], hits: [{ o: 2, owner: -1, x }] };
    },
    draw(c, v) {
      let n0 = 0, n1 = 0;
      for (const t of v.targets) { if (t.takenBy === 0) n0++; else if (t.takenBy === 1) n1++; }
      const dish = (x, pi) => {
        E(c, '⭐', x, 432, 54);
        c.strokeStyle = P_COL[pi]; c.lineWidth = 6;
        c.beginPath(); c.arc(x, 386, 34, 0, Math.PI); c.stroke();
        pLabel(c, x, 472, pi);
      };
      dish(310, 0); dish(650, 1);
      scoreTag(c, 150, 120, 0, '×' + n0);
      scoreTag(c, 810, 120, 1, '×' + n1);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.08) E(c, '🌠', t.x + Math.sin(p * 9) * 8, lerp(-30, 366, clamp(p, 0, 1.08)), 46);
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.45) {
            const tx = t.takenBy === 0 ? 310 : 650;
            E(c, '⭐', lerp(t.x, tx, dt / 0.45), lerp(366, 380, dt / 0.45), 40);
            E(c, '✨', t.x, 340, 34);
          }
        } else if (v.sec - t.jt < 0.4) {
          E(c, '💫', t.x, 430, 36);
        }
      }
    }
  };

  ARCH.tug = {
    base: 'つなひきリズム', icon: '🪢', twoP: 'versus',
    desc: 'ふえの「ポォ〜ッ」の 1はくはん あとに ひっぱれ！ジャストなら 2ばい ひける！はたを じぶんの じんちへ！',
    hit(ak, bus, t) { ak.sfx(bus, 'shk', t); },
    phrase(d, r) {
      if (r() < 0.4)
        return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5, owner: -1 }, { o: 2.5, owner: -1 }] };
      return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5, owner: -1 }] };
    },
    draw(c, v) {
      let pull = 0;
      for (const t of v.targets) {
        if (t.takenBy == null || !t.judged || t.judged === 'miss') continue;
        const q = t.judged === 'perfect' ? 2 : 1;
        pull += t.takenBy === 0 ? -q : q;
      }
      const flagX = 480 + clamp(pull, -9, 9) * 20;
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(480, 330); c.lineTo(480, 430); c.stroke();
      c.strokeStyle = '#c9a227'; c.lineWidth = 9;
      c.beginPath(); c.moveTo(flagX - 240, 372); c.lineTo(flagX + 240, 372); c.stroke();
      E(c, '🚩', flagX, 344, 44);
      const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
      E(c, '⭐', flagX - 160, 378 + (a0 != null && a0 < 0.2 ? 8 : 0), 58, -0.25);
      E(c, '⭐', flagX - 215, 382, 46, -0.3);
      E(c, '⭐', flagX + 160, 378 + (a1 != null && a1 < 0.2 ? 8 : 0), 58, 0.25);
      E(c, '⭐', flagX + 215, 382, 46, 0.3);
      pLabel(c, flagX - 160, 328, 0); pLabel(c, flagX + 160, 328, 1);
      for (const cu of v.cues) {
        const d2 = v.beat - cu.beat;
        if (d2 >= 0 && d2 < 0.9) speech(c, 480, 240, 'ポォ〜ッ！');
      }
    }
  };

  ARCH.volley = {
    base: 'トスでアタック', icon: '🏐', twoP: 'coop',
    desc: 'ボールが おちてきた がわが トス！もうひとりが 1はくあとに アタック！やくわりは そのつど かわるぞ！',
    hit(ak, bus, t, tg) { ak.sfx(bus, tg.role === 'toss' ? 'boing' : 'crack', t); },
    phrase(d, r) {
      const a = r() < 0.5 ? 0 : 1, b = 1 - a;
      return {
        span: 4, cues: [{ o: 0, sfx: 'plip' }],
        hits: [{ o: 2, owner: a, role: 'toss' }, { o: 3, owner: b, role: 'spike' }]
      };
    },
    draw(c, v) {
      const px = o2 => o2 === 0 ? 330 : 630;
      const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
      E(c, '⭐', 330, 382 - (a0 != null && a0 < 0.2 ? 16 : 0), 60);
      E(c, '⭐', 630, 382 - (a1 != null && a1 < 0.2 ? 16 : 0), 60);
      pLabel(c, 330, 328, 0); pLabel(c, 630, 328, 1);
      for (const t of v.targets) {
        if (t.role !== 'toss') continue;
        const spike = v.targets.find(x => x.cueB === t.cueB && x.role === 'spike');
        const rel = v.beat - t.cueB;
        if (rel < 0 || rel > 5) continue;
        let bx, by;
        if (!t.judged) {
          if (rel <= 2.1) { bx = px(t.owner); by = lerp(-30, 336, clamp(rel / 2, 0, 1.05)); }
        } else if (t.judged !== 'miss') {
          if (spike && !spike.judged) {
            const p2 = clamp((v.beat - t.b) / (spike.b - t.b), 0, 1);
            bx = lerp(px(t.owner), px(spike.owner), p2); by = 310 - Math.sin(p2 * Math.PI) * 90;
          } else if (spike && spike.judged !== 'miss') {
            const dt = v.sec - spike.jt;
            if (dt < 0.5) { bx = px(spike.owner) + dt * 520; by = 300 - dt * 420; E(c, '💥', px(spike.owner), 300, 40 * (1 - dt)); }
          } else if (spike) {
            const dt = v.sec - spike.jt;
            if (dt < 0.5) { bx = px(spike.owner) + dt * 150; by = 340 + dt * 160; }
          }
        } else {
          const dt = v.sec - t.jt;
          if (dt < 0.5) { bx = px(t.owner); by = 350 + dt * 140; }
        }
        if (bx !== undefined) E(c, '🏐', bx, by, 40);
      }
    }
  };

  ARCH.rocket = {
    base: 'ロケットカウントダウン', icon: '🚀', twoP: 'coop',
    desc: '「3・2・1」を こうごに カウントして、さいごは ふたり どうじに ハッシャ！せいこうすれば ロケットが とぶ！',
    hit(ak, bus, t, tg) { ak.sfx(bus, tg.fin ? 'boom' : 'tick', t); },
    phrase(d, r) {
      const a = r() < 0.5 ? 0 : 1, b = 1 - a;
      return {
        span: 8, cues: [{ o: 0, sfx: 'beep2' }],
        hits: [
          { o: 2, owner: a }, { o: 3, owner: b }, { o: 4, owner: a },
          { o: 5, owner: 0, fin: 1 }, { o: 5, owner: 1, fin: 1 }
        ]
      };
    },
    draw(c, v) {
      let grp = null;
      for (const t of v.targets) {
        if (v.beat >= t.cueB - 0.5 && v.beat <= t.cueB + 7.5) {
          if (!grp || t.cueB === grp[0].cueB) (grp = grp || []).push(t);
        }
      }
      let launch = null, failed = false;
      if (grp) {
        const fins = grp.filter(t => t.fin);
        if (fins.length === 2 && fins.every(t => t.judged && t.judged !== 'miss')) launch = Math.max(...fins.map(t => t.jt));
        if (fins.some(t => t.judged === 'miss')) failed = true;
      }
      const ly = launch != null ? Math.min(560, (v.sec - launch) * (v.sec - launch) * 900) : 0;
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(425, 420, 110, 14);
      const shake = grp && !launch && !failed ? Math.sin(v.sec * 42) * 2.5 : 0;
      E(c, '🚀', 480 + shake, 372 - ly, 86);
      if (launch != null && ly < 500) E(c, '🔥', 480, 428 - ly, 36 + ly * 0.08);
      if (failed) E(c, '💨', 480, 380, 52);
      E(c, '⭐', 320, 398, 54); E(c, '⭐', 640, 398, 54);
      pLabel(c, 320, 352, 0); pLabel(c, 640, 352, 1);
      if (grp) {
        const rel = v.beat - grp[0].cueB;
        let txt = null;
        if (rel >= 1.6 && rel < 2.6) txt = '3';
        else if (rel < 3.6) txt = '2';
        else if (rel < 4.6) txt = '1';
        else if (rel < 6) txt = 'ハッシャ!!';
        if (txt) {
          c.save();
          c.font = '900 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 7;
          c.fillStyle = txt === 'ハッシャ!!' ? v.theme.accent : '#fff';
          c.strokeText(txt, 480, 150); c.fillText(txt, 480, 150);
          c.restore();
        }
      }
    }
  };

  ARCH.chorus = {
    base: 'リレーコーラス', icon: '🎶', twoP: 'coop',
    desc: 'ことりの メロディを 1Pが まねっこ→ そのあと 2Pも まねっこ！じゅんばんに リレーで うたおう！',
    hit(ak, bus, t, tg) { ak.sfx(bus, 'pip', t, { f: tg.f || 880 }); },
    phrase(d, r, scale) {
      const o2 = r() < 0.5 ? 0.5 : 1;
      const notes = [0, o2].map(o => { const fi = Math.floor(r() * scale.length); return { o, fi, f: scale[fi] }; });
      return {
        span: 6,
        cues: notes.map(nn => ({ o: nn.o, sfx: 'pip', opt: { f: nn.f } })),
        hits: [
          ...notes.map(nn => ({ o: nn.o + 2, owner: 0, f: nn.f, fi: nn.fi })),
          ...notes.map(nn => ({ o: nn.o + 4, owner: 1, f: nn.f, fi: nn.fi })),
        ]
      };
    },
    draw(c, v) {
      c.fillStyle = '#8b5a2b';
      c.fillRect(115, 348, 110, 10);
      E(c, '🐦', 170, 320, 56);
      E(c, '🐤', 450, 332, 50); E(c, '🐤', 680, 332, 50);
      pLabel(c, 450, 288, 0); pLabel(c, 680, 288, 1);
      for (const t of v.targets) {
        if (t.judged) continue;
        const from = t.owner === 0 ? { x: 170, y: 300 } : { x: 450, y: 312 };
        const to = t.owner === 0 ? { x: 450, y: 312 } : { x: 680, y: 312 };
        const p = (v.beat - (t.b - 2)) / 2;
        if (p < 0 || p > 1.05) continue;
        const pp = clamp(p, 0, 1);
        E(c, '🎵', lerp(from.x, to.x, pp), (from.y - (t.fi || 0) * 18) - Math.sin(pp * Math.PI) * 42, 32);
      }
    }
  };

  ARCH.mole = {
    base: 'もぐらたたきバトル', icon: '🐹', twoP: 'versus',
    desc: 'じぶんの じんちの もぐらを たたけ！でも 💣ボムを たたいたら おおダメージ！がまんも かんじん！',
    hit(ak, bus, t) { ak.sfx(bus, 'stomp', t); },
    phrase(d, r) {
      const cues = [], hits = [];
      for (const owner of [0, 1]) {
        const o = Math.floor(r() * 3);
        const hx = (owner === 0 ? [200, 300, 400] : [560, 660, 760])[Math.floor(r() * 3)];
        const bomb = r() < 0.25;
        cues.push({ o, sfx: bomb ? 'uino' : 'boing' });
        const h = { o: o + 1, owner, hx };
        if (bomb) h.kind = 'bomb';
        hits.push(h);
      }
      return { span: 4, cues, hits };
    },
    draw(c, v) {
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(480, 300); c.lineTo(480, 445); c.stroke();
      pLabel(c, 300, 295, 0); pLabel(c, 660, 295, 1);
      c.fillStyle = 'rgba(0,0,0,.35)';
      for (const hx of [200, 300, 400, 560, 660, 760]) {
        c.beginPath(); c.ellipse(hx, 414, 34, 12, 0, 0, 7); c.fill();
      }
      for (const t of v.targets) {
        const rel = v.beat - (t.b - 1);   // とび出しは ヒットの1拍まえ
        if (rel < 0) continue;
        if (t.judged === 'bombed') {
          if (v.sec - t.jt < 0.5) E(c, '💥', t.hx, 380, 62);
          continue;
        }
        if (t.judged && t.judged !== 'miss' && t.judged !== 'passed') {
          const dt = v.sec - t.jt;
          if (dt < 0.4) { E(c, '💫', t.hx, 362, 40); E(c, '🐹', t.hx, 402, 34); }
          continue;
        }
        if (v.beat > t.b + 0.5) continue;
        const up = clamp(rel / 0.6, 0, 1);
        E(c, t.kind === 'bomb' ? '💣' : '🐹', t.hx, 410 - up * 44, 44);
      }
    }
  };

  ARCH.gunman = {
    base: 'はやうちガンマン', icon: '🤠',
    twoP: 'versus',
    desc: '「まだ…まだ…」あいずの「バンッ!」が なったら はやおし！さきに うった ほうの かち。フライングは おてつきだ！',
    hit(ak, bus, t) { ak.sfx(bus, 'pew', t); },
    phrase(d, r) {
      const sig = 1.5 + Math.floor(r() * 8) * 0.25;   // 1.5〜3.25拍のランダムな合図
      return {
        span: 4,
        cues: [{ o: 0, sfx: 'plip' }, { o: sig, sfx: 'crack' }],
        hits: [{ o: sig + 0.3, owner: -1, hidden: true, sig }]
      };
    },
    draw(c, v) {
      E(c, '🌵', 140, 392, 50); E(c, '🌵', 838, 384, 42);
      let w0 = 0, w1 = 0;
      for (const t of v.targets) { if (t.takenBy === 0) w0++; else if (t.takenBy === 1) w1++; }
      E(c, '🤠', 330, 380, 64); E(c, '🤠', 630, 380, 64);
      pLabel(c, 330, 330, 0); pLabel(c, 630, 330, 1);
      scoreTag(c, 150, 120, 0, '×' + w0);
      scoreTag(c, 810, 120, 1, '×' + w1);
      for (const t of v.targets) {
        const sigB = t.cueB + t.sig;
        const rel = v.beat - t.cueB;
        if (rel < 0 || rel > t.sig + 2.5) continue;
        if (!t.judged && v.beat < sigB) {
          c.save();
          c.font = '900 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = 'rgba(255,255,255,.85)';
          c.fillText('まだ…', 480, 170 + Math.sin(v.sec * 5) * 5);
          c.restore();
        } else if (v.beat >= sigB && v.beat < sigB + 1) {
          c.save();
          c.font = '900 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 8;
          c.fillStyle = '#ff5d5d';
          c.strokeText('バンッ!!', 480, 160); c.fillText('バンッ!!', 480, 160);
          c.restore();
        }
        if (t.judged && t.judged !== 'miss' && v.sec - t.jt < 0.7) {
          const wx = t.takenBy === 0 ? 330 : 630, lx = t.takenBy === 0 ? 630 : 330;
          E(c, '💥', wx + (t.takenBy === 0 ? 60 : -60), 360, 44);
          E(c, '😵', lx, 300, 40);
        }
      }
    }
  };

  ARCH.pingpong = {
    base: 'ピンポンラリー', icon: '🏓', twoP: 'versus',
    desc: 'こうごに うちあう ラリー！だんだん テンポが はやくなるぞ。じぶんの ばんを のがすな！',
    hit(ak, bus, t) { ak.sfx(bus, 'tick', t); },
    phrase(d, r) {
      const a = r() < 0.5 ? 0 : 1, b = 1 - a;
      return {
        span: 8, cues: [{ o: 0, sfx: 'boing' }],
        hits: [{ o: 2, owner: a }, { o: 4, owner: b }, { o: 5.5, owner: a }, { o: 6.5, owner: b }, { o: 7.25, owner: a }]
      };
    },
    draw(c, v) {
      c.fillStyle = 'rgba(10,90,70,.6)';
      c.fillRect(310, 402, 340, 16);
      c.fillStyle = 'rgba(255,255,255,.6)';
      c.fillRect(476, 384, 8, 34);
      const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
      E(c, '⭐', 290, 372, 58); E(c, '🏓', 348, 362, 42, a0 != null && a0 < 0.15 ? -0.9 : -0.2);
      E(c, '⭐', 670, 372, 58); E(c, '🏓', 612, 362, 42, a1 != null && a1 < 0.15 ? 0.9 : 0.2);
      pLabel(c, 290, 322, 0); pLabel(c, 670, 322, 1);
      const xs = t2 => t2.owner === 0 ? 320 : 640;
      const groups = {};
      for (const t of v.targets) {
        if (v.beat >= t.cueB - 0.5 && v.beat <= t.cueB + 9) (groups[t.cueB] = groups[t.cueB] || []).push(t);
      }
      for (const k in groups) {
        const seq = groups[k].sort((x2, y2) => x2.b - y2.b);
        const missIdx = seq.findIndex(t2 => t2.judged === 'miss');
        if (missIdx >= 0 && seq[missIdx].jt) {
          const m = seq[missIdx], dt = v.sec - m.jt;
          if (dt < 0.6) E(c, '⚪', xs(m) + (m.owner === 0 ? -1 : 1) * dt * 420, 366 + dt * 110, 26);
          continue;
        }
        if (v.beat < seq[0].b) {
          const p = clamp((v.beat - seq[0].cueB) / (seq[0].b - seq[0].cueB), 0, 1);
          E(c, '⚪', lerp(480, xs(seq[0]), p), lerp(140, 356, p), 26);
          continue;
        }
        let drawn = false;
        for (let i = 0; i < seq.length - 1; i++) {
          if (v.beat >= seq[i].b && v.beat < seq[i + 1].b) {
            const p = (v.beat - seq[i].b) / (seq[i + 1].b - seq[i].b);
            E(c, '⚪', lerp(xs(seq[i]), xs(seq[i + 1]), p), 356 - Math.sin(p * Math.PI) * (40 + 30 * (seq[i + 1].b - seq[i].b)), 26);
            drawn = true; break;
          }
        }
        if (!drawn) {
          const last = seq[seq.length - 1];
          if (last.judged && last.judged !== 'miss' && v.sec - last.jt < 0.5) {
            const dt = v.sec - last.jt;
            E(c, '⚪', xs(last) + (last.owner === 0 ? 1 : -1) * dt * 400, 340 - dt * 320, 26);
          }
        }
      }
    }
  };

  /* ======== 2P拡張ミニゲーム: テンプレート方式 ========
     tpl: fall(落下) / travel(飛来) / popup(飛び出し) / charge(ため) / relay(リレー) / rally(打ち合い) / cuecall(合図) */
  const oX = t => t.owner === 0 ? 320 : t.owner === 1 ? 640 : (t.x || 480);
  function itemOf(cfg, t) {
    if (t.kind === 'bomb') return cfg.bombItem || '💣';
    return Array.isArray(cfg.item) ? cfg.item[(t.vi || 0) % cfg.item.length] : (cfg.item || '⭕');
  }
  function baseScene(c, v, cfg) {
    const a0 = lastHitAge(v, 0), a1 = lastHitAge(v, 1);
    E(c, cfg.p1 || '⭐', 320, 386 - (a0 != null && a0 < 0.2 ? 14 : 0), 58);
    E(c, cfg.p2 || '⭐', 640, 386 - (a1 != null && a1 < 0.2 ? 14 : 0), 58);
    pLabel(c, 320, 334, 0); pLabel(c, 640, 334, 1);
    if (cfg.prop) E(c, cfg.prop, 480, 378 - bounce(v.beat) * 6, 62);
    if (cfg.twoP === 'versus') {
      let n0 = 0, n1 = 0;
      for (const t of v.targets) {
        const ok2 = t.judged && t.judged !== 'miss' && t.judged !== 'passed' && t.judged !== 'bombed';
        const who = t.owner === -1 ? t.takenBy : (ok2 ? t.owner : null);
        if (who === 0) n0++; else if (who === 1) n1++;
      }
      scoreTag(c, 150, 120, 0, '×' + n0);
      scoreTag(c, 810, 120, 1, '×' + n1);
    }
    for (const cu of v.cues) {
      const d2 = v.beat - cu.beat;
      const txt = cfg.cueText && cfg.cueText[cu.sfx];
      if (txt && d2 >= 0 && d2 < 0.7) speech(c, 480, 226, txt);
    }
  }
  function fx2P(c, v, t, x, y) {
    const dt = v.sec - t.jt;
    if (t.judged === 'bombed') { if (dt < 0.5) E(c, '💥', x, y - 30, 58); return; }
    if (t.judged === 'miss') { if (dt < 0.4) E(c, '💫', x, y, 34); return; }
    if (dt < 0.4) E(c, '✨', x, y - 36, 38);
  }
  const TPL = {
    fall(c, v, cfg) {
      baseScene(c, v, cfg);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        const x = t.x != null ? t.x : oX(t);
        if (t.judged) { fx2P(c, v, t, x, 380); continue; }
        if (p <= 1.08) E(c, itemOf(cfg, t), x, lerp(-30, 356, clamp(p, 0, 1.08)), 44);
      }
    },
    travel(c, v, cfg) {
      baseScene(c, v, cfg);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0) continue;
        const from = cfg.fromX != null ? { x: cfg.fromX, y: cfg.fromY || 350 }
          : cfg.toCenter ? { x: oX(t), y: 330 } : { x: 480, y: 140 };
        const to = cfg.toCenter ? { x: 480, y: 350 } : { x: t.x != null ? t.x : oX(t), y: 350 };
        if (t.judged) { fx2P(c, v, t, to.x, 380); continue; }
        if (p <= 1.08) {
          const pp = clamp(p, 0, 1.08);
          E(c, itemOf(cfg, t), lerp(from.x, to.x, pp), lerp(from.y, to.y, pp) - Math.sin(clamp(pp, 0, 1) * Math.PI) * 55, 42);
        }
      }
    },
    popup(c, v, cfg) {
      baseScene(c, v, cfg);
      for (const t of v.targets) {
        const rel = v.beat - (t.b - 1);
        if (rel < 0) continue;
        const x = t.hx != null ? t.hx : oX(t);
        if (t.judged && t.judged !== 'passed') { fx2P(c, v, t, x, 400); continue; }
        if (v.beat > t.b + 0.5) continue;
        E(c, itemOf(cfg, t), x, 412 - clamp(rel / 0.6, 0, 1) * 46, 44);
      }
    },
    charge(c, v, cfg) {
      baseScene(c, v, cfg);
      for (const t of v.targets) {
        const p = (v.beat - t.cueB) / (t.b - t.cueB);
        if (p < 0 || v.beat > t.b + 1) continue;
        const x = t.x != null ? t.x : oX(t);
        if (t.judged) { fx2P(c, v, t, x, 320); continue; }
        E(c, itemOf(cfg, t), x, 296, 22 + clamp(p, 0, 1.05) * 46);
      }
    },
    relay(c, v, cfg) {
      baseScene(c, v, cfg);
      if (cfg.src) E(c, cfg.src, 140, 330, 52);
      for (const t of v.targets) {
        if (t.judged) { fx2P(c, v, t, t.owner === 0 ? 320 : 640, 360); continue; }
        const leg = cfg.leg || 1;
        const p = (v.beat - (t.b - leg)) / leg;
        if (p < 0 || p > 1.05) continue;
        const from = t.owner === 0 ? 140 : 320, to = t.owner === 0 ? 320 : 640;
        E(c, itemOf(cfg, t), lerp(from, to, clamp(p, 0, 1)), (300 - (t.fi || 0) * 16) - Math.sin(clamp(p, 0, 1) * Math.PI) * 46, 36);
      }
    },
    rally(c, v, cfg) {
      baseScene(c, v, cfg);
      const xs = t2 => t2.owner === 0 ? 330 : 630;
      const groups = {};
      for (const t of v.targets) if (v.beat >= t.cueB - 0.5 && v.beat <= t.cueB + 10) (groups[t.cueB] = groups[t.cueB] || []).push(t);
      for (const k in groups) {
        const seq = groups[k].sort((a2, b2) => a2.b - b2.b);
        const mi2 = seq.findIndex(t2 => t2.judged === 'miss');
        if (mi2 >= 0) { const mt = seq[mi2], dt = v.sec - mt.jt; if (dt < 0.6) E(c, cfg.item, xs(mt) + (mt.owner === 0 ? -1 : 1) * dt * 420, 366 + dt * 100, 30); continue; }
        if (v.beat < seq[0].b) { const p = clamp((v.beat - seq[0].cueB) / (seq[0].b - seq[0].cueB), 0, 1); E(c, cfg.item, lerp(480, xs(seq[0]), p), lerp(150, 356, p), 30); continue; }
        for (let i = 0; i < seq.length - 1; i++) {
          if (v.beat >= seq[i].b && v.beat < seq[i + 1].b) {
            const p = (v.beat - seq[i].b) / (seq[i + 1].b - seq[i].b);
            E(c, cfg.item, lerp(xs(seq[i]), xs(seq[i + 1]), p), 356 - Math.sin(p * Math.PI) * 70, 30);
            break;
          }
        }
      }
    },
    cuecall(c, v, cfg) {
      baseScene(c, v, cfg);
      for (const t of v.targets) {
        if (t.judged) {
          if (t.judged === 'miss' || t.judged === 'bombed') { fx2P(c, v, t, oX(t), 400); continue; }
          if (t.judged === 'passed') continue;
          const dt = v.sec - t.jt;
          if (dt < 0.35) {
            c.strokeStyle = t.owner === 1 ? P_COL[1] : t.owner === 0 ? P_COL[0] : '#ffd166';
            c.lineWidth = 6; c.globalAlpha = 1 - dt / 0.35;
            c.beginPath(); c.arc(oX(t), 370, 30 + dt * 90, 0, 7); c.stroke();
            c.globalAlpha = 1;
          }
          continue;
        }
        if (t.hidden) continue;
        const dt = t.b - v.beat;
        if (dt > 0 && dt < 2) {
          c.globalAlpha = 0.5;
          E(c, '❗', oX(t), 250, 24 + (2 - dt) * 10);
          c.globalAlpha = 1;
        }
      }
      if (cfg.extra) cfg.extra(c, v, cfg);
    },
  };
  function make2P(cfg) {
    return {
      base: cfg.base, icon: cfg.icon, twoP: cfg.twoP, desc: cfg.desc,
      hit(ak, bus, t, tg) { ak.sfx(bus, typeof cfg.hitSfx === 'function' ? cfg.hitSfx(tg) : (cfg.hitSfx || 'tick'), t, { f: tg.f }); },
      phrase: cfg.phrase,
      draw(c, v) { TPL[cfg.tpl](c, v, cfg); if (cfg.tpl !== 'cuecall' && cfg.extra) cfg.extra(c, v, cfg); },
    };
  }

  const CFG2P = [
    /* ---- 協力 15 ---- */
    { key: 'canon', base: 'おいかけコーラス', icon: '🎼', twoP: 'coop', tpl: 'relay', item: '🎵', src: '🐦', hitSfx: 'pip', leg: 1,
      desc: 'ことりのうたを 1Pが うたい、2Pが 1はく おくれで おいかける カノンがっしょう！',
      phrase(d, r, scale) {
        const ns = [0, 1, 2].map(o => { const fi = Math.floor(r() * scale.length); return { o, fi, f: scale[fi] }; });
        return { span: 8, cues: ns.map(n2 => ({ o: n2.o, sfx: 'pip', opt: { f: n2.f } })),
          hits: [...ns.map(n2 => ({ o: n2.o + 2, owner: 0, f: n2.f, fi: n2.fi })), ...ns.map(n2 => ({ o: n2.o + 3, owner: 1, f: n2.f, fi: n2.fi }))] };
      } },
    { key: 'bucket', base: 'バケツリレー', icon: '🪣', twoP: 'coop', tpl: 'relay', item: '💧', src: '🚰', hitSfx: 'plip', leg: 1,
      desc: 'みずを こぼさず リレー！1Pが うけとって、2Pに わたせ！ふそくな まも あるぞ！',
      phrase(d, r) {
        const o1 = 2 + (r() < 0.5 ? 0 : 0.5);
        return { span: 8, cues: [{ o: 0, sfx: 'plip' }], hits: [{ o: o1, owner: 0 }, { o: o1 + 1, owner: 1 }, { o: o1 + 2.5, owner: 0 }, { o: o1 + 3.5, owner: 1 }] };
      } },
    { key: 'saw', base: 'のこぎりデュオ', icon: '🪚', twoP: 'coop', tpl: 'cuecall', prop: '🪵', hitSfx: 'shk', cueText: { whoosh: 'ギコギコ いくよ〜' },
      desc: 'まるたを ふたりで ギコギコ！こうごに ひいて、だんだん はやくなる！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'whoosh' }],
          hits: [{ o: 2, owner: 0 }, { o: 3, owner: 1 }, { o: 4, owner: 0 }, { o: 4.75, owner: 1 }, { o: 5.5, owner: 0 }, { o: 6, owner: 1 }] };
      } },
    { key: 'flag', base: 'あいずでフラッグ', icon: '🚩', twoP: 'coop', tpl: 'cuecall', prop: '🗼', hitSfx: 'stomp',
      desc: '「ピッ」1かい=1P、2かい=2P、3かい=ふたり！よくきいて 2はくあとに フラッグアップ！',
      phrase(d, r) {
        const n = 1 + Math.floor(r() * 3);
        const cues = []; for (let i = 0; i < n; i++) cues.push({ o: i * 0.5, sfx: 'pip', opt: { f: n === 2 ? 1046 : n === 3 ? 1319 : 784 } });
        const hits = n === 1 ? [{ o: 3, owner: 0 }] : n === 2 ? [{ o: 3, owner: 1 }] : [{ o: 3, owner: 0 }, { o: 3, owner: 1 }];
        return { span: 6, cues, hits };
      } },
    { key: 'pump', base: 'ふうせんポンプ', icon: '🎈', twoP: 'coop', tpl: 'cuecall', hitSfx: 'boing', cueText: { beep2: 'ポンプ スタート！' },
      desc: 'こうごに シュコシュコ ポンプ！さいごは ふたり どうじに キュッと むすんで かんせい！',
      phrase(d, r) {
        const a = r() < 0.5 ? 0 : 1;
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }],
          hits: [{ o: 2, owner: a }, { o: 2.5, owner: 1 - a }, { o: 3, owner: a }, { o: 3.5, owner: 1 - a }, { o: 5, owner: 0 }, { o: 5, owner: 1 }] };
      },
      extra(c, v) {
        let n = 0, active = false;
        for (const t of v.targets) if (v.beat >= t.cueB - 0.2 && v.beat <= t.cueB + 7) { active = true; if (t.judged && t.judged !== 'miss') n++; }
        if (active) E(c, '🎈', 480, 270, 28 + n * 10);
      } },
    { key: 'taiko', base: 'たいこコンビ', icon: '🥁', twoP: 'coop', tpl: 'cuecall', prop: '🥁',
      hitSfx: tg => tg.owner === 0 ? 'stomp' : 'clap',
      desc: 'ひくい音=1P、たかい音=2P！おてほんの リズムを ふたりで たたきわけろ！',
      phrase(d, r) {
        const offs = pick(r, [[0, 0.5, 1, 1.5], [0, 1, 1.5], [0, 0.5, 1.5]]);
        const ns = offs.map(o => ({ o, owner: r() < 0.5 ? 0 : 1 }));
        return { span: 8, cues: ns.map(n2 => ({ o: n2.o, sfx: 'pip', opt: { f: n2.owner === 0 ? 294 : 1175 } })),
          hits: ns.map(n2 => ({ o: n2.o + 3, owner: n2.owner })) };
      } },
    { key: 'canoe', base: 'カヌーツインズ', icon: '🛶', twoP: 'coop', tpl: 'cuecall', prop: '🛶', hitSfx: 'whoosh', cueText: { croak: 'そ〜れ！' },
      desc: 'ふたり ぴったり どうじに パドルを こごう！3かい つづけて スイスイ！',
      phrase(d, r) {
        const fast = d >= 6 && r() < 0.35;
        const os = fast ? [2, 3, 4] : [2, 4, 6];
        return { span: 8, cues: [{ o: 0, sfx: 'croak' }], hits: os.flatMap(o => [{ o, owner: 0 }, { o, owner: 1 }]) };
      } },
    { key: 'stones', base: 'とびいしわたり', icon: '🪨', twoP: 'coop', tpl: 'popup', item: '🪨', hitSfx: 'boing',
      desc: 'ふぞろいな とびいしを こうごに ジャンプ！まの ながさに きをつけて！',
      phrase(d, r) {
        const a = r() < 0.5 ? 0 : 1;
        const os = pick(r, [[2, 3.5, 4.5, 6], [2, 3, 4.5, 5.5], [2, 3.5, 5, 6]]);
        return { span: 8, cues: [{ o: 0, sfx: 'plip' }], hits: os.map((o, i) => ({ o, owner: (a + i) % 2, hx: 240 + i * 140 })) };
      } },
    { key: 'cake', base: 'ケーキデコペア', icon: '🎂', twoP: 'coop', tpl: 'travel', toCenter: true, item: ['🍦', '🍒'], prop: '🎂', hitSfx: 'plip',
      desc: '1Pが クリームを のせたら、2Pは はんぱく おくれで さくらんぼ を トッピング！',
      phrase(d, r) {
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 2, owner: 0, vi: 0 }, { o: 3.5, owner: 1, vi: 1 }] };
      } },
    { key: 'maki', base: 'まきわりコンビ', icon: '🪵', twoP: 'coop', tpl: 'cuecall', prop: '🪵', hitSfx: 'crack', cueText: { whistle: 'よ〜い…' },
      desc: '1Pが まきを セット、2Pが パカーン と わる！いきの あった コンビわざ！',
      phrase(d, r) {
        if (d >= 6 && r() < 0.4)
          return { span: 8, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 2, owner: 0 }, { o: 3, owner: 1 }, { o: 4, owner: 0 }, { o: 5, owner: 1 }] };
        return { span: 6, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 2, owner: 0 }, { o: 3, owner: 1 }] };
      } },
    { key: 'rope2', base: 'ダブルなわとび', icon: '➰', twoP: 'coop', tpl: 'cuecall', prop: '➰', hitSfx: 'boing', cueText: { whoosh: 'まわすよ〜' },
      desc: 'ふたり どうじに ジャンプ！はやまわしは テンポが 2ばいだ！',
      phrase(d, r) {
        const fast = d >= 6 && r() < 0.35;
        const os = fast ? [2, 3, 4, 5] : [2, 4, 6];
        return { span: 8, cues: [{ o: 0, sfx: 'whoosh' }], hits: os.flatMap(o => [{ o, owner: 0 }, { o, owner: 1 }]) };
      } },
    { key: 'stars2', base: 'ほしつなぎ', icon: '🌌', twoP: 'coop', tpl: 'cuecall', hitSfx: 'ding',
      desc: 'こうごに ほしを ともして、せいざを かんせいさせよう！',
      phrase(d, r) {
        const a = r() < 0.5 ? 0 : 1;
        return { span: 8, cues: [{ o: 0, sfx: 'twinkle' }], hits: [2, 3, 4, 5, 6].map((o, i) => ({ o, owner: (a + i) % 2 })) };
      },
      extra(c, v) {
        const grp = {};
        for (const t of v.targets) if (v.beat >= t.cueB - 0.5 && v.beat <= t.cueB + 8) (grp[t.cueB] = grp[t.cueB] || []).push(t);
        for (const k in grp) {
          const seq = grp[k].sort((a2, b2) => a2.b - b2.b);
          let prev = null;
          seq.forEach((t, i) => {
            const x = 200 + i * 140, y = 210 - Math.sin(i / Math.max(1, seq.length - 1) * Math.PI) * 70;
            const lit = t.judged && t.judged !== 'miss';
            if (prev && lit && prev.lit) { c.strokeStyle = '#ffe066'; c.lineWidth = 3; c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(x, y); c.stroke(); }
            c.globalAlpha = lit ? 1 : 0.35; E(c, '⭐', x, y, lit ? 34 : 24); c.globalAlpha = 1;
            prev = { x, y, lit };
          });
        }
      } },
    { key: 'bread', base: 'パンこねベーカリー', icon: '🍞', twoP: 'coop', tpl: 'cuecall', prop: '🍞', hitSfx: 'plip', cueText: { beep2: 'こねこね タイム！' },
      desc: '1Pが 3かい こねたら、2Pが すかさず ひっくりかえす！はんぱくの わりこみに ちゅうい！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 2, owner: 0 }, { o: 3, owner: 0 }, { o: 4, owner: 0 }, { o: 4.5, owner: 1 }] };
      } },
    { key: 'sweep', base: 'おそうじタッグ', icon: '🧹', twoP: 'coop', tpl: 'cuecall', prop: '🧹', hitSfx: 'shk', cueText: { whistle: 'そうじの じかん！' },
      desc: '1Pは うら拍で ハキハキ はいて、2Pが さいごに ちりとりで キャッチ！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 2.5, owner: 0 }, { o: 3.5, owner: 0 }, { o: 5, owner: 1 }] };
      } },
    { key: 'dock', base: 'うちゅうドッキング', icon: '🛰', twoP: 'coop', tpl: 'travel', toCenter: true, item: '🛰', hitSfx: 'ding', cueText: { beep2: 'ドッキング シークエンス…' },
      desc: 'カプセルが ゆっくり ちかづく…ふたり ぴったり どうじに おして ドッキングせいこう！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 6, owner: 0 }, { o: 6, owner: 1 }] };
      } },
    /* ---- 対戦 15 ---- */
    { key: 'sushi', base: 'かいてんずしバトル', icon: '🍣', twoP: 'versus', tpl: 'travel', fromX: 980, fromY: 340, toCenter: true, item: ['🍣', '🍤', '🍙'], hitSfx: 'plip',
      desc: 'レーンを ながれる おすしが まんなかに きた しゅんかんに ゲット！はやいもの がちだ！',
      phrase(d, r) {
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }],
          hits: [{ o: 2, owner: -1, vi: Math.floor(r() * 3) }, { o: 2.75, owner: -1, vi: Math.floor(r() * 3) }, { o: 3.5, owner: -1, vi: Math.floor(r() * 3) }] };
      } },
    { key: 'copycat', base: 'リズムコピーバトル', icon: '🎤', twoP: 'versus', tpl: 'cuecall', prop: '🎤',
      desc: 'おてほんの リズムを ふたり どうじに コピー！せいかくな ほうが かち！',
      phrase(d, r) {
        const offs = pick(r, [[0, 0.5, 1.5], [0, 1, 1.5], [0, 0.5, 1]]);
        return { span: 8, cues: offs.map(o => ({ o, sfx: 'clap' })),
          hits: offs.flatMap(o => [{ o: o + 3, owner: 0 }, { o: o + 3, owner: 1 }]) };
      } },
    { key: 'hockey', base: 'エアホッケー', icon: '🏒', twoP: 'versus', tpl: 'rally', item: '🟡', hitSfx: 'tick',
      desc: 'パックを うちあえ！はねかえる タイミングは まちまちだ。ばんを のがすな！',
      phrase(d, r) {
        const a = r() < 0.5 ? 0 : 1;
        const os = pick(r, [[2, 3.5, 4.5, 6.5, 7.25], [2, 3, 4.5, 5.5, 7], [2, 4, 5, 6.5, 7.5]]);
        return { span: 8, cues: [{ o: 0, sfx: 'boing' }], hits: os.map((o, i) => ({ o, owner: (a + i) % 2 })) };
      } },
    { key: 'sumo', base: 'リズムずもう', icon: '🏟', twoP: 'versus', tpl: 'cuecall', hitSfx: 'stomp', cueText: { croak: 'はっけよい…' },
      desc: 'ジャストで おすたび あいてを ぐいぐい おしだす！どひょうぎわまで おしこめ！',
      phrase(d, r) {
        if (d >= 6 && r() < 0.4) return { span: 4, cues: [{ o: 0, sfx: 'croak' }], hits: [{ o: 2, owner: -1 }, { o: 2.5, owner: -1 }, { o: 3, owner: -1 }] };
        return { span: 4, cues: [{ o: 0, sfx: 'croak' }], hits: [{ o: 2, owner: -1 }, { o: 3, owner: -1 }] };
      },
      extra(c, v) {
        let pull = 0;
        for (const t of v.targets) { if (t.takenBy == null || t.judged === 'miss') continue; pull += (t.takenBy === 0 ? -1 : 1) * (t.judged === 'perfect' ? 2 : 1); }
        const fxp = 480 + Math.max(-9, Math.min(9, pull)) * 18;
        c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 4;
        c.beginPath(); c.arc(480, 410, 160, Math.PI, 0); c.stroke();
        E(c, '🚩', fxp, 320, 42);
      } },
    { key: 'fruits', base: 'フルーツキャッチャー', icon: '🍎', twoP: 'versus', tpl: 'fall', item: ['🍎', '🍊', '🍉'], hitSfx: 'plip',
      desc: 'それぞれの フルーツを キャッチ！ときどき まんなかに きんの ほしが おちてくるぞ！',
      phrase(d, r) {
        const vi = Math.floor(r() * 3);
        const hits = [{ o: 2, owner: 0, vi }, { o: 2, owner: 1, vi: (vi + 1) % 3 }];
        if (r() < 0.3) hits.push({ o: 3.5, owner: -1, x: 480, vi: 2 });
        return { span: 4, cues: [{ o: 0, sfx: 'plip' }], hits };
      } },
    { key: 'ninja', base: 'しのびあしバトル', icon: '🥷', twoP: 'versus', tpl: 'cuecall', prop: '🏮',
      desc: 'ひくい音=1P、たかい音=2P。レーンには なにも でない…みみだけが たよりの しのび しょうぶ！',
      phrase(d, r) {
        const who = r() < 0.5 ? 0 : 1;
        const o = pick(r, [0, 0.5, 1]);
        return { span: 4, cues: [{ o, sfx: 'pip', opt: { f: who === 0 ? 392 : 1568 } }], hits: [{ o: o + 2, owner: who, hidden: true }] };
      } },
    { key: 'dance', base: 'ダンスバトル', icon: '🪩', twoP: 'versus', tpl: 'cuecall', prop: '🪩', hitSfx: 'clap',
      desc: 'おてほんの ふりつけを 1P→2Pの じゅんに ひろう！キレの いい ほうが かち！',
      phrase(d, r) {
        const offs = pick(r, [[0, 0.5, 1], [0, 1, 1.5], [0, 0.5, 1.5]]);
        return { span: 8, cues: offs.map(o => ({ o, sfx: 'shk' })),
          hits: [...offs.map(o => ({ o: o + 2, owner: 0 })), ...offs.map(o => ({ o: o + 4.5, owner: 1 }))] };
      } },
    { key: 'iai', base: 'いあいぎりしょうぶ', icon: '⚔️', twoP: 'versus', tpl: 'charge', item: '🎍', hitSfx: 'crack', cueText: { whistle: 'しんこきゅう…' },
      desc: 'なが〜い ためのあと、6はくめで イチげき！より ジャストに ちかい ほうが かち！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 6, owner: 0 }, { o: 6, owner: 1 }] };
      } },
    { key: 'race', base: 'リズムかけっこ', icon: '🏁', twoP: 'versus', tpl: 'cuecall', hitSfx: 'stomp', cueText: { beep2: 'よ〜い ドン！' },
      desc: '1Pは おもて拍、2Pは うら拍で ダッシュ！ふみはずさず ゴールへ はしれ！',
      phrase(d, r) {
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }],
          hits: [...[2, 3, 4, 5].map(o => ({ o, owner: 0 })), ...[2.5, 3.5, 4.5, 5.5].map(o => ({ o, owner: 1 }))] };
      },
      extra(c, v) {
        const cnt = [0, 0];
        for (const t of v.targets) if (t.judged && t.judged !== 'miss' && t.owner >= 0) cnt[t.owner]++;
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(120, 118, 720, 62);
        E(c, '🏁', 828, 148, 40);
        E(c, '🔵', 136 + Math.min(650, cnt[0] * 13), 136, 24);
        E(c, '🟠', 136 + Math.min(650, cnt[1] * 13), 164, 24);
      } },
    { key: 'chicken', base: 'ふうせんチキンレース', icon: '🎈', twoP: 'versus', tpl: 'charge', item: '🎈', hitSfx: 'boing',
      desc: 'ふうせんが われる ギリギリを ねらえ！はやすぎると てんが ひくい、おそいと パンク！',
      phrase(d, r) {
        const b0 = 4 + Math.floor(r() * 6) * 0.25, b1 = 4 + Math.floor(r() * 6) * 0.25;
        return { span: 8, cues: [{ o: 0, sfx: 'plip' }, { o: 2, sfx: 'plip' }],
          hits: [{ o: b0, owner: 0, hidden: true }, { o: b1, owner: 1, hidden: true }] };
      } },
    { key: 'ice', base: 'こおりわりバトル', icon: '🧊', twoP: 'versus', tpl: 'popup', item: '🧊', hitSfx: 'crack',
      desc: 'タ・タ・タン！と 3れんだで こおりを くだけ！じぶんの ばんに しっぱいするな！',
      phrase(d, r) {
        const a = r() < 0.5 ? 0 : 1;
        const hx = o2 => o2 === 0 ? [250, 320, 390] : [570, 640, 710];
        return { span: 8, cues: [{ o: 0, sfx: 'ratchet' }, { o: 2.5, sfx: 'ratchet' }],
          hits: [...[2, 2.5, 3].map((o, i) => ({ o, owner: a, hx: hx(a)[i] })), ...[4.5, 5, 5.5].map((o, i) => ({ o, owner: 1 - a, hx: hx(1 - a)[i] }))] };
      } },
    { key: 'dj', base: 'DJスクラッチバトル', icon: '🎧', twoP: 'versus', tpl: 'cuecall', prop: '🎧', hitSfx: 'shk',
      desc: '「シュッ」の あと、16ぶおんぷ ぶん ずれた シャレた タイミングで スクラッチ！',
      phrase(d, r) {
        return { span: 4, cues: [{ o: 1, sfx: 'shk' }, { o: 3, sfx: 'shk' }],
          hits: [{ o: 1.75, owner: 0 }, { o: 3.75, owner: 1 }] };
      } },
    { key: 'treasure', base: 'たからほりバトル', icon: '💎', twoP: 'versus', tpl: 'popup', item: '💎', bombItem: '🪤', hitSfx: 'ding',
      desc: 'まんなかに たからが とびだす！はやいもの がち。ただし ワナ(🪤)を たたくと だいそんがい！',
      phrase(d, r) {
        const hits = [{ o: 2, owner: -1, hx: 400 + Math.floor(r() * 4) * 55 }];
        if (r() < 0.28) hits[0].kind = 'bomb';
        if (r() < 0.4) {
          const h2 = { o: 3, owner: -1, hx: 400 + Math.floor(r() * 4) * 55 };
          if (r() < 0.28) h2.kind = 'bomb';
          hits.push(h2);
        }
        return { span: 4, cues: [{ o: 0, sfx: 'plip' }], hits };
      } },
    { key: 'invade', base: 'インベーダーたいせん', icon: '👾', twoP: 'versus', tpl: 'fall', item: '👾', hitSfx: 'pew',
      desc: 'じぶんの じんちに おりてくる インベーダーを げきつい！2はめは スピードアップ！',
      phrase(d, r) {
        const jit = () => (r() * 80 - 40);
        const hits = [{ o: 2, owner: 0, x: 320 + jit() }, { o: 2, owner: 1, x: 640 + jit() }];
        if (d >= 6 && r() < 0.45) hits.push({ o: 3.5, owner: 0, x: 320 + jit() }, { o: 3.5, owner: 1, x: 640 + jit() });
        return { span: 4, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'spark', base: 'ビリビリスイッチ', icon: '⚡', twoP: 'versus', tpl: 'popup', item: '🔘', bombItem: '⚡', hitSfx: 'tick',
      desc: 'じぶんの スイッチだけ おせ！⚡は ビリビリ ペナルティ！うら拍に でるのが いじわるだ！',
      phrase(d, r) {
        const mk = owner => {
          const h = { o: pick(r, [1.5, 2.5]) + 1, owner, hx: owner === 0 ? 260 + Math.floor(r() * 3) * 60 : 560 + Math.floor(r() * 3) * 60 };
          if (r() < 0.4) h.kind = 'bomb';
          return h;
        };
        return { span: 4, cues: [{ o: 0, sfx: 'tick' }], hits: [mk(0), mk(1)] };
      } },
  ];
  for (const cfg of CFG2P) ARCH[cfg.key] = make2P(cfg);

  /* ======== アローゲーム: ↑↓←→ が それぞれ べつのアクション(1人モード) ========
     hits に dir をつけると「その ほうこうの アローキーでしか 取れない ノーツ」になる。 */
  const DIRS = ['up', 'down', 'left', 'right'];
  const DIR_GLYPH = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
  const DIR_TONE = { up: 1319, down: 330, left: 659, right: 880 };   // 音のたかさでも ほうこうが わかる
  const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_NAME = { up: 'うえ！', down: 'した！', left: 'ひだり！', right: 'みぎ！' };
  const dirAt = (dir, cx, cy, r) => [cx + DIR_VEC[dir][0] * r, cy + DIR_VEC[dir][1] * r];
  function dirMark(c, dir, x, y, size, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; E(c, DIR_GLYPH[dir], x, y, size); c.restore();
  }
  const dirCue = (o, dir) => ({ o, sfx: 'pip', opt: { f: DIR_TONE[dir] } });

  ARCH.block = {
    base: 'ブロックマスター', icon: '🛡️', arrow: true,
    desc: 'うえ・した・ひだり・みぎ から ボールが とんでくる！とんでくる ほうこうの アローキーで ブロック！',
    hit(ak, bus, t) { ak.sfx(bus, 'crack', t); },
    phrase(d, r) {
      const d1 = pick(r, DIRS);
      if (r() < 0.35) { const d2 = pick(r, DIRS); return { span: 4, cues: [dirCue(0, d1), dirCue(1, d2)], hits: [{ o: 2, dir: d1 }, { o: 3, dir: d2 }] }; }
      return { span: 4, cues: [dirCue(0, d1)], hits: [{ o: 2, dir: d1 }] };
    },
    draw(c, v) {
      const cx = 480, cy = 290;
      E(c, '⭐', cx, cy, 64);
      for (const dir of DIRS) { const [x, y] = dirAt(dir, cx, cy, 72); dirMark(c, dir, x, y, 20, 0.3); }
      for (const t of v.targets) {
        const p = (v.beat - (t.b - 2)) / 2;
        if (p < 0) continue;
        const [fx, fy] = dirAt(t.dir, cx, cy, 300), [tx, ty] = dirAt(t.dir, cx, cy, 72);
        if (!t.judged) {
          if (p <= 1.08) { const pp = clamp(p, 0, 1.08); E(c, '⚽', lerp(fx, tx, pp), lerp(fy, ty, pp), 40); }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.45) { E(c, '🛡️', tx, ty, 46); E(c, '⚽', lerp(tx, fx, dt * 1.6), lerp(ty, fy, dt * 1.6), 32); }
        } else if (v.sec - t.jt < 0.45) E(c, '💫', cx, cy - 52, 40);
      }
    }
  };

  ARCH.boxing = {
    base: 'ボクシングジム', icon: '🥊', arrow: true,
    desc: 'コーチが かまえた ミットの いち(うえ・した・ひだり・みぎ)へ、1はくはん あとに おなじ ほうこうで パンチ！2れんだ・3れんだも！',
    hit(ak, bus, t) { ak.sfx(bus, 'stomp', t); },
    phrase(d, r) {
      const n = r() < 0.4 ? 1 : r() < 0.6 ? 2 : 3;
      const seq = []; for (let i = 0; i < n; i++) seq.push(pick(r, DIRS));
      return { span: 4, cues: seq.map((dd, i) => dirCue(i * 0.5, dd)), hits: seq.map((dd, i) => ({ o: 1.5 + i * 0.5, dir: dd })) };
    },
    draw(c, v) {
      E(c, '⭐', 330, 300, 66);
      E(c, '🐻', 640, 300, 74);
      for (const t of v.targets) {
        const [mx, my] = dirAt(t.dir, 640, 300, 66);
        const shown = v.beat >= t.b - 1.5 && (t.judged ? v.sec - t.jt < 0.3 : v.beat < t.b + 0.5);
        if (shown) { E(c, '🥊', mx, my, 34); dirMark(c, t.dir, mx + (t.dir === 'right' ? 34 : t.dir === 'left' ? -34 : 0), my + (t.dir === 'up' ? -30 : t.dir === 'down' ? 30 : -30), 18, 0.85); }
        if (!t.judged) continue;
        const dt = v.sec - t.jt;
        if (dt > 0.3) continue;
        if (t.judged === 'miss') { E(c, '💫', 330, 240, 36); continue; }
        const k = Math.min(1, dt * 6);
        E(c, '👊', lerp(380, mx - 26, k), lerp(300, my, k), 36);
        if (dt < 0.2) E(c, '💥', mx, my, 30);
      }
    }
  };

  ARCH.dance4 = {
    base: 'ダンスレッスン', icon: '🕺', arrow: true,
    desc: 'せんせいの ステップ(↑↓←→)を おぼえて、2はく おくれで おなじ ほうこう・おなじ リズムで まねっこ！',
    hit(ak, bus, t) { ak.sfx(bus, 'pip', t, { f: DIR_TONE[t.dir] }); },
    phrase(d, r) {
      const offs = pick(r, [[0, 1], [0, 0.5, 1], [0, 1, 1.5], [0, 0.5, 1, 1.5]]);
      const seq = offs.map(o => ({ o, dir: pick(r, DIRS) }));
      return { span: 4, cues: seq.map(s2 => dirCue(s2.o, s2.dir)), hits: seq.map((s2, i) => ({ o: s2.o + 2, dir: s2.dir, seqI: i, seqN: seq.length })) };
    },
    draw(c, v) {
      E(c, '🐰', 300, 310, 66); E(c, '⭐', 660, 310, 66);
      c.save(); c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.85)';
      c.fillText('せんせい', 300, 360); c.fillText('きみ', 660, 360); c.restore();
      for (const t of v.targets) {
        const rel = v.beat - (t.b - 2);
        if (rel < 0) continue;
        const off = (t.seqI - (t.seqN - 1) / 2) * 46;
        if (rel < 1.8) dirMark(c, t.dir, 300 + off, 226, 32, clamp(1.8 - rel, 0, 1));   // おてほんは きえていく(おぼえる)
        if (v.beat < t.b + 1) {
          if (t.judged && t.judged !== 'miss') dirMark(c, t.dir, 660 + off, 226, 32, 1);
          else if (t.judged === 'miss') E(c, '❌', 660 + off, 226, 26);
          else E(c, '❔', 660 + off, 226, 26);
        }
      }
    }
  };

  ARCH.shoot4 = {
    base: 'スターシューター４', icon: '🎯', arrow: true,
    desc: 'うえ・した・ひだり・みぎ に あらわれる エイリアンを、その ほうこうの アローキーで シュート！はやい やつも いるぞ！',
    hit(ak, bus, t) { ak.sfx(bus, 'pew', t); ak.sfx(bus, 'boom', t + 0.08); },
    phrase(d, r) {
      const fast = r() < 0.3;
      const cues = [{ o: fast ? 0.5 : 0, sfx: 'beep2' }];
      const hits = [{ o: 2, dir: pick(r, DIRS), wait: fast ? 1.5 : 2 }];
      if (r() < 0.35) { cues.push({ o: 1.5, sfx: 'beep2' }); hits.push({ o: 3.5, dir: pick(r, DIRS), wait: 2 }); }
      return { span: 4, cues, hits };
    },
    draw(c, v) {
      const cx = 480, cy = 290;
      E(c, '⭐', cx, cy, 60);
      for (const t of v.targets) {
        const [ax, ay] = dirAt(t.dir, cx, cy, 150);
        const p = (v.beat - (t.b - t.wait)) / t.wait;
        if (p < 0) continue;
        if (!t.judged) {
          if (p <= 1.1) {
            E(c, '👾', ax, ay, 52 * clamp(p * 3, 0, 1));
            c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9;
            c.beginPath(); c.arc(ax, ay, lerp(120, 26, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
            dirMark(c, t.dir, ax, ay - 44, 18, 0.9);
          }
        } else if (t.judged !== 'miss') {
          const dt = v.sec - t.jt;
          if (dt < 0.12) { c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke(); }
          if (dt < 0.4) E(c, '💥', ax, ay, 54 + dt * 90);
        } else if (v.sec - t.jt < 0.5) {
          const dt = v.sec - t.jt; E(c, '👾', ax + DIR_VEC[t.dir][0] * dt * 260, ay + DIR_VEC[t.dir][1] * dt * 260, 52);
        }
      }
    }
  };

  ARCH.cmdmarch = {
    base: 'ごうれいマーチ', icon: '📣', arrow: true,
    desc: 'たいちょうの ごうれい「うえ！」「みぎ！」…を きいて、3はくめに その ほうこうの アローキー！「まて！」の ときは なにも おすな！',
    hit(ak, bus, t) { ak.sfx(bus, 'stomp', t); },
    phrase(d, r) {
      if (r() < 0.22) return { span: 4, cues: [{ o: 0, sfx: 'uino' }], hits: [{ o: 3, kind: 'bomb', cmd: 'wait' }] };
      const dd = pick(r, DIRS);
      return { span: 4, cues: [dirCue(0, dd), { o: 1, sfx: 'step' }, { o: 2, sfx: 'step' }], hits: [{ o: 3, dir: dd }] };
    },
    draw(c, v) {
      E(c, '🦁', 200, 300, 70); E(c, '📣', 250, 270, 30);
      for (let i = 0; i < 3; i++) E(c, '⭐', 470 + i * 90, 392 - bounce(v.beat) * 10, 52);
      for (const t of v.targets) {
        const rel = v.beat - t.cueB;
        if (rel < 0 || rel > 4.5) continue;
        const wait = t.kind === 'bomb';
        if (rel < 1) speech(c, 300, 200, wait ? 'まて！' : DIR_NAME[t.dir]);
        else if (rel < 3 && !t.judged) {
          const n = ['イチ', 'ニ'][Math.floor(rel) - 1];
          c.save(); c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 6; c.strokeText(n, 560, 200); c.fillText(n, 560, 200); c.restore();
        }
        if (t.judged === 'bombed' && v.sec - t.jt < 0.5) E(c, '💥', 560, 300, 60);
        else if (t.judged === 'miss' && v.sec - t.jt < 0.5) E(c, '💫', 560, 300, 40);
        else if (t.judged && t.judged !== 'passed' && v.sec - t.jt < 0.6) { const [gx, gy] = dirAt(t.dir, 560, 300, 60); dirMark(c, t.dir, gx, gy, 48, 1); }
        else if (wait && t.judged === 'passed' && v.sec - t.jt < 0.6) speech(c, 560, 220, 'よし！');
      }
    }
  };

  /* ======== アローゲーム拡張(テンプレート方式): radial(中心から4方向) / sequence(おてほんと回答) / lanes(4レーン落下) / stage(舞台+合図) ======== */
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const LANE_X = { left: 260, down: 400, up: 560, right: 700 };
  function itemOf2(cfg, t) {
    if (t.kind === 'bomb') return cfg.bombItem || '💣';
    if (cfg.itemByDir) return cfg.itemByDir[t.dir] || '⭕';
    return Array.isArray(cfg.item) ? cfg.item[(t.vi || 0) % cfg.item.length] : (cfg.item || '⭕');
  }
  function judgedFx(c, v, t, x, y) {
    const dt = v.sec - t.jt;
    if (t.judged === 'bombed') { if (dt < 0.5) E(c, '💥', x, y, 58); return; }
    if (t.judged === 'passed') return;
    if (t.judged === 'miss') { if (dt < 0.45) E(c, '💫', x, y, 36); return; }
    if (dt < 0.45) E(c, '✨', x, y, 40);
  }
  const ATPL = {
    radial(c, v, cfg) {
      const cx = 480, cy = 290, near = cfg.near || 72;
      E(c, cfg.player || '⭐', cx, cy, 62);
      for (const dir of DIRS) { const [x, y] = dirAt(dir, cx, cy, near); dirMark(c, dir, x, y, 20, 0.28); }
      for (const t of v.targets) {
        if (cfg.filter && !cfg.filter(t)) continue;
        const d = cfg.itemDir ? cfg.itemDir(t) : (t.dir || t.bdir || 'up');   // 物が くる ほうこう
        const md = t.dir || d;                                                  // おす ほうこう(しるし)
        const motion = t.motion || cfg.motion;                                  // in(外から) / out(まんなかから) / pop(その場)
        const [fx, fy] = dirAt(d, cx, cy, 300), [tx, ty] = dirAt(d, cx, cy, near);
        const wait = t.wait || cfg.wait || 2;
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged) {
          judgedFx(c, v, t, tx, ty);
          if (motion === 'in' && t.judged !== 'miss' && t.judged !== 'bombed' && t.judged !== 'passed' && v.sec - t.jt < 0.45) {
            const dt = v.sec - t.jt; E(c, itemOf2(cfg, t), lerp(tx, fx, dt * 1.6), lerp(ty, fy, dt * 1.6), 30);
          }
          continue;
        }
        if (p > 1.15 || cfg.blind) continue;   // blind = みみで きく ゲーム(見せない)
        if (motion === 'in') { const pp = clamp(p, 0, 1.1); E(c, itemOf2(cfg, t), lerp(fx, tx, pp), lerp(fy, ty, pp), 42); }
        else if (motion === 'out') { const pp = clamp(p, 0, 1.1); E(c, itemOf2(cfg, t), lerp(cx, tx, pp), lerp(cy, ty, pp), 42); }
        else {
          E(c, itemOf2(cfg, t), tx, ty, 50 * clamp(p * 3, 0, 1));
          c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9;
          c.beginPath(); c.arc(tx, ty, lerp(110, 26, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
        }
        if (t.kind !== 'bomb' && !t.secret) { const [mx2, my2] = dirAt(md, cx, cy, near + 46); dirMark(c, md, mx2, my2, 18, 0.9); }
      }
    },
    sequence(c, v, cfg) {
      const [nameA, nameB] = cfg.labels || ['せんせい', 'きみ'];
      E(c, cfg.teacher || '🐰', 300, 310, 66); E(c, cfg.player || '⭐', 660, 310, 66);
      c.save(); c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.85)';
      c.fillText(nameA, 300, 360); c.fillText(nameB, 660, 360); c.restore();
      for (const t of v.targets) {
        const ct = t.cueB + (t.cueOff || 0);
        const rel = v.beat - ct;
        if (rel < 0) continue;
        const n = t.seqN || 1;
        if (cfg.reveal !== 'hidden' && t.showDir) {
          const alpha = cfg.reveal === 'fade' ? clamp(1.8 - rel, 0, 1) : (v.beat < t.b + 0.5 ? 1 : 0);
          if (alpha > 0) dirMark(c, t.showDir, 300 + ((t.showI != null ? t.showI : t.seqI) - (n - 1) / 2) * 46, 226, 32, alpha);
        }
        if (v.beat < t.b + 1) {
          const ax = 660 + (t.seqI - (n - 1) / 2) * 46;
          if (t.judged && t.judged !== 'miss') dirMark(c, t.dir, ax, 226, 32, 1);
          else if (t.judged === 'miss') E(c, '❌', ax, 226, 26);
          else E(c, '❔', ax, 226, 26);
        }
      }
    },
    lanes(c, v, cfg) {
      const wait = cfg.wait || 2;
      for (const d of DIRS) {
        const x = LANE_X[d];
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x - 46, 40, 92, 350);
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 44, 380); c.lineTo(x + 44, 380); c.stroke();
        dirMark(c, d, x, 414, 26, 0.6);
      }
      for (const t of v.targets) {
        const x = LANE_X[t.dir];
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged && !t.holding) { judgedFx(c, v, t, x, 380); continue; }
        if (t.hold) {   // ながおし: たての バー
          const yOf = bb => 380 - (bb - v.beat) * (320 / wait);
          const y1 = Math.max(60, yOf(t.b + t.hold)), y2 = Math.min(380, Math.max(60, yOf(t.b)));
          c.fillStyle = t.holding ? v.theme.accent : 'rgba(255,255,255,.4)';
          if (y2 > y1) c.fillRect(x - 12, y1, 24, y2 - y1);
          if (t.holding) continue;
        }
        if (p <= 1.1) E(c, itemOf2(cfg, t), x, lerp(60, 380, clamp(p, 0, 1.1)), 44);
      }
      // 同時押し: おなじ拍に おちてくる ものを 線で つないで「いっしょ！」
      const byB = {};
      for (const t of v.targets) {
        if (t.judged || t.kind === 'bomb') continue;
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0 || p > 1.1) continue;
        (byB[t.b.toFixed(3)] = byB[t.b.toFixed(3)] || []).push(t);
      }
      for (const k in byB) {
        const g = byB[k]; if (g.length < 2) continue;
        const xs = g.map(t => LANE_X[t.dir]), x1 = Math.min(...xs), x2 = Math.max(...xs);
        const yy = lerp(60, 380, clamp((v.beat - (g[0].b - wait)) / wait, 0, 1.1));
        c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 5; c.beginPath(); c.moveTo(x1, yy); c.lineTo(x2, yy); c.stroke();
        c.save(); c.font = '900 16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
        c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 4; c.strokeText('いっしょ！', (x1 + x2) / 2, yy - 34); c.fillText('いっしょ！', (x1 + x2) / 2, yy - 34); c.restore();
      }
      E(c, cfg.player || '⭐', 480, 470, 40);
    },
    stage(c, v, cfg) {
      const cx = 480, cy = 330;
      if (cfg.prop) E(c, cfg.prop, cx, 210, 56);
      E(c, cfg.player || '⭐', cx, cy, 66);
      for (const t of v.targets) {
        if (cfg.filter && !cfg.filter(t)) continue;
        const [x, y] = dirAt(t.dir || 'up', cx, cy, 78);
        if (t.holding) { dirMark(c, t.dir, x, y, 46, 1); continue; }
        if (t.judged) { judgedFx(c, v, t, x, y); continue; }
        const dt = t.b - v.beat;
        if (!t.hidden && !t.secret && dt > 0 && dt < 2) dirMark(c, t.dir, x, y, 22 + (2 - dt) * 10, 0.45 + (2 - dt) * 0.27);
        const ct = t.cueB + (t.cueOff || 0);
        if (cfg.say && v.beat >= ct && v.beat < ct + 0.9) { const s2 = cfg.say(t); if (s2) speech(c, cx, 190, s2); }
      }
      for (const cu of v.cues) { const d2 = v.beat - cu.beat; const txt = cfg.cueText && cfg.cueText[cu.sfx]; if (txt && d2 >= 0 && d2 < 0.7) speech(c, cx, 190, txt); }
    },
    /* 5×5 の マス: みちの やじるしを たどって ゴールへ。judged の ぶんだけ すすむ */
    grid(c, v, cfg) {
      const cs = 56, gx0 = 480 - 2 * cs, gy0 = 250 - 2 * cs;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { c.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.17)'; c.fillRect(gx0 + i * cs - cs / 2, gy0 + j * cs - cs / 2, cs - 2, cs - 2); }
      const ph = curPhrase(v, cfg.span || 8);
      let px = 2, py = 2;
      if (ph.length) {
        const sorted = ph.slice().sort((a, b2) => a.b - b2.b);
        let k = 0;
        for (const t of sorted) { if (t.judged) { const [dx, dy] = DIR_VEC[t.dir]; px += dx; py += dy; k++; } else break; }
        let qx = px, qy = py;
        for (let i = k; i < sorted.length; i++) { const t = sorted[i]; const [dx, dy] = DIR_VEC[t.dir]; qx += dx; qy += dy; dirMark(c, t.dir, gx0 + qx * cs, gy0 + qy * cs, 24, i === k ? 1 : 0.5); }
        E(c, cfg.goal || '🚩', gx0 + qx * cs, gy0 + qy * cs - 20, 30);
      }
      E(c, cfg.player || '🐹', gx0 + px * cs, gy0 + py * cs - 6, 44);
    },
    /* よこスクロール: しょうがいぶつが 右から くる。↑= ジャンプ / ↓= しゃがむ */
    runner(c, v, cfg) {
      const px = 260, gy = 400, wait = cfg.wait || 2;
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, gy + 30, 960, 4);
      let jump = 0, duck = 0;
      for (const t of v.targets) {
        const dt = v.sec - t.jt;
        if (t.judged && t.judged !== 'miss' && dt < 0.4) { if (t.dir === 'up') jump = Math.max(jump, Math.sin(dt / 0.4 * Math.PI) * 70); else duck = 1; }
      }
      E(c, cfg.player || '🏃', px, gy - jump + (duck ? 14 : 0), duck ? 40 : 56);
      for (const t of v.targets) {
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0 || p > 1.4) continue;
        const x = lerp(960, px, p), item = t.dir === 'up' ? (cfg.low || '🪵') : (cfg.high || '🪧'), y = t.dir === 'up' ? gy + 8 : gy - 60;
        if (t.judged === 'miss' && v.sec - t.jt < 0.4) E(c, '💫', px, gy - 30, 36);
        if (p <= 1.3) E(c, item, x, y, 44);
      }
    },
  };
  function makeArrow(cfg) {
    return {
      base: cfg.base, icon: cfg.icon, arrow: true, desc: cfg.desc,
      hit(ak, bus, t, tg) {
        const nm = typeof cfg.hitSfx === 'function' ? cfg.hitSfx(tg) : (cfg.hitSfx || 'tick');
        ak.sfx(bus, nm, t, { f: tg.f || (tg.dir ? DIR_TONE[tg.dir] : 880) });
      },
      phrase: cfg.phrase,
      draw(c, v) { ATPL[cfg.tpl](c, v, cfg); if (cfg.extra) cfg.extra(c, v, cfg); },
    };
  }

  const CFGA = [
    { key: 'surf', base: 'サーフィンライド', icon: '🏄', tpl: 'stage', player: '🏄', hitSfx: 'whoosh',
      desc: 'なみの おと(たかさ)で ほうこうが わかる。↑は 2はく後に ジャンプ、↓は 1はく後に しゃがみ、←→は 1はくはん後に ターン！ほうこうで タイミングが ちがうぞ！',
      say: t => ({ up: 'ジャンプ！', down: 'しゃがめ！', left: 'ひだりターン！', right: 'みぎターン！' })[t.dir],
      phrase(d, r) { const dd = pick(r, DIRS); const o = { up: 2, down: 1, left: 1.5, right: 1.5 }[dd]; return { span: 4, cues: [dirCue(0, dd)], hits: [{ o, dir: dd }] }; } },
    { key: 'fruit4', base: 'フルーツ4レーン', icon: '🍇', tpl: 'lanes', item: ['🍎', '🍊', '🍇'], wait: 2, hitSfx: 'plip',
      desc: '4つの レーンに おちてくる フルーツを、その レーンの アローキーで キャッチ！おなじ しゅんかんに 2つ おちたら、2つの キーを いっしょに おす！',
      phrase(d, r) {
        const a = pick(r, DIRS); let b2 = pick(r, DIRS); if (b2 === a) b2 = OPP[a];
        const hits = r() < 0.5 ? [{ o: 2, dir: a }, { o: 2, dir: b2 }] : [{ o: 2, dir: a }, { o: 3, dir: b2 }];
        if (r() < 0.4) hits.push({ o: 3.5, dir: pick(r, DIRS) });
        return { span: 4, cues: [{ o: 0, sfx: 'plip' }], hits: hits.map(h => ({ ...h, vi: Math.floor(r() * 3) })) };
      } },
    { key: 'mirror', base: 'かがみダンス', icon: '🪞', tpl: 'sequence', reveal: 'stay', teacher: '🪞', labels: ['かがみ', 'きみ'], hitSfx: 'clap',
      desc: 'かがみに うつった せんせいと ダンス！でも かがみは さかさま。←が でたら →、↑が でたら ↓ を 2はく後に おす！',
      phrase(d, r) {
        const offs = pick(r, [[0, 1], [0, 0.5, 1], [0, 1, 1.5]]);
        const seq = offs.map(o => ({ o, dir: pick(r, DIRS) }));
        return { span: 4, cues: seq.map(s2 => dirCue(s2.o, s2.dir)),
          hits: seq.map((s2, i) => ({ o: s2.o + 2, dir: OPP[s2.dir], showDir: s2.dir, showI: i, seqI: i, seqN: seq.length, cueOff: s2.o })) };
      } },
    { key: 'hold4', base: 'ひっぱりっこ4ほうこう', icon: '🪢', tpl: 'stage', prop: '🪢', hitSfx: 'shk', cueText: { whistle: 'ひっぱれ〜！' },
      desc: 'つなが ひっぱられる ほうこうの アローキーを おしたまま ふんばれ！バーの おわりで はなす。はやく はなすと まけ！',
      phrase(d, r) {
        const a = pick(r, DIRS);
        if (r() < 0.35) { let b2 = pick(r, DIRS); if (b2 === a) b2 = OPP[a]; return { span: 6, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5, dir: a, hold: 1 }, { o: 3.5, dir: b2, hold: 1 }] }; }
        return { span: 4, cues: [{ o: 0, sfx: 'whistle' }], hits: [{ o: 1.5, dir: a, hold: 1.5 }] };
      },
      extra(c, v) { for (const t of v.targets) if (t.holding) { const [x, y] = dirAt(t.dir, 480, 330, 250); c.strokeStyle = '#c9a227'; c.lineWidth = 8; c.beginPath(); c.moveTo(480, 330); c.lineTo(x, y); c.stroke(); E(c, '🐗', x, y, 52); } } },
    { key: 'reverse', base: 'さかさまエコー', icon: '🔁', tpl: 'sequence', reveal: 'fade', teacher: '🦉', hitSfx: 'pip',
      desc: 'せんせいの ステップ(↑↓←→)を おぼえて、2はく後に うしろから ぎゃくじゅんで まねっこ！さいごの やじるしから おすぞ！',
      phrase(d, r) {
        const offs = pick(r, [[0, 0.5], [0, 0.5, 1]]);
        const seq = offs.map(o => ({ o, dir: pick(r, DIRS) })); const n = seq.length;
        return { span: 4, cues: seq.map(s2 => dirCue(s2.o, s2.dir)),
          hits: seq.map((s2, i) => { const src = seq[n - 1 - i]; return { o: 2 + i * 0.5, dir: src.dir, showDir: src.dir, showI: n - 1 - i, seqI: i, seqN: n, cueOff: src.o }; }) };
      } },
    { key: 'soccer', base: 'トラップ＆シュート', icon: '⚽', tpl: 'radial', motion: 'in', item: '⚽', filter: t => !t.shoot, hitSfx: t => t.shoot ? 'crack' : 'stomp',
      desc: 'パスが とんでくる ほうこうの アローキーで トラップ！その 1はく後に ↑で シュート！',
      phrase(d, r) { const dd = pick(r, DIRS); return { span: 4, cues: [dirCue(0, dd)], hits: [{ o: 2, dir: dd }, { o: 3, dir: 'up', shoot: 1 }] }; },
      extra(c, v) {
        for (const t of v.targets) {
          if (!t.shoot) continue;
          if (t.judged && t.judged !== 'miss') { const dt = v.sec - t.jt; if (dt < 0.6) { E(c, '⚽', 480, 220 - dt * 420, 40); E(c, '🥅', 480, 60, 60); } }
          else if (!t.judged && v.beat > t.b - 1) { E(c, '⚽', 480, 250, 36); dirMark(c, 'up', 480, 178, 20, 0.9); E(c, '🥅', 480, 60, 60); }
          else if (t.judged === 'miss' && v.sec - t.jt < 0.5) E(c, '💫', 480, 220, 36);
        }
      } },
    { key: 'crane', base: 'クレーンゲーム', icon: '🧸', tpl: 'stage', hitSfx: t => t.dir === 'down' ? 'ding' : 'tick', cueText: { beep2: 'ぬいぐるみを ねらえ！' },
      desc: 'クレーンを ←か→で ぬいぐるみの うえまで うごかし(おなじ ほうこうを くりかえす)、さいごに ↓で つかめ！',
      phrase(d, r) {
        const side = pick(r, ['left', 'right']); const n = 1 + Math.floor(r() * 3); const hits = [];
        for (let i = 0; i < n; i++) hits.push({ o: 2 + i * 0.5, dir: side, n });
        hits.push({ o: 2 + n * 0.5, dir: 'down', n, grab: 1 });
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }, dirCue(0.5, side)], hits };
      },
      extra(c, v) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(200, 120, 560, 12);
        const grp = v.targets.filter(t => v.beat >= t.cueB - 0.5 && v.beat < t.cueB + 6);
        if (!grp.length) return;
        const g0 = grp[0]; const side = grp.find(t => t.dir !== 'down'); const sx = side ? (side.dir === 'left' ? -1 : 1) : 1;
        const done = grp.filter(t => t.dir !== 'down' && t.judged && t.judged !== 'miss').length;
        const px = 480 + sx * g0.n * 70, cx = 480 + sx * done * 70;
        const grab = grp.find(t => t.grab);
        const dropped = grab && grab.judged && grab.judged !== 'miss' && v.sec - grab.jt < 0.8;
        if (!dropped) E(c, '🧸', px, 400, 52);
        c.strokeStyle = '#888'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, 126); c.lineTo(cx, dropped ? 360 : 200); c.stroke();
        E(c, '🪝', cx, dropped ? 372 : 212, 40);
        if (dropped) E(c, '🧸', cx, 400 - (v.sec - grab.jt) * 120, 52);
      } },
    { key: 'tennis4', base: 'ラリーテニス', icon: '🎾', tpl: 'stage', prop: '🎾', hitSfx: 'crack', cueText: { boing: 'サーブ！' },
      desc: 'ボールが くる ほうこう(←か→)へ ラケットを ふれ！ラリーは だんだん はやくなるぞ！',
      phrase(d, r) { let dd = pick(r, ['left', 'right']); return { span: 8, cues: [{ o: 0, sfx: 'boing' }], hits: [2, 3, 4, 4.75, 5.5, 6].map(o => { const h = { o, dir: dd }; dd = OPP[dd]; return h; }) }; } },
    { key: 'animals', base: 'どうぶつのこえ', icon: '🐮', tpl: 'stage', hitSfx: 'pip',
      desc: 'どうぶつの なきごえ(おとの たかさ)だけが ヒント！2はく後に その どうぶつが いる ほうこうを おそう。レーンに ノーツは でないよ。',
      phrase(d, r) { const dd = pick(r, DIRS); return { span: 4, cues: [dirCue(0, dd)], hits: [{ o: 2, dir: dd, hidden: true }] }; },
      extra(c, v) {
        const AN = { up: '🐦', down: '🐸', left: '🐮', right: '🐱' };
        for (const d of DIRS) {
          const [x, y] = dirAt(d, 480, 330, 150); let sc = 1;
          for (const t of v.targets) { const rel = v.beat - t.cueB; if (t.dir === d && rel >= 0 && rel < 0.35) sc = 1.35; }
          E(c, AN[d], x, y, 50 * sc);
        }
      } },
    { key: 'pinwheel', base: 'かざぐるま', icon: '🎡', tpl: 'stage', hitSfx: 'tick', cueText: { whoosh: 'まわれ〜！' },
      desc: 'かざぐるまの まわる むきに、4つの ほうこうを 8ぶおんぷで つづけて おす！とけい回りなら ↑→↓←、ぎゃくなら ↑←↓→！',
      phrase(d, r) { const cw = r() < 0.5; const ring = cw ? ['up', 'right', 'down', 'left'] : ['up', 'left', 'down', 'right']; const st2 = Math.floor(r() * 4); return { span: 6, cues: [{ o: 0, sfx: 'whoosh' }], hits: [0, 1, 2, 3].map(i => ({ o: 2 + i * 0.5, dir: ring[(st2 + i) % 4], cw })) }; },
      extra(c, v) {
        const t = v.targets.find(x => v.beat >= x.cueB - 0.5 && v.beat < x.cueB + 5); if (!t) return;
        E(c, '🎡', 480, 210, 60, (t.cw ? 1 : -1) * v.sec * 3);
        c.save(); c.font = '900 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(t.cw ? '↻ とけい回り' : '↺ ぎゃく回り', 480, 150); c.restore();
      } },
    { key: 'word', base: 'かんばんタイピング', icon: '🪧', tpl: 'sequence', reveal: 'stay', teacher: '🪧', labels: ['かんばん', 'きみ'], hitSfx: 'tick',
      desc: 'かんばんに でた 4つの やじるしを 見て、2はく後から 8ぶおんぷで じゅんばんに タイプ！',
      phrase(d, r) { const seq = [0, 1, 2, 3].map(() => pick(r, DIRS)); return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: seq.map((dd, i) => ({ o: 2 + i * 0.5, dir: dd, showDir: dd, showI: i, seqI: i, seqN: 4, cueOff: 0 })) }; } },
    { key: 'shuriken', base: 'しゅりけんにんじゃ', icon: '🥷', tpl: 'radial', motion: 'pop', item: '🎯', player: '🥷', hitSfx: 'pew',
      desc: 'まとが とつぜん あらわれる！でた ほうこうへ 1はく後に しゅりけん！いつ でるかは まちまち。レーンに ノーツは でない。',
      phrase(d, r) { const o1 = pick(r, [1, 1.5, 1.75, 2, 2.25]); return { span: 4, cues: [{ o: 0, sfx: 'tick' }, { o: o1, sfx: 'shk' }], hits: [{ o: o1 + 1, dir: pick(r, DIRS), hidden: true, wait: 1 }] }; } },
    { key: 'sugoroku', base: 'すごろくレース', icon: '🎲', tpl: 'stage', hitSfx: t => t.dir === 'down' ? 'ding' : 'stomp',
      desc: 'サイコロの め(1〜4)の かずだけ、その ほうこうへ 8ぶおんぷで コマを すすめる！さいごに ↓で ストップ！',
      phrase(d, r) {
        const n = 1 + Math.floor(r() * 4); const dd = pick(r, ['left', 'right', 'up']); const hits = [];
        for (let i = 0; i < n; i++) hits.push({ o: 2 + i * 0.5, dir: dd, n });
        hits.push({ o: 2 + n * 0.5, dir: 'down', n, stop: 1 });
        const cues = [dirCue(0, dd)]; for (let i = 0; i < n; i++) cues.push({ o: 0.5 + i * 0.25, sfx: 'count' });
        return { span: 6, cues, hits };
      },
      extra(c, v) {
        const t = v.targets.find(x => v.beat >= x.cueB && v.beat < x.cueB + 5); if (!t) return;
        c.save(); c.font = '64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(['⚀', '⚁', '⚂', '⚃'][t.n - 1], 480, 200); c.restore();
      } },
    { key: 'mole4', base: 'もぐら4ほうこう', icon: '🐹', tpl: 'radial', motion: 'pop', item: '🐹', bombItem: '💣', near: 130, hitSfx: 'stomp',
      desc: '4つの あなから もぐらが とびだす！でた ほうこうの アローキーで たたけ。💣が でたら なにも おすな！',
      phrase(d, r) {
        const o = pick(r, [1, 1.5, 2]); const dd = pick(r, DIRS);
        if (r() < 0.25) return { span: 4, cues: [{ o, sfx: 'uino' }], hits: [{ o: o + 1, bdir: dd, kind: 'bomb', wait: 1 }] };
        const hits = [{ o: o + 1, dir: dd, wait: 1 }]; const cues = [{ o, sfx: 'boing' }];
        if (r() < 0.6) { const o2 = o + 1.5; cues.push({ o: o2, sfx: 'boing' }); hits.push({ o: o2 + 1, dir: pick(r, DIRS), wait: 1 }); }
        return { span: 4, cues, hits };
      } },
    { key: 'piano', base: 'ピアノれんしゅう', icon: '🎹', tpl: 'lanes', item: '🎵', wait: 2, player: '🎹', hitSfx: 'pip',
      desc: 'おちてくる おんぷを、その レーンの アローキーで えんそう！8ぶおんぷが 4〜6こ つづくぞ！',
      phrase(d, r) { const n = 4 + Math.floor(r() * 3); const hits = []; for (let i = 0; i < n; i++) { const dd = pick(r, DIRS); hits.push({ o: 2 + i * 0.5, dir: dd, f: DIR_TONE[dd] }); } return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
  ];
  for (const cfg of CFGA) ARCH[cfg.key] = makeArrow(cfg);

  /* ---------- アローゲーム 第2弾(20本): ことば・ねじれ・カノン・めいろ・ランナー など ---------- */
  const ROT = { up: 'right', right: 'down', down: 'left', left: 'up' };
  const DIR_WORD = { up: 'きた！', down: 'みなみ！', left: 'にし！', right: 'ひがし！' };
  const CLOCK_DIR = { 12: 'up', 3: 'right', 6: 'down', 9: 'left' };
  const CFGA2 = [
    { key: 'compass', base: 'ことばの コンパス', icon: '🧭', tpl: 'stage', player: '🧭', hitSfx: 'ding',
      desc: '「きた」「みなみ」「ひがし」「にし」の ことばだけが ヒント！きた=↑ みなみ=↓ ひがし=→ にし=← を 2はく後に おす。レーンの ノーツは「?」だよ。',
      say: t => t.word,
      phrase(d, r) {
        const a = pick(r, DIRS); const hits = [{ o: 2, dir: a, secret: true, word: DIR_WORD[a] }]; const cues = [{ o: 0, sfx: 'beep2' }];
        if (r() < 0.5) { const b2 = pick(r, DIRS); cues.push({ o: 1, sfx: 'beep2' }); hits.push({ o: 3, dir: b2, secret: true, word: DIR_WORD[b2], cueOff: 1 }); }
        return { span: 4, cues, hits };
      } },
    { key: 'traffic', base: 'こうさてん ガード', icon: '🚦', tpl: 'radial', motion: 'in', item: ['🚗', '🚕', '🚙'], wait: 2, hitSfx: 'crack',
      desc: 'こうさてんに くるまが とびこんでくる！くる ほうこうの キーで ストップ。むかいあわせに 2だい きたら、2つの キーを いっしょに おす！',
      phrase(d, r) {
        const a = pick(r, DIRS);
        if (r() < 0.5) return { span: 4, cues: [dirCue(0, a), dirCue(0.5, OPP[a])], hits: [{ o: 2, dir: a, vi: 0 }, { o: 2, dir: OPP[a], vi: 1 }] };
        const b2 = pick(r, DIRS);
        return { span: 4, cues: [dirCue(0, a), dirCue(1, b2)], hits: [{ o: 2, dir: a, vi: 0 }, { o: 3, dir: b2, vi: 2 }] };
      } },
    { key: 'drum4', base: 'たいこ4ほうこう', icon: '🥁', tpl: 'lanes', item: '🥁', wait: 2, player: '🥁', hitSfx: t => (t.dir === 'up' || t.dir === 'down' ? 'stomp' : 'clap'),
      desc: '4つの レーンに おちてくる たいこを ドコドコ たたけ！8ぶおんぷから 16ぶおんぷの フィルまで、はやい れんだが つづくぞ！',
      phrase(d, r) {
        const offs = pick(r, [[2, 2.5, 3, 3.5], [2, 2.5, 3, 3.25, 3.5, 4], [2, 2.25, 2.5, 3, 3.5, 4], [2, 2.25, 2.5, 2.75, 3, 3.5]]);
        let last = null; const hits = offs.map(o => { let dd = pick(r, DIRS); if (dd === last && r() < 0.5) dd = pick(r, DIRS); last = dd; return { o, dir: dd }; });
        return { span: 6, cues: [{ o: 0, sfx: 'stomp' }, { o: 1, sfx: 'stomp' }], hits };
      } },
    { key: 'echo4', base: 'きえる やまびこ', icon: '🏔️', tpl: 'sequence', reveal: 'fade', teacher: '🏔️', labels: ['やま', 'きみ'], hitSfx: 'pip',
      desc: 'やまから やじるしが 3〜5こ でて、すぐ きえていく！きえても おぼえて、3はく後に おなじ じゅんばんで おす！',
      phrase(d, r) {
        const n = pick(r, [3, 4, 4, 5]); const seq = []; for (let i = 0; i < n; i++) seq.push({ o: i * 0.5, dir: pick(r, DIRS) });
        return { span: 6, cues: seq.map(s2 => dirCue(s2.o, s2.dir)), hits: seq.map((s2, i) => ({ o: s2.o + 3, dir: s2.dir, showDir: s2.dir, showI: i, seqI: i, seqN: n, cueOff: s2.o })) };
      } },
    { key: 'dodge', base: 'よけろ！', icon: '🪨', tpl: 'radial', motion: 'in', item: '🪨', wait: 2, hitSfx: 'whoosh', itemDir: t => t.from,
      desc: 'いわが ころがってくる！くる ほうこうと ぎゃくの キーで よけろ（うえから きたら ↓）。しるしは よける ほうこうを さしている。',
      phrase(d, r) {
        const a = pick(r, DIRS); const hits = [{ o: 2, dir: OPP[a], from: a }]; const cues = [dirCue(0, a)];
        if (r() < 0.5) { const b2 = pick(r, DIRS); cues.push(dirCue(1, b2)); hits.push({ o: 3, dir: OPP[b2], from: b2 }); }
        return { span: 4, cues, hits };
      } },
    { key: 'twist', base: 'ねじれロボ', icon: '🤖', tpl: 'sequence', reveal: 'stay', teacher: '🤖', labels: ['ロボ', 'きみ'], hitSfx: 'ratchet',
      desc: 'ロボの やじるしを「とけい回りに 90ど ねじって」おす！↑なら →、→なら ↓、↓なら ←、←なら ↑ を 2はく後に。',
      phrase(d, r) {
        const n = pick(r, [1, 2, 2, 3]); const seq = []; for (let i = 0; i < n; i++) seq.push({ o: i * 0.5, dir: pick(r, DIRS) });
        return { span: n > 2 ? 6 : 4, cues: seq.map(s2 => dirCue(s2.o, s2.dir)), hits: seq.map((s2, i) => ({ o: s2.o + 2, dir: ROT[s2.dir], showDir: s2.dir, showI: i, seqI: i, seqN: n, cueOff: s2.o })) };
      } },
    { key: 'doubletap', base: 'ダブル・ノック', icon: '🚪', tpl: 'radial', motion: 'pop', item: '🚪', near: 120, hitSfx: 'tick',
      desc: 'ドアが でた ほうこうを「コン・コン」と 8ぶおんぷで 2かい ノック！ときどき 3かい ノックも！',
      phrase(d, r) {
        const a = pick(r, DIRS); const n = r() < 0.35 ? 3 : 2; const hits = [];
        for (let i = 0; i < n; i++) hits.push({ o: 2 + i * 0.5, dir: a, wait: i === 0 ? 1 : 0.5 });
        return { span: 4, cues: [dirCue(0.5, a), { o: 1, sfx: 'tick' }], hits };
      } },
    { key: 'maze', base: 'めいろ たんけん', icon: '🗺️', tpl: 'grid', player: '🐹', goal: '🧀', span: 8, hitSfx: 'step',
      desc: 'マスめの みちが やじるしで しめされる。2はく後から 4ぶおんぷで じゅんばんに おして、チーズまで すすめ！',
      phrase(d, r) {
        const n = pick(r, [3, 4, 4, 5]); let x = 2, y = 2; const hits = [];
        for (let i = 0; i < n; i++) {
          const cand = DIRS.filter(dd => { const [dx, dy] = DIR_VEC[dd]; return x + dx >= 0 && x + dx <= 4 && y + dy >= 0 && y + dy <= 4; });
          const dd = pick(r, cand); const [dx, dy] = DIR_VEC[dd]; x += dx; y += dy; hits.push({ o: 2 + i, dir: dd });
        }
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'canon4', base: 'カノン・ステップ', icon: '🎼', tpl: 'sequence', reveal: 'stay', teacher: '🐰', labels: ['せんせい', 'きみ'], hitSfx: 'clap',
      desc: 'せんせいが 1はくずつ やじるしを だす。きみは いつも「1はく おくれ」で おなじ やじるしを おす（かさなりながら つづく カノン）！',
      phrase(d, r) {
        const n = pick(r, [3, 4, 4, 5]); const seq = []; for (let i = 0; i < n; i++) seq.push({ o: i, dir: pick(r, DIRS) });
        return { span: n + 3, cues: seq.map(s2 => dirCue(s2.o, s2.dir)), hits: seq.map((s2, i) => ({ o: s2.o + 1, dir: s2.dir, showDir: s2.dir, showI: i, seqI: i, seqN: n, cueOff: s2.o })) };
      } },
    { key: 'pattern4', base: 'きそくを みつけろ', icon: '🔍', tpl: 'sequence', reveal: 'stay', teacher: '🦉', labels: ['もんだい', 'こたえ'], hitSfx: 'ding',
      desc: '↑→↑→ ？ のように ならんだ やじるしの きそくを みつけて、つぎに くる やじるしを 4はくめに おす！こたえは「?」で かくれている。',
      phrase(d, r) {
        const per = pick(r, [2, 2, 3]); const base = []; for (let i = 0; i < per; i++) { let dd = pick(r, DIRS); if (i && dd === base[0]) dd = OPP[dd]; base.push(dd); }
        const shownN = per === 2 ? 4 : 5; const shown = []; for (let i = 0; i < shownN; i++) shown.push(base[i % per]);
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 4, dir: base[shownN % per], secret: true, shown, seqI: 0, seqN: 1 }] };
      },
      extra(c, v) {
        const t = v.targets.find(x => v.beat >= x.cueB && v.beat < x.cueB + 6 && x.shown); if (!t) return;
        const n = t.shown.length;
        t.shown.forEach((dd, i) => { if (v.beat >= t.cueB + i * 0.5) dirMark(c, dd, 300 + (i - n / 2) * 44, 226, 30, 1); });
        E(c, '❔', 300 + (n / 2) * 44, 226, 26);
      } },
    { key: 'majority', base: 'どっちが おおい？', icon: '⚖️', tpl: 'sequence', reveal: 'stay', teacher: '⚖️', labels: ['やじるし', 'こたえ'], hitSfx: 'ding',
      desc: 'やじるしが 5こ ならぶ。いちばん おおい やじるしを 4はくめに おす！こたえは「?」だよ。',
      phrase(d, r) {
        const a = pick(r, DIRS); const others = DIRS.filter(x => x !== a); const arr = [a, a, a, pick(r, others), pick(r, others)];
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 4, dir: a, secret: true, shown: arr, seqI: 0, seqN: 1 }] };
      },
      extra(c, v) {
        const t = v.targets.find(x => v.beat >= x.cueB && v.beat < x.cueB + 6 && x.shown); if (!t) return;
        t.shown.forEach((dd, i) => { if (v.beat >= t.cueB + i * 0.4) dirMark(c, dd, 300 + (i - 2) * 44, 226, 30, 1); });
      } },
    { key: 'flyaway', base: 'とんでいく ちょうちょ', icon: '🦋', tpl: 'radial', motion: 'out', item: '🦋', near: 140, wait: 2, hitSfx: 'plip',
      desc: 'まんなかから ちょうちょが とびたつ！とんでいく ほうこうの キーを、わっかに とどいた しゅんかんに おす！',
      phrase(d, r) {
        const a = pick(r, DIRS); const hits = [{ o: 2, dir: a }]; const cues = [dirCue(0, a)];
        if (r() < 0.5) { const b2 = pick(r, DIRS); cues.push(dirCue(1.5, b2)); hits.push({ o: 3.5, dir: b2 }); }
        return { span: 6, cues, hits };
      } },
    { key: 'jumpduck', base: 'ジャンプ＆しゃがみ', icon: '🏃', tpl: 'runner', player: '🏃', low: '🪵', high: '🪧', wait: 2, hitSfx: t => (t.dir === 'up' ? 'boing' : 'whoosh'),
      desc: 'みぎから しょうがいぶつが くる！まるたは ↑で ジャンプ、かんばんは ↓で しゃがむ。とどいた しゅんかんに おせ！',
      phrase(d, r) {
        const ud = () => (r() < 0.5 ? 'up' : 'down');
        const hits = [{ o: 2, dir: ud() }];
        if (r() < 0.5) hits.push({ o: pick(r, [2.5, 3]), dir: ud() });
        if (r() < 0.3) hits.push({ o: 3.5, dir: ud() });
        return { span: 4, cues: [{ o: 0, sfx: 'shk' }], hits };
      } },
    { key: 'rocket4', base: 'ロケット はっしゃ', icon: '🚀', tpl: 'stage', player: '🚀', prop: '🌕', hitSfx: t => (t.hold ? 'whoosh' : 'pew'),
      desc: '← → で ブースターに てんか、そのあと ↑を 2はく ながおしして はっしゃ！バーの おわりで はなせ！',
      say: t => (t.hold ? 'はっしゃ！' : t.dir === 'left' ? 'ひだり てんか！' : 'みぎ てんか！'),
      phrase(d, r) {
        const first = r() < 0.5 ? 'left' : 'right';
        return { span: 8, cues: [{ o: 0, sfx: 'count' }, dirCue(1, first), dirCue(1.5, OPP[first])],
          hits: [{ o: 2, dir: first, cueOff: 1 }, { o: 2.5, dir: OPP[first], cueOff: 1.5 }, { o: 3.5, dir: 'up', hold: r() < 0.4 ? 2.5 : 2, cueOff: 2.5 }] };
      } },
    { key: 'combo', base: 'ひっさつわざ', icon: '🥋', tpl: 'sequence', reveal: 'stay', teacher: '🥋', labels: ['わざ', 'きみ'], hitSfx: 'crack',
      desc: 'ひっさつわざの コマンド(やじるし 3こ)が でる！2はく後から 8ぶおんぷ(ときどき 16ぶおんぷ)で いっきに にゅうりょく！',
      phrase(d, r) {
        const step = r() < 0.3 ? 0.25 : 0.5; const seq = []; for (let i = 0; i < 3; i++) seq.push(pick(r, DIRS));
        return { span: 4, cues: [{ o: 0, sfx: 'pew' }], hits: seq.map((dd, i) => ({ o: 2 + i * step, dir: dd, showDir: dd, showI: i, seqI: i, seqN: 3 })) };
      },
      extra(c, v) { const t = v.targets.find(x => v.beat >= x.cueB && v.beat < x.cueB + 0.9 && x.seqI === 0); if (t) speech(c, 480, 120, 'ひっさつ！'); } },
    { key: 'clockhand', base: 'とけいの はり', icon: '🕒', tpl: 'stage', player: '🕒', hitSfx: 'tick',
      desc: '「3じ！」と いわれたら はりの ほうこう →。12じ=↑ 6じ=↓ 9じ=←。2はく後に その ほうこうを おす。こたえは「?」。',
      say: t => t.hour + 'じ！',
      phrase(d, r) {
        const h = pick(r, [12, 3, 6, 9]); const hits = [{ o: 2, dir: CLOCK_DIR[h], hour: h, secret: true }]; const cues = [{ o: 0, sfx: 'tick' }];
        if (r() < 0.5) { const h2 = pick(r, [12, 3, 6, 9]); cues.push({ o: 1, sfx: 'tick' }); hits.push({ o: 3, dir: CLOCK_DIR[h2], hour: h2, secret: true, cueOff: 1 }); }
        return { span: 4, cues, hits };
      } },
    { key: 'rain4', base: 'あめの レーン', icon: '☔', tpl: 'lanes', item: '💧', wait: 2, player: '☔', hitSfx: 'plip',
      desc: 'あめつぶが おちてくる レーンの キーを おしたまま かさを さす！バーの おわりで はなす。2つ つづけて くることも！',
      phrase(d, r) {
        const a = pick(r, DIRS); const hits = [{ o: 2, dir: a, hold: r() < 0.5 ? 1 : 1.5 }];
        if (r() < 0.5) { let b2 = pick(r, DIRS); if (b2 === a) b2 = OPP[a]; hits.push({ o: 4, dir: b2, hold: 1 }); }
        return { span: 6, cues: [{ o: 0, sfx: 'plip' }], hits };
      } },
    { key: 'bell4', base: '4つの かね', icon: '🔔', tpl: 'radial', motion: 'pop', item: '🔔', near: 120, blind: true, hitSfx: 'pip',
      desc: '4つの ほうこうに おとの ちがう かねが ある。ならった メロディ(2〜3おん)を、2はく後に おなじ じゅんばんで ほうこうキーで ならせ！みみで きく ゲーム、しるしは でない。',
      phrase(d, r) {
        const n = r() < 0.5 ? 2 : 3; const seq = []; for (let i = 0; i < n; i++) seq.push(pick(r, DIRS));
        return { span: 6, cues: seq.map((dd, i) => dirCue(i * 0.5, dd)), hits: seq.map((dd, i) => ({ o: 3 + i * 0.5, dir: dd, secret: true, wait: 1, f: DIR_TONE[dd] })) };
      } },
    { key: 'boomerang', base: 'ブーメラン', icon: '🪃', tpl: 'radial', item: '🪃', near: 110, hitSfx: t => (t.back ? 'clap' : 'whoosh'),
      desc: 'でた ほうこうへ ブーメランを なげ(1かいめ)、2はく後に もどってきた ところを おなじ ほうこうで キャッチ(2かいめ)！',
      phrase(d, r) { const a = pick(r, DIRS); return { span: 6, cues: [dirCue(0, a)], hits: [{ o: 2, dir: a, motion: 'pop', wait: 1 }, { o: 4, dir: a, motion: 'in', wait: 2, back: true }] }; } },
    { key: 'speed4', base: 'はやおし 4ほうこう', icon: '⚡', tpl: 'stage', player: '⚡', hitSfx: 'pew',
      desc: 'やじるし 4こが つづけて ひかる！4ぶ → 8ぶ → 16ぶおんぷと どんどん はやくなる。ついてこい！',
      say: t => (t.seqI === 0 ? 'いくぞ！' : null),
      phrase(d, r) {
        const step = pick(r, [1, 0.5, 0.5, 0.25]); const hits = []; for (let i = 0; i < 4; i++) hits.push({ o: 2 + i * step, dir: pick(r, DIRS), seqI: i });
        return { span: step === 1 ? 6 : 4, cues: [{ o: 0, sfx: 'pew' }], hits };
      } },
  ];
  for (const cfg of CFGA2) ARCH[cfg.key] = makeArrow(cfg);
  const ARROW_GAMES2 = CFGA2.map(cfg => cfg.key);

  /* ================= キーボードせんよう ゲーム =================
     A〜Z・0〜9 の キーを つかうことを 前提に つくった ミニゲーム(モード切替では なく、ゲームそのものが キーボード用)。
     ノーツは 最初から kbd(キーコード)を もつ。hits: { o, kbd:'KeyA', ... } ／ 文字 → キーコードは KC()
     secret: true の ノーツは よこく・レーンで「?」に なる(こたえを かんがえる / おぼえる ゲーム用) */
  const KC = ch => (/^[0-9]$/.test(ch) ? 'Digit' + ch : 'Key' + ch);
  const KL = code => code.replace(/^Key|^Digit/, '');
  const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const KW3 = ['CAT', 'DOG', 'SUN', 'CAR', 'BUS', 'EGG', 'HAT', 'PIG', 'BOX', 'CUP', 'BEE', 'ANT', 'FOX', 'OWL', 'JAM', 'KEY', 'MAP', 'NET', 'PEN', 'RUN', 'SKY', 'TOY', 'VAN', 'WEB', 'ZOO', 'ICE', 'INK', 'JET', 'KID', 'LOG'];
  const KW4 = ['STAR', 'MOON', 'FISH', 'CAKE', 'BIRD', 'FROG', 'BEAR', 'LION', 'DUCK', 'SHIP', 'TREE', 'BOOK', 'MILK', 'RAIN', 'SNOW', 'GAME', 'DRUM', 'KING', 'RING', 'BELL', 'LAMP', 'CORN', 'WOLF', 'BOAT', 'HAND'];
  const KW5 = ['APPLE', 'HAPPY', 'MUSIC', 'PIANO', 'ROBOT', 'TRAIN', 'CANDY', 'PARTY', 'SMILE', 'WATER', 'JUICE', 'BEACH', 'HORSE', 'TIGER', 'MANGO', 'PEACH', 'ZEBRA', 'CLOUD', 'DANCE', 'LUCKY'];
  const LEFT_KEYS = 'QWERTASDFGZXCVB'.split(''), RIGHT_KEYS = 'YUIOPHJKLNM'.split('');
  const ROW_Q = 'QWERTYUIOP'.split(''), ROW_A = 'ASDFGHJKL'.split(''), ROW_Z = 'ZXCVBNM'.split('');
  const PIANO_KEYS = 'ASDFGHJK'.split(''), PIANO_F = [523, 587, 659, 698, 784, 880, 988, 1047];
  const KANA = { K: 'かきくけこ', S: 'さしすせそ', T: 'たちつてと', N: 'なにぬねの', H: 'はひふへほ', M: 'まみむめも', R: 'らりるれろ' };
  const MORSE = { E: '.', T: '-', I: '..', M: '--', A: '.-', N: '-.', S: '...', O: '---', U: '..-', D: '-..', K: '-.-', R: '.-.' };

  /* キーキャップ: 文字を 四角い キーの絵で。state: idle / next(つぎ) / hit / miss。hide なら「?」 */
  function keyCap(c, ch, x, y, size, state, hide = false, alpha = 1) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y);
    const w = size * 1.15, h = size * 1.15, r = size * 0.22;
    c.fillStyle = state === 'hit' ? '#7ee0a0' : state === 'miss' ? '#ff8080' : state === 'next' ? '#ffd166' : 'rgba(255,255,255,.92)';
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
    c.beginPath(); if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, r); else c.rect(-w / 2, -h / 2, w, h); c.fill(); c.stroke();
    c.fillStyle = '#333'; c.font = '900 ' + Math.round(size * 0.8) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(hide ? '?' : ch, 0, 1);
    c.restore();
  }
  const keyState = t => (!t.judged ? 'idle' : t.judged === 'miss' ? 'miss' : 'hit');
  /* いま見せる フレーズ(おなじ あいず cueB の ノーツたち)。cueB から hold 拍のあいだ 見せる */
  function curPhrase(v, hold) {
    let cb = null;
    for (const t of v.targets) if (t.cueB <= v.beat + 0.001 && v.beat < t.cueB + hold && (cb == null || t.cueB > cb)) cb = t.cueB;
    return cb == null ? [] : v.targets.filter(t => t.cueB === cb);
  }
  const nextOf = ph => ph.filter(t => !t.judged).sort((a, b2) => a.b - b2.b)[0] || null;

  const KTPL = {
    /* 文字列を キーキャップで ならべ、じゅんばんに タイプ。'-' は くぎり、' ' は あき。secret なら showFor 拍のあと「?」 */
    word(c, v, cfg) {
      E(c, cfg.player || '⭐', 480, 400 - jumpOffset(v, v.targets), 66);
      const ph = curPhrase(v, cfg.span || 8);
      if (!ph.length) return;
      const w = ph[0].word, n = w.length, size = Math.min(54, 620 / n), gap = size * 1.3;
      const x0 = 480 - (n - 1) * gap / 2;
      const nx = nextOf(ph);
      const hidden = cfg.secret && v.beat > ph[0].cueB + (cfg.showFor || 1.5);
      for (let i = 0; i < n; i++) {
        const ch = w[i], x = x0 + i * gap;
        if (ch === ' ') continue;
        if (ch === '-') { c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x - size * 0.28, 186, size * 0.56, 8); continue; }
        const t = ph.find(u => u.wi === i);
        const st = !t ? 'idle' : t.judged ? keyState(t) : (nx && nx.b === t.b ? 'next' : 'idle');
        const notYet = !!cfg.revealStep && v.beat < ph[0].cueB + i * cfg.revealStep;   // 1文字ずつ 見せる
        keyCap(c, ch, x, 190, size, st, (!!t && !t.judged && hidden) || (!!t && !t.judged && notYet), t ? 1 : 0.4);
      }
      if (ph[0].caption && (!cfg.secret || !hidden)) speech(c, 480, 110, ph[0].caption);
      if (cfg.cueSay && v.beat - ph[0].cueB < 0.8) speech(c, 480, 290, cfg.cueSay);
    },
    /* もんだい → こたえの キー。こたえは おすまで「?」 */
    quiz(c, v, cfg) {
      E(c, cfg.teacher || '🦉', 300, 330, 66); E(c, cfg.player || '⭐', 660, 330 - jumpOffset(v, v.targets), 66);
      const ph = curPhrase(v, cfg.span || 8);
      if (!ph.length) return;
      speech(c, 300, 230, ph[0].q);
      const ans = ph.slice().sort((a, b2) => (a.ai || 0) - (b2.ai || 0)), n = ans.length, nx = nextOf(ph);
      ans.forEach((t, i) => {
        const x = 660 + (i - (n - 1) / 2) * 60;
        keyCap(c, KL(t.kbd), x, 230, 48, t.judged ? keyState(t) : (nx === t ? 'next' : 'idle'), !t.judged);
      });
    },
    /* あなから キーつきの もぐらが とびだす(ボムは おさない) */
    popup(c, v, cfg) {
      const wait = cfg.wait || 1.5;
      const xy = t => [300 + t.px * 180, 190 + t.py * 95];
      for (let py = 0; py < 3; py++) for (let px = 0; px < 3; px++) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(300 + px * 180, 190 + py * 95 + 40, 40, 12, 0, 0, 7); c.fill();
      }
      for (const t of v.targets) {
        const [x, y] = xy(t);
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged) { judgedFx(c, v, t, x, y); continue; }
        if (p > 1.15) continue;
        const s = clamp(p * 3, 0, 1);
        E(c, t.kind === 'bomb' ? (cfg.bombItem || '💣') : (cfg.item || '🐹'), x, y + 22, 44 * s);
        if (t.kind !== 'bomb') keyCap(c, KL(t.kbd), x, y - 26, 34 * s, 'next');
        c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(x, y, lerp(90, 30, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
      }
      E(c, cfg.player || '⭐', 480, 480, 40);
    },
    /* キーの ならび(1れつ)に ノーツが おちてくる */
    row(c, v, cfg) {
      const keys = cfg.keys, n = keys.length, wait = cfg.wait || 2, yKey = 400;
      const xOf = i => 480 + (i - (n - 1) / 2) * (600 / (n - 1));
      keys.forEach((k, i) => {
        const hit = v.targets.some(t => t.judged && t.judged !== 'miss' && KL(t.kbd) === k && v.sec - t.jt < 0.25);
        keyCap(c, k, xOf(i), yKey, 40, hit ? 'hit' : 'idle', false, 0.92);
      });
      const yOf = bb => lerp(60, yKey - 34, clamp((v.beat - (bb - wait)) / wait, 0, 1.1));
      for (const t of v.targets) {
        const i = keys.indexOf(KL(t.kbd)); if (i < 0) continue;
        const x = xOf(i);
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged && !t.holding) { judgedFx(c, v, t, x, yKey - 44); continue; }
        if (t.hold) {   // ながおし: おんぷの うえに のびる バー
          const y1 = Math.max(60, yOf(t.b + t.hold)), y2 = yOf(t.b);
          c.fillStyle = t.holding ? v.theme.accent : 'rgba(255,255,255,.4)';
          if (y2 > y1) c.fillRect(x - 10, y1, 20, y2 - y1);
          if (t.holding) continue;
        }
        if (p > 1.1) continue;
        const y = yOf(t.b);
        E(c, cfg.item || '🎵', x, y, 40);
        keyCap(c, KL(t.kbd), x, y - 36, 22, 'next');
      }
      E(c, cfg.player || '⭐', 480, 480, 40);
    },
    /* モールス: 1つの キーを トン(タップ)・ツー(ながおし)で */
    morse(c, v, cfg) {
      E(c, cfg.player || '📡', 480, 330 - jumpOffset(v, v.targets), 66);
      const ph = curPhrase(v, cfg.span || 8);
      if (!ph.length) return;
      const t0 = ph[0], n = ph.length, nx = nextOf(ph);
      keyCap(c, KL((nx || t0).kbd), 480, 150, 56, 'next');   // いま うつ もじ(ことばなら かわっていく)
      ph.forEach((t, i) => {
        const x = 480 + (i - (n - 1) / 2) * 70;
        const st = keyState(t);
        c.fillStyle = st === 'hit' ? '#7ee0a0' : st === 'miss' ? '#ff8080' : t.holding ? v.theme.accent : nx === t ? '#ffd166' : 'rgba(255,255,255,.85)';
        if (t.hold) c.fillRect(x - 26, 222, 52, 16);
        else { c.beginPath(); c.arc(x, 230, 10, 0, 7); c.fill(); }
      });
      if (v.beat - t0.cueB < 1.2) {
        const byL = []; for (const t of ph) (byL[t.li || 0] = byL[t.li || 0] || []).push(t);
        speech(c, 480, 80, byL.map((g, i) => (t0.word ? t0.word[i] : KL(t0.kbd)) + ' ＝ ' + g.map(t => (t.hold ? 'ツー' : 'トン')).join('・')).join('　'));
      }
    },
    /* ピンポン: ひだり(1Pがわの キー)と みぎ(2Pがわの キー)を こうごに */
    rally(c, v, cfg) {
      const xL = 200, xR = 760, y = 300;
      E(c, cfg.left || '🐰', xL, y + 50, 60); E(c, cfg.right || '🐻', xR, y + 50, 60);
      const nxt = v.targets.find(t => !t.judged && t.b >= v.beat - 0.3 && v.beat >= t.cueB);
      if (nxt) {
        const to = nxt.side === 'R' ? xR : xL, from = nxt.side === 'R' ? xL : xR;
        const gap = nxt.gap || 1, p = clamp((v.beat - (nxt.b - gap)) / gap, 0, 1);
        E(c, cfg.ball || '🏓', lerp(from, to, p), y - Math.sin(p * Math.PI) * 60, 34);
        keyCap(c, KL(nxt.kbd), to, y - 70, 44, 'next');
      }
      for (const t of v.targets) if (t.judged && v.sec - t.jt < 0.45) judgedFx(c, v, t, t.side === 'R' ? xR : xL, y - 20);
      const t0 = v.targets.find(t => t.first && v.beat >= t.cueB && v.beat < t.cueB + 0.8);
      if (t0) speech(c, 480, 120, 'サーブ！');
    },
  };

  /* hits を つくる ヘルパー: 文字列 word を o0 から step 拍ごとに(' ' と '-' は とばす) */
  function wordHits(word, o0, step, extra = {}) {
    const hits = []; let k = 0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (ch === ' ' || ch === '-') { if (ch === '-') k++; continue; }   // '-' は 1つぶん あける
      hits.push({ o: o0 + k * step, kbd: KC(ch), word, wi: i, ...extra }); k++;
    }
    return hits;
  }
  function makeKbd(cfg) {
    return {
      base: cfg.base, icon: cfg.icon, kbdGame: true, desc: cfg.desc,
      hit(ak, bus, t, tg) {
        const nm = typeof cfg.hitSfx === 'function' ? cfg.hitSfx(tg) : (cfg.hitSfx || 'tick');
        ak.sfx(bus, nm, t, { f: tg.f || 880 });
      },
      phrase: cfg.phrase,
      draw(c, v) { KTPL[cfg.tpl](c, v, cfg); if (cfg.extra) cfg.extra(c, v, cfg); },
    };
  }
  const CFGK = [
    { key: 'typing', base: 'タイピング・ワード', icon: '🐱', tpl: 'word', player: '🐱', span: 6, cueSay: 'タイプ！', hitSfx: 'tick',
      desc: 'でてきた えいたんご(CAT・STAR・APPLE…)を、1もじずつ リズムに のせて タイプ！ながい たんごは 8ぶおんぷで！',
      phrase(d, r) {
        const w = d < 5 ? pick(r, KW3) : d < 7 ? pick(r, r() < 0.5 ? KW3 : KW4) : pick(r, r() < 0.4 ? KW4 : KW5);
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, w.length >= 5 ? 0.5 : 1) };
      } },
    { key: 'zipcode', base: 'ゆうびんばんごう', icon: '📮', tpl: 'word', player: '📮', span: 8, hitSfx: 'pip',
      desc: '〒123-4567 のような ゆうびんばんごうを、3けた → ひとやすみ → 4けた の リズムで うちこもう！',
      phrase(d, r) {
        let w = ''; for (let i = 0; i < 7; i++) w += (i === 3 ? '-' : '') + Math.floor(r() * 10);
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, 0.5, { caption: '〒 ゆうびんばんごう' }) };
      } },
    { key: 'homerow', base: 'ホームポジション', icon: '🖐️', tpl: 'word', player: '🖐️', span: 6, cueSay: 'ゆびの たいそう！', hitSfx: 'clap',
      desc: 'ホームポジションの キー(A S D F ／ J K L)を 8ぶおんぷで！F J F J のように ひだりと みぎを こうごに つかう れんしゅう！',
      phrase(d, r) {
        const pats = d < 5 ? ['FJFJ', 'DKDK', 'FFJJ', 'JFJF', 'SLSL'] : d < 7 ? ['ASDF', 'JKLJ', 'FDSA', 'FJDK', 'GHGH', 'AFJL'] : ['ASDFG', 'LKJHG', 'FJDKSL', 'AJSKDL', 'GFDSA'];
        const w = pick(r, pats);
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, 0.5) };
      } },
    { key: 'abcsong', base: 'ABCのうた', icon: '🎶', tpl: 'word', player: '🎶', span: 6, hitSfx: t => 'pip',
      desc: 'アルファベットの じゅんばんに 4もじ(E F G H…)を うたに のせて タイプ！むずかしくなると ぎゃくじゅん(H G F E)も！',
      phrase(d, r) {
        const s = Math.floor(r() * 23); let w = AZ.slice(s, s + 4); let cap = '';
        if (d >= 6 && r() < 0.35) { w = w.split('').reverse().join(''); cap = 'ぎゃくから！'; }
        const hits = wordHits(w, 2, 1, cap ? { caption: cap } : {}).map((h, i) => ({ ...h, f: 523 * Math.pow(2, ((AZ.indexOf(w[i]) % 7) * 2) / 12) }));
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'romaji', base: 'ローマじ タイピング', icon: '🍙', tpl: 'word', player: '🍙', span: 6, hitSfx: 'plip',
      desc: 'ひらがな 2もじ(か・き…)を ローマじで！「か」なら K と A を いっしょに おす(同時押し)！',
      phrase(d, r) {
        const cons = Object.keys(KANA), vow = 'AIUEO';
        const n = d < 6 ? 2 : 3; let w = '', kana = '';
        for (let i = 0; i < n; i++) { const cc = pick(r, cons), vi = Math.floor(r() * 5); w += (i ? ' ' : '') + cc + vow[vi]; kana += KANA[cc][vi]; }
        const hits = []; let k = 0;
        for (let i = 0; i < w.length; i++) { if (w[i] === ' ') { k++; continue; } hits.push({ o: 2 + k * (n === 3 ? 1 : 2), kbd: KC(w[i]), word: w, wi: i, caption: kana }); }
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'math', base: 'けいさんドリル', icon: '🦉', tpl: 'quiz', teacher: '🦉', player: '🐥', span: 6, hitSfx: 'ding',
      desc: 'ふくろう せんせいの けいさん(3＋4＝？)。こたえの すうじキーを 3はくめに おす！ひきざん・かけざんも でるぞ！',
      phrase(d, r) {
        let a, b2, q, ans;
        const kind = d >= 6 && r() < 0.3 ? '×' : r() < 0.5 ? '＋' : '−';
        if (kind === '＋') { a = 1 + Math.floor(r() * 8); b2 = 1 + Math.floor(r() * (9 - a)); ans = a + b2; }
        else if (kind === '−') { a = 2 + Math.floor(r() * 8); b2 = 1 + Math.floor(r() * (a - 1)); ans = a - b2; }
        else { a = 2 + Math.floor(r() * 2); b2 = 2 + Math.floor(r() * 2); ans = a * b2; }
        q = `${a} ${kind} ${b2} ＝ ？`;
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(String(ans)), q, ai: 0, secret: true }] };
      } },
    { key: 'nextone', base: 'つづきは なに？', icon: '🐘', tpl: 'quiz', teacher: '🐘', player: '🐭', span: 6, hitSfx: 'ding',
      desc: '「B C D ？」「2 4 6 ？」の つづきを かんがえて、3はくめに その キーを おす！',
      phrase(d, r) {
        let q, ans;
        if (r() < 0.5) { const s = Math.floor(r() * 23); q = `${AZ[s]} ${AZ[s + 1]} ${AZ[s + 2]} ？`; ans = AZ[s + 3]; }
        else {
          const step = d >= 5 && r() < 0.5 ? 2 : 1, down = d >= 6 && r() < 0.4;
          const s = down ? 3 * step + Math.floor(r() * (10 - 3 * step)) : Math.floor(r() * (10 - 3 * step));
          const seq = [0, 1, 2, 3].map(i => (down ? s - i * step : s + i * step));
          q = `${seq[0]} ${seq[1]} ${seq[2]} ？`; ans = String(seq[3]);
        }
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(ans), q, ai: 0, secret: true }] };
      } },
    { key: 'spellbee', base: 'スペル・ビー', icon: '🐝', tpl: 'quiz', teacher: '🐝', player: '🌻', span: 6, hitSfx: 'sparkle',
      desc: 'えいたんごの 1もじが ぬけている(C ＿ T)。ぬけた もじを 3はくめに タイプ！',
      phrase(d, r) {
        const w = d < 6 ? pick(r, KW3) : pick(r, KW4); const i = Math.floor(r() * w.length);
        const q = w.split('').map((ch, j) => (j === i ? '＿' : ch)).join(' ');
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(w[i]), q, ai: 0, secret: true }] };
      } },
    { key: 'keymole', base: 'キー・もぐらたたき', icon: '🐹', tpl: 'popup', item: '🐹', bombItem: '💣', player: '🔨', wait: 1.5, hitSfx: 'stomp',
      desc: 'あなから キーを もった もぐらが とびだす！その キーで たたけ。💣が でたら なにも おすな！',
      phrase(d, r) {
        const pos = () => ({ px: Math.floor(r() * 3), py: Math.floor(r() * 3) });
        const o = pick(r, [0.5, 1, 1.5]);
        if (r() < 0.22) return { span: 4, cues: [{ o, sfx: 'uino' }], hits: [{ o: o + 1.5, kind: 'bomb', ...pos() }] };
        const hits = [{ o: o + 1.5, kbd: KC(pick(r, AZ.split(''))), ...pos() }], cues = [{ o, sfx: 'boing' }];
        if (r() < 0.55) { const o2 = o + 2; cues.push({ o: o2, sfx: 'boing' }); hits.push({ o: o2 + 1.5, kbd: KC(pick(r, AZ.split(''))), ...pos() }); }
        return { span: hits.length > 1 ? 6 : 4, cues, hits };
      } },
    { key: 'qwerty', base: 'QWERTYレース', icon: '🏃', tpl: 'row', keys: ROW_Q, item: '🏃', player: '🏁', wait: 2, hitSfx: 'step',
      desc: 'キーボードの いちばん うえの れつ(Q W E R T Y U I O P)を、となりへ となりへ 8ぶおんぷで はしる！ぎゃくむきも！',
      phrase(d, r) {
        const n = d < 5 ? 3 : d < 7 ? 4 : 5, rev = d >= 5 && r() < 0.4;
        const s = Math.floor(r() * (10 - n)); const hits = [];
        for (let i = 0; i < n; i++) hits.push({ o: 2 + i * 0.5, kbd: KC(ROW_Q[rev ? s + n - 1 - i : s + i]) });
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'pianokey', base: 'キーボード・ピアノ', icon: '🎹', tpl: 'row', keys: PIANO_KEYS, item: '🎵', player: '🎹', wait: 2, hitSfx: 'pip',
      desc: 'A S D F G H J K が ド レ ミ ファ ソ ラ シ ド！おちてくる おんぷを その キーで えんそう！',
      phrase(d, r) {
        const rh = pick(r, d < 5 ? [[2, 3, 4], [2, 3, 4, 5]] : [[2, 2.5, 3, 4], [2, 3, 3.5, 4, 4.5], [2, 2.5, 3, 3.5, 4, 5]]);
        let i = Math.floor(r() * 8); const hits = [];
        for (const o of rh) { i = clamp(i + Math.floor(r() * 5) - 2, 0, 7); hits.push({ o, kbd: KC(PIANO_KEYS[i]), f: PIANO_F[i] }); }
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'password', base: 'ひみつの パスワード', icon: '🔐', tpl: 'word', player: '🔐', span: 8, secret: true, showFor: 2.5, hitSfx: 'tick',
      desc: '4もじの パスワードが 2はくだけ 見える。かくれたら おぼえた じゅんばんに 4はくめから タイプ！',
      phrase(d, r) {
        const pool = d < 6 ? AZ : AZ + '0123456789'; let w = ''; for (let i = 0; i < 4; i++) w += pool[Math.floor(r() * pool.length)];
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }, { o: 2.5, sfx: 'shk' }], hits: wordHits(w, 4, 1, { caption: 'おぼえて！', secret: true }) };
      } },
    { key: 'morsecode', base: 'モールス つうしん', icon: '📡', tpl: 'morse', player: '📡', span: 8, hitSfx: 'pip',
      desc: 'もじを モールスしんごうで そうしん！「トン」は タップ、「ツー」は 1はく ながおし。おなじ キーを つづけて うつ！',
      phrase(d, r) {
        const easy = ['E', 'T', 'I', 'M', 'A', 'N'], hard = ['S', 'O', 'U', 'D', 'K', 'R'];
        const ch = pick(r, d < 5 ? easy : d < 7 ? easy.concat(hard) : hard);
        const code = MORSE[ch]; const hits = []; let o = 2;
        for (const sy of code) { if (sy === '.') { hits.push({ o, kbd: KC(ch), f: 1200 }); o += 1; } else { hits.push({ o, kbd: KC(ch), hold: 1, f: 900 }); o += 2; } }
        return { span: Math.ceil((o + 1) / 2) * 2, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'pingpong', base: 'キー・ピンポン', icon: '🏓', tpl: 'rally', left: '🐰', right: '🐻', ball: '🏓', hitSfx: 'crack',
      desc: 'ひだりの キー(Q〜B)と みぎの キー(Y〜M)で こうごに ラリー！ボールが とどく しゅんかんに、パドルの キーを おす！',
      phrase(d, r) {
        const n = d < 5 ? 4 : d < 7 ? 5 : 6; const hits = []; let o = 2; let side = r() < 0.5 ? 'L' : 'R';
        for (let i = 0; i < n; i++) {
          const gap = i === 0 ? 1 : (d >= 6 && r() < 0.3 ? 0.5 : 1);
          o += i === 0 ? 0 : gap;
          hits.push({ o, kbd: KC(pick(r, side === 'L' ? LEFT_KEYS : RIGHT_KEYS)), side, gap, first: i === 0 });
          side = side === 'L' ? 'R' : 'L';
        }
        return { span: Math.ceil((o + 1.5) / 2) * 2, cues: [{ o: 0, sfx: 'whistle' }], hits };
      } },
    { key: 'countdown', base: 'カウントダウン・ロケット', icon: '🚀', tpl: 'word', player: '🚀', span: 8, hitSfx: t => (KL(t.kbd) === 'G' || KL(t.kbd) === 'O' ? 'boom' : 'count'),
      desc: '5・4・3・2・1 と すうじキーで カウントダウン、さいごに G と O を いっしょに おして はっしゃ！',
      phrase(d, r) {
        if (d >= 6 && r() < 0.4) return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [...wordHits('321', 2, 0.5, { word: '321 GO', caption: 'いそいで はっしゃ！' }), { o: 3.5, kbd: KC('G'), word: '321 GO', wi: 4, caption: 'いそいで はっしゃ！' }, { o: 3.5, kbd: KC('O'), word: '321 GO', wi: 5, caption: 'いそいで はっしゃ！' }] };
        const w = '54321 GO';
        return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: [...wordHits('54321', 2, 1, { word: w, caption: 'はっしゃ じゅんび！' }), { o: 7, kbd: KC('G'), word: w, wi: 6, caption: 'はっしゃ じゅんび！' }, { o: 7, kbd: KC('O'), word: w, wi: 7, caption: 'はっしゃ じゅんび！' }] };
      } },
    { key: 'neighbor', base: 'となりの キー', icon: '🐧', tpl: 'quiz', teacher: '🐧', player: '🐟', span: 6, hitSfx: 'ding',
      desc: '「Q の みぎどなり は？」→ W！キーボードの ならびを おもいだして、3はくめに となりの キーを おす。ひだりどなりも でるぞ！',
      phrase(d, r) {
        const row = pick(r, [ROW_Q, ROW_A, ROW_Z]); const left = d >= 6 && r() < 0.45;
        const i = left ? 1 + Math.floor(r() * (row.length - 1)) : Math.floor(r() * (row.length - 1));
        const q = `${row[i]} の ${left ? 'ひだり' : 'みぎ'}どなり は？`, ans = row[left ? i - 1 : i + 1];
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(ans), q, ai: 0, secret: true }] };
      } },
  ];
  for (const cfg of CFGK) ARCH[cfg.key] = makeKbd(cfg);
  /* ---------- キーボードせんよう ゲーム 第2弾(24本) ---------- */
  const KW6 = ['BANANA', 'MONKEY', 'ORANGE', 'YELLOW', 'PURPLE', 'SUMMER', 'WINTER', 'FLOWER', 'ROCKET', 'PLANET', 'SILVER', 'GOLDEN', 'RABBIT', 'TURTLE', 'COOKIE', 'BUTTON', 'CASTLE', 'DRAGON', 'GARDEN', 'JUNGLE'];
  const SENTENCES = ['I AM OK', 'GO GO GO', 'HI MOM', 'BE COOL', 'WE WIN', 'SO FUN', 'NO WAY', 'YES YES', 'BIG CAT', 'RED CAR', 'HOT DOG', 'ICE TEA', 'SUN UP', 'RUN FAR', 'JUMP UP', 'SIT DOWN'];
  const PICS = { CAT: '🐱', DOG: '🐶', SUN: '☀️', EGG: '🥚', HAT: '🎩', PIG: '🐷', BOX: '📦', CUP: '☕', BEE: '🐝', ANT: '🐜', FOX: '🦊', OWL: '🦉', KEY: '🔑', MAP: '🗺️', PEN: '🖊️', BUS: '🚌', CAR: '🚗', FISH: '🐟', CAKE: '🍰', FROG: '🐸', BEAR: '🐻', LION: '🦁', DUCK: '🦆', SHIP: '🚢', TREE: '🌳', BOOK: '📖', MILK: '🥛', RAIN: '🌧️', SNOW: '❄️', DRUM: '🥁', KING: '👑', RING: '💍', BELL: '🔔', MOON: '🌙', STAR: '⭐', BIRD: '🐦', APPLE: '🍎', PIANO: '🎹', ROBOT: '🤖', TRAIN: '🚂', CANDY: '🍬', HORSE: '🐴', TIGER: '🐯', ZEBRA: '🦓', CLOUD: '☁️' };
  const PIC_WORDS = Object.keys(PICS);
  const CLOCKS = { 1: '🕐', 2: '🕑', 3: '🕒', 4: '🕓', 5: '🕔', 6: '🕕', 7: '🕖', 8: '🕗', 9: '🕘', 10: '🕙', 11: '🕚', 12: '🕛' };
  const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const COUNT_ITEMS = ['🍎', '⭐', '🐟', '🎈', '🍪', '🐥'];
  const MORSE2 = { H: '....', W: '.--', G: '--.', L: '.-..' };
  const MORSE_WORDS = ['HI', 'IT', 'AT', 'ME', 'NO', 'ON', 'IN', 'AN', 'AM', 'TO', 'SO', 'US', 'DO', 'GO', 'WE', 'HE'];
  const morseOf = ch => MORSE[ch] || MORSE2[ch];
  const ansHits = (str, o0, step, q, extra = {}) => str.split('').map((ch, i) => ({ o: o0 + i * step, kbd: KC(ch), q, ai: i, secret: true, ...extra }));
  const CFGK2 = [
    { key: 'sentence', base: 'みじかい えいぶん', icon: '📝', tpl: 'word', player: '📝', span: 6, cueSay: 'よんで タイプ！', hitSfx: 'tick',
      desc: '「I AM OK」のような みじかい えいぶんを 8ぶおんぷで タイプ！スペースの ところは ひとやすみ。',
      phrase(d, r) { const w = pick(r, SENTENCES); return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, 0.5) }; } },
    { key: 'reverseword', base: 'さかさ タイピング', icon: '🙃', tpl: 'word', player: '🙃', span: 6, hitSfx: 'plip',
      desc: 'でた たんごを「さいごの もじから」さかさに タイプ！CAT なら T → A → C。ひかる ところが つぎの もじ。',
      phrase(d, r) {
        const w = pick(r, r() < 0.5 ? KW3 : KW4); const hits = wordHits(w, 2, 1, { caption: 'さかさに！' });
        hits.forEach((h, i) => { h.o = 2 + (hits.length - 1 - i); });
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'vowels', base: 'ぼいんだけ', icon: '🅰️', tpl: 'word', player: '🅰️', span: 6, hitSfx: 'ding',
      desc: 'たんごの なかの ぼいん(A I U E O)だけを、その もじの ばしょの リズムで タイプ！しいんは おさない。',
      phrase(d, r) {
        let w = pick(r, r() < 0.5 ? KW4 : KW5); if (!/[AEIOU]/.test(w)) w = 'APPLE';
        const hits = []; for (let i = 0; i < w.length; i++) if (/[AEIOU]/.test(w[i])) hits.push({ o: 2 + i * 0.5, kbd: KC(w[i]), word: w, wi: i, caption: 'ぼいんだけ！' });
        return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'binary', base: 'デジタル・ビート', icon: '💾', tpl: 'word', player: '💾', span: 6, hitSfx: t => (KL(t.kbd) === '1' ? 'pip' : 'tick'),
      desc: '0 と 1 だけの 8けたを 8ぶおんぷで うちこむ！1 は たかい おと、0 は ひくい おと。',
      phrase(d, r) { let w = ''; for (let i = 0; i < 8; i++) w += r() < 0.5 ? '0' : '1'; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, 0.5, { caption: 'デジタル！' }).map(h => ({ ...h, f: KL(h.kbd) === '1' ? 1320 : 660 })) }; } },
    { key: 'dicesum', base: 'サイコロ たしざん', icon: '🎲', tpl: 'quiz', teacher: '🎲', player: '🐼', span: 6, hitSfx: 'ding',
      desc: 'サイコロ 2つの めを たして、こたえを 3はくめから すうじで！10 いじょうは 2けた（1 → 0）。',
      phrase(d, r) { const a = 1 + Math.floor(r() * 6), b2 = 1 + Math.floor(r() * 6); const q = `${DICE[a - 1]} ＋ ${DICE[b2 - 1]} ＝ ？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: ansHits(String(a + b2), 3, 1, q) }; } },
    { key: 'clock', base: 'いま なんじ？', icon: '🕰️', tpl: 'quiz', teacher: '🕰️', player: '🐓', span: 6, hitSfx: 'tick',
      desc: 'とけいの えを 見て、なんじか すうじで こたえる！10・11・12じは 2けた。',
      phrase(d, r) { const h = 1 + Math.floor(r() * 12); const q = `${CLOCKS[h]} いま なんじ？`; return { span: 6, cues: [{ o: 0, sfx: 'tick' }], hits: ansHits(String(h), 3, 1, q) }; } },
    { key: 'initials', base: 'えいごの あたまもじ', icon: '🔤', tpl: 'quiz', teacher: '🦜', player: '🐣', span: 6, hitSfx: 'sparkle',
      desc: 'えを 見て、その えいごの さいしょの もじを 3はくめに タイプ！🐱 なら C（CAT）。',
      phrase(d, r) { const w = pick(r, PIC_WORDS); const q = `${PICS[w]} の えいごの あたまもじ は？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(w[0]), q, ai: 0, secret: true }] }; } },
    { key: 'spellpic', base: 'えを 見て スペル', icon: '🖼️', tpl: 'quiz', teacher: '🖼️', player: '🐨', span: 8, hitSfx: 'sparkle',
      desc: 'えを 見て、その えいごを 3はくめから 1もじずつ タイプ！🐱 → C・A・T。',
      phrase(d, r) { const pool = PIC_WORDS.filter(w => w.length === (r() < 0.6 ? 3 : 4)); const w = pick(r, pool); const q = `${PICS[w]} を スペル！（${w.length}もじ）`; return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: ansHits(w, 3, 1, q) }; } },
    { key: 'shiritori', base: 'さいごの もじ', icon: '🔚', tpl: 'quiz', teacher: '🐢', player: '🐇', span: 6, hitSfx: 'ding',
      desc: 'でた たんごの「さいごの もじ」を 3はくめに タイプ！しりとりの れんしゅう。',
      phrase(d, r) { const w = pick(r, r() < 0.5 ? KW4 : KW5); const q = `${w} の さいごの もじ は？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(w[w.length - 1]), q, ai: 0, secret: true }] }; } },
    { key: 'count', base: 'いくつ ある？', icon: '🔢', tpl: 'quiz', teacher: '🐘', player: '🐭', span: 6, hitSfx: 'ding',
      desc: 'ならんだ ものの かずを かぞえて、3はくめに すうじで こたえる！',
      phrase(d, r) { const n = 1 + Math.floor(r() * 9); const q = pick(r, COUNT_ITEMS).repeat(n) + ' いくつ？'; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(String(n)), q, ai: 0, secret: true }] }; } },
    { key: 'bigger', base: 'おおきい ほう', icon: '🐘', tpl: 'quiz', teacher: '🦒', player: '🐁', span: 6, hitSfx: 'ding',
      desc: '2つの すうじの「おおきい ほう」を 3はくめに おす！ときどき「ちいさい ほう」も きかれる。',
      phrase(d, r) { const a = Math.floor(r() * 10); let b2 = Math.floor(r() * 10); if (b2 === a) b2 = (a + 3) % 10; const small = r() < 0.35; const q = `${a} と ${b2}、${small ? 'ちいさい' : 'おおきい'} ほうは？`; const ans = small ? Math.min(a, b2) : Math.max(a, b2); return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(String(ans)), q, ai: 0, secret: true }] }; } },
    { key: 'oddeven', base: 'ぐうすう？ きすう？', icon: '⚖️', tpl: 'quiz', teacher: '🦉', player: '🐿️', span: 6, hitSfx: 'ding',
      desc: 'すうじが ぐうすうなら E、きすうなら O を 3はくめに おす！',
      phrase(d, r) { const n = r() < 0.5 ? Math.floor(r() * 10) : 10 + Math.floor(r() * 90); const q = `${n} は ぐうすう(E)？ きすう(O)？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(n % 2 ? 'O' : 'E'), q, ai: 0, secret: true }] }; } },
    { key: 'rowpos', base: 'キーボードの ばしょ', icon: '📍', tpl: 'quiz', teacher: '🐧', player: '🐟', span: 6, hitSfx: 'tick',
      desc: '「うえの れつの 3ばんめ は？」→ E！キーボードの ならびを おもいだして 3はくめに おす。',
      phrase(d, r) { const [name, row] = pick(r, [['うえ', ROW_Q], ['まんなか', ROW_A], ['した', ROW_Z]]); const i = Math.floor(r() * row.length); const q = `${name}の れつの ${i + 1}ばんめ は？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: [{ o: 3, kbd: KC(row[i]), q, ai: 0, secret: true }] }; } },
    { key: 'bottomrow', base: 'したの れつ', icon: '🦀', tpl: 'row', keys: ROW_Z, item: '🦀', player: '🏖️', wait: 2, hitSfx: 'clap',
      desc: 'いちばん したの れつ(Z X C V B N M)に カニが おちてくる！バラバラの じゅんばんで 8ぶおんぷ。',
      phrase(d, r) { const n = pick(r, [3, 4, 5]); const hits = []; let last = -9; for (let i = 0; i < n; i++) { let k = Math.floor(r() * 7); if (Math.abs(k - last) <= 1) k = (k + 3) % 7; last = k; hits.push({ o: 2 + i * 0.5, kbd: KC(ROW_Z[k]) }); } return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
    { key: 'numberrow', base: 'すうじの れつ', icon: '🔟', tpl: 'row', keys: '1234567890'.split(''), item: '🎈', player: '🧮', wait: 2, hitSfx: 'pip',
      desc: 'すうじキーの れつに ふうせんが おちてくる！1つとび・さかさまなど、かぞえる じゅんばんで 8ぶおんぷ。',
      phrase(d, r) { const keys = '1234567890'; const step = pick(r, [1, 1, 2, -1, -2]); const n = 4; const s = step > 0 ? Math.floor(r() * (10 - n * step + step)) : n * (-step) - (-step) + Math.floor(r() * (10 - n * (-step) + (-step))); const hits = []; for (let i = 0; i < n; i++) { const k = Math.max(0, Math.min(9, s + i * step)); hits.push({ o: 2 + i * 0.5, kbd: KC(keys[k]), f: 440 * Math.pow(2, k / 12) }); } return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
    { key: 'chordpiano', base: 'わおん ピアノ', icon: '🎶', tpl: 'row', keys: PIANO_KEYS, item: '🎵', player: '🎹', wait: 2, hitSfx: 'pip',
      desc: '2つの キーを いっしょに おして わおん！A と D、S と F のように 2つ とばしの キーが おなじ しゅんかんに おちてくる。',
      phrase(d, r) { const n = pick(r, [2, 3]); const hits = []; for (let i = 0; i < n; i++) { const k = Math.floor(r() * 6); const o = 2 + i * (n === 3 ? 1 : 1.5); hits.push({ o, kbd: KC(PIANO_KEYS[k]), f: PIANO_F[k] }, { o, kbd: KC(PIANO_KEYS[k + 2]), f: PIANO_F[k + 2] }); } return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
    { key: 'organ', base: 'オルガン ロングトーン', icon: '🎼', tpl: 'row', keys: PIANO_KEYS, item: '🎵', player: '🎼', wait: 2, hitSfx: 'pip',
      desc: 'おんぷの ながさだけ キーを おしたまま！バーの おわりで はなす。1〜2はくの ロングトーン。',
      phrase(d, r) { const k = Math.floor(r() * 8); const hits = [{ o: 2, kbd: KC(PIANO_KEYS[k]), f: PIANO_F[k], hold: pick(r, [1, 1.5, 2]) }]; if (r() < 0.5) { const k2 = (k + 2 + Math.floor(r() * 4)) % 8; hits.push({ o: 5, kbd: KC(PIANO_KEYS[k2]), f: PIANO_F[k2], hold: 1 }); } return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
    { key: 'scalerun', base: 'ドレミ かけあがり', icon: '🎢', tpl: 'row', keys: PIANO_KEYS, item: '🎵', player: '🎢', wait: 2, hitSfx: 'pip',
      desc: 'ド レ ミ ファ…と となりの キーへ 8ぶおんぷで かけあがる(かけおりる)！5〜8おんの スケール。',
      phrase(d, r) { const n = pick(r, [5, 6, 8]); const up = r() < 0.6; const s = up ? Math.floor(r() * (9 - n)) : n - 1 + Math.floor(r() * (9 - n)); const hits = []; for (let i = 0; i < n; i++) { const k = up ? s + i : s - i; hits.push({ o: 2 + i * 0.5, kbd: KC(PIANO_KEYS[k]), f: PIANO_F[k] }); } return { span: n >= 8 ? 8 : 6, cues: [{ o: 0, sfx: 'beep2' }], hits }; } },
    { key: 'twinmole', base: 'ふたご もぐら', icon: '🐹', tpl: 'popup', item: '🐹', bombItem: '💣', player: '🔨', wait: 1.5, hitSfx: 'stomp',
      desc: 'もぐらが 2ひき いっしょに とびだす！2つの キーを どうじに おして たたけ。💣は おさない。',
      phrase(d, r) {
        const pos = (used) => { let p; do { p = { px: Math.floor(r() * 3), py: Math.floor(r() * 3) }; } while (used.some(u => u.px === p.px && u.py === p.py)); return p; };
        const o = pick(r, [0.5, 1, 1.5]);
        if (r() < 0.2) return { span: 4, cues: [{ o, sfx: 'uino' }], hits: [{ o: o + 1.5, kind: 'bomb', ...pos([]) }] };
        const p1 = pos([]), p2 = pos([p1]); const k1 = pick(r, AZ.split('')); let k2 = pick(r, AZ.split('')); if (k2 === k1) k2 = k1 === 'A' ? 'B' : 'A';
        return { span: 4, cues: [{ o, sfx: 'boing' }, { o: o + 0.25, sfx: 'boing' }], hits: [{ o: o + 1.5, kbd: KC(k1), ...p1 }, { o: o + 1.5, kbd: KC(k2), ...p2 }] };
      } },
    { key: 'simon', base: 'おぼえて まね', icon: '🧠', tpl: 'word', player: '🧠', span: 12, secret: true, showFor: 4.5, revealStep: 1, hitSfx: 'pip',
      desc: 'キーが 1はくずつ ひかる（3〜4こ）。ぜんぶ きえたら、おなじ じゅんばんで 4ぶおんぷで おす！',
      phrase(d, r) { const n = r() < 0.6 ? 3 : 4; let w = ''; for (let i = 0; i < n; i++) w += AZ[Math.floor(r() * 26)]; const cues = [{ o: 0, sfx: 'beep2' }]; for (let i = 0; i < n; i++) cues.push({ o: i, sfx: 'pip', opt: { f: 660 + i * 110 } }); return { span: n + 6, cues, hits: wordHits(w, n + 2, 1, { caption: 'おぼえて！', secret: true }) }; } },
    { key: 'morseword', base: 'モールスで ことば', icon: '📻', tpl: 'morse', player: '📻', span: 12, hitSfx: 'pip',
      desc: '2もじの ことば(HI・GO…)を モールスで そうしん！トン＝タップ、ツー＝1はく ながおし。もじが かわると キーも かわる。',
      phrase(d, r) {
        const w = pick(r, MORSE_WORDS); const hits = []; let o = 2;
        for (let li = 0; li < w.length; li++) { const ch = w[li]; for (const sy of morseOf(ch)) { if (sy === '.') { hits.push({ o, kbd: KC(ch), li, word: w, f: 1200 }); o += 1; } else { hits.push({ o, kbd: KC(ch), li, word: w, hold: 1, f: 900 }); o += 2; } } o += 1; }
        return { span: Math.ceil(o / 2) * 2, cues: [{ o: 0, sfx: 'beep2' }], hits };
      } },
    { key: 'kuku', base: 'くく ドリル', icon: '✖️', tpl: 'quiz', teacher: '🦊', player: '🐰', span: 6, hitSfx: 'ding',
      desc: 'かけざん(3 × 4 ＝ ？)。こたえが 2けたなら 1 → 2 の じゅんに 3はくめから！',
      phrase(d, r) { const a = 2 + Math.floor(r() * 8), b2 = 2 + Math.floor(r() * 8); const q = `${a} × ${b2} ＝ ？`; return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: ansHits(String(a * b2), 3, 1, q) }; } },
    { key: 'sortabc', base: 'ABCじゅんに ならべ', icon: '🔠', tpl: 'quiz', teacher: '🦉', player: '🐤', span: 8, hitSfx: 'sparkle',
      desc: 'バラバラの 3もじを ABCじゅんに ならべて、3はくめから 1もじずつ タイプ！',
      phrase(d, r) { const set = new Set(); while (set.size < 3) set.add(AZ[Math.floor(r() * 26)]); const arr = [...set]; const sorted = arr.slice().sort(); for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } const q = `${arr.join(' ')} を ABCじゅんに！`; return { span: 8, cues: [{ o: 0, sfx: 'beep2' }], hits: ansHits(sorted.join(''), 3, 1, q) }; } },
    { key: 'longword', base: 'ながい たんご', icon: '🐍', tpl: 'word', player: '🐍', span: 6, cueSay: 'いっきに！', hitSfx: 'tick',
      desc: '6もじの ながい たんご(BANANA・ROCKET…)を 8ぶおんぷで いっきに タイプ！',
      phrase(d, r) { const w = pick(r, KW6); return { span: 6, cues: [{ o: 0, sfx: 'beep2' }], hits: wordHits(w, 2, 0.5) }; } },
  ];
  for (const cfg of CFGK2) ARCH[cfg.key] = makeKbd(cfg);
  const KBD_GAMES = CFGK.concat(CFGK2).map(cfg => cfg.key);


  /* ================= ミックス せんよう ゲーム(4ファミリー × 40本) =================
     ノーツの しゅるいを ゲームが きめる 1人用ゲーム(ノーツモードの 切替とは べつ)。
       am  = アロー＆通常 せんよう        … ↑↓←→ の ノーツ と ●(ふつう)ノーツ
       km  = キーボード＆通常 せんよう     … A〜Z・0〜9 の ノーツ と ●
       ak  = アロー＆キーボード せんよう   … ↑↓←→ と A〜Z・0〜9
       akm = アロー＆キーボード＆通常 せんよう … ↑↓←→・A〜Z・0〜9・●
     10の テンプレート(見た目と しくみ) × 4バリエーション(a=きほん / b=8ぶで はやい / c=ながおし / d=同時押し＆💣) */
  const MIX_KINDS = { am: ['dir', 'plain'], km: ['kbd', 'plain'], ak: ['dir', 'kbd'], akm: ['dir', 'kbd', 'plain'] };
  const MIX_KEYS = 'QWERTYUIOPASDFGHJKZXCVBNM1234567890'.split('');   // L は レーン切替に のこす
  const MIX_POLICY = { belt: 'alt', pop3x3: 'bag', teacher: 'bag', wordline: 'group', bounce: 'alt', train: 'bag', stars: 'bag', drums: 'bag', runnerMix: 'bag', memory: 'bag' };
  const MIX_FAM_DESC = {
    am: '↑↓←→ の ノーツは その ほうこう、●の ノーツは スペース(どの ほうこうキーでも OK)。',
    km: 'もじの ノーツは その キー、●の ノーツは どのキーでも(スペースも OK)。アローキーは レーン切替。',
    ak: '↑↓←→ の ノーツは アローキー、もじの ノーツは その キー。L は レーン切替。',
    akm: '↑↓←→ は アローキー、もじは その キー、●は スペース(どのキーでも OK)。L は レーン切替。',
  };
  const MIX_VAR_DESC = { a: '', b: '8ぶおんぷで つづけて くるぞ！', c: 'バーつきの ノーツは おしたまま、バーの おわりで はなす。', d: '2つ いっしょに きたら 同時押し。💣は なにも おさない！' };
  function mixNote(kind, r, o, extra) {
    const h = { o, ...extra };
    if (kind === 'dir') h.dir = pick(r, DIRS);
    else if (kind === 'kbd') h.kbd = KC(pick(r, MIX_KEYS));
    else h.plain = true;
    return h;
  }
  function mixDistinct(h1, h2, r, kinds) {   // 同時押しの 2つが おなじに ならないように
    if (h1.dir && h2.dir && h1.dir === h2.dir) h2.dir = OPP[h1.dir];
    else if (h1.kbd && h2.kbd && h1.kbd === h2.kbd) h2.kbd = KC(MIX_KEYS[(MIX_KEYS.indexOf(KL(h1.kbd)) + 1) % MIX_KEYS.length]);
    else if (h1.plain && h2.plain) { delete h2.plain; const k = kinds.find(x => x !== 'plain'); if (k === 'dir') h2.dir = pick(r, DIRS); else h2.kbd = KC(pick(r, MIX_KEYS)); }
  }
  function mixPos(tplKey, r, used) {
    if (tplKey === 'pop3x3') { let p; do { p = { px: Math.floor(r() * 3), py: Math.floor(r() * 3) }; } while (used && used.px === p.px && used.py === p.py); return p; }
    if (tplKey === 'stars') { let sx = r(); if (used && Math.abs(used.sx - sx) < 0.25) sx = (sx + 0.5) % 1; return { sx }; }
    return {};
  }
  function mixPhrase(tplKey, variant, fam, cfg, d, r) {
    const kinds = MIX_KINDS[fam];
    let bagArr = [];
    const off = Math.floor(r() * kinds.length);   // こうごの はじまりを フレーズごとに ずらす(3しゅるいでも ぜんぶ 出る)
    const nextKind = (i, n) => {
      const policy = MIX_POLICY[tplKey];
      if (policy === 'alt') return kinds[(i + off) % kinds.length];
      if (policy === 'group' && n >= kinds.length) return kinds[Math.min(kinds.length - 1, Math.floor(i * kinds.length / Math.max(1, n)))];
      if (!bagArr.length) { bagArr = kinds.slice(); for (let j = bagArr.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [bagArr[j], bagArr[k]] = [bagArr[k], bagArr[j]]; } }
      return bagArr.shift();
    };
    const o0 = 2 + (cfg.memory ? 1.5 : 0);
    let slots;
    if (variant === 'a') { const n = pick(r, [2, 3, 3]); slots = Array.from({ length: n }, (_, i) => ({ o: o0 + i })); }
    else if (variant === 'b') { const n = pick(r, [4, 5, 6]); slots = Array.from({ length: n }, (_, i) => ({ o: o0 + i * 0.5 })); }
    else if (variant === 'c') slots = r() < 0.5 ? [{ o: o0, hold: pick(r, [1, 1.5, 2]) }, { o: o0 + 3 }] : [{ o: o0 }, { o: o0 + 1, hold: pick(r, [1, 1.5]) }];
    else slots = r() < 0.25 ? [{ o: o0, bomb: true }, { o: o0 + 1.5 }] : [{ o: o0, chord: true }, { o: o0 + 1 }, ...(r() < 0.5 ? [{ o: o0 + 2, chord: true }] : [])];
    const last = Math.max(...slots.map(s => s.o + (s.hold || 0)));
    const span = Math.max(4, Math.ceil((last + 1.5) / 2) * 2);
    const n = slots.length, hits = [];
    slots.forEach((s, i) => {
      if (s.bomb) { hits.push({ o: s.o, kind: 'bomb', seqI: i, seqN: n, showOff: s.o - 2, ...mixPos(tplKey, r) }); return; }
      const h1 = mixNote(nextKind(i, n), r, s.o, { hold: s.hold, seqI: i, seqN: n, showOff: s.o - 2, ...mixPos(tplKey, r) });
      if (cfg.memory) h1.secret = true;
      hits.push(h1);
      if (s.chord) {
        const h2 = mixNote(nextKind(i + 1, n), r, s.o, { seqI: i, seqN: n, ci: 1, showOff: s.o - 2, ...mixPos(tplKey, r, h1) });
        mixDistinct(h1, h2, r, kinds);
        if (cfg.memory) h2.secret = true;
        hits.push(h2);
      }
    });
    return { span, cues: [{ o: 0, sfx: cfg.cueSfx || 'beep2' }], hits };
  }
  /* ラベル: やじるし / キーキャップ / ●(ふつう) / 💣。hideLabel なら「?」 */
  function noteLabel(c, t, x, y, size, alpha = 1, state = 'idle') {
    if (t.kind === 'bomb') { E(c, '💣', x, y, size); return; }
    if (t.hideLabel) { keyCap(c, '?', x, y, size * 0.8, state, true, alpha); return; }
    if (t.dir) { dirMark(c, t.dir, x, y, size, alpha); return; }
    if (t.kbd) { keyCap(c, KL(t.kbd), x, y, size * 0.8, state, false, alpha); return; }
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = state === 'hit' ? '#7ee0a0' : state === 'miss' ? '#ff8080' : '#ffd166';
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, size * 0.4, 0, 7); c.fill(); c.stroke();
    c.restore();
  }
  const itemMix = (cfg, t) => (t.kind === 'bomb' ? '💣' : Array.isArray(cfg.item) ? cfg.item[(t.seqI || 0) % cfg.item.length] : (cfg.item || '📦'));
  const MTPL = {
    /* ベルト: 右から ながれてきて、左の マーカーで おす(train は 車両を つなぐ) */
    belt(c, v, cfg) {
      const mx = 260, y = 300, wait = cfg.wait || 2, ppb = (960 - mx) / wait;
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, y + 26, 960, 10);
      c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.beginPath(); c.arc(mx, y, 34, 0, 7); c.stroke();
      E(c, cfg.player || '⭐', mx, y + 84 - jumpOffset(v, v.targets) * 0.4, 50);
      for (const t of v.targets) {
        const dt = t.b - v.beat;
        if (dt > wait + 0.5 || dt < -1) continue;
        const x = mx + dt * ppb;
        if (t.judged && !t.holding) { if (v.sec - t.jt < 0.45) judgedFx(c, v, t, mx, y); continue; }
        if (t.hold) {
          const xe = mx + (t.b + t.hold - v.beat) * ppb, xs = Math.max(mx, x);
          c.fillStyle = t.holding ? v.theme.accent : 'rgba(255,255,255,.4)'; if (xe > xs) c.fillRect(xs, y - 8, xe - xs, 16);
          if (t.holding) continue;
        }
        if (cfg.link && t.seqI === 0 && !t.ci) E(c, '🚂', x + 66, y + 10, 46);
        if (cfg.link && t.seqI > 0) { c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 6; c.beginPath(); c.moveTo(x - 26, y + 12); c.lineTo(x - 56, y + 12); c.stroke(); }
        const yy = y + 10 - (t.ci ? 56 : 0);
        E(c, itemMix(cfg, t), x, yy, 44);
        noteLabel(c, t, x, yy - 44, 30);
      }
    },
    /* 3×3 の あなから ラベルつきの ものが とびだす */
    pop3x3(c, v, cfg) {
      const wait = cfg.wait || 1.5;
      for (let py = 0; py < 3; py++) for (let px = 0; px < 3; px++) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(300 + px * 180, 190 + py * 95 + 40, 40, 12, 0, 0, 7); c.fill(); }
      for (const t of v.targets) {
        const x = 300 + (t.px || 0) * 180, y = 190 + (t.py || 0) * 95;
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged && !t.holding) { judgedFx(c, v, t, x, y); continue; }
        if (t.holding) { E(c, itemMix(cfg, t), x, y + 22, 48); noteLabel(c, t, x, y - 30, 34, 1, 'hit'); continue; }
        if (p > 1.15) continue;
        const s = clamp(p * 3, 0, 1);
        E(c, itemMix(cfg, t), x, y + 22, 44 * s);
        noteLabel(c, t, x, y - 30, 34 * s, 1, 'next');
        c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9; c.beginPath(); c.arc(x, y, lerp(90, 30, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
      }
      E(c, cfg.player || '🔨', 480, 480, 40);
    },
    /* せんせいが 2はく前に ラベルを 見せる → おなじ じゅんばんで */
    teacher(c, v, cfg) {
      E(c, cfg.teacher || '🐰', 300, 310, 66); E(c, cfg.player || '⭐', 660, 310 - jumpOffset(v, v.targets) * 0.5, 66);
      for (const t of v.targets) {
        const showT = t.cueB + (t.showOff || 0), n = t.seqN || 1, i = t.seqI || 0, yo = t.ci ? -44 : 0;
        if (v.beat >= showT && v.beat < t.b + 0.5) noteLabel(c, t, 300 + (i - (n - 1) / 2) * 50, 226 + yo, 32);
        if (v.beat >= showT && v.beat < t.b + 1) {
          const ax = 660 + (i - (n - 1) / 2) * 50;
          if (t.judged && t.judged !== 'miss') noteLabel(c, t, ax, 226 + yo, 32, 1, 'hit');
          else if (t.judged === 'miss') E(c, '❌', ax, 226 + yo, 26);
          else if (t.kind === 'bomb') E(c, '💣', ax, 226 + yo, 26);
          else E(c, '❔', ax, 226 + yo, 26);
        }
      }
    },
    /* ラベルを 1れつに ならべて じゅんばんに(memory は かくれる) */
    wordline(c, v, cfg) {
      E(c, cfg.player || '⭐', 480, 400 - jumpOffset(v, v.targets), 66);
      const ph = curPhrase(v, cfg.span || 8); if (!ph.length) return;
      const sorted = ph.slice().sort((a, b2) => a.b - b2.b || (a.ci || 0) - (b2.ci || 0));
      const n = sorted.length, gap = Math.min(72, 640 / n), x0 = 480 - (n - 1) * gap / 2;
      const nx = nextOf(ph);
      const hidden = !!cfg.memory && v.beat > ph[0].cueB + (cfg.showFor || 1.5);
      sorted.forEach((t, i) => {
        const x = x0 + i * gap;
        const st = t.judged ? keyState(t) : (nx && nx.b === t.b ? 'next' : 'idle');
        t.hideLabel = hidden && !t.judged && t.kind !== 'bomb';
        noteLabel(c, t, x, 190, 40, 1, st);
        if (t.hold) { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x - 20, 222, 40 * t.hold * 0.7, 8); }
      });
      if (cfg.memory && !hidden) speech(c, 480, 110, 'おぼえて！');
      if (cfg.cueSay && v.beat - ph[0].cueB < 0.8) speech(c, 480, 290, cfg.cueSay);
    },
    /* ボールが スポットを じゅんばんに はねる。スポットの ラベルを ボールが つく しゅんかんに */
    bounce(c, v, cfg) {
      const y = 380;
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, y + 30, 960, 4);
      const ph = curPhrase(v, cfg.span || 8);
      if (!ph.length) { E(c, cfg.ball || '🏀', 140, y, 40); return; }
      const sorted = ph.slice().sort((a, b2) => a.b - b2.b || (a.ci || 0) - (b2.ci || 0));
      const uniq = []; for (const t of sorted) if (!uniq.length || uniq[uniq.length - 1].b !== t.b) uniq.push(t);
      const n = uniq.length, gap = Math.min(150, 700 / n), x0 = 480 - (n - 1) * gap / 2;
      const xOf = b => x0 + uniq.findIndex(u => u.b === b) * gap;
      for (const t of sorted) {
        const x = xOf(t.b), yy = y + 4 - (t.ci ? 44 : 0);
        c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.ellipse(x, y + 22, 34, 10, 0, 0, 7); c.fill();
        if (!(t.judged && !t.holding && v.sec - t.jt > 0.45)) noteLabel(c, t, x, yy - 60, 32, 1, t.judged ? keyState(t) : 'idle');
        if (t.hold) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x + 22, yy - 66, t.hold * 30, 8); }
        if (t.judged && v.sec - t.jt < 0.45) judgedFx(c, v, t, x, yy - 20);
      }
      const nxt = uniq.find(t => t.b >= v.beat - 0.05);
      if (nxt) {
        const idx = uniq.indexOf(nxt), prevB = idx > 0 ? uniq[idx - 1].b : ph[0].cueB, prevX = idx > 0 ? xOf(prevB) : 100;
        const p = clamp((v.beat - prevB) / Math.max(0.01, nxt.b - prevB), 0, 1);
        E(c, cfg.ball || '🏀', lerp(prevX, xOf(nxt.b), p), y - Math.sin(p * Math.PI) * 90, 40);
      } else E(c, cfg.ball || '🏀', xOf(uniq[n - 1].b), y, 40);
    },
    /* うえから ラベルつきの ものが おちてきて、まんなかの かごで うける */
    stars(c, v, cfg) {
      const yC = 400, wait = cfg.wait || 2;
      E(c, cfg.player || '🧺', 480, yC + 40, 56);
      for (const t of v.targets) {
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        const x0 = 120 + (t.sx == null ? 0.5 : t.sx) * 720, x = lerp(x0, 480, clamp(p, 0, 1)), y = lerp(40, yC, clamp(p, 0, 1));
        if (t.judged && !t.holding) { if (v.sec - t.jt < 0.45) judgedFx(c, v, t, 480, yC); continue; }
        if (t.holding) { noteLabel(c, t, 480, yC - 70, 34, 1, 'hit'); continue; }
        if (p > 1.15) continue;
        E(c, itemMix(cfg, t), x, y, 40);
        noteLabel(c, t, x, y - 38, 28);
        if (t.hold) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x - 4, y - 38 - t.hold * 60, 8, t.hold * 60); }
      }
    },
    /* ドラムセット: ↑↓←→ は ひだりの 4パッド、もじは みぎの 3パッド、●は まんなか */
    drums(c, v, cfg) {
      const padPos = t => {
        if (t.dir) return dirAt(t.dir, 250, 280, 80);
        if (t.kbd) { const i = t.kbd.charCodeAt(t.kbd.length - 1) % 3; return [600 + i * 100, 280 + (i === 1 ? -50 : 0)]; }
        return [480, 340];
      };
      for (const dd of DIRS) { const [x, y] = dirAt(dd, 250, 280, 80); c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(x, y, 34, 22, 0, 0, 7); c.fill(); dirMark(c, dd, x, y, 16, 0.4); }
      for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(600 + i * 100, 280 + (i === 1 ? -50 : 0), 34, 22, 0, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.ellipse(480, 340, 46, 28, 0, 0, 7); c.fill();
      E(c, cfg.player || '🥁', 480, 440, 50);
      const wait = cfg.wait || 1.5;
      for (const t of v.targets) {
        const [x, y] = padPos(t);
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged && !t.holding) { if (v.sec - t.jt < 0.45) judgedFx(c, v, t, x, y); continue; }
        if (t.holding) { noteLabel(c, t, x, y - 46, 34, 1, 'hit'); continue; }
        if (p > 1.15) continue;
        noteLabel(c, t, x, y - 46, 30 * clamp(p * 2, 0.4, 1), 1, 'next');
        c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9; c.beginPath(); c.arc(x, y, lerp(70, 24, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
      }
    },
    /* よこスクロール: ↑= まるた(ジャンプ) / ↓= かんばん(しゃがむ) / ←→= うずまき / もじ= こうじ / ●= むし / 💣 */
    runnerMix(c, v, cfg) {
      const px = 240, gy = 400, wait = cfg.wait || 2;
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, gy + 30, 960, 4);
      let jump = 0, duck = 0;
      for (const t of v.targets) { const dt = v.sec - t.jt; if (t.judged && t.judged !== 'miss' && dt < 0.4) { if (t.dir === 'up') jump = Math.max(jump, Math.sin(dt / 0.4 * Math.PI) * 70); else if (t.dir === 'down') duck = 1; } }
      E(c, cfg.player || '🏃', px, gy - jump + (duck ? 14 : 0), duck ? 40 : 56);
      for (const t of v.targets) {
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0 || p > 1.4) continue;
        const x = lerp(960, px, p);
        const item = t.kind === 'bomb' ? '💣' : t.dir === 'up' ? '🪵' : t.dir === 'down' ? '🪧' : t.dir ? '🌀' : t.kbd ? '🚧' : '🐛';
        const y = (t.dir === 'down' ? gy - 60 : gy + 8) - (t.ci ? 50 : 0);
        if (t.judged && !t.holding) { if (t.judged === 'miss' && v.sec - t.jt < 0.4) E(c, '💫', px, gy - 30, 36); if (p <= 1.3) E(c, item, x, y, 44); continue; }
        if (p <= 1.3) { E(c, item, x, y, 44); if (t.kind !== 'bomb') noteLabel(c, t, x, y - 44, 26); }
        if (t.hold) { c.fillStyle = t.holding ? v.theme.accent : 'rgba(255,255,255,.45)'; c.fillRect(x, y - 8, t.hold * ((960 - px) / wait) * 0.5, 8); }
      }
    },
  };
  const MIX_TPL_DESC = {
    belt: 'ベルトで 右から ながれてくる ものを、左の マーカーに かさなった しゅんかんに！', pop3x3: '3×3 の あなから とびだす ものを、わっかが ちぢんだ しゅんかんに！',
    teacher: 'せんせいが 2はく前に 見せた ものを、おなじ じゅんばんで おす！', wordline: 'ならんだ ノーツを ひだりから じゅんばんに！ひかる ところが つぎ。',
    bounce: 'ボールが スポットを じゅんに はねる。ボールが つく しゅんかんに スポットの ノーツを！', train: 'でんしゃの 車両に ノーツが のっている。えきの マーカーを とおる しゅんかんに！',
    stars: 'うえから おちてくる ものを、まんなかの かごに はいる しゅんかんに！', drums: '↑↓←→ は ひだりの パッド、もじは みぎの パッド、●は まんなか。ひかった パッドを！',
    runnerMix: 'みぎから くる しょうがいぶつを、とどいた しゅんかんに！まるた=↑ かんばん=↓ うずまき=←→ こうじ=もじ むし=●', memory: 'ノーツが 1はくはん だけ 見えて かくれる！おぼえて じゅんばんに おす(レーンは ?)。',
  };
  const MIX_TABLE = [
    ['belt', {}, [['a', 'かいてんずし', '🍣', ['🍣', '🍤', '🍙']], ['b', 'こうじょうライン', '🏭', ['📦', '🧸', '🎈']], ['c', 'マグネット ベルト', '🧲', '🧲'], ['d', 'ペア・プレゼント', '🎁', '🎁']]],
    ['pop3x3', {}, [['a', '3×3 もぐら', '🐹', '🐹'], ['b', 'はやおし 3×3', '⚡', '🐿️'], ['c', 'きのこ ながおし', '🍄', '🍄'], ['d', 'ばくだん もぐら', '💣', '🐹']]],
    ['teacher', {}, [['a', 'せんせいの まね', '🐰'], ['b', 'はやくち まね', '🐇'], ['c', 'ながく まね', '🐢'], ['d', 'ふたごの まね', '🐼']]],
    ['wordline', {}, [['a', 'かんばん タイプ', '🪧'], ['b', 'ダッシュ タイプ', '🏃'], ['c', 'ロング タイプ', '🧘'], ['d', 'ダブル タイプ', '🤝']]],
    ['bounce', {}, [['a', 'バウンド ボール', '🏀'], ['b', 'はやい バウンド', '🏓'], ['c', 'ふわふわ バウンド', '🫧'], ['d', 'ダブル バウンド', '🎾']]],
    ['train', { tpl: 'belt', link: true, item: ['🚃', '🚋', '🚃'] }, [['a', 'でんしゃ ごっこ', '🚂'], ['b', 'しんかんせん', '🚄'], ['c', 'ながい かもつ', '🚃'], ['d', 'れんけつ ダブル', '🚈']]],
    ['stars', {}, [['a', 'ながれぼし', '🌠', '⭐'], ['b', 'りゅうせいぐん', '☄️', '☄️'], ['c', 'ゆっくり おつきさま', '🌙', '🌙'], ['d', 'ふたごぼし', '✨', '⭐']]],
    ['drums', {}, [['a', 'ドラムセット', '🥁'], ['b', 'ドラムソロ', '🎛️'], ['c', 'ロング ドラム', '🪘'], ['d', 'ドラム・デュオ', '🎼']]],
    ['runnerMix', {}, [['a', 'ミックス ランナー', '🏃'], ['b', 'チーター ダッシュ', '🐆'], ['c', 'かたつむり ロング', '🐌'], ['d', 'カンガルー ダブル', '🦘']]],
    ['memory', { tpl: 'wordline', memory: true, showFor: 1.5 }, [['a', 'おぼえて ミックス', '🧠'], ['b', 'はやおぼえ', '🐙'], ['c', 'ながく おぼえて', '🐘'], ['d', 'ダブル おぼえ', '🦉']]],
  ];
  function makeMix(fam, tplKey, variant, base, icon, item, extra) {
    const cfg = { ...extra, tpl: extra.tpl || tplKey, fam, variant, item: item || extra.item, player: icon, ball: icon, teacher: icon, span: 8 };
    return {
      base, icon, mixGame: fam,
      desc: MIX_TPL_DESC[tplKey] + MIX_VAR_DESC[variant] + MIX_FAM_DESC[fam],
      hit(ak, bus, t, tg) { ak.sfx(bus, tg.dir ? 'pip' : tg.kbd ? 'tick' : 'clap', t, { f: tg.dir ? DIR_TONE[tg.dir] : 880 }); },
      phrase(d, r) { return mixPhrase(tplKey, variant, fam, cfg, d, r); },
      draw(c, v) { MTPL[cfg.tpl](c, v, cfg); },
      require(targets) {   // ぜんしゅるいの ノーツが 出る。d は 同時押しと 💣が かならず ある
        const el = targets.filter(t => t.kind !== 'bomb');
        const has = k => el.some(t => (k === 'dir' ? !!t.dir : k === 'kbd' ? !!t.kbd : !t.dir && !t.kbd));
        if (!MIX_KINDS[fam].every(has)) return false;
        if (variant === 'd') { const bs = new Set(el.map(t => t.b.toFixed(3))); return targets.length > el.length && bs.size < el.length; }
        if (variant === 'c') return el.some(t => t.hold);
        return true;
      },
    };
  }
  const MIX_GAMES = { am: [], km: [], ak: [], akm: [] };
  for (const fam of Object.keys(MIX_GAMES)) for (const [tplKey, extra, variants] of MIX_TABLE) for (const [variant, base, icon, item] of variants) {
    const sub = `${tplKey}_${variant}`, key = `${fam}_${sub}`;
    ARCH[key] = makeMix(fam, tplKey, variant, base, icon, item, extra);
    MIX_GAMES[fam].push(sub);
  }

  /* ================= 譜面生成 ================= */
  function genPhrases(arch, d, rng, scale, start, end, density) {
    const cues = [], targets = [];
    let b = start;
    while (b < end - 1) {
      if (rng() < density) {
        const ph = ARCH[arch].phrase(d, rng, scale);
        if (b + ph.span <= end) {
          for (const cu of ph.cues) cues.push({ beat: b + cu.o, sfx: cu.sfx, opt: cu.opt, arch });
          for (const h of ph.hits) {
            const { o, ...rest } = h;
            targets.push({ b: b + o, cueB: b, arch, ...rest, judged: null, jt: 0 });
          }
          b += ph.span;
          continue;
        }
      }
      b += 2;
    }
    return { cues, targets };
  }

  /* 通常ミニゲーム: 18小節(72拍)。冒頭1小節と最後は休み。 */
  function buildGamePattern(def) {
    let density = clamp(0.42 + def.d * 0.03, 0.42, 0.85) + (def.ura ? 0.08 : 0);
    let res = null;
    for (let tries = 0; tries < 8; tries++) {
      const rng = rngFor(def.id + ':' + tries);
      res = genPhrases(def.arch, def.d, rng, def.scale, 4, 70, Math.min(density, 0.95));
      const req = ARCH[def.arch].require;   // ゲームごとの 条件(ぜんしゅるいの ノーツが 出る、💣が ある など)
      if (res.targets.filter(t => t.kind !== 'bomb').length >= 10 && (!req || req(res.targets))) break;   // 採点対象(ボム以外)で 10本以上
      density += 0.08;
    }
    res.targets.sort((a, b2) => a.b - b2.b);
    res.cues.sort((a, b2) => a.beat - b2.beat);
    if (def.noHold) for (const t of res.targets) delete t.hold;   // 初期バージョン: 長押しは ふつうのノーツに
    return { targets: res.targets, cues: res.cues, segments: null, totalBeats: 72 };
  }

  /* リミックス: 8セグメント×2小節、ゲームが次々切り替わる。 */
  function buildRemixPattern(def) {
    const rng = rngFor(def.id);
    const order = def.games.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const segments = [], cues = [], targets = [];
    const NSEG = 8, LEN = 8;
    for (let i = 0; i < NSEG; i++) {
      const g = order[i % order.length];
      const s0 = 4 + i * LEN;
      let res = genPhrases(g.arch, g.d, rng, def.scale, s0, s0 + LEN, 0.8);
      if (res.targets.length === 0) res = genPhrases(g.arch, g.d, rng, def.scale, s0, s0 + LEN, 1.01);
      cues.push(...res.cues);
      targets.push(...res.targets);
      segments.push({ start: s0, end: s0 + LEN, arch: g.arch });
    }
    targets.sort((a, b2) => a.b - b2.b);
    cues.sort((a, b2) => a.beat - b2.beat);
    if (def.noHold) for (const t of targets) delete t.hold;
    return { targets, cues, segments, totalBeats: 4 + NSEG * LEN + 4 };
  }

  /* エンドレスリミックス: セグメントが えんえん つづき、だんだん むずかしくなる。
     プールと難易度カーブは モード(1人/協力/対戦)ごとに ちがう。seed は プレイのたびに かわる。 */
  function buildEndlessPattern(def) {
    const rng = rngFor(def.id + ':' + (def.seed || 0));
    const NSEG = def.segCount || 48, LEN = 8;
    const pool = def.pool;
    const segments = [], cues = [], targets = [];
    let prev = null;
    for (let i = 0; i < NSEG; i++) {
      let a = pool[Math.floor(rng() * pool.length)];
      if (pool.length > 2 && a === prev) a = pool[Math.floor(rng() * pool.length)];   // おなじゲームの連続をへらす
      prev = a;
      const s0 = 4 + i * LEN;
      const d = (def.d0 || 5) + Math.floor(i / 4);   // 4セグごとに難易度アップ
      let res = genPhrases(a, d, rng, def.scale, s0, s0 + LEN, 0.9);
      if (res.targets.length === 0) res = genPhrases(a, d, rng, def.scale, s0, s0 + LEN, 1.01);
      cues.push(...res.cues);
      targets.push(...res.targets);
      segments.push({ start: s0, end: s0 + LEN, arch: a });
    }
    targets.sort((x, y) => x.b - y.b);
    cues.sort((x, y) => x.beat - y.beat);
    return { targets, cues, segments, totalBeats: 4 + NSEG * LEN + 4 };
  }

  return { ARCH, KBD_GAMES, ARROW_GAMES2, MIX_GAMES, rngFor, buildGamePattern, buildRemixPattern, buildEndlessPattern, E, clamp, lerp, bounce };
})();
