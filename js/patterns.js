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
        const d = t.dir || t.bdir || 'up';
        const [fx, fy] = dirAt(d, cx, cy, 300), [tx, ty] = dirAt(d, cx, cy, near);
        const wait = t.wait || cfg.wait || 2;
        const p = (v.beat - (t.b - wait)) / wait;
        if (p < 0) continue;
        if (t.judged) {
          judgedFx(c, v, t, tx, ty);
          if (cfg.motion === 'in' && t.judged !== 'miss' && t.judged !== 'bombed' && t.judged !== 'passed' && v.sec - t.jt < 0.45) {
            const dt = v.sec - t.jt; E(c, itemOf2(cfg, t), lerp(tx, fx, dt * 1.6), lerp(ty, fy, dt * 1.6), 30);
          }
          continue;
        }
        if (p > 1.15) continue;
        if (cfg.motion === 'in') { const pp = clamp(p, 0, 1.1); E(c, itemOf2(cfg, t), lerp(fx, tx, pp), lerp(fy, ty, pp), 42); }
        else {
          E(c, itemOf2(cfg, t), tx, ty, 50 * clamp(p * 3, 0, 1));
          c.strokeStyle = v.theme.accent; c.lineWidth = 4; c.globalAlpha = 0.9;
          c.beginPath(); c.arc(tx, ty, lerp(110, 26, clamp(p, 0, 1)), 0, 7); c.stroke(); c.globalAlpha = 1;
        }
        if (t.kind !== 'bomb') { const [mx2, my2] = dirAt(d, cx, cy, near + 46); dirMark(c, d, mx2, my2, 18, 0.9); }
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
        if (!t.hidden && dt > 0 && dt < 2) dirMark(c, t.dir, x, y, 22 + (2 - dt) * 10, 0.45 + (2 - dt) * 0.27);
        if (cfg.say && v.beat >= t.cueB && v.beat < t.cueB + 0.9) { const s2 = cfg.say(t); if (s2) speech(c, cx, 190, s2); }
      }
      for (const cu of v.cues) { const d2 = v.beat - cu.beat; const txt = cfg.cueText && cfg.cueText[cu.sfx]; if (txt && d2 >= 0 && d2 < 0.7) speech(c, cx, 190, txt); }
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
      if (res.targets.filter(t => t.kind !== 'bomb').length >= 10) break;   // 採点対象(ボム以外)で 10本以上
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

  return { ARCH, rngFor, buildGamePattern, buildRemixPattern, buildEndlessPattern, E, clamp, lerp, bounce };
})();
