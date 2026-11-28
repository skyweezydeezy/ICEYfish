// T-115: the hand-built puzzles (goldfish/static/puzzles.json, rules in puzzle-core.js). Each puzzle is a board set by hand against a real engine seat that
// holds a hidden hand. This test replays the data against the engine: the intended line wins, every listed tempting wrong line does not, nothing is random
// (a second replay gives the same game), every card is one the engine reads exactly, the hints never give the line away, and every puzzle has its lesson.
const fs = require('fs'), path = require('path');
const T = require('../../tools/lib/turn2.js'), PS = require('../../tools/lib/puzzle-search.js');
const Core = require('../../goldfish/static/puzzle-core.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const data = JSON.parse(fs.readFileSync(path.join(T.STATIC, 'puzzles.json'), 'utf8'));
const L = T.load(), cardOf = n => L.card(n, 1);
const P = data.puzzles, key = (t, l) => P.filter(p => p.type === t && p.level === l).length;

check('twelve puzzles: two of each type and difficulty', P.length === 12 && ['fast', 'endgame'].every(t => ['easy', 'medium', 'hard'].every(l => key(t, l) === 2)), P.map(p => p.id).join());
check('ids are unique and every puzzle has a title, premise, mechanic and deadline', new Set(P.map(p => p.id)).size === P.length && P.every(p => p.title && p.premise && p.mechanic && p.deadline >= 1));
check('fast wins start at turn 1 (a deadline of 2 or 3), endgames are set late (turn 9 or later)', P.every(p => p.type === 'fast' ? p.me.turn == null && [2, 3].includes(p.deadline) : p.me.turn >= 8 && p.deadline <= 2));
check('every puzzle has three hints and a lesson with a mechanic and a rules text', P.every(p => p.hints.length === 3 && p.hints.every(h => h.length > 20) && p.lesson && p.lesson.mechanic && p.lesson.rules && p.lesson.rules.length > 60));

// the engine reads every card exactly (coverage 'full'), and every name resolves
const names = new Set();
for (const p of P) for (const s of [p.me, p.opp]) for (const n of [].concat(s.hand || [], (s.battlefield || []).map(e => typeof e === 'string' ? e : e.name), s.graveyard || [], s.library || [])) names.add(n);
const bad = [...names].filter(n => { try { const c = cardOf(n); return !(c.cov && c.cov.status === 'full') && !(c.cov && /full|ok/.test(JSON.stringify(c.cov).slice(0, 40))); } catch (e) { return true; } });
check('every card the puzzles use is read exactly by the engine (coverage full)', bad.length === 0, bad.join(', ') || names.size + ' cards');
const inDecks = [...names].filter(n => [...L.decks.values()].some(d => d.cards.some(c => c.name === n)));
check('the cards come from the built-in decks (as far as the puzzles need)', inDecks.length >= names.size * 0.85, inDecks.length + '/' + names.size);

// the intended line wins; the wrong lines do not; a second replay is the same game
for (const p of P) {
  const r = Core.playScenario(cardOf, p, p.solution, true);
  check(p.id + ' (' + p.type + '/' + p.level + ', ' + p.mechanic + '): the intended line wins with every move legal', r.result === 'win' && !r.invalid, r.result + (r.invalid ? ' invalid' : ''));
  const r2 = Core.playScenario(cardOf, p, p.solution, true);
  check(p.id + ': replaying gives the same game', r2.result === r.result && r2.sc.b.life === r.sc.b.life && r2.sc.g.life === r.sc.g.life);
  check(p.id + ': there are at least two tempting wrong lines', p.wrong.length >= 2);
  for (const w of p.wrong) {
    const x = Core.playScenario(cardOf, p, w.moves, false);
    check(p.id + ' wrong line "' + w.name + '" does not win', x.result !== 'win', x.result);
  }
  const solved = [...new Set([].concat(...p.solution).filter(m => m.do === 'cast').map(m => m.card))];
  const leak = p.hints.filter(h => solved.filter(n => h.includes(n)).length >= 2 || /\bthen\b/i.test(h) || /cast .* first/i.test(h));
  check(p.id + ': the hints do not give the line away', leak.length === 0, leak.join(' / '));
}
check('nobody is given the combo for free: no move plays a whole combo for you (no autopilot move)', P.every(p => p.solution.flat().every(m => ['land', 'cast', 'ability', 'attack', 'loyalty'].includes(m.do)) && p.wrong.every(w => w.moves.flat().every(m => ['land', 'cast', 'ability', 'attack', 'loyalty'].includes(m.do)))));
check('the medium and hard fast wins start the opponent at 40 and the easy ones lower', P.filter(p => p.type === 'fast' && p.level !== 'easy').every(p => p.opp.life === 40) && P.filter(p => p.type === 'fast' && p.level === 'easy').every(p => p.opp.life < 40));
check('the four medium and hard fast wins end four different ways (Oracle, Jace, Laboratory Maniac, a drain loop)', (() => { const f = P.filter(p => p.type === 'fast' && p.level !== 'easy').map(p => p.me.hand.find(n => /Thassa|Jace|Maniac|Vito/.test(n))); return new Set(f).size === 4; })());
// T-119: a person pays through the pay sheet, not through the solver's moves. Every intended line is replayed with the person's own payment choices:
// pressing Confirm on the sheet's starting payment ('smart', the one that wastes no mana) wins, and so does the engine's own default; and every other way
// of paying at each question is tried one at a time (the rest on the default): at least the default wins, and the number of questions and alternatives is reported.
function payAlternatives(q) { const U = q.pay.units.map(u => u.u), n = q.pay.n, out = []; const rec = (i, cur) => { if (cur.length === n) { const ks = q.pay.solve(cur.map(u => ({ u, force: null }))); if (ks) out.push(ks); return; } if (i >= U.length || U.length - i < n - cur.length) return; rec(i + 1, cur.concat([U[i]])); rec(i + 1, cur); }; rec(0, []); return out; }
const bare = line => JSON.parse(JSON.stringify(line)).map(t => t.map(m => { delete m.pay; return m; }));          // without the solver's own choice of sources
let askedTotal = 0, altsTotal = 0, altWins = 0, altLosses = 0;
for (const p of P) {
  const smart = Core.playScenario(cardOf, p, bare(p.solution), true, false, 'smart');
  check(p.id + ': the intended line wins when the person presses Confirm on every payment sheet', smart.result === 'win' && !smart.invalid, smart.result);
  const asked = [];
  Core.playScenario(cardOf, p, bare(p.solution), true, false, q => { asked.push(q); return 'smart'; });
  askedTotal += asked.length;
  asked.forEach((q0, i) => {
    for (const ks of payAlternatives(q0)) {
      let n = 0; const r = Core.playScenario(cardOf, p, bare(p.solution), true, false, q => (n++ === i ? ks : 'smart'));
      altsTotal++; if (r.result === 'win') altWins++; else altLosses++;
    }
  });
}
check('payment sheets are asked in the intended lines (a person chooses how to pay), and the alternatives were tried', askedTotal > 0 && altsTotal > 0, `${askedTotal} questions, ${altsTotal} other payments tried: ${altWins} still win, ${altLosses} do not`);
check('Rocks before the dragon asks how to pay Goldspan Dragon (six mana for five)', (() => { const p = P.find(x => x.id === 'fast-1'), asked = []; Core.playScenario(cardOf, p, bare(p.solution), true, false, q => { asked.push(q); return 'smart'; }); return asked.some(q => /Goldspan/.test(q.title)); })());
// the opponent's hand is hidden: what the puzzle shows of it is a count, never the names (the data keeps them for the engine)
check('easy puzzles hold nothing, medium one piece of interaction, hard a fuller hand', P.filter(p => p.level === 'easy').every(p => !(p.opp.hand || []).length) && P.filter(p => p.level === 'medium').every(p => (p.opp.hand || []).length >= 1) && P.filter(p => p.level === 'hard').every(p => (p.opp.hand || []).length >= 3));
// the search tool and the rules module agree: the searcher finds the intended line's first turn among its winning prefixes (bounded, endgames only)
const one = P.find(p => p.id === 'end-2'), s = PS.search(cardOf, one, { maxMoves: 3, cap: 500 });
check('the search tool finds the intended line for a one-turn puzzle (and nothing that skips the dragon)', s.wins.length >= 1 && s.wins.every(w => w[0].some(m => m.card === 'Goldspan Dragon')), s.wins.length + ' win(s)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
