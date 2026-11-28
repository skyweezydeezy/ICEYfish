#!/usr/bin/env node
// T-137: finds, for every built-in deck, the 1v1 Duel it wins fastest against another built-in deck, so the Build tab can offer
// "Fastest win vs <deck>: turn N ▶ Watch". Writes goldfish/static/decks/fastest.json.
//   node tools/fastest-kill.js [--games=300] [--jobs=4] [--only=death-tax]
// Per deck: --games Duels (default 300), spread over all the other built-in decks in turn (every opponent gets about the same number of
// games, the first seat alternates between rounds of opponents), seeds derived from the deck and the game number. The fastest win is the one
// where the deck's own turn number is lowest (then the lower round, then the earlier game). The Duel is the app's own: tools/lib/fastest.js.
// The engine changes the result, so the file records the engine version ("v"); tests/engine/fastest-duel.test.js replays every stored seed
// and fails, saying to run this tool again, when a result no longer comes out the same.
// --only=<text> re-searches only the decks whose file name contains <text> and keeps the others as they are.
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const F = require('./lib/fastest.js');
const OUT = path.join(F.DECKS, 'fastest.json'), SEED = 20261128;
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const GAMES = +arg('games', 300), JOBS = +arg('jobs', os.cpus().length), ONLY = arg('only', '');

function search(L, i) {              // L = { decks }, i = the deck's index
  const A = L.decks[i], others = L.decks.map((d, k) => k).filter(k => k !== i), M = others.length;
  let best = null, errors = 0, wins = 0;
  for (let k = 0; k < GAMES; k++) {
    const j = others[k % M], first = Math.floor(k / M) % 2, seed = (SEED + i * 1000003 + k * 7919) >>> 0;
    let r; try { r = F.playDuel(A, L.decks[j], seed, first); } catch (e) { errors++; continue; }
    if (r.winner !== 0) continue; wins++;
    if (!best || r.turn < best.turn || (r.turn === best.turn && r.round < best.round)) best = { opp: L.decks[j].file, oppName: L.decks[j].name, seed, first, turn: r.turn, round: r.round };
  }
  return { file: A.file, best, wins, errors };
}

if (!isMainThread) {
  const L = F.loadDecks();
  parentPort.on('message', i => parentPort.postMessage(search(L, i)));
  return;
}
const main = async () => {
  const L = F.loadDecks(), todo = L.decks.map((d, i) => i).filter(i => !ONLY || L.decks[i].file.includes(ONLY));
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { decks: {} };
  const out = Object.assign({}, old.decks), t0 = Date.now(); let done = 0;
  await new Promise(res => {
    const next = [...todo], n = Math.min(JOBS, todo.length);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { workerData: {} });
      const feed = () => { if (next.length) wk.postMessage(next.shift()); else wk.terminate(); };
      wk.on('message', r => {
        out[r.file] = r.best ? Object.assign({}, r.best, { v: F.version(), games: GAMES }) : { none: true, v: F.version(), games: GAMES };
        done++; console.log(`${done}/${todo.length} ${r.file}: ` + (r.best ? `turn ${r.best.turn} vs ${r.best.oppName} (${r.wins} wins in ${GAMES}${r.errors ? ', ' + r.errors + ' errors' : ''})` : `no win in ${GAMES} games`));
        if (done === todo.length) res(); feed();
      });
      wk.on('error', e => { console.error(e); process.exit(1); });
      feed();
    }
  });
  const sorted = {}; Object.keys(out).sort().forEach(k => { sorted[k] = out[k]; });
  fs.writeFileSync(OUT, JSON.stringify({ about: 'Fastest 1v1 Duel win of each built-in deck against another built-in deck (T-137). Rebuild with: node tools/fastest-kill.js. Seat 0 is this deck; first = the seat that goes first. v = engine version it was found on.', v: F.version(), games: GAMES, decks: sorted }, null, 1) + '\n');
  console.log(`Wrote ${path.relative(F.ROOT, OUT)}: ${todo.length} decks, ${GAMES} Duels each, ${Math.round((Date.now() - t0) / 1000)} s on ${JOBS} threads.`);
};
main();
