#!/usr/bin/env node
// T-137: finds, for every built-in deck, its fastest real win in a 1v1 Duel against ONE standard opponent, so the Build tab can offer
// "Fastest win vs <Standard>: turn N · about 1 game in R ▶ Watch". Writes goldfish/static/decks/fastest.json.
//   node tools/fastest-kill.js [--goldfish=20000] [--seeds=200] [--jobs=4] [--only=death-tax] [--standard=second-draw.txt]
//
// The standard opponent (STANDARD): a mid-power Bracket 3 deck picked by measurement (see docs/agents/T-137.md): blockers (30+ creatures is
// not needed, 13+ is enough to block), removal, counterspells (11), and its own goldfish median kill is T8 (it does not win fast). When a deck
// meets itself, FALLBACK (next candidate) plays instead.
//
// Two stages per deck. Every player already has its own seeded random stream (the engine seeds seat i with seed + i * 0x9e3779b9, and a seat's
// stream is only used by its own shuffles), so seat 0's shuffle and opening hand depend only on the seed, not on the opponent, and a goldfish
// game with a seed starts from the same library as seat 0 of a Duel with that seed.
//   Stage 1: --goldfish goldfish games (seeds 1..N, on the draw, up to 7 turns) give each seed a kill turn.
//   Stage 2: the best --seeds seeds (lowest kill turn, then lowest seed) are played as Duels vs the standard opponent, once with each seat
//            going first, both seats on autopilot, the engine's default priority. The fastest real win is kept; among wins on the same
//            turn, the one where the opponent fought back most (blocks + counterspells + removal on this deck's permanents), then the
//            lower round.
//   Rarity: how many of the stage 1 games kill by the winning turn: "about 1 game in N" (null when none did).
// The engine changes the result, so the file records the engine version ("v"); tests/engine/fastest-duel.test.js replays every stored seed and
// fails, saying to run this tool again, when a result no longer comes out the same. --only=<text> re-searches just those decks.
// A win whose log shows no kill line (damage, poison, a named combo or alternate win) is never kept (KILL_LINE in tools/lib/fastest.js). Per-deck results are saved as they finish in $TMPDIR/isf-fastest (one file per engine version), so an interrupted run carries on.
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const F = require('./lib/fastest.js');
const OUT = path.join(F.DECKS, 'fastest.json');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const GF = +arg('goldfish', 20000), SEEDS = +arg('seeds', 200), JOBS = +arg('jobs', os.cpus().length), ONLY = arg('only', ''), STANDARD = arg('standard', 'second-draw.txt'), FALLBACK = 'dead-ringers.txt', CAP = 7;

function search(L, i) {
  const A = L.decks[i], std = L.decks.find(d => d.file === (A.file === STANDARD ? FALLBACK : STANDARD));
  // stage 1
  const kills = new Array(CAP + 1).fill(0), ranked = [];
  for (let s = 1; s <= GF; s++) { const k = F.goldfishKill(A, s, CAP); if (k != null) { kills[k]++; ranked.push([k, s]); } }
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pick = ranked.slice(0, SEEDS).map(x => x[1]);
  if (pick.length < SEEDS) for (let s = 1; pick.length < SEEDS && s <= GF; s++) if (!pick.includes(s)) pick.push(s);          // too few seeds kill by T7: the rest are plain seeds
  // stage 2
  let best = null, games = 0, wins = 0, errors = 0, hidden = 0;
  for (const seed of pick) for (const first of [1, 0]) {
    let r; games++; try { r = F.playDuel(A, std, seed, first); } catch (e) { errors++; continue; }
    if (r.winner !== 0) continue; wins++;
    if (!r.visible) { hidden++; continue; }          // the log does not show how it won: not a fastest win
    const inter = r.tally.blocks + r.tally.counters + r.tally.removal;
    if (!best || r.turn < best.turn || (r.turn === best.turn && (inter > best.interaction.total || (inter === best.interaction.total && r.round < best.round))))
      best = { opp: std.file, seed, first, turn: r.turn, round: r.round, interaction: { blocks: r.tally.blocks, counters: r.tally.counters, removal: r.tally.removal, total: inter } };
  }
  if (best) { const n = kills.slice(0, best.turn + 1).reduce((a, b) => a + b, 0); best.rarity = { goldfish: GF, atOrBelow: n, oneIn: n ? Math.round(GF / n) : null }; }
  return { file: A.file, best, wins, games, errors, hidden, killsByT: kills.slice(1) };
}

