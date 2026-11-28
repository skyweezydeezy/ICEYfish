// T-122 timing audit, fix 5: (a) CR 514.3a: if something happens in the cleanup step (here a trigger that draws), players get priority and there is another cleanup step, so the hand is discarded down again.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('no card ' + n); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Llanowar Elves', 'Forest'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const elfCard = deck.unique.find(c => c.name === 'Llanowar Elves');
elfCard.a.triggers.push({ kinds: ['discard'], fx: [{ type: 'draw', n: 1 }], text: 'Whenever you discard a card, draw a card. This ability triggers only once each turn.' });
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
{
  const g = bare(); const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: elfCard }, {}, []); p.sick = false; p.enteredTurn = 1;
  g.hand = g.library.splice(0, 9);
  G.endTurn(g);
  check('CR 514.3a: nine cards, discard two, the trigger draws one: another cleanup step discards down to seven again', g.hand.length === 7, g.hand.length);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
