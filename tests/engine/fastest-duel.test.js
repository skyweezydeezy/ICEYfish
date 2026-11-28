// T-137: every built-in deck's stored "fastest win" (decks/fastest.json, found by tools/fastest-kill.js) replays identically: the same seed, decks and
// first player give a win for that deck on the same turn. The result depends on the engine, so a change to the rules can make this fail:
// run `node tools/fastest-kill.js` (about 5 minutes on 4 processors; `--only=<deck file>` for one deck) and commit decks/fastest.json.
const fs = require('fs'), path = require('path');
const F = require('../../tools/lib/fastest.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FILE = path.join(F.DECKS, 'fastest.json'), doc = JSON.parse(fs.readFileSync(FILE, 'utf8')), L = F.loadDecks(), by = new Map(L.decks.map(d => [d.file, d]));
const AGAIN = ' -> the engine changed: run `node tools/fastest-kill.js` again and commit goldfish/static/decks/fastest.json (see tests/README.md)';

check(`fastest.json has a line for every one of the ${L.decks.length} built-in decks`, L.decks.every(d => doc.decks[d.file]), L.decks.filter(d => !doc.decks[d.file]).map(d => d.file).join(', ') + ' (new deck: node tools/fastest-kill.js --only=<file>)');
check('no line for a deck that no longer exists', Object.keys(doc.decks).every(f => by.has(f)), Object.keys(doc.decks).filter(f => !by.has(f)).join(', '));
let bad = [], n = 0;
for (const [file, e] of Object.entries(doc.decks)) {
  if (e.none || !by.has(file)) continue;
  const A = by.get(file), B = by.get(e.opp);
  if (!B) { bad.push(file + ': opponent ' + e.opp + ' is not a built-in deck'); continue; }
  const r = F.playDuel(A, B, e.seed, e.first); n++;
  if (r.winner === 0 && !r.visible) bad.push(`${file}: the log of the winning turn does not show how it won (${(r.tally.kill || {}).text}) -> a replay must teach how it won`);
  if (r.winner !== 0 || r.turn !== e.turn) bad.push(`${file} vs ${e.opp} (seed ${e.seed}, first ${e.first}): stored turn ${e.turn}, replayed ${r.winner === 0 ? 'turn ' + r.turn : r.winner == null ? 'no winner' : 'a loss'}`);
}
check(`all ${n} stored games replay to the same winner and turn`, !bad.length, bad.slice(0, 5).join(' || ') + (bad.length ? AGAIN : ''));
{ const std = by.get(doc.standard), idx = L.index.decks.find(d => d.file === doc.standard);
  check('the standard opponent is a built-in Bracket 3 deck', !!std && idx.bracket === 3, doc.standard + ' bracket ' + (idx && idx.bracket));
  check('every deck is played against the standard opponent (the fallback for the standard deck itself)', Object.entries(doc.decks).every(([f, e]) => e.none || e.opp === (f === doc.standard ? doc.fallback : doc.standard)), 'standard ' + doc.standard + ', fallback ' + doc.fallback); }
check('every stored game has its rarity, what the opponent did, and the stage sizes', Object.values(doc.decks).every(e => e.none || (e.rarity && e.rarity.goldfish >= 1000 && (e.rarity.oneIn == null || e.rarity.oneIn >= 1) && e.interaction && e.interaction.total === e.interaction.blocks + e.interaction.counters + e.interaction.removal && e.stage1 >= 1000 && e.stage2 >= 2)));
{ let wrong = [];          // what the opponent did is what the replay shows
  for (const [file, e] of Object.entries(doc.decks).slice(0, 12)) { if (e.none) continue; const r = F.playDuel(by.get(file), by.get(e.opp), e.seed, e.first); if (r.tally.blocks + r.tally.counters + r.tally.removal !== e.interaction.total) wrong.push(file); }
  check('the stored interaction count matches the replayed game (12 decks)', !wrong.length, wrong.join(', ')); }
{ // Each seat has its own random stream: seat 0's opening hand depends only on the seed, not on the opponent, and a goldfish game of that seed deals the same hand
  const A = by.get('winota.txt') || L.decks[0], hand = g => g.hand.map(i => i.card.name).sort().join('|'), hands = new Set(); let same = true;
  for (const seed of [11, 4242, 987654]) {
    const hs = L.decks.filter(d => d !== A).slice(0, 5).map(B => { const o = [A, B].map(X => Object.assign({}, F.DUEL_OPTS, { policy: (X.d && X.d.policy) || {} })); return hand(F.G.newPod([A.deck, B.deck], o, seed, ['a', 'b'], 1).games[0]); });
    const gf = F.G.newGame(A.deck, Object.assign({}, F.DUEL_OPTS, { onPlay: false, turns: 7, policy: (A.d && A.d.policy) || {} }), seed); F.G.mulligan(gf);
    if (new Set(hs).size !== 1 || hs[0] !== hand(gf)) same = false; hands.add(hs[0]);
  }
  check('seat 0 opening hand is the same against 5 different opponents, and the same as the goldfish game of that seed (3 seeds)', same && hands.size === 3); }
check('the stored first player is a seat (0 = this deck, 1 = the opponent) and the turn is at least 1', Object.values(doc.decks).every(e => e.none || ((e.first === 0 || e.first === 1) && e.turn >= 1 && e.round >= 1)));
{ const a = Object.entries(doc.decks).find(([, e]) => !e.none); const r1 = F.playDuel(by.get(a[0]), by.get(a[1].opp), a[1].seed, a[1].first), r2 = F.playDuel(by.get(a[0]), by.get(a[1].opp), a[1].seed, a[1].first);
  check('the same Duel twice gives the same game', JSON.stringify(r1) === JSON.stringify(r2)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