if (!isMainThread) {
  const L = F.loadDecks();
  parentPort.on('message', i => parentPort.postMessage(search(L, i)));
  return;
}
const main = async () => {
  const L = F.loadDecks(), v = F.version(), todo = L.decks.map((d, i) => i).filter(i => !ONLY || L.decks[i].file.includes(ONLY));
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { decks: {} };
  const out = ONLY ? Object.assign({}, old.decks) : {}, t0 = Date.now(); let done = 0;
  const CK = path.join(process.env.ISF_CKPT_DIR || path.join(os.tmpdir(), 'isf-fastest'), `v${v}-g${GF}-s${SEEDS}-${STANDARD}-visible.jsonl`); fs.mkdirSync(path.dirname(CK), { recursive: true });
  const saved = new Map(); if (fs.existsSync(CK)) for (const l of fs.readFileSync(CK, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); saved.set(r.file, r); }
  const take = r => {
    out[r.file] = r.best ? Object.assign({}, r.best, { v, stage1: GF, stage2: r.games }) : { none: true, v, stage1: GF, stage2: r.games };
    done++; console.log(`${done}/${todo.length} ${r.file}: ` + (r.best ? `turn ${r.best.turn}${r.best.rarity.oneIn ? ' (1 in ' + r.best.rarity.oneIn + ')' : ''}, opponent fought back ${r.best.interaction.total}x (${r.wins} wins in ${r.games} Duels, ${r.hidden} wins skipped: no kill line in the log)` : `no win in ${r.games} Duels`) + (r.errors ? `, ${r.errors} errors` : ''));
  };
  const next = todo.filter(i => !saved.has(L.decks[i].file)); todo.filter(i => saved.has(L.decks[i].file)).forEach(i => take(saved.get(L.decks[i].file)));
  if (next.length) await new Promise(res => {
    const n = Math.min(JOBS, next.length);
    for (let w = 0; w < n; w++) {
      const wk = new Worker(__filename, { argv: process.argv.slice(2) });
      const feed = () => { if (next.length) wk.postMessage(next.shift()); else wk.terminate(); };
      wk.on('message', r => { fs.appendFileSync(CK, JSON.stringify(r) + '\n'); take(r); if (done === todo.length) res(); feed(); });
      wk.on('error', e => { console.error(e); process.exit(1); });
      feed();
    }
  });
  const sorted = {}; Object.keys(out).sort().forEach(k => { sorted[k] = out[k]; });
  fs.writeFileSync(OUT, JSON.stringify({ about: 'Fastest real win of each built-in deck in a 1v1 Duel against one standard opponent (T-137). Rebuild with: node tools/fastest-kill.js. Seat 0 is this deck; first = the seat that goes first; rarity.oneIn = about 1 goldfish game in N kills by that turn; interaction = what the opponent did (blocks, counterspells, removal). v = engine version it was found on.', v, standard: STANDARD, fallback: FALLBACK, stage1: GF, stage2Seeds: SEEDS, decks: sorted }, null, 1) + '\n');
  console.log(`Wrote ${path.relative(F.ROOT, OUT)}: ${todo.length} decks, ${GF} goldfish games and ${SEEDS * 2} Duels each, ${Math.round((Date.now() - t0) / 1000)} s on ${JOBS} threads.`);
};
main();
