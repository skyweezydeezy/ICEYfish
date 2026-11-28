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
    return { d, file: d.file, name: d.name, deck: G.buildDeck(cards, [], d.policy && d.policy.tribe) };
  });
  return { G, index, decks };
}
const version = () => +(fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];

// One Duel to the end: seat 0 = A, seat 1 = B; first = the seat that goes first. Returns { winner, turn (the winner's own turn number), round }.
function playDuel(A, B, seed, first) {
  const optsList = [A, B].map(L => Object.assign({}, DUEL_OPTS, { policy: (L.d && L.d.policy) || {} }));
  const pod = G.playPod([A.deck, B.deck], optsList, seed >>> 0, [A.name, B.name], first), m = pod.match;
  return { winner: m.winner, turn: m.winner == null ? null : pod.games[m.winner].turn, round: m.round };
}
module.exports = { G, DUEL_OPTS, loadDecks, playDuel, version, STATIC, DECKS, ROOT };
