// T-122 timing audit, fix 4: CR 603.7, 603.7b: a delayed trigger created during the end step ("return that card ... at the beginning of the next end step") waits for the NEXT turn's end step.
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
const NAMES = ['Avacyn, Angel of Horror', 'Llanowar Elves', 'Forest'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const by = n => deck.unique.find(c => c.name === n);
const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40);
const put = n => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
put('Avacyn, Angel of Horror'); const elves = put('Llanowar Elves');
elves.sacEnd = true;          // "at the beginning of the end step, sacrifice it": it dies during this end step
const inst = elves.inst;
G.endTurn(g);
check('CR 603.7: Avacyn\'s "next end step" is the next turn\'s: the creature is not back yet this turn', !g.battlefield.some(q => q.inst === inst));
g.turn++; elves.sacEnd = false; G.endTurn(g);
check('...and it returns at the beginning of the next end step', g.battlefield.some(q => q.inst === inst));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
