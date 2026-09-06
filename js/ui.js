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
    const pc = GameData.pcActive();
    const mark = GameData.isPerfect(id) ? '💯' : (pc && pc.id === id && pc.mode === mode) ? '🎯' : '';
    const r = GameData.rank(id);
    return (r === 3 ? '⭐' : r === 2 ? '✅' : '') + mark + (GameData.rank(id + '#arrow') >= 2 ? '🎮' : '') + (GameData.rank(id + '#arrowmix') >= 2 ? '🕹️' : '') + (GameData.rank(id + '#kbd') >= 2 ? '⌨️' : '') + (GameData.rank(id + '#kbdmix') >= 2 ? '🔤' : '') + (GameData.rank(id + '#arrowkbd') >= 2 ? '🎹' : '') + (GameData.rank(id + '#arrowkbdmix') >= 2 ? '🎲' : '') + (GameData.rank(id + '#kbdonly') >= 2 ? '🔠' : '');
  }

  function updateLaneBtn() {
    const b = $('#btn-lane');
    if (!b) return;
    const on = Engine.getLane();
    b.textContent = on ? '🎯 レーン: ON' : '🎯 レーン: OFF';
    b.classList.toggle('off', !on);
    const nb = $('#btn-night');
    if (nb) {
      nb.hidden = !GameData.nightUnlocked();
      nb.textContent = GameData.nightOn() ? '🌙 ナイト: ON' : '🌙 ナイト: OFF';
      nb.classList.toggle('off', !GameData.nightOn());
    }
    // ノーツモードの ボタン(どれか ひとつだけ ON。初期バージョンには ない)
    for (const [id, m, label] of NOTE_BTNS) {
      const b2 = $('#' + id);
      if (!b2) continue;
      const on = GameData.noteMode() === m;
      b2.hidden = !GameData.feat('arrows');
      b2.textContent = label + (on ? ': ON' : ': OFF');
      b2.classList.toggle('off', !on);
    }
    document.body.classList.toggle('night', GameData.nightOn());
    const sc = $('#speed-ctl');   // はやさ(初期バージョンには ない)
    if (sc) {
      sc.hidden = !GameData.feat('speed');
      const lab = $('#spd-label'); if (lab) lab.textContent = '⏩ はやさ ' + GameData.speedLabel();
      const rg = $('#spd-range'); if (rg) rg.value = String(GameData.speed());
    }
  }

  const NOTE_BTNS = [
    ['btn-arrow', 'arrow', '🎮 アロー版'],
    ['btn-arrowmix', 'arrowmix', '🎮 アロー＆通常版'],
    ['btn-kbd', 'kbd', '⌨️ キーボード版'],
    ['btn-kbdmix', 'kbdmix', '⌨️ キーボード＆通常版'],
    ['btn-arrowkbd', 'arrowkbd', '🎮⌨️ アロー＆キーボード版'],
    ['btn-arrowkbdmix', 'arrowkbdmix', '🎮⌨️ アロー＆キーボード＆通常版'],
    ['btn-kbdonly', 'kbdonly', '⌨️ キーボード専用版'],
  ];
  const NOTE_NAMES = { arrow: '🎮 アロー版', arrowmix: '🎮 アロー＆通常版', kbd: '⌨️ キーボード版', kbdmix: '⌨️ キーボード＆通常版', arrowkbd: '🎮⌨️ アロー＆キーボード版', arrowkbdmix: '🎮⌨️ アロー＆キーボード＆通常版', kbdonly: '⌨️ キーボード専用版' };
  /* その def の ノーツモード名(きろく用のタグ)。エンジンの noteTagOf と おなじ きまり */
  const noteTagOf = def => (def.kbdGame ? '' : def.kbdOnly ? 'kbdonly' : def.arrowMode && def.kbdMode ? (def.mix ? 'arrowkbdmix' : 'arrowkbd') : def.arrowMode ? (def.mix ? 'arrowmix' : 'arrow') : def.kbdMode ? (def.mix ? 'kbdmix' : 'kbd') : '');

  /* あそびかたの ヒント文(バージョンと モードで きまる)。render() が まいかい 反映する */
  function modeHintText() {
    if (GameData.version() === 'v0') return '📼 初期バージョン: ミニゲームと リミックス1〜20（おもて・うら）だけの シンプルな あそびかた。スペース / J / F / タップで あそぼう！';
    if (mode === 'coop') return '🤝 1P: Fキー・↑↓←→・がめん左タップ ／ 2P: J/Kキー・WASD・がめん右タップ。ふたりのスコアを あわせて クリア！けっかは セーブされるよ。';
    const base = mode === 'versus' ? '⚔ 1P: Fキー・↑↓←→・がめん左タップ ／ 2P: J/Kキー・WASD・がめん右タップ。スコアの たかい ほうが かち！たいせんゲーム20しゅるいの クリアきろくだけ のこるよ（エンドレス解放よう）。' : '';
    const nm = GameData.noteMode();
    const ar = nm === 'arrow' ? '🎮 アロー版ON: アローゲーム以外の ぜんぶの ゲームの ノーツに ↑↓←→ が つくよ（ふつう版は OFFで）。'
      : nm === 'arrowmix' ? '🎮 アロー＆通常版ON: アローゲーム以外の ゲームの ノーツの いちぶ(だいたい 半分)に ↑↓←→ が つくよ。ほうこうの ない ●ノーツは いつもの キーで OK。'
      : nm === 'kbd' ? '⌨️ キーボード版ON: アローゲーム以外の ゲームの ノーツに A〜Z・0〜9 の キーが つくよ。アローキーは レーンの ON/OFF。'
      : nm === 'kbdmix' ? '⌨️ キーボード＆通常版ON: ノーツの いちぶ(だいたい 半分)に A〜Z・0〜9 の キーが つくよ。キーの ない ●ノーツは どのキーでも OK。アローキーは レーンの ON/OFF。'
      : nm === 'arrowkbd' ? '🎮⌨️ アロー＆キーボード版ON: ぜんぶの ノーツに ↑↓←→ か A〜Z・0〜9 の どちらかが つくよ（2Pは WASD が ほうこう）。レーンの ON/OFF は Lキー。'
      : nm === 'arrowkbdmix' ? '🎮⌨️ アロー＆キーボード＆通常版ON: ノーツに ↑↓←→ か A〜Z・0〜9 が ついたり つかなかったり。●ノーツは いつもの キーで OK。レーンの ON/OFF は Lキー。'
      : nm === 'kbdonly' ? '⌨️ キーボード専用版ON: アローゲームも ふくめて ぜんぶの ゲームの ぜんぶの ノーツが A〜Z・0〜9 の キーに なるよ。スペース・タップは つかえない。アローキーは レーンの ON/OFF。' : '';
    return base + (base && ar ? '　' : '') + ar;
  }

  function render() {
    updateLaneBtn();   // ゲーム中にLキーで切り替えた場合もここで同期
    // バージョン: 初期バージョンは 1人モードだけで、あそびかた/レーン/ナイトの ボタンも ない
    const v0 = GameData.version() === 'v0';
    if (v0 && mode !== 'solo') { mode = 'solo'; document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === 'solo')); }
    const mb = $('#mode-bar'); if (mb) mb.hidden = v0;
    const vb = $('#btn-ver'); if (vb) vb.textContent = '📼 ' + (v0 ? '初期バージョン' : 'Ver. 1');
    $('#mode-hint').textContent = modeHintText();
    document.body.classList.toggle('ura', side === 'ura');
    $('#side-title').textContent = side === 'ura' ? '🌙 うら ステージ' : '☀ おもて ステージ';
    // いま何本クリアできているか つねに見えるようにする(エンドレスの条件は おもての 80本)
    let done = 0, total = 0;
    for (let s = 1; s <= 20; s++) {
      if (s <= 15) for (let k = 0; k < 4; k++) { total++; if (GameData.cleared(`${side}:${s}:${k}`)) done++; }
      total++; if (GameData.cleared(`${side}:${s}:R`)) done++;
    }
    $('#medal-count').textContent = `⭐ ${GameData.medals()}　✅ ${done}/${total}${GameData.feat('perfect') ? '　💯 ' + GameData.perfectCount() : ''}`;

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

    // パーフェクトキャンペーン かいさい中のおしらせ(そのモードのときだけ)
    const pc = GameData.pcActive();
    if (!GameData.feat('perfect')) {
      // 初期バージョンには パーフェクトキャンペーンが ない
    } else if (pc && pc.mode === mode) {
      const d = GameData.defFromId(pc.id);
      html += `<div class="stage-row pc">
        <div class="stage-head"><span class="badge">💯 パーフェクトキャンペーン</span>
        <span class="s-name">${d.icon} ${d.title}</span>
        <span class="s-name" style="margin-left:auto;font-size:15px">のこりチャンス ${'★'.repeat(pc.tries)}${'☆'.repeat(GameData.PC_TRIES - pc.tries)}</span></div>
        <div class="btn-grid"><button class="g-btn remix" data-pc="1">🎯 ${d.title} に ちょうせん！</button></div>
        <p class="locked-hint">ミス・おてつき・ボムが 1つでも 出たら その場で しゅうりょう。ノーミスで クリアすると 💯 パーフェクト！</p></div>`;
    } else if (mode !== 'versus') {
      const doneP = GameData.perfectDone(mode), totalP = GameData.perfectTotal(mode);
      if (doneP > 0) {
        html += `<div class="stage-row pc done">
          <div class="stage-head"><span class="badge">💯 パーフェクト</span>
          <span class="s-name">${doneP} / ${totalP} たっせい${doneP >= totalP ? '　🎊 コンプリート！' : ''}</span></div>
          <p class="locked-hint">ゲームを クリアすると ときどき パーフェクトキャンペーンが かいさいされるよ！</p></div>`;
      }
    }

    // ふたりせんよう ミニゲーム(協力/対戦モードのときだけ出る)
    if (GameData.feat('specials') && GameData.SPECIALS[mode]) {
      const isCoop = mode === 'coop', isSolo = mode === 'solo';
      let spBtns = '';
      let spDone = 0;
      for (const a of GameData.SPECIALS[mode]) {
        const d = GameData.specialDef(mode, a);
        if (GameData.cleared(d.id)) spDone++;
        // 対戦もクリア記録がのこるので ✅ を出す(エンドレスの条件が見えるように)
        spBtns += `<button class="g-btn ${stateCls(d.id, true)}" data-sp="${a}">${d.icon} ${d.title} ${badge(d.id, true)}</button>`;
      }
      html += `<div class="stage-row sp">
        <div class="stage-head"><span class="badge">${isSolo ? '🎮 アローせんよう' : isCoop ? '🤝 ふたりせんよう' : '⚔ ふたりせんよう'}</span>
        <span class="s-name">${isSolo ? 'アローゲーム（↑↓←→ が べつのアクション）' : isCoop ? 'きょうりょくゲーム' : 'たいせんゲーム'}</span>
        <span class="s-name" style="margin-left:auto;font-size:14px">✅ ${spDone}/${GameData.SPECIALS[mode].length}</span></div>
        <div class="btn-grid">${spBtns}</div></div>`;
    }
    // キーボードせんよう ゲーム(1人モード)。A〜Z・0〜9 の キーで あそぶことを 前提に つくった ゲーム(ノーツモードとは べつ)
    if (GameData.feat('specials') && mode === 'solo') {
      let kbBtns = '', kbDone = 0;
      for (const a of GameData.KBD_GAMES) {
        const d = GameData.kbdGameDef(a);
        if (GameData.cleared(d.id)) kbDone++;
        kbBtns += `<button class="g-btn ${stateCls(d.id, true)}" data-kbd="${a}">${d.icon} ${d.title} ${badge(d.id, true)}</button>`;
      }
      html += `<div class="stage-row sp">
        <div class="stage-head"><span class="badge">⌨️ キーボードせんよう</span>
        <span class="s-name">キーボードゲーム（A〜Z・0〜9 の キーで あそぶ）</span>
        <span class="s-name" style="margin-left:auto;font-size:14px">✅ ${kbDone}/${GameData.KBD_GAMES.length}</span></div>
        <div class="btn-grid">${kbBtns}</div></div>`;
    }
    // アローゲームは 2人モードでも あそべる(1P=↑↓←→ / 2P=WASD)。記録は 1人モードと 共通
    if (GameData.feat('specials') && mode !== 'solo') {
      let arBtns = '', arDone = 0;
      for (const a of GameData.SPECIALS.solo) {
        const d = GameData.specialDef('solo', a);
        if (GameData.cleared(d.id)) arDone++;
        arBtns += `<button class="g-btn ${stateCls(d.id, true)}" data-sp="${a}" data-spmode="solo">${d.icon} ${d.title} ${badge(d.id, true)}</button>`;
      }
      html += `<div class="stage-row sp">
        <div class="stage-head"><span class="badge">🎮 アローゲーム</span>
        <span class="s-name">${mode === 'coop' ? 'ふたりで きょうりょく' : 'ふたりで たいせん'}（1P=↑↓←→ ／ 2P=WASD）</span>
        <span class="s-name" style="margin-left:auto;font-size:14px">✅ ${arDone}/${GameData.SPECIALS.solo.length}</span></div>
        <div class="btn-grid">${arBtns}</div></div>`;
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
    // エンドレスリミックス(モードごとに べつのゲーム。ぜんぶクリアで かいほう)。初期バージョンには ない
    if (GameData.feat('endless')) {
      const ed = GameData.endlessDef(mode);
      const open = GameData.endlessOpen(mode);
      const remain = GameData.endlessRemain(mode);
      const best = GameData.bestEndless(mode);
      const miss = GameData.endlessMissing(mode);
      const missTxt = miss.length ? `　のこり：${miss.slice(0, 3).join('、')}${miss.length > 3 ? ` ほか${miss.length - 3}` : ''}` : '';
      const hint = open
        ? (best ? `🏅 ベストきろく ${best} ポイント` : 'まだ きろくが ないよ！さいしょの ちょうせん！')
        : `🔒 ${ed.unlockText}（あと ${remain}）${missTxt}`;
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
    if (btn.dataset.kbd) {   // キーボードせんよう ゲーム
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      launch(GameData.kbdGameDef(btn.dataset.kbd));
      return;
    }
    if (btn.dataset.sp) {   // ふたりせんよう ミニゲーム
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      launch(GameData.specialDef(btn.dataset.spmode || mode, btn.dataset.sp));   // アローゲームは 2人モードでも 'solo' の定義を つかう
      return;
    }
    if (btn.dataset.pc) {   // パーフェクトキャンペーンの ちょうせん
      const pc = GameData.pcActive();
      if (!pc) { render(); return; }
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      launch(GameData.defFromId(pc.id));
      return;
    }
    if (btn.dataset.endless) {
      if (!GameData.endlessOpen(mode)) { denied(btn); return; }
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      showEndlessChooser(GameData.endlessDef(mode));
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
    const pc = GameData.pcActive();
    const isCampaign = !!(pc && pc.mode === mode && pc.id === def.id);
    // 遊びかたを えらべる ゲーム: パーフェクト たっせいずみ / エンドレスが ある ゲーム(クレーンなど)
    const opts = {
      perfect: !isCampaign && GameData.feat('perfect') && GameData.isPerfect(def.id),
      endless: !isCampaign && GameData.feat('endless') && GameData.endlessGameOK(def),
    };
    if (opts.perfect || opts.endless) { showChooser(def, opts); return; }
    startGame(def, isCampaign, isCampaign);
  }

  function startGame(def, challenge, isCampaign) {
    if (def.kind === 'endless') def.seed = Math.floor(Math.random() * 1e9);   // エンドレスは まいかい ちがう譜面
    def.perfectChallenge = !!challenge && GameData.feat('perfect');
    def.noHold = !GameData.feat('hold');   // 初期バージョンは 長押しなし
    def.kbdOnly = GameData.kbdOnly();                     // キーボード専用版: アローゲームも ふくめて ぜんぶ キー(ほうこうは みない)
    def.arrowMode = !def.arrow && GameData.arrowMode();   // アロー版: ぜんぶの ノーツに ↑↓←→(アローゲームは もともと)
    def.kbdMode = (!def.arrow || def.kbdOnly) && GameData.kbdMode();   // キーボード版: ぜんぶの ノーツに A〜Z・0〜9
    def.mix = (def.arrowMode || def.kbdMode) && GameData.mixMode();   // ＆通常版: いちぶの ノーツだけに つける
    if (def.kbdGame) { def.kbdMode = true; def.arrowMode = false; def.mix = false; }   // キーボードせんよう ゲーム: つねに A〜Z・0〜9(ノーツモードは かんけいなし)
    def.pcCampaign = !!isCampaign;
    def.pcTries = isCampaign ? (GameData.pcActive() || {}).tries || 1 : 0;
    show('game');
    Engine.play(def, {
      finish: res => onFinish(def, res),
      exit: where => { show(where === 'title' ? 'title' : 'select'); render(); },   // 'title' = ゲームを やめる
    }, mode);
  }

  /* あそびかた えらび: ふつう / パーフェクトに ちょうせん(たっせいずみ) / エンドレスで あそぶ(あるゲームだけ) */
  function showChooser(def, opts) {
    show('game');
    const ov = document.getElementById('game-overlay');
    const ed = opts.endless ? GameData.endlessGameDef(def.arch, mode) : null;
    const best = ed ? GameData.bestEndless(endlessRecKey(ed)) : 0;
    const bestP = ed ? GameData.bestEndless(endlessRecKey(ed) + ':perfect') : 0;
    ov.innerHTML = `
      <div class="card">
        <div class="g-icon">${def.icon}${opts.perfect ? ' 💯' : ''}${opts.endless ? ' ♾️' : ''}</div>
        <h2>${def.title}</h2>
        <p class="desc">${opts.perfect ? 'このゲームは <b>パーフェクト たっせいずみ</b>！<br>' : ''}どうやって あそぶ？</p>
        ${opts.perfect && !GameData.nightUnlocked() ? '<p class="desc pc-box">🌙 ひみつ: <b>レーンを けしたまま</b> パーフェクトを たっせいすると、なにかが おこる…？</p>' : ''}
        <button class="go-btn" id="btn-normal">▶ ふつうに あそぶ</button>
        <div style="margin-top:10px">
          ${opts.perfect ? '<button class="sub-btn" id="btn-pcgo">💯 パーフェクトに ちょうせん</button>' : ''}
          ${opts.endless ? `<button class="sub-btn" id="btn-endless">♾️ エンドレスで あそぶ${best ? `（ベスト ${best}pt）` : ''}</button>` : ''}
          ${opts.endless ? `<button class="sub-btn" id="btn-pend">♾️💯 エンドレスを パーフェクトで${bestP ? `（ベスト ${bestP}pt）` : ''}</button>` : ''}
          <button class="sub-btn" id="btn-cancel">🗺 セレクトへ</button>
        </div>
        <p class="hint">${opts.endless ? `♾️ エンドレス: ${def.title} が えんえん つづき、すすむほど テンポアップ。ライフ ${'❤️'.repeat(ed.lives)}${ed.lifeMode === 'shared' ? '（ふたりで きょうゆう）' : ''}。<br>` : ''}${opts.perfect ? '💯 ちょうせんは ミス・おてつきが 1つでも 出たら しゅうりょう（チャンスは へりません）' : ''}</p>
      </div>`;
    const click = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { AudioKit.ensure(); AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now()); fn(); }); };
    click('btn-normal', () => startGame(def, false, false));
    click('btn-pcgo', () => startGame(def, true, false));
    click('btn-endless', () => startGame(ed, false, false));
    click('btn-pend', () => startGame(perfectEndlessDef(ed), false, false));
    click('btn-cancel', () => { ov.innerHTML = ''; show('select'); render(); });
  }

  /* エンドレスの きろくキー(アロー版・キーボード版は べつわく)。エンジンの result.endlessKey と おなじ きまり */
  function endlessRecKey(ed) {
    const arrowable = !ed.arrow || GameData.kbdOnly();   // アローゲームの エンドレスは キーボード専用版いがいの ノーツモードに ならない(startGame と おなじ きまり)
    return (ed.endlessKey || mode) + (arrowable && GameData.noteTag() ? ':' + GameData.noteTag() : '');
  }

  /* エンドレスの パーフェクトちょうせん版: ライフ1つ(協力も 共有1つ)。ミス・おてつき・ボムが 1つでも 出たら しゅうりょう */
  function perfectEndlessDef(ed) {
    const d = Object.assign({}, ed);
    d.perfectEndless = true;
    d.lives = 1;
    d.title = ed.title + '（💯パーフェクト）';
    return d;
  }

  /* モードのエンドレス: ふつう / パーフェクトで ちょうせん を えらぶ */
  function showEndlessChooser(ed) {
    show('game');
    const ov = document.getElementById('game-overlay');
    const best = GameData.bestEndless(endlessRecKey(ed));
    const bestP = GameData.bestEndless(endlessRecKey(ed) + ':perfect');
    ov.innerHTML = `
      <div class="card">
        <div class="g-icon">${ed.icon}</div>
        <h2>${ed.title}</h2>
        <p class="desc">どうやって あそぶ？</p>
        <button class="go-btn" id="btn-normal">♾️ ふつうに あそぶ${best ? `（ベスト ${best}pt）` : ''}</button>
        <div style="margin-top:10px">
          <button class="sub-btn" id="btn-pend">💯 パーフェクトで ちょうせん${bestP ? `（ベスト ${bestP}pt）` : ''}</button>
          <button class="sub-btn" id="btn-cancel">🗺 セレクトへ</button>
        </div>
        <p class="hint">♾️ ふつう: ライフ ${'❤️'.repeat(ed.lives)}${ed.lifeMode === 'shared' ? '（ふたりで きょうゆう）' : mode === 'versus' ? '（それぞれ）' : ''}。ミス・おてつき・ボムの たびに 1つ へります。<br>
          💯 パーフェクト: ライフは 1つだけ。ミス・おてつき・ボムが 1つでも 出たら その場で しゅうりょう。${ed.segCount} セクション いきのこれば パーフェクトたっせい！ きろくは べつわくです。</p>
      </div>`;
    const click = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { AudioKit.ensure(); AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now()); fn(); }); };
    click('btn-normal', () => startGame(ed, false, false));
    click('btn-pend', () => startGame(perfectEndlessDef(ed), false, false));
    click('btn-cancel', () => { ov.innerHTML = ''; show('select'); render(); });
  }

  /* 1P/2P の 成績行(協力・対戦の リザルトで つかう) */
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
    if (GameData.feat('endless')) for (const m of ['solo', 'coop', 'versus']) {
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
        const rk = b >= 85 ? 3 : b >= 60 ? 2 : 1;
        GameData.setResult(def.id, rk);
        if (noteTagOf(def)) GameData.setResult(def.id + '#' + noteTagOf(def), rk);   // アロー版などの きろくは べつにも のこす
        saved = true;
      }
    } else {
      const rk = res.rank === 'superb' ? 3 : res.rank === 'clear' ? 2 : 1;
      GameData.setResult(def.id, rk);
      if (noteTagOf(def)) GameData.setResult(def.id + '#' + noteTagOf(def), rk);   // アロー版などの きろくは べつにも のこす
      saved = true;
    }
    const news = saved ? newsFrom(before, GameData.unlockSnapshot()) : [];
    const newsHtml = `<div class="unlocks">${news.map(n => `<div>${n}</div>`).join('')}</div>`;

    // クリアすると ときどき パーフェクトキャンペーンが かいさいされる
    let offer = null;
    if (GameData.feat('perfect') && !res.perfectChallenge && !res.endless && (res.mode === 'solo' || res.mode === 'coop') &&
        (res.rank === 'clear' || res.rank === 'superb')) {
      offer = GameData.pcMaybeOffer(res.mode);
    }
    const offerHtml = offer
      ? `<div class="unlocks"><div>💯 パーフェクトキャンペーン かいさい！<br>「${GameData.defFromId(offer.id).title}」を ノーミスで クリアしよう！（チャンス ${offer.tries}かい）</div></div>`
      : '';

    if (res.perfectChallenge) {
      const totalP = GameData.perfectTotal(res.mode);
      // レーンを 一度も つけずに たっせいしたら ナイトモード かいほう
      const gotNight = res.perfectAchieved && res.noLane && GameData.unlockNight();
      const nightHtml = gotNight
        ? `<div class="unlocks"><div>🌙 ナイトモード かいほう！！<br>レーンなしで パーフェクトを たっせいした しょうこ。セレクトの 🌙ボタンで きりかえられるよ！</div></div>`
        : '';
      if (res.perfectAchieved) {
        if (res.campaign) GameData.pcWin();
        const doneP = GameData.perfectDone(res.mode);
        ov.innerHTML = `
          <div class="card result rk-superb">
            <div class="rank-face">💯</div>
            <h2>${res.campaign ? 'パーフェクト たっせい！！' : 'パーフェクト いじ！さすが！'}</h2>
            <div class="score">${def.icon} ${def.title}</div>
            <div class="stats">ミスなし・おてつきなし で かんぺき！${res.noLane ? '　🎯 レーンなし！' : ''}</div>
            <div class="unlocks">
              <div>💯 パーフェクト ${doneP} / ${totalP}${doneP >= totalP ? '　🎊 ぜんぶ たっせい！コンプリート！！' : ''}</div>
            </div>
            ${nightHtml}
            ${newsHtml}
            ${res.campaign ? '' : '<button class="sub-btn" id="btn-retry">🔁 もういちど</button>'}
            <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
          </div>`;
      } else {
        const left = res.campaign ? GameData.pcFail() : -1;
        const msg = !res.campaign
          ? 'ちょうせん しっぱい。💯 の きろくは そのままだよ！'
          : left > 0
            ? `のこりチャンス ${'★'.repeat(left)}${'☆'.repeat(GameData.PC_TRIES - left)}　もういちど ちょうせんできるよ！`
            : 'チャンスを つかいきって キャンペーンは しゅうさい。またの きかいに！';
        ov.innerHTML = `
          <div class="card result rk-fail">
            <div class="rank-face">💥</div>
            <h2>ざんねん…</h2>
            <div class="score">${def.icon} ${def.title}</div>
            <div class="stats">${msg}</div>
            <div class="stats">💯 パーフェクト ${GameData.perfectDone(res.mode)} / ${totalP}</div>
            ${left !== 0 ? '<button class="sub-btn" id="btn-retry">🔁 もういちど ちょうせん</button>' : ''}
            <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
          </div>`;
      }
    } else if (res.endless) {
      const ek = res.endlessKey || res.mode;
      const prevBest = GameData.bestEndless(ek);
      const isBest = GameData.setBestEndless(ek, res.points);
      const pe = !!def.perfectEndless;
      const head = res.mode === 'versus'
        ? (res.winner === -1 ? '🤝 ひきわけ！' : `🏆 ${res.winner + 1}P の かち！${pe && res.survived ? '　💯 ふたりとも パーフェクト！' : ''}`)
        : pe
          ? (res.survived ? '💯 エンドレス パーフェクト たっせい！！' : '💥 ざんねん…（💯 パーフェクトちょうせん）')
          : (res.survived ? '🎉 コンプリート！！' : '♾️ ゲームオーバー');
      const face = res.survived ? (pe ? '💯' : '🎉') : res.mode === 'versus' ? '⚔' : pe ? '💥' : '💫';
      const rows = res.mode === 'solo' ? '' : res.players.map((pl, i) =>
        `<div class="stats"><b style="color:${P_COLS[i]}">${i + 1}P</b>　${pl.points} ポイント　／　ピッタリ ${pl.perfect}・セーフ ${pl.ok}・ミス ${pl.miss}</div>`
      ).join('');
      ov.innerHTML = `
        <div class="card result ${res.survived ? 'rk-superb' : 'rk-clear'}">
          <div class="rank-face">${face}</div>
          <h2>${head}</h2>
          <div class="score">セクション ${res.sections} / ${res.totalSections} とうたつ</div>
          <div class="score">${res.points} ポイント</div>
          ${res.speed && res.speed !== 1 ? `<div class="stats">⏩ はやさ ${res.speed.toFixed(1)}×で プレイ</div>` : ''}
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
          ${noteTagOf(def) ? `<div class="stats">${NOTE_NAMES[noteTagOf(def)]}で プレイ</div>` : ''}
          <div class="score">スコア ${res.score}</div>
          ${res.speed && res.speed !== 1 ? `<div class="stats">⏩ はやさ ${res.speed.toFixed(1)}×で プレイ</div>` : ''}
          <div class="stats">ピッタリ ${res.perfect} ／ セーフ ${res.ok} ／ ミス ${res.miss} ／ おてつき ${res.whiff}</div>
          ${coopRows}
          ${newsHtml}
          ${offerHtml}
          <button class="sub-btn" id="btn-retry">🔁 もういちど</button>
          <button class="sub-btn" id="btn-back">🗺 セレクトへ</button>
        </div>`;
    }
    const retry = document.getElementById('btn-retry');
    if (retry) retry.addEventListener('click', () => launch(def));
    document.getElementById('btn-back').addEventListener('click', () => {
      Engine.stop();
      show('select');
      render();
    });
  }

  /* ---------- 初期化 ---------- */
  function initUI() {
    Engine.init(document.getElementById('cv'));
    updateLaneBtn();   // ナイトモードの見た目は タイトルがめんから てきよう

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
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      render();
    }));

    $('#btn-lane').addEventListener('click', () => {
      if (!GameData.feat('lane')) return;   // 初期バージョン: レーンは つねに OFF(切替なし)
      Engine.setLane(!Engine.getLane());
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      updateLaneBtn();
    });

    // ノーツモード(アロー版 / アロー＆通常版 / キーボード版 / キーボード＆通常版): どれか ひとつ。おなじのを もういちど おすと OFF
    for (const [id, m] of NOTE_BTNS) {
      const b2 = $('#' + id);
      if (!b2) continue;
      b2.addEventListener('click', () => {
        GameData.setNoteMode(GameData.noteMode() === m ? 'off' : m);
        AudioKit.ensure();
        AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
        render();
      });
    }

    // はやさ: − / ＋ / スライダー(0.5×〜10×、0.5きざみ)
    const spd = v => { GameData.setSpeed(v); AudioKit.ensure(); AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now()); updateLaneBtn(); };
    const sd = $('#btn-spd-down'), su = $('#btn-spd-up'), sr = $('#spd-range');
    if (sd) sd.addEventListener('click', () => spd(GameData.speed() - GameData.SPEED_STEP));
    if (su) su.addEventListener('click', () => spd(GameData.speed() + GameData.SPEED_STEP));
    if (sr) sr.addEventListener('input', () => spd(parseFloat(sr.value)));

    $('#btn-night').addEventListener('click', () => {
      GameData.setNight(!GameData.nightOn());
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      updateLaneBtn();
    });

    $('#btn-ver').addEventListener('click', () => {   // 初期バージョン ⇄ Ver. 1
      const next = GameData.version() === 'v0' ? 'v1' : 'v0';
      GameData.setVersion(next);
      if (next === 'v0') mode = 'solo';
      AudioKit.ensure();
      AudioKit.sfx(AudioKit.newBus(1), 'uiclick', AudioKit.now());
      render();
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
