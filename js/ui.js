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

  function updateLaneBtn() {
    const b = $('#btn-lane');
    if (!b) return;
    const on = Engine.getLane();
    b.textContent = on ? '🎯 レーン: ON' : '🎯 レーン: OFF';
    b.classList.toggle('off', !on);
  }

  function render() {
    updateLaneBtn();   // ゲーム中にLキーで切り替えた場合もここで同期
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
    // エンドレスリミックス(モードごとに べつのゲーム。ぜんぶクリアで かいほう)
    {
      const ed = GameData.endlessDef(mode);
      const open = GameData.endlessOpen(mode);
      const remain = GameData.endlessRemain(mode);
      const best = GameData.bestEndless(mode);
      const hint = open
        ? (best ? `🏅 ベストきろく ${best} ポイント` : 'まだ きろくが ないよ！さいしょの ちょうせん！')
        : `🔒 ${ed.unlockText}（のこり ${remain}）`;
      html += `<div class="stage-row endless ${open ? '' : 'row-locked'}">
        <div class="stage-head"><span class="badge">♾️ エンドレス</span><span class="s-name">${mode === 'solo' ? '1人プレイ' : mode === 'coop' ? 'ふたり協力' : 'ふたり対戦'} げんていの さいしゅうモード</span></div>
        <div class="btn-grid">
          <button class="g-btn remix ${open ? '' : 'locked'}" data-endless="1">${ed.icon} ${ed.title} ${open ? (best ? '🏅' + best : '') : '🔒'}</button>
        </div>
        <p class="locked-hint">${hint}</p></div>`;
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
    if (btn.dataset.endless) {
      if (!GameData.endlessOpen(mode)) { denied(btn); return; }
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      launch(GameData.endlessDef(mode));
      return;
    }
    const s = Number(btn.dataset.s), slot = btn.dataset.slot;
    if (!GameData.unlocked(side, s, slot === 'R' ? 'R' : Number(slot))) { denied(btn); return; }
    AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
    launch(defFor(side, s, slot));
  }

  function denied(btn) {
    AudioKit.sfx(AudioKit.newBus(1), 'uino', AudioKit.now());
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 350);
  }

  /* ---------- プレイ・リザルト ---------- */
  function launch(def) {
    if (def.kind === 'endless') def.seed = Math.floor(Math.random() * 1e9);   // エンドレスは まいかい ちがう譜面
    show('game');
    Engine.play(def, {
      finish: res => onFinish(def, res),
      exit: () => { show('select'); render(); },
    }, mode);
  }

  function playerStatsLine(pl, i) {
    return `<div class="stats"><b style="color:${P_COLS[i]}">${i + 1}P</b>　ピッタリ ${pl.perfect} ／ セーフ ${pl.ok} ／ ミス ${pl.miss} ／ おてつき ${pl.whiff}</div>`;
  }

  /* かいほうされたものを ならべる */
  function newsFrom(before, after) {
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
    for (const m of ['solo', 'coop', 'versus']) {
      if (!before.has('ENDLESS:' + m) && after.has('ENDLESS:' + m)) {
        const label = m === 'solo' ? '1人プレイ' : m === 'coop' ? 'ふたり協力' : 'ふたり対戦';
        news.push(`♾️ ${label}の エンドレスリミックス「${GameData.endlessDef(m).title}」 かいほう！！`);
      }
    }
    return news;
  }

  function onFinish(def, res) {
    const ov = document.getElementById('game-overlay');
    const before = GameData.unlockSnapshot();
    let saved = false;
    if (res.endless) {
      // エンドレスは ベストきろくだけ のこす
    } else if (res.mode === 'versus') {
      // 対戦: ふたりせんようゲームだけ クリア記録をつける(エンドレス解放に つかう)
      if (def.special === 'versus') {
        const b = Math.max(res.players[0].score, res.players[1].score);
        GameData.setResult(def.id, b >= 85 ? 3 : b >= 60 ? 2 : 1);
        saved = true;
      }
    } else {
      GameData.setResult(def.id, res.rank === 'superb' ? 3 : res.rank === 'clear' ? 2 : 1);
      saved = true;
    }
    const news = saved ? newsFrom(before, GameData.unlockSnapshot()) : [];
    const newsHtml = `<div class="unlocks">${news.map(n => `<div>${n}</div>`).join('')}</div>`;

    if (res.endless) {
      const prevBest = GameData.bestEndless(res.mode);
      const isBest = GameData.setBestEndless(res.mode, res.points);
      const head = res.mode === 'versus'
        ? (res.winner === -1 ? '🤝 ひきわけ！' : `🏆 ${res.winner + 1}P の かち！`)
        : (res.survived ? '🎉 コンプリート！！' : '♾️ ゲームオーバー');
      const face = res.survived ? '🎉' : res.mode === 'versus' ? '⚔' : '💫';
      const rows = res.mode === 'solo' ? '' : res.players.map((pl, i) =>
        `<div class="stats"><b style="color:${P_COLS[i]}">${i + 1}P</b>　${pl.points} ポイント　／　ピッタリ ${pl.perfect}・セーフ ${pl.ok}・ミス ${pl.miss}</div>`
      ).join('');
      ov.innerHTML = `
        <div class="card result ${res.survived ? 'rk-superb' : 'rk-clear'}">
          <div class="rank-face">${face}</div>
          <h2>${head}</h2>
          <div class="score">セクション ${res.sections} / ${res.totalSections} とうたつ</div>
          <div class="score">${res.points} ポイント</div>
          ${res.mode === 'solo' ? `<div class="stats">ピッタリ ${res.players[0].perfect} ／ セーフ ${res.players[0].ok} ／ ミス ${res.players[0].miss} ／ おてつき ${res.players[0].whiff}</div>` : rows}
          <div class="unlocks">${isBest
            ? `<div>🎉 さいこうきろく こうしん！（まえは ${prevBest}）</div>`
            : `<div>🏅 ベストきろく ${prevBest} ポイント</div>`}</div>
          <button class="sub-btn" id="btn-retry">🔁 もういちど</button>
          <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
        </div>`;
    } else if (res.mode === 'versus') {
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
          ${newsHtml}
          <p class="hint">${def.special === 'versus'
            ? 'たいせんゲームの クリアきろくは エンドレス解放に つかわれます'
            : 'たいせんモードの キャンペーンは セーブされません'}</p>
          <button class="sub-btn" id="btn-retry">🔁 もういちど</button>
          <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
        </div>`;
    } else {
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
          ${newsHtml}
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
        : mode === 'versus' ? '⚔ 1P: F/Dキー・がめん左タップ ／ 2P: J/Kキー・がめん右タップ。スコアの たかい ほうが かち！たいせんゲーム20しゅるいの クリアきろくだけ のこるよ（エンドレス解放よう）。'
        : '';
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      render();
    }));

    $('#btn-lane').addEventListener('click', () => {
      Engine.setLane(!Engine.getLane());
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      updateLaneBtn();
    });

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
