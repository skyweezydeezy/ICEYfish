// A person chooses X when casting a spell with {X} in its cost (it used to be cast with X = 1), up to what the mana pays for, with
// Zimone, Infinite Analyst's discount on the first X spell of the turn counted. Zimone's counters come only from that first X spell.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js'), D = require('../../goldfish/static/decide.js');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zimone-loaded.json'), 'utf8'));
const deck = G.buildDeck(F.cards, F.tokens);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => deck.unique.find(c => c.name.startsWith(n));
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
const fresh = (person) => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; if (person) D.seat(g);
  for (let i = 0; i < 6; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(i % 2 ? 'Island' : 'Forest') }, {}); p.tapped = false; } return g; };
const zimone = (g, n) => { const z = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Zimone') }, {}, []); z.counters = n; z.sick = false; return z; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const untapped = g => g.battlefield.filter(p => p.asLand && !p.tapped).length;
const cast = (g, inst, pick) => { let q = null; const ev = D.resolveSync([g], 0, gs => G.castCard(gs[0], gs[0].hand.find(i => i.iid === inst.iid)), x => { if (x.kind !== 'x') return 'auto'; q = x; return pick(x); }); return { q, ev }; };

(() => {
  const g = fresh(true); const sc = hand(g, 'Stonecoil Serpent');
  const { q } = cast(g, sc, x => 3);          // the fourth option: X = 3 (X = 0 is offered first, CR 107.3)
  check('casting Stonecoil Serpent ({X}) asks for X, 0 to 6 with six lands', q && q.options.length === 7 && q.options[0].name === 'X = 0' && q.options[6].name === 'X = 6', q && q.options.map(o => o.name).join(','));
  check('...the starting pick is all the mana (what the autopilot does)', q && q.def[0] === 6);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('...X = 3: three counters, three lands tapped', s && s.counters === 3 && untapped(g) === 3, s && s.counters + ' counters, ' + untapped(g) + ' untapped');
})();
(() => {
  const g = fresh(true); const z = zimone(g, 2); const sc = hand(g, 'Stonecoil Serpent');
  const { q } = cast(g, sc, x => x.options.length - 1);
  check('with two counters on Zimone the first X spell can have X = 8', q && q.options.length === 9 && /\{2\} less/.test(q.text), q && q.text);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('...and it enters with 8 counters', s && s.counters === 8);
  check('Zimone gets two counters from the first X spell', z.counters === 4, z.counters);
  g.battlefield.forEach(p => { p.tapped = false; });
  const hw = hand(g, 'Hangarback Walker'); const r = cast(g, hw, x => 2);
  check('the second X spell that turn has no discount ({X}{X}: X up to 3)', r.q && r.q.options.length === 4, r.q && r.q.options.length);
  const w = g.battlefield.find(p => /Hangarback/.test(p.card.name));
  check('...X = 2 costs four mana', w && w.counters === 2 && untapped(g) === 2);
  check('...and Zimone gets no more counters', z.counters === 4, z.counters);
})();
(() => {                                                                                                   // not asked: the autopilot, and a spell with no X
  const g = fresh(false); const sc = hand(g, 'Stonecoil Serpent'); sc.extraX = 3; G.castCard(g, sc);
  const s = g.battlefield.find(p => /Stonecoil/.test(p.card.name));
  check('the autopilot\'s own X is untouched', s && s.counters === 4);
  const g2 = fresh(true); zimone(g2, 0); const z2 = g2.battlefield.find(p => /Zimone/.test(p.card.name));
  const n = hand(g2, 'Forgotten Ancient');
  if (n && n.card) { const r = cast(g2, n, x => 0); check('a spell without {X} asks nothing and gives Zimone no counter', !r.q && z2.counters === 0, z2.counters); }
})();
// ---- X is applied as the card enters: nothing can happen between entering and getting its counters
(() => {
  const g = fresh(true); const fa = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Forgotten Ancient') }, {}, []);
  const ae = hand(g, 'Altered Ego'); cast(g, ae, x => 2);          // X = 2
  const cp = g.battlefield.find(p => p.copyOf === 'Forgotten Ancient');
  check('Altered Ego enters as a copy with X additional +1/+1 counters', cp && cp.counters === 2, cp && cp.counters);
})();
(() => {
  const g = fresh(true); const fh = hand(g, 'Fractal Harness'); cast(g, fh, x => 3);          // X = 3
  const tok = g.battlefield.find(p => p.card.name === 'Fractal'), eq = g.battlefield.find(p => p.card.name === 'Fractal Harness');
  check('Fractal Harness: its 0/0 Fractal token gets X counters and survives', tok && tok.counters === 3, tok && tok.counters);
  check('...and the Harness is attached to it', tok && eq && eq.attachedTo === tok.iid);
})();
(() => {
  const g = fresh(true); const gm = { iid: g.nextIid++, card: by('The Goose Mother') }; g.library = [gm].concat(g.library.filter(i => !i.card.a.isCreature));
  const fd = hand(g, 'Finale of Devastation'); cast(g, fd, x => 2);          // X = 3: finds The Goose Mother (mana value 2)
  const p = g.battlefield.find(q => q.card.name === 'The Goose Mother');
  check('Finale of Devastation, X = 3: the creature it finds was not cast, so its own X is 0 (no counters, no Food)', p && !(p.counters > 0) && !g.battlefield.some(q => q.card.name === 'Food'), p && (p.counters || 0));
})();
(() => {
  const g = fresh(true); const hy = { iid: g.nextIid++, card: by('Primordial Hydra') }; g.library = [hy].concat(g.library.filter(i => !i.card.a.isCreature));
  const fd = hand(g, 'Finale of Devastation'); cast(g, fd, x => 5);
  check('...and it does not pick a 0/0 Hydra that would die at once', !g.graveyard.includes(hy) && !g.battlefield.some(q => q.card.name === 'Primordial Hydra'));
})();
(() => {
  const g = fresh(true); const ac = hand(g, 'Astral Cornucopia'); cast(g, ac, x => 2);          // X = 2: six mana
  const p = g.battlefield.find(q => q.card.name === 'Astral Cornucopia');
  check('Astral Cornucopia, X = 2: it taps for two mana', p && p.produce && p.produce.amount === 2 && untapped(g) === 0, p && p.produce && p.produce.amount);
})();
(() => {                                                                                                   // an ability with {X} in its cost: you choose X too
  const g = fresh(true); const be = G.enterWithTriggers(g, { iid: g.nextIid++, card: by('Berta, Wise Extrapolator') }, {}, []); be.sick = false; be.tapped = false;
  const i = G.abilityMenu(g, be).findIndex(x => /Fractal/.test(x.label)); let q = null;
  D.resolveSync([g], 0, gs => G.useAbility(gs[0], gs[0].battlefield.find(p => p.iid === be.iid), i), x => { if (x.kind !== 'x') return 'auto'; q = x; return 1; });
  const tok = g.battlefield.find(p => p.card.name === 'Fractal');
  check('Berta: {X}, {T} asks for X (1 to 6 with six lands)', q && q.options.length === 6, q && q.options.length);
  check('...X = 2: a Fractal with two counters, two lands tapped', tok && tok.counters === 2 && untapped(g) === 4, tok && tok.counters + ' / ' + untapped(g));
})();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
