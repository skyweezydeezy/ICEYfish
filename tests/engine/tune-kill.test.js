// Policy lab, "Tune toward a goal": the kill-earlier goal (split out of tune.test.js so the files run side by side, T-133).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

// ---- the pool of cheap ramp and draw (the app finds it on Scryfall; here it comes from the set data) ----
const top = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 400), sets = {}, pool = [];
for (const t of top) {
  if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
  const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool.push(c);
}
const rr = ld('red-rum-raiders'), text = fs.readFileSync(path.join(FIX, 'red-rum-raiders.txt'), 'utf8');
const size = cards => cards.reduce((s, c) => s + (c.qty || 1), 0);
const listSize = t => t.split('\n').reduce((s, l) => s + (+(l.match(/^\s*(\d+)\s/) || [])[1] || 0), 0);          // the copies in a deck list's text
const interaction = new Set(rr.cards.filter(c => ['removal', 'counter', 'wipe', 'protection', 'wincon'].some(r => P.roles(c).has(r))).map(c => c.name));

// ---- kill earlier: 2 turns earlier than the median now ----
{ const t0 = Date.now(), r = T.tune(G, P, { cards: rr.cards, tokens: rr.tokens, pool }, O, { kind: 'kill', earlier: 2 }, { n: 240, rounds: 1, seed: 777 });
  check('kill: the target is 2 turns before the median kill turn it measured', r.goal.turn === Math.max(3, r.now.median - 2) && r.goal.share === 0.5, `median ${r.now.median} -> target turn ${r.goal.turn}`);
  check('kill: a change is kept', r.steps.length === 1, r.steps.map(s => s.label).join(' | '));
  check('kill: on fresh shuffles the deck kills earlier, by more than chance (z > 2)', r.after.meanKill < r.before.meanKill && r.confirm.z > 2 && r.verdict === 'confirmed', `average kill turn ${r.before.meanKill.toFixed(2)} -> ${r.after.meanKill.toFixed(2)}, z ${r.confirm.z.toFixed(1)}`);
  check('kill: a bracket speed is given before and after', [2, 3, 4, 5].includes(r.before.bracket) && [2, 3, 4, 5].includes(r.after.bracket), `B${r.before.bracket} -> B${r.after.bracket}`);
  check('kill: the deck list stays the same size', size(rr.cards) === 100 && listSize(text) === 100 && listSize(C.applyChanges(text, r.lines.join('\n')).text) === 100);
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
