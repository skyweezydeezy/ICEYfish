// "Tune to the next bracket" (T-055): B2 -> B3 on the combo-pieces list (split out of tune.test.js so the files run side by side, T-133).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

const listSize = t => t.split('\n').reduce((s, l) => s + (+(l.match(/^\s*(\d+)\s/) || [])[1] || 0), 0);          // the copies in a deck list's text

// ---- "Tune to the next bracket" (T-055): the next faster bracket's median kill turn, in plain words ----
{ check('the final check plays at least 2,000 games unless a test lowers it', T.FINAL_MIN === 2000);
const sets = {};
  const big = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 1500), pool2 = [];
  for (const t of big) {
    if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
    const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool2.push(c);
  }
  // T-061: the engine now keeps combo hands, so the stock combo-pieces list already starts at B3 (median 7). The same list without its seven mana rocks
  // (their places taken by Islands) is a B2 deck again (median turn 8), and the tuner can win the rocks back.
  const cp = ld('combo-pieces'), t0 = Date.now(), NO_ROCKS = ['Sol Ring', 'Mana Vault', 'Grim Monolith', 'Basalt Monolith', 'Arcane Signet', 'Mind Stone', 'Fellwar Stone'];
  cp.cards = cp.cards.filter(c => !NO_ROCKS.includes(c.name)).map(c => Object.assign({}, c));
  { const isl = cp.cards.find(c => c.name === 'Island'); isl.qty = (isl.qty || 1) + NO_ROCKS.length; }
  const r = T.nextBracket(G, P, { cards: cp.cards, tokens: cp.tokens, pool: pool2 }, O, { n: 250, rounds: 5, seed: 99, minFinal: 500 });
  check('next bracket: B2 -> B3 (median kill by turn 7) is reached, and the median really gets faster on fresh shuffles', r.status === 'reached' && r.current === 2 && r.target === 3 && r.after.median < r.before.median && r.after.median <= 7, `median ${r.before.median} -> ${r.after.median}`);
  check('next bracket: confirmed on fresh shuffles by more than chance (z > 2), and the games are not the search\'s own', r.verdict === 'confirmed' && r.confirm.z > 2 && r.freshSeed !== r.seed);
  check('next bracket: the answer names the target, the cuts, the adds and before -> after', /^To reach B3 \(median kill by turn 7\): cut .+; add .+; result median turn 7 \(was turn 8\), kills by turn 7 \d+% → \d+%\.$/.test(r.text), r.text);
  const text0 = cp.cards.map(c => `${c.qty || 1} ${c.name}`).join('\n'), ch = C.applyChanges(text0, r.lines.join('\n'));
  check('next bracket: the changes keep 100 cards and apply to the list; no commander cut', ch.missing.length === 0 && listSize(ch.text) === listSize(text0) && !ch.cuts.some(n => cp.cards.find(c => c.name === n && c.commander)), r.lines.join(' | '));
  check('next bracket: each kept change carries its own cut and add, to Apply one by one', r.steps.every(x => x.kind === 'policy' || (x.cut.length && x.add.length === x.cut.length)));
  console.log(`      (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
