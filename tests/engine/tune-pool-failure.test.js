// T-064: the Tune worker pool survives sub-workers that fail. worker.js runs here in vm contexts with a fake Worker; some sub-workers die with an error, go silent,
// or stop answering mid-part. The search must still finish, with exactly the result of the single-thread search (Tune.tune).
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const STATIC = path.join(__dirname, '..', '..', 'goldfish', 'static');
const rr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {}, priority: false };          // priority: false: the worker runs in a vm context that cannot see ISF_PRIORITY, so both sides must agree
const src = fs.readFileSync(path.join(STATIC, 'worker.js'), 'utf8'), clone = x => structuredClone(x);
// a worker.js running in its own context; `modes` says how each sub-worker it starts behaves: ok | error (an error event on its first part) | silent (never answers) | beat-then-silent
function context(modes, watchdog, out) {
  let made = 0;
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, structuredClone, navigator: { hardwareConcurrency: 4 } });
  ctx.self = ctx;
  ctx.TUNE_WATCHDOG_MS = watchdog;
  ctx.importScripts = (...files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(STATIC, f), 'utf8'), ctx, { filename: f }));
  ctx.postMessage = m => out(clone(m));
  ctx.Worker = class {
    constructor() {
      this.mode = (modes || [])[made++] || 'ok'; this.dead = false;
      this.child = this.mode === 'ok' ? context(null, watchdog, m => { if (!this.dead) setImmediate(() => this.onmessage && this.onmessage({ data: m })); }) : null;
    }
    postMessage(m) {
      if (this.dead) return;
      if (this.mode === 'ok') setImmediate(() => this.child.self.onmessage({ data: clone(m) }));
      else if (this.mode === 'error') setImmediate(() => { this.dead = true; this.onerror && this.onerror({ message: 'boom' }); });
      else if (this.mode === 'beat-then-silent') setImmediate(() => this.onmessage && this.onmessage({ data: { tbeat: m.tpart.id } }));
    }
    terminate() { this.dead = true; }
  };
  vm.runInContext(src, ctx, { filename: 'worker.js' });
  return ctx;
}
const ser = x => JSON.stringify(x, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
const input = { cards: rr.cards, tokens: rr.tokens, pool: [] }, goal = { kind: 'kill', earlier: 2 }, cfg = { n: 100, rounds: 1, seed: 777 };
const base = ser(T.tune(G, P, input, O, goal, cfg));
const msg = { tune: { cards: rr.cards, tokens: rr.tokens, pool: [], goal, rounds: 1 }, opts: O, n: 100, seed: 777 };
function go(label, modes, watchdog) {
  return new Promise(res => {
    const t0 = Date.now(), timer = setTimeout(() => { check(label + ': finishes', false, 'no result in 150 s'); res(); }, 150000);
    const ctx = context(modes, watchdog, m => { if (m.result) { clearTimeout(timer); check(label + ': the result equals the single search', ser(m.result) === base, ((Date.now() - t0) / 1000).toFixed(0) + ' s'); res(); } });
    ctx.self.onmessage({ data: clone(msg) });
  });
}
(async () => {
  await go('healthy pool', [], 60000);
  await go('one sub-worker errors on its first part', ['error'], 60000);
  await go('every sub-worker errors (the search finishes in the calling thread)', ['error', 'error', 'error', 'error'], 60000);
  await go('one sub-worker never answers (watchdog)', ['silent'], 3000);
  await go('one sub-worker beats once, then goes quiet (watchdog)', ['beat-then-silent'], 3000);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
