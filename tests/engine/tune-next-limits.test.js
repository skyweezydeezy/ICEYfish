// "Tune to the next bracket": a target out of reach, a target already met, and banned combo pieces (split out of tune.test.js, T-133).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), P = require('../../goldfish/static/profile.js'), T = require('../../goldfish/static/tune.js'), C = require('../../goldfish/static/compare.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const FIX = path.join(__dirname, '..', 'fixtures'), DATA = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
const ld = n => JSON.parse(fs.readFileSync(path.join(FIX, n + '-loaded.json'), 'utf8'));
const O = { turns: 10, oppLife: 40, minLands: 2, maxLands: 5, freeMulligan: true, prioritizeCommander: true, minHandSize: 5, idealLandRatio: 0.42, policy: {} };

const sets = {};
{ const big = JSON.parse(fs.readFileSync(path.join(DATA, 'top-cards.json'), 'utf8')).cards.slice(0, 1500), pool2 = [];
  for (const t of big) {
    if (!sets[t.set]) { try { sets[t.set] = JSON.parse(fs.readFileSync(path.join(DATA, 'sets', t.set + '.json'), 'utf8')); } catch (e) { sets[t.set] = { cards: [] }; } }
    const c = sets[t.set].cards.find(x => x.name === t.name && x.oracle_text != null); if (c) pool2.push(c);
  }
  // the other way round: B5 is out of reach for Frodo; it must say so, with the best it found, and never claim success
  const fr = ld('frodo'), t1 = Date.now();
  const q = T.nextBracket(G, P, { cards: fr.cards, tokens: fr.tokens, pool: pool2 }, O, { n: 150, rounds: 1, seed: 5, bracket: 5, minFinal: 400 });
  check('next bracket: an out-of-reach target says "Couldn\'t reach B5", not success', !q.reached && /^Couldn't reach B5/.test(q.text) && q.status !== 'reached', q.text.slice(0, 160));
  check('next bracket: ...and gives the best it found (a median) or says nothing beat chance', /the best found gets to median|no change beat chance|did not hold up/.test(q.text));
  const same = T.nextBracket(G, P, { cards: fr.cards, tokens: fr.tokens, pool: [] }, O, { n: 80, seed: 5, bracket: 1 });
  check('next bracket: a target at or below the deck\'s bracket needs no tuning', same.status === 'already' && /needs no tuning/.test(same.text), same.text);
  // a Spellbook piece that is banned or not legal in Commander is never offered (poolSize counts what the search may add)
  { const ring = pool2.find(c => c.name === 'Sol Ring'), mk = lg => Object.assign({}, ring, { name: 'Test Ring ' + lg, legal_commander: lg });
    const run = extra => T.tune(G, P, { cards: fr.cards, tokens: fr.tokens, pool: [], extra }, O, { kind: 'kill', bracket: 3 }, { n: 40, rounds: 1, seed: 3, wide: true, finalN: 40, fullTurns: 10 }).poolSize;
    const base = run([]), lg = run([mk('legal')]), bn = run([mk('banned')]), nl = run([mk('not_legal')]);
    check('next bracket: a banned combo piece is not offered, a legal one is', !!ring && lg === base + 1 && bn === base && nl === base, `legal +${lg - base}, banned +${bn - base}, not_legal +${nl - base}`); }
  console.log(`      (${((Date.now() - t1) / 1000).toFixed(0)}s)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
