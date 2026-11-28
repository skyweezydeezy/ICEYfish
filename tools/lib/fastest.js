// Shared by tools/fastest-kill.js and tests/engine/fastest-duel.test.js (T-137): the one definition, in Node, of the Duel a built-in deck's
// "fastest win" replay plays. The page (versus.js, V.watch) builds the same game with the same options: REPLAY_OPTS there must equal DUEL_OPTS here
// (tests/ui/watch-replay.ui.js checks that the page reaches the stored winner and turn).
// A replay does not use the person's settings (minimum lands, format, combos found for their deck...): it must come out the same for everybody.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), STATIC = path.join(ROOT, 'goldfish', 'static'), DECKS = path.join(STATIC, 'decks');
const G = require(path.join(STATIC, 'sim.js')), Source = require(path.join(STATIC, 'source.js'));

// The Commander Duel: 40 life, 25 rounds at most, keep 7 with 2-5 lands, first mulligan free, no combos from the Spellbook (they depend on the
// deck the person has loaded), each seat its own learned choices (the deck's "policy" in decks/index.json), neither seat a person (autopilot,
// the engine's default priority: opts.autoPass unset = 'smart').
const DUEL_OPTS = { turns: 25, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, startLife: 40, prioritizeCommander: true, idealLandRatio: 0.42, noMaxHand: false, turnTimer: false, bookCombos: [] };

function loadDecks() {
  const D = path.join(STATIC, 'data', 'sets'), idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
  idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
  const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8'));
  const decks = index.decks.map(d => {
    const cards = [];
    for (const e of Source.parseDecklist(fs.readFileSync(path.join(DECKS, d.file), 'utf8'))) {
      const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) throw new Error(d.file + ': not in the set data: ' + e.name);
      const hit = cards.find(x => x.name === c.name); if (hit) { hit.qty += e.qty; hit.commander = hit.commander || e.commander; } else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander }));
    }
    if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; }
    return { d, file: d.file, name: d.name, cards, deck: G.buildDeck(cards, [], d.policy && d.policy.tribe) };
  });
  return { G, index, decks };
}
const version = () => +(fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];

// A win must teach how it happened: the log of the winning turn has to show what killed the opponent (damage, poison, a combo or alternate win named,
// the opponent out of the game for a stated reason). A turn that only reads "land; cast X; WINS" is flagged (visible false) and is never kept as a fastest win.
const KILL_LINE = /damage|poison|Combo:|infinite|win the game|loses? the game|out of the game \(|mill|commander damage/i;
function killLine(g, ev) { const items = G.turnSummary(g, ev).filter(x => !/WINS/.test(x)); return { visible: items.some(x => KILL_LINE.test(x)), text: items.join('; ').slice(0, 300) }; }
// How hard the opponent (seat 1) fought back in a game seat 0 wins: blocks and counterspells show in notes on seat 0's turns ("X blocks Y",
// "X counters Y"), removal on seat 1's own turn ("Destroyed the opponent's Y", "Exiled ...", "Returned ..."). Read from the engine's events.
function interaction(g, ev, tally) {
  if (ev.some(e => e.type === 'kill')) tally.kill = killLine(g, ev);
  for (const e of ev) {
    if (e.type !== 'note' || typeof e.text !== 'string') continue;
    if (g.pid === 0) { if (/ blocks /.test(e.text)) tally.blocks++; else if (/ counters /.test(e.text)) tally.counters++; }
    else if (/^(Destroyed|Exiled|Returned|Bounced) the opponent's /.test(e.text)) tally.removal++;
  }
}
// One Duel to the end: seat 0 = A, seat 1 = B; first = the seat that goes first. Returns { winner, turn (the winner's own turn number), round, tally }.
function playDuel(A, B, seed, first) {
  const optsList = [A, B].map(L => Object.assign({}, DUEL_OPTS, { policy: (L.d && L.d.policy) || {} })), tally = { blocks: 0, counters: 0, removal: 0 };
  const pod = G.playPod([A.deck, B.deck], optsList, seed >>> 0, [A.name, B.name], first, (g, ev) => interaction(g, ev, tally)), m = pod.match;
  return { winner: m.winner, turn: m.winner == null ? null : pod.games[m.winner].turn, round: m.round, tally, visible: !!(tally.kill && tally.kill.visible) };
}
// Stage 1: one goldfish game of A from a seed (the same shuffle as seat 0 of a Duel with that seed: both start from mulberry32(seed)); its kill turn, or null.
// Same options as the Duel (an opponent at 40 life, turns capped at maxTurns).
function goldfishKill(A, seed, maxTurns) {
  const g = G.newGame(A.deck, Object.assign({}, DUEL_OPTS, { onPlay: false, turns: maxTurns, policy: (A.d && A.d.policy) || {} }), seed >>> 0);
  G.mulligan(g);
  for (let t = 0; t < maxTurns && g.killTurn == null && !G.matchOver(g); t++) G.playTurn(g);
  return g.killTurn == null ? null : g.killTurn;
}
module.exports = { KILL_LINE, G, DUEL_OPTS, loadDecks, playDuel, goldfishKill, version, STATIC, DECKS, ROOT };
