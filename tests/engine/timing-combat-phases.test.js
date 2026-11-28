// T-122 timing audit, fix 2: CR 506.1 / 507.1: every combat phase has its own beginning of combat step, so "at the beginning of combat" triggers happen again in an additional combat phase.
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
const NAMES = ['Hakbal of the Surging Soul', 'Forest'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
const hak = deck.unique.find(c => c.name === 'Hakbal of the Surging Soul');
// (g.throttleTurn untaps the attackers at each combat, as Full Throttle does, so the second phase has an attacker)
const bare = extra => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40);
  const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: hak }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; g.extraCombats = extra; g.throttleTurn = g.turn; return [g, p]; };
const explores = extra => { const [g] = bare(extra); const ev = G.combat(g); return ev.filter(e => e.type === 'note' && /Hakbal of the Surging Soul explores/.test(e.text)).length; };
const used1 = explores(0), used2 = explores(1);
check('one combat phase: Hakbal explores at the beginning of combat', used1 === 1, used1);
check('CR 506.1/507.1: with an additional combat phase the beginning-of-combat trigger happens again', used2 === 2, used1 + ' -> ' + used2);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
