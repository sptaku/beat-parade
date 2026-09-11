// ヘッドレス ハーネス(Deno): DOM / Canvas / WebAudio の スタブを 用意して ゲーム一式(ui.js まで)を 読みこむ
//   実行: deno run --allow-read tests/<test>.js
export function boot() {
  const listeners = {};
  globalThis.window = globalThis;
  globalThis.addEventListener = (k, f) => { (listeners[k] ||= []).push(f); };
  const raf = { cb: null };
  globalThis.requestAnimationFrame = f => { raf.cb = f; return 1; };
  globalThis.cancelAnimationFrame = () => { raf.cb = null; };
  globalThis.setTimeout = (f) => { f(); return 0; };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.confirm = () => true;
  const drawn = [];
  const gradient = { addColorStop() {} };
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillText' || k === 'strokeText') return (s) => { drawn.push(String(s)); };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => gradient;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const els = {};
  function mkEl(id) {
    const h = {};
    return els[id] = {
      id, dataset: {}, hidden: false, textContent: '', style: {}, _html: '', value: '', clientWidth: 960, width: 960, height: 540,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(k, f) { (h[k] ||= []).push(f); },
      reset() { for (const k of Object.keys(h)) delete h[k]; },   // ほんものの DOM では 要素が つくりなおされる ぶんの まね
      fire(k, ev = {}) { (h[k] || []).forEach(f => f(Object.assign({ preventDefault() {}, repeat: false }, ev))); },
      get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
      querySelector(q) { return q && q.startsWith('#') ? (els[q.slice(1)] || null) : null; }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
      getContext() { return ctx2d; },
      closest() { return null; },
    };
  }
  const byId = id => els[id] || mkEl(id);
  globalThis.document = {
    readyState: 'complete', body: mkEl('body'),
    getElementById: byId,
    querySelector: q => q.startsWith('#') ? byId(q.slice(1)) : null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const clock = { t: 0 };
  const FN = /^(connect|disconnect|start|stop|setValueAtTime|linearRampToValueAtTime|exponentialRampToValueAtTime|setTargetAtTime|cancelScheduledValues|setPeriodicWave)$/;
  function mkNode() {
    return new Proxy({}, {
      get(t, k) {
        if (typeof k === 'symbol') return undefined;
        if (k === 'getChannelData') return () => new Float32Array(16);
        if (k in t) return t[k];
        if (FN.test(k)) return () => t;
        t[k] = mkNode(); return t[k];
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  class Ctx {
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = mkNode(); }
    get currentTime() { return clock.t; }
    resume() {}
  }
  for (const m of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBuffer', 'createBufferSource', 'createConvolver', 'createDynamicsCompressor', 'createDelay', 'createStereoPanner', 'createPeriodicWave']) Ctx.prototype[m] = () => mkNode();
  globalThis.AudioContext = Ctx;

  const src = ['audio.js', 'patterns.js', 'data.js', 'engine.js', 'ui.js'].map(f => Deno.readTextFileSync(new URL('../js/' + f, import.meta.url))).join('\n');
  const G = new Function(src + '\n;return { Engine, GameData, Patterns, AudioKit };')();
  G.GameData.wipe();
  G.GameData.setVersion('v1');
  G.GameData.setNoteMode('off');
  if (G.GameData.setSpeed) G.GameData.setSpeed(1);
  const key = (code, down = true) => (listeners[down ? 'keydown' : 'keyup'] || []).forEach(f => f({ code, repeat: false, preventDefault() {} }));
  const frame = () => { if (raf.cb) raf.cb(); };
  let pass = 0, fail = 0;
  const ok = (cond, msg, extra = '') => { if (cond) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg, extra); } };
  const done = () => { console.log(`\n${pass} passed, ${fail} failed`); if (fail) Deno.exit(1); };
  const DIRKEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const WASDKEY = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  return { ...G, byId, els, key, frame, clock, drawn, listeners, ok, done, DIRKEY, WASDKEY };
}
