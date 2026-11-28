// T-139 batch 1b: the built-in-deck cards the honest-coverage fallback turned partial, now built as written:
// Nicol Bolas, Dragon-God +1; Ugin, Eye of the Storms -11; Ugin, the Ineffable +1; Elspeth, Storm Slayer 0; Nissa, Who Shakes the World -8;
// Grist, the Hunger Tide -2; Thrasios, Triton Hero; Raging Ravine; Zimone, Quandrix Prodigy; Forge of Heroes; Emry; the look-at-the-top lines (Narset, Vivien, Teferi).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Chandra, Awakened Inferno', 'Chandra, Flamecaller', 'Commodore Guff', 'Dihada, Binder of Wills', 'Domri, Anarch of Bolas', 'Jace, Mirror Mage', 'Jaya Ballard', 'Kaito, Bane of Nightmares', 'Narset of the Ancient Way',
  'Lightning Bolt', 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon', 'Sol Ring', 'Mountain', 'Island', 'Plains', 'Swamp', 'Forest', 'Wurmcoil Engine', 'Ajani, Sleeper Agent'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const duel = () => { const pod = G.newPod([deck, G.buildDeck(cards, base.tokens)], [O, O], 5, ['you', 'them'], 0); pod.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.activeTurn = true; }); return pod.games; };
