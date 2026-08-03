'use strict';
/* UI: タイトル / ステージセレクト(表・裏切替) / リザルト・解放演出 */
(() => {
  let side = 'omote';
  let mode = 'solo';   // 'solo' | 'coop' | 'versus'
  const P_COLS = ['#47a8ff', '#ff8c42'];
  const $ = q => document.querySelector(q);

  function show(id) {
    ['title', 'select', 'game'].forEach(s => $('#scr-' + s).classList.toggle('active', s === id));
  }

  function defFor(sideV, s, slot) {
    return slot === 'R' ? GameData.remixDef(sideV, s) : GameData.gameDef(sideV, s, Number(slot));
  }

  /* ---------- ステージセレクト ---------- */
  function stateCls(id, isUnlocked) {
    if (!isUnlocked) return 'locked';
    const r = GameData.rank(id);
    if (r === 3) return 'st-superb';
    if (r === 2) return 'st-clear';
    return '';
  }
  function badge(id, isUnlocked) {
    if (!isUnlocked) return '🔒';
    const r = GameData.rank(id);
    return r === 3 ? '⭐' : r === 2 ? '✅' : '';
  }

  function render() {
    document.body.classList.toggle('ura', side === 'ura');
    $('#side-title').textContent = side === 'ura' ? '🌙 うら ステージ' : '☀ おもて ステージ';
    $('#medal-count').textContent = '⭐ ' + GameData.medals();

    const uraOpen = GameData.uraOpen();
    const sideBtn = $('#btn-side');
    sideBtn.classList.toggle('locked', !uraOpen);
    sideBtn.textContent = side === 'ura' ? '☀ おもてへ' : (uraOpen ? '🌙 うらへ' : '🔒 うら');
    $('#side-hint').textContent = uraOpen
      ? (side === 'ura' ? 'うらは テンポアップ＆とちゅうで 見えなくなる 高難度モード！' : '')
      : '「リミックス8」を クリアすると 🌙うらモード が かいほうされるよ！';

    const list = $('#stage-list');
    const scroll = list.scrollTop;
    let html = '';

    // ふたりせんよう ミニゲーム(協力/対戦モードのときだけ出る)
    if (mode !== 'solo') {
      const isCoop = mode === 'coop';
      let spBtns = '';
      for (const a of GameData.SPECIALS[mode]) {
        const d = GameData.specialDef(mode, a);
        const cls = isCoop ? stateCls(d.id, true) : '';
        const bd = isCoop ? badge(d.id, true) : '';
        spBtns += `<button class="g-btn ${cls}" data-sp="${a}">${d.icon} ${d.title} ${bd}</button>`;
      }
      html += `<div class="stage-row sp">
        <div class="stage-head"><span class="badge">${isCoop ? '🤝 ふたりせんよう' : '⚔ ふたりせんよう'}</span>
        <span class="s-name">${isCoop ? 'きょうりょくゲーム' : 'たいせんゲーム'}</span></div>
        <div class="btn-grid">${spBtns}</div></div>`;
    }

    for (let s = 1; s <= 20; s++) {
      const meta = GameData.STAGES[s - 1];
      const isEx = s > 15;
      const remixId = `${side}:${s}:R`;
      const remixOpen = GameData.unlocked(side, s, 'R');
      let games = '';
      let anyOpen = remixOpen;
      if (!isEx) {
        for (let k = 0; k < 4; k++) {
          const d = defFor(side, s, k);
          const open = GameData.unlocked(side, s, k);
          anyOpen = anyOpen || open;
          games += `<button class="g-btn ${stateCls(d.id, open)}" data-s="${s}" data-slot="${k}">` +
            `${d.icon} ${Patterns.ARCH[d.arch].base}${d.level > 1 ? ' ' + d.level : ''} ${badge(d.id, open)}</button>`;
        }
      }
      const rd = GameData.remixDef(side, s);
      const remixBtn = `<button class="g-btn remix ${stateCls(remixId, remixOpen)}" data-s="${s}" data-slot="R">` +
        `${rd.icon} ${rd.title} ${badge(remixId, remixOpen)}</button>`;
      let hint = '';
      if (!anyOpen) {
        hint = `<p class="locked-hint">🔒 ${isEx ? `リミックス${s - 1} を クリアで かいほう` : `リミックス${s - 1} を クリアで かいほう`}</p>`;
      } else if (!remixOpen && !isEx) {
        hint = `<p class="locked-hint">🎵 4つの ゲームを ぜんぶ クリアすると リミックス${s} が かいほう！</p>`;
      }
      html += `<div class="stage-row ${isEx ? 'ex' : ''} ${anyOpen ? '' : 'row-locked'}">
        <div class="stage-head"><span class="badge">${isEx ? 'EX' + (s - 15) : 'ステージ' + s}</span><span class="s-name">${meta.name}</span></div>
        <div class="btn-grid">${games}${remixBtn}</div>${hint}</div>`;
    }
    list.innerHTML = html;
    list.scrollTop = scroll;
  }

  function onSelectClick(e) {
    const btn = e.target.closest('button.g-btn');
    if (!btn) return;
    AudioKit.ensure();
    if (btn.dataset.sp) {   // ふたりせんよう ミニゲーム
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      launch(GameData.specialDef(mode, btn.dataset.sp));
      return;
    }
    const s = Number(btn.dataset.s), slot = btn.dataset.slot;
    if (!GameData.unlocked(side, s, slot === 'R' ? 'R' : Number(slot))) {
      AudioKit.sfx(AudioKit.newBus(1), 'uino', AudioKit.now());
      btn.classList.add('shake');
      setTimeout(() => btn.classList.remove('shake'), 350);
      return;
    }
    AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
    launch(defFor(side, s, slot));
  }

  /* ---------- プレイ・リザルト ---------- */
  function launch(def) {
    show('game');
    Engine.play(def, {
      finish: res => onFinish(def, res),
      exit: () => { show('select'); render(); },
    }, mode);
  }

  function playerStatsLine(pl, i) {
    return `<div class="stats"><b style="color:${P_COLS[i]}">${i + 1}P</b>　ピッタリ ${pl.perfect} ／ セーフ ${pl.ok} ／ ミス ${pl.miss} ／ おてつき ${pl.whiff}</div>`;
  }

  function onFinish(def, res) {
    const ov = document.getElementById('game-overlay');

    if (res.mode === 'versus') {
      // 対戦: 勝敗のみ。セーブには記録しない
      const w = res.winner;
      const head = w === -1 ? '🤝 ひきわけ！' : `🏆 ${w + 1}P の かち！`;
      const rows = res.players.map((pl, i) =>
        `<div class="score" style="color:${P_COLS[i]}">${i + 1}P　スコア ${pl.score}</div>` + playerStatsLine(pl, i)
      ).join('');
      ov.innerHTML = `
        <div class="card result rk-clear">
          <div class="rank-face">⚔</div>
          <h2>${head}</h2>
          ${rows}
          <p class="hint">たいせんの けっかは セーブされません</p>
          <button class="sub-btn" id="btn-retry">🔁 もういちど</button>
          <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
        </div>`;
    } else {
      const before = GameData.unlockSnapshot();
      GameData.setResult(def.id, res.rank === 'superb' ? 3 : res.rank === 'clear' ? 2 : 1);
      const after = GameData.unlockSnapshot();

      const news = [];
      if (!before.has('URA') && after.has('URA')) {
        news.push('🌙 うらモード かいほう！！ セレクトがめんで きりかえられるよ！');
      }
      for (let s = 1; s <= 20; s++) {
        for (const sd of ['omote', 'ura']) {
          const rid = `${sd}:${s}:R`;
          if (!before.has(rid) && after.has(rid)) {
            news.push(`🔓 ${sd === 'ura' ? '裏リミックス' : 'リミックス'}${s} かいほう！`);
          }
          const gid = `${sd}:${s}:0`;
          if (s <= 15 && !before.has(gid) && after.has(gid)) {
            news.push(`🔓 ${sd === 'ura' ? '裏' : ''}ステージ${s}「${GameData.STAGES[s - 1].name}」の ゲーム かいほう！`);
          }
        }
      }

      const conf = {
        superb: { face: '🌟', name: 'ハイレベル！', cls: 'rk-superb' },
        clear: { face: '😊', name: 'クリア！', cls: 'rk-clear' },
        fail: { face: '😵', name: 'やりなおし…', cls: 'rk-fail' },
      }[res.rank];
      const coopRows = res.players ? res.players.map((pl, i) => playerStatsLine(pl, i)).join('') : '';

      ov.innerHTML = `
        <div class="card result ${conf.cls}">
          <div class="rank-face">${conf.face}</div>
          <h2>${conf.name}</h2>
          <div class="score">スコア ${res.score}</div>
          <div class="stats">ピッタリ ${res.perfect} ／ セーフ ${res.ok} ／ ミス ${res.miss} ／ おてつき ${res.whiff}</div>
          ${coopRows}
          <div class="unlocks">${news.map(n => `<div>${n}</div>`).join('')}</div>
          <button class="sub-btn" id="btn-retry">🔁 もういちど</button>
          <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
        </div>`;
    }
    document.getElementById('btn-retry').addEventListener('click', () => launch(def));
    document.getElementById('btn-back').addEventListener('click', () => {
      Engine.stop();
      show('select');
      render();
    });
  }

  /* ---------- 初期化 ---------- */
  function initUI() {
    Engine.init(document.getElementById('cv'));

    $('#btn-start').addEventListener('click', () => {
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      show('select');
      render();
    });

    $('#btn-side').addEventListener('click', () => {
      if (!GameData.uraOpen()) {
        AudioKit.ensure();
        AudioKit.sfx(AudioKit.newBus(1), 'uino', AudioKit.now());
        $('#btn-side').classList.add('shake');
        setTimeout(() => $('#btn-side').classList.remove('shake'), 350);
        return;
      }
      side = side === 'omote' ? 'ura' : 'omote';
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      render();
    });

    document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
      $('#mode-hint').textContent =
        mode === 'coop' ? '🤝 1P: F/Dキー・がめん左タップ ／ 2P: J/Kキー・がめん右タップ。ふたりのスコアを あわせて クリア！けっかは セーブされるよ。'
        : mode === 'versus' ? '⚔ 1P: F/Dキー・がめん左タップ ／ 2P: J/Kキー・がめん右タップ。スコアの たかい ほうが かち！けっかは セーブされないよ。'
        : '';
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      render();
    }));

    $('#btn-wipe').addEventListener('click', () => {
      if (confirm('セーブデータを ぜんぶ けしますか？（もどせません）')) {
        GameData.wipe();
        side = 'omote';
        render();
      }
    });

    $('#stage-list').addEventListener('click', onSelectClick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})();
