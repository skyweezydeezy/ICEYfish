// T-140: wins the engine declares must be legal. Mana sources that say "any color among / that a land could produce / in your commander's color
// identity" make only those colors (Mox Amber: legendary creatures and planeswalkers you control, never the command zone), and an infinite-mana loop
// must be payable from the mana that is really left (Basalt Monolith + Rings of Brighthearth: {3} to untap and {2} for the copy).
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
const store = {}; idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Mox Amber', 'Ancient Tomb', 'Reflecting Pool', 'Exotic Orchard', 'Fellwar Stone', 'Arcane Signet', 'Basalt Monolith', 'Rings of Brighthearth', 'Plains', 'Mountain', 'Island', 'Sol Ring', 'Isochron Scepter', 'Dramatic Reversal', 'Tezzeret the Seeker', 'Lithoform Engine', 'Walking Ballista', 'Thrasios, Triton Hero', 'Kenrith, the Returned King'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 50).concat(NAMES.map(n => base.cards.find(c => c.name === n) || find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const cols = g => G.allUnits(g).map(u => [...u.colors].sort().join('')).sort().join(',');

// ---- Mox Amber
{ const g = bare(); put(g, 'Ancient Tomb'); put(g, 'Mox Amber');
  check('Mox Amber with no legendary creature or planeswalker makes no mana (only the Tomb\'s {C}{C})', cols(g) === 'C,C', cols(g)); }
{ const g = bare(); put(g, 'Mox Amber'); const k = by('Kenrith, the Returned King'); g.command = [{ iid: g.nextIid++, card: k }];
  check('...the commander in the command zone does not count', G.allUnits(g).length === 0, cols(g)); }
{ const g = bare(); put(g, 'Mox Amber'); put(g, 'Kenrith, the Returned King');
  check('...with Kenrith (a white legend; his color identity does not matter) on the battlefield it makes only {W}', cols(g) === 'W', cols(g)); }
{ const g = bare(); put(g, 'Mox Amber'); put(g, 'Thrasios, Triton Hero');
  check('...a green-blue legend: only {G} or {U}', cols(g) === 'GU' && G.canPay({ generic: 0, pips: [['G']], x: 0 }, G.allUnits(g)) && !G.canPay({ generic: 0, pips: [['R']], x: 0 }, G.allUnits(g)), cols(g)); }
// ---- Reflecting Pool, Exotic Orchard, Fellwar Stone, Arcane Signet
{ const g = bare(); put(g, 'Reflecting Pool'); check('Reflecting Pool alone makes no mana (it cannot count itself)', G.allUnits(g).length === 0, cols(g)); }
{ const g = bare(); put(g, 'Reflecting Pool'); put(g, 'Mountain'); put(g, 'Island'); const u = G.allUnits(g).filter(x => x.src.card.name === 'Reflecting Pool');
  check('...with a Mountain and an Island it makes {R} or {U} only', u.length === 1 && [...u[0].colors].sort().join('') === 'RU', cols(g)); }
{ const g = bare(); g.deck.commanders = []; put(g, 'Arcane Signet'); check('Arcane Signet in a list with no commander keeps any color (nothing to read an identity from)', cols(g) === 'BGRUW', cols(g)); }
{ const g = bare(); put(g, 'Arcane Signet'); g.deck.commanders = [{ iid: 900, card: Object.assign({}, by('Thrasios, Triton Hero')) }];
  check('...with Thrasios it makes {G} or {U} only', cols(g) === 'GU', cols(g)); }
// ---- Basalt Monolith + Rings of Brighthearth
{ const g = bare(); put(g, 'Plains'); put(g, 'Basalt Monolith'); put(g, 'Rings of Brighthearth');
  check('Monolith + Rings with one other land is not infinite mana ({3} untap + {2} copy = 5; only 4 available)', !G.infiniteMana(g), JSON.stringify(G.infiniteMana(g))); }
{ const g = bare(); put(g, 'Plains'); put(g, 'Plains'); put(g, 'Basalt Monolith'); put(g, 'Rings of Brighthearth');
  const inf = G.infiniteMana(g); check('...with two other lands it is (3 + 2 = 5 to start, 6 back each round)', !!inf && /Basalt Monolith/.test(inf.how), JSON.stringify(inf)); }
{ const g = bare(); put(g, 'Plains'); put(g, 'Plains'); put(g, 'Plains'); const m = put(g, 'Basalt Monolith'); put(g, 'Rings of Brighthearth'); m.tapped = true;
  check('...a tapped Monolith needs the whole {3}+{2} from the other lands: three lands are not enough', !G.infiniteMana(g), JSON.stringify(G.infiniteMana(g))); }
{ const g = bare(); for (let i = 0; i < 5; i++) put(g, 'Plains'); const m = put(g, 'Basalt Monolith'); put(g, 'Rings of Brighthearth'); m.tapped = true;
  check('...five lands do pay for it', !!G.infiniteMana(g)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
