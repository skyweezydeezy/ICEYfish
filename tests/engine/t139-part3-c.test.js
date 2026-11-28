// T-139 part 3, batch C: Humble Defector, Ashling (both faces).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Humble Defector', 'Ashling, Rekindled', 'Serra Angel', 'Vampire Nighthawk', 'Llanowar Elves', 'Shivan Dragon', 'Swamp', 'Mountain', 'Plains', 'Forest', 'Island', 'Lightning Bolt'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); g.activeTurn = true; return g; };
const duel = g => { const b = bare(4); G.linkMatch(g, b); b.activeTurn = false; return b; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, k) => { const out = []; for (let i = 0; i < n; i++) out.push(putOn(g, k || 'Swamp')); return out; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const entry = (g, p, re) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => re.test((x.label || '') + ' ' + (x.cost || ''))); return i < 0 ? null : Object.assign({ i }, m[i]); };
const run = (g, p, e) => { const r = G.useAbility(g, p, e.i); G.flushLeaves(g, []); return r; };


T('every line reads ok', () => {
  for (const n of ['Humble Defector', 'Ashling, Rekindled']) check(n + ': no partial or ignored line', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.map(r => r.status).join());
  const back = by('Ashling, Rekindled').a.backCard;
  check('Ashling, Rimebound: no partial or ignored line', back.a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), back.a.coverage.map(r => r.status).join());
});

T('Humble Defector: draw two, then an opponent gains control; only on your turn', () => {
  const g = bare(); duel(g); const d = putOn(g, 'Humble Defector'); g.library.unshift(inst(g, 'Plains'), inst(g, 'Plains'));
  let e = entry(g, d, /Draw two/); check('listed', e && e.ok, e && e.why);
  g.activeTurn = false; e = entry(g, d, /Draw two/); check('not on an opponent\'s turn', e && !e.ok, e && e.why); g.activeTurn = true; e = entry(g, d, /Draw two/);
  const h = g.hand.length; run(g, d, e);
  check('two cards drawn', g.hand.length === h + 2);
  check('the opponent controls it now', !g.battlefield.includes(d) && g.opp.battlefield.includes(d));
  const g2 = bare(); const d2 = putOn(g2, 'Humble Defector'); g2.library.unshift(inst(g2, 'Plains'), inst(g2, 'Plains')); const h2 = g2.hand.length; const e2 = entry(g2, d2, /Draw two/); run(g2, d2, e2);
  check('the goldfish (no opponent): two cards, and the creature is gone', g2.hand.length === h2 + 2 && !g2.battlefield.includes(d2));
});

T('Ashling: the front face loots when it enters or transforms; the back face makes two mana (one color) for mana value 4+', () => {
  const a = by('Ashling, Rekindled').a;
  check('front: etb and transformIn discard-then-draw', a.triggers.some(t => t.kinds.includes('etb') && t.kinds.includes('transformIn') && t.fx[0].type === 'discardFor'));
  const g = bare(); const p = putOn(g, 'Ashling, Rekindled'); g.floating = [];
  G.applyEffects(g, [{ type: 'transform', same: true }], p, [], null); G.flushLeaves(g, []);
  check('it is Ashling, Rimebound now and two mana of one color floats', p.card.name === 'Ashling, Rimebound' && g.floating.length === 2 && g.floating[0].restrict && g.floating[0].restrict.k === 'mvMin', p.card.name + ' ' + g.floating.length);
  const cols = g.floating.map(u => [...u.colors].join('')); check('both mana are the same color', cols[0] === cols[1], cols.join());
  check('a first-main-phase trigger makes the same mana', p.card.a.triggers.some(t => t.kinds.includes('main') && t.fx[0].type === 'restrictMana' && t.fx[0].amount === 2));
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
