// T-122 timing audit, fix 1: CR 500.7: extra turns are taken one after another, however many a player has. The engine used to stop at three in a row.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('no card ' + n); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const tw = find('Time Warp'), mt = find('Island'); tw.qty = 1; mt.qty = 24;
const deck = G.buildDeck([tw, mt], []);
const c = deck.unique.find(x => x.name === 'Time Warp');
c.a.spellFx = [{ type: 'draw', n: 1 }, { type: 'extraTurn', n: 6 }];          // one copy that banks six extra turns (the card itself banks one)
const O = { turns: 12, onPlay: false, minLands: 0, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let cast = 0;
for (let seed = 1; seed <= 12; seed++) {
  let g = null; try { g = G.simulate(deck, O, seed); } catch (e) { check('simulate threw', false, String(e.stack).split('\n').slice(0, 3).join(' | ')); continue; }
  if (!g.graveyard.some(i => i.card.name === 'Time Warp')) continue;          // never cast in this game
  cast++;
  check('CR 500.7: seed ' + seed + ': Time Warp banking six extra turns, all six are taken (12 turns + 6)', g.turn === 18, 'turn ' + g.turn);
}
check('Time Warp was cast in at least one game', cast > 0, cast);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
