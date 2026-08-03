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
    base: 'ミラクルバッティング', icon: '⚾',
    desc: 'ボールが バットに とどく しゅんかんに フルスイング！はやい球に ちゅうい！',
    hit(ak, bus, t, tg, perfect) { ak.sfx(bus, 'crack', t); if (perfect) ak.sfx(bus, 'homerun', t + 0.05); },
    phrase(d, r) {
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
    desc: 'とりさんの メロディが とんでくる！2はく おくれで おなじリズムを まねっこ！',
    hit(ak, bus, t, tg) { ak.sfx(bus, 'pip', t, { f: tg.f || 880 }); },
    phrase(d, r, scale) {
      const n = d < 4 ? 2 : (d < 8 ? (r() < 0.5 ? 2 : 3) : 3);
      const offs = n === 2 ? pick(r, [[0, 1], [0, 0.5], [0.5, 1]]) : pick(r, [[0, 0.5, 1], [0, 1, 1.5], [0, 0.5, 1.5]]);
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
    desc: 'きてき「ポォ〜ッ」の あと、1はくはん おくれて せきたんを ポイッ！',
    hit(ak, bus, t) { ak.sfx(bus, 'shk', t); },
    phrase(d, r) {
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
    base: 'ミラクルフラワー', icon: '🌸',
    desc: 'たねが ポトン…めが すくすく…3はくめに パッ！と さく しゅんかんに タッチ！',
    hit(ak, bus, t) { ak.sfx(bus, 'bloom', t); },
    phrase(d, r) {
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
        if (t.judged) {
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
    desc: '「ウィーン」の あいずで、タ・タ・タン！と れんぞくで ネジしめ！',
    hit(ak, bus, t) { ak.sfx(bus, 'tick', t); },
    phrase(d, r) {
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
      E(c, '🔧', 565, 330, 46, v.pressAge < 0.15 ? -1.1 : -0.2);
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
      if (res.targets.length >= 10) break;
      density += 0.08;
    }
    res.targets.sort((a, b2) => a.b - b2.b);
    res.cues.sort((a, b2) => a.beat - b2.beat);
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
    return { targets, cues, segments, totalBeats: 4 + NSEG * LEN + 4 };
  }

  return { ARCH, rngFor, buildGamePattern, buildRemixPattern, E, clamp, lerp, bounce };
})();
