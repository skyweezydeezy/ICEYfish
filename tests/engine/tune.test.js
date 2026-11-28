// Policy lab, "Tune toward a goal" (goldfish/static/tune.js): the bracket speed rule, the change lines, the ramp and draw pool, and the
// search itself on a built-in deck: it must find changes that hold up on fresh shuffles the search never saw.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

// ---- bracket speed: the one table, shared with the bracket check (tools/verify-brackets.js, T-035) ----
{ const V = require('../../tools/verify-brackets.js');
  const med = m => Array.from({ length: 12 }, (_, t) => t + 1 >= m ? 0.6 : 0.2);          // a kill distribution whose median is turn m
  check('the median kill turn sets the speed: before T4 B5, before T6 B4, before T8 B3, before T9 B2, else B1', [3, 4, 5, 6, 7, 8, 9, 11].map(m => T.bracketOf(med(m))).join('') === '54433211');
  check('no median inside the games counts as later than the last turn (B1)', T.bracketOf(Array(10).fill(0.3)) === 1);
  check('the bracket check reads the same table, not a copy', V.speedBracket && [3, 4, 5, 6, 7, 8, 9, 11].map(V.speedBracket).join('') === [3, 4, 5, 6, 7, 8, 9, 11].map(T.speedBracket).join('') && /require\(path\.join\(STATIC, 'tune\.js'\)\)\.SPEED/.test(require('fs').readFileSync(require.resolve('../../tools/verify-brackets.js'), 'utf8')));
  const none = L => Array(L).fill(0);          // a deck that never kills, in a run of L turns
  check('no kill in 3 turns: the bracket is unknown (at most B4), not B4', T.bracketOf(none(3)) === null && T.bracketAtMost(none(3)) === 4);
  check('no kill in 5 turns: unknown (at most B3), not B3', T.bracketOf(none(5)) === null && T.bracketAtMost(none(5)) === 3);
  check('no kill in 10 turns: past every threshold, so B1', T.bracketOf(none(10)) === 1 && T.bracketAtMost(none(10)) === 1);
  check('8 turns are enough to tell (a median after turn 8 is B1); 7 are not (at most B2)', T.bracketOf(none(8)) === 1 && T.bracketOf(none(7)) === null && T.bracketAtMost(none(7)) === 2);
  check('a bracket as a goal: the median kill by the turn before its threshold', JSON.stringify(T.bracketGoal(4)) === JSON.stringify({ bracket: 4, turn: 5, share: 0.5 }) && T.bracketGoal(5).turn === 3 && T.bracketGoal(1) === null); }

// ---- change lines for the A/B test: a cut and an add of the same card cancel out ----
{ const l = T.changeLines([{ sign: '-', name: 'Ponder' }, { sign: '-', name: 'Opt' }, { sign: '+', name: 'Island' }, { sign: '+', name: 'Island' }, { sign: '+', name: 'Opt' }]);
  check('"- Card" and "+ N Card" lines, the same card cut and added left out', JSON.stringify(l) === JSON.stringify(['- Ponder', '+ 2 Island']), l.join(' | '));
  const r = C.applyChanges('1 Ponder\n1 Opt\n10 Island', l.join('\n'));
  check('...which the A/B test reads', r.missing.length === 0 && !/Ponder/.test(r.text) && /^2 Island$/m.test(r.text) && r.cuts.length === 1, r.text.replace(/\n/g, ' | ')); }

// ---- the pool of cheap ramp and draw (the app finds it on Scryfall; here it comes from the set data) ----
const top = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 400), sets = {}, pool = [];
for (const t of top) {
  if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
  const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool.push(c);
}
{ const p = T.poolFrom(G, P, pool, ['U', 'R'], true);
  check('the pool keeps only cards in the deck\'s colors, mana value 2 or less, ramp or draw, every line simulated', p.length > 5 && p.every(x => (x.card.color_identity || []).every(c => 'UR'.includes(c)) && (x.card.cmc || 0) <= 2 && (x.roles.has('ramp') || x.roles.has('draw'))), p.length + ': ' + p.slice(0, 4).map(x => x.card.name).join(', '));
  check('Sol Ring is in a blue-red pool; a green card is not', p.some(x => x.card.name === 'Sol Ring') && !p.some(x => (x.card.color_identity || []).includes('G'))); }

const rr = ld('red-rum-raiders'), text = fs.readFileSync(path.join(FIX, 'red-rum-raiders.txt'), 'utf8');
const size = cards => cards.reduce((s, c) => s + (c.qty || 1), 0);
const listSize = t => t.split('\n').reduce((s, l) => s + (+(l.match(/^\s*(\d+)\s/) || [])[1] || 0), 0);          // the copies in a deck list's text
const interaction = new Set(rr.cards.filter(c => ['removal', 'counter', 'wipe', 'protection', 'wincon'].some(r => P.roles(c).has(r))).map(c => c.name));

// ---- hit land drops more often: land drop 4 on turn 4 ----
{ const t0 = Date.now(), r = T.tune(G, P, { cards: rr.cards, tokens: rr.tokens, pool }, O, { kind: 'lands', turn: 4, share: 0.8 }, { n: 300, rounds: 3, seed: 4242 });
  const b = r.before.onCurve[3], a = r.after.onCurve[3];
  check('lands: the search keeps at least one change', r.steps.length >= 1, r.steps.map(s => s.label).join(' | '));
  check('lands: on fresh shuffles land drop 4 on turn 4 goes up, by more than chance (z > 2)', a > b && r.confirm.z > 2 && r.verdict === 'confirmed', `${(100 * b).toFixed(0)}% -> ${(100 * a).toFixed(0)}%, z ${r.confirm.z.toFixed(1)}`);
  check('lands: the before/after games are not the search\'s own shuffles', r.freshSeed !== r.seed && r.before.n === 300);
  const ch = C.applyChanges(text, r.lines.join('\n'));
  check('lands: the changes keep the deck\'s size and apply to the list', ch.missing.length === 0 && listSize(ch.text) === listSize(text), r.lines.join(' | ') || 'choices only');
  check('lands: no interaction, win condition or commander is cut', !ch.cuts.some(n => interaction.has(n)) && !ch.cuts.some(n => rr.cards.find(c => c.name === n && c.commander)), ch.cuts.join(', ') || 'none');
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }

// the kill-earlier goal is in tune-kill.test.js; "Tune to the next bracket" is in tune-next-bracket.test.js and tune-next-limits.test.js (split so they run side by side, T-133)

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
