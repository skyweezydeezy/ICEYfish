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
  if (r.winner !== 0 || r.turn !== e.turn) bad.push(`${file} vs ${e.opp} (seed ${e.seed}, first ${e.first}): stored turn ${e.turn}, replayed ${r.winner === 0 ? 'turn ' + r.turn : r.winner == null ? 'no winner' : 'a loss'}`);
}
check(`all ${n} stored games replay to the same winner and turn`, !bad.length, bad.slice(0, 5).join(' || ') + (bad.length ? AGAIN : ''));
check('the stored first player is a seat (0 = this deck, 1 = the opponent) and the turn is at least 1', Object.values(doc.decks).every(e => e.none || ((e.first === 0 || e.first === 1) && e.turn >= 1 && e.round >= 1)));
{ const a = Object.entries(doc.decks).find(([, e]) => !e.none); const r1 = F.playDuel(by.get(a[0]), by.get(a[1].opp), a[1].seed, a[1].first), r2 = F.playDuel(by.get(a[0]), by.get(a[1].opp), a[1].seed, a[1].first);
  check('the same Duel twice gives the same game', JSON.stringify(r1) === JSON.stringify(r2)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