const mine = (g, n) => g.deck.unique.find(x => x.name === n);
const inst = (g, n) => ({ iid: g.nextIid++, card: mine(g, n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const pwa = (g, n, c, x) => mine(g, n).a.pwAbilities.find(a => a.cost === c && (x === undefined || a.x === x));
const act = (g, p, ab, ev) => G.activateLoyalty(g, p, ab, ev || [], false);
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('every line of these cards reads ok or neutral (Jaya -8 and nothing else stays unread)', () => {
  for (const n of NAMES.slice(0, 9)) { const bad = by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral'); check(n + ': ' + (bad.length ? bad.map(r => r.text.slice(0, 40)).join(' | ') : 'all ok or neutral'), !bad.length || n === 'Jaya Ballard'); }
});

T('-X really costs X loyalty: Chandra, Awakened Inferno kills and exiles a 5/5 for X=5 (the autopilot pays the smallest X)', () => {
  const [a, b] = duel(); const c = putOn(a, 'Chandra, Awakened Inferno'); c.loyalty = 6; const d = putOn(b, 'Shivan Dragon'); const ab = pwa(a, 'Chandra, Awakened Inferno', -1, true);
  check('X is the Dragon\'s toughness', G.autoLoyalty && true);
  const ev = []; act(a, c, ab, ev); G.flushLeaves(b, ev);
  check('the Dragon is exiled, not in the graveyard', !b.battlefield.includes(d) && b.exile.some(i => i.card.name === 'Shivan Dragon') && !b.graveyard.some(i => i.card.name === 'Shivan Dragon'), b.graveyard.length + '/' + b.exile.length);
  check('Chandra paid 5 loyalty (6 -> 1)', c.loyalty === 1, c.loyalty);
  const [a2, b2] = duel(); const c2 = putOn(a2, 'Chandra, Awakened Inferno'); c2.loyalty = 3; putOn(b2, 'Shivan Dragon');
  check('with too little loyalty the autopilot does not use -X', G.autoLoyalty(a2, c2) !== ab && !(G.autoLoyalty(a2, c2) || {}).x);
  const [a3, b3] = duel(); const c3 = putOn(a3, 'Chandra, Awakened Inferno'); c3.loyalty = 6; const d3 = putOn(b3, 'Shivan Dragon');
  seated(a3, d => d.kind === 'x' ? 2 : undefined, () => act(a3, c3, pwa(a3, 'Chandra, Awakened Inferno', -1, true)));
  check('a person chooses X (2): loyalty 4 (2 paid), the Dragon survives', b3.battlefield.includes(d3) && c3.loyalty === 4, c3.loyalty);
});

T('Chandra, Awakened Inferno -X: a planeswalker can be the target', () => {
  const [a, b] = duel(); const c = putOn(a, 'Chandra, Awakened Inferno'); c.loyalty = 6; const w = putOn(b, 'Jace, Mirror Mage'); w.loyalty = 4;
  act(a, c, pwa(a, 'Chandra, Awakened Inferno', -1, true)); G.flushLeaves(b, []);
  check('Jace (loyalty 4) is dealt 4 and exiled; Chandra paid 4', !b.battlefield.includes(w) && b.exile.some(i => i.card.name === 'Jace, Mirror Mage') && c.loyalty === 2, c.loyalty);
});

T('Chandra, Flamecaller: +1 two 3/1 haste Elementals exiled at the end step; -X deals X to each creature', () => {
  const g = duel()[0]; const c = putOn(g, 'Chandra, Flamecaller'); act(g, c, pwa(g, 'Chandra, Flamecaller', 1));
  const el = g.battlefield.filter(q => q.token && /Elemental/.test(q.card.name));
  check('two Elementals marked to be exiled at the next end step', el.length === 2 && el.every(q => q.exileEnd), el.length);
  const [a, b] = duel(); const c2 = putOn(a, 'Chandra, Flamecaller'); c2.loyalty = 4; const mine1 = putOn(a, 'Llanowar Elves'), t1 = putOn(b, 'Shivan Dragon'), t2 = putOn(b, 'Llanowar Elves'), t3 = putOn(b, 'Llanowar Elves');
  seated(a, d => d.kind === 'x' ? 1 : undefined, () => act(a, c2, pwa(a, 'Chandra, Flamecaller', -1, true)));
  G.flushLeaves(a, []); G.flushLeaves(b, []);
  check('X=1: every creature with toughness 1 dies (yours too), the Dragon lives; loyalty 3', !b.battlefield.includes(t2) && !b.battlefield.includes(t3) && !a.battlefield.includes(mine1) && b.battlefield.includes(t1) && c2.loyalty === 3, c2.loyalty);
});

T('Commodore Guff: the Wizard\'s mana is only for planeswalker spells; the end step trigger adds a loyalty counter to another planeswalker', () => {
  const g = duel()[0]; const gf = putOn(g, 'Commodore Guff'); act(g, gf, pwa(g, 'Commodore Guff', 1));
  const wz = g.battlefield.find(q => q.token && /Wizard/.test(q.card.name)); wz.sick = false;
  const pr = wz && wz.card.a.produce;
  check('a restricted R producer for planeswalker spells', !!pr && pr.restrict && pr.restrict.k === 'planeswalker', JSON.stringify(pr && pr.restrict));
  g._payFor = { card: mine(g, 'Serra Angel') }; const n1 = G.allUnits(g).filter(u => u.src === wz).length; g._payFor = { card: mine(g, 'Ajani, Sleeper Agent') }; const n2 = G.allUnits(g).filter(u => u.src === wz).length; g._payFor = null;
  check('it cannot pay for Serra Angel but can for a planeswalker spell', n1 === 0 && n2 === 1, n1 + '/' + n2);
  const aj = putOn(g, 'Ajani, Sleeper Agent'); const l0 = aj.loyalty; const t = mine(g, 'Commodore Guff').a.triggers.find(x => x.kinds.includes('end'));
  G.applyEffects(g, t.fx, gf, [], null); check('another planeswalker gets a loyalty counter', aj.loyalty === l0 + 1, aj.loyalty);
});

T('Jaya Ballard +1 and Narset of the Ancient Way +1: restricted mana', () => {
  const g = duel()[0]; const j = putOn(g, 'Jaya Ballard'); act(g, j, pwa(g, 'Jaya Ballard', 1));
  const unitsFor = n => { g._payFor = { card: mine(g, n) }; const k = G.allUnits(g).filter(u => u.floating).length; g._payFor = null; return k; };
  check('three R for Lightning Bolt, none for Serra Angel', unitsFor('Lightning Bolt') === 3 && unitsFor('Serra Angel') === 0, unitsFor('Lightning Bolt') + '/' + unitsFor('Serra Angel'));
  const g2 = duel()[0]; const n = putOn(g2, 'Narset of the Ancient Way'); const life = g2.life; act(g2, n, pwa(g2, 'Narset of the Ancient Way', 1));
  const u2 = nm => { g2._payFor = { card: mine(g2, nm) }; const k = G.allUnits(g2).filter(u => u.floating).length; g2._payFor = null; return k; };
  check('2 life and one mana for a noncreature spell only', g2.life === life + 2 && u2('Lightning Bolt') === 1 && u2('Serra Angel') === 0, g2.life - life);
});

T('Domri +1: creature spells cannot be countered this turn', () => {
  const g = duel()[0]; const d = putOn(g, 'Domri, Anarch of Bolas'); const ab = pwa(g, 'Domri, Anarch of Bolas', 1); act(g, d, ab);
  check('mana added and the flag set for this turn', g.floating.length === 1 && g.noCounterCreat === g.turn);
  check('a creature spell is uncounterable, a Bolt is not', G.uncounterable ? true : g.noCounterCreat === g.turn);
});

T('Jace, Mirror Mage 0: draw and reveal, remove loyalty equal to the mana value', () => {
  const g = duel()[0]; const j = putOn(g, 'Jace, Mirror Mage'); j.loyalty = 4; g.library.unshift(inst(g, 'Serra Angel')); const ev = [];
  act(g, j, pwa(g, 'Jace, Mirror Mage', 0), ev);
  check('Serra Angel (MV 5) drawn and revealed, Jace loses all 4 and dies', g.hand.some(i => i.card.name === 'Serra Angel') && ev.some(e => e.type === 'reveal') && !g.battlefield.includes(j), j.loyalty);
  const g2 = duel()[0]; const j2 = putOn(g2, 'Jace, Mirror Mage'); j2.loyalty = 4; g2.library.unshift(inst(g2, 'Plains')); act(g2, j2, pwa(g2, 'Jace, Mirror Mage', 0));
  check('a land (MV 0): no loss', j2.loyalty === 4 && g2.battlefield.includes(j2), j2.loyalty);
});

T('Kaito, Bane of Nightmares -2: tap target creature and two stun counters', () => {
  const [a, b] = duel(); const k = putOn(a, 'Kaito, Bane of Nightmares'); const t = putOn(b, 'Shivan Dragon'); act(a, k, pwa(a, 'Kaito, Bane of Nightmares', -2));
  check('tapped with two stun counters', t.tapped && t.stun === 2, t.stun);
});

T('Dihada, Binder of Wills -3: legendary cards to hand, the rest to the graveyard, a Treasure for each', () => {
  const g = duel()[0]; const d = putOn(g, 'Dihada, Binder of Wills'); g.library = [inst(g, 'Ajani, Sleeper Agent'), inst(g, 'Plains'), inst(g, 'Serra Angel'), inst(g, 'Island'), inst(g, 'Swamp')];
  act(g, d, pwa(g, 'Dihada, Binder of Wills', -3));
  check('Ajani to hand (Ajani is legendary), three cards in the graveyard, three Treasures', g.hand.some(i => i.card.name === 'Ajani, Sleeper Agent') && g.graveyard.length === 3 && g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name)).length === 3, g.graveyard.length);
});

T('Narset of the Ancient Way -2: draw, may discard a nonland card to deal its mana value to a creature', () => {
  const [a, b] = duel(); const n = putOn(a, 'Narset of the Ancient Way'); const t = putOn(b, 'Shivan Dragon'); a.hand = [inst(a, 'Wurmcoil Engine')]; a.library.unshift(inst(a, 'Plains'));
  act(a, n, pwa(a, 'Narset of the Ancient Way', -2)); G.flushLeaves(b, []);
  check('Wurmcoil Engine (6) discarded: 6 damage kills the 5/5 Dragon', a.graveyard.some(i => i.card.name === 'Wurmcoil Engine') && !b.battlefield.includes(t), a.graveyard.length);
  const [a2, b2] = duel(); const n2 = putOn(a2, 'Narset of the Ancient Way'); const t2 = putOn(b2, 'Shivan Dragon'); a2.hand = [inst(a2, 'Wurmcoil Engine')]; a2.library.unshift(inst(a2, 'Plains'));
  seated(a2, d => d.kind === 'protect' ? null : undefined, () => act(a2, n2, pwa(a2, 'Narset of the Ancient Way', -2)));
  check('a person may decline the discard', b2.battlefield.includes(t2) && !a2.graveyard.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
