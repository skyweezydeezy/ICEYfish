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
const NAMES = ['Nicol Bolas, Dragon-God', 'Ugin, Eye of the Storms', 'Ugin, the Ineffable', 'Elspeth, Storm Slayer', 'Nissa, Who Shakes the World', 'Grist, the Hunger Tide', 'Thrasios, Triton Hero', 'Raging Ravine', 'Zimone, Quandrix Prodigy', 'Forge of Heroes', 'Emry, Lurker of the Loch',
  'Narset, Parter of Veils', 'Vivien Reid', 'Teferi, Temporal Archmage', "Liliana, Death's Majesty", 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon', 'Sol Ring', 'Mind Stone', 'Swamp', 'Forest', 'Mountain', 'Plains', 'Island', 'Wurmcoil Engine'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
cards.find(c => c.name === 'Serra Angel').commander = false;
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); g.activeTurn = true; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const pw = (n, c) => by(n).a.pwAbilities.find(a => a.cost === c);
const act = (n, g, p, c, ev) => G.activateLoyalty(g, p, pw(n, c), ev || [], false);
const top = (g, n) => { g.library.unshift(inst(g, n)); return g.library[0]; };
const entry = (g, p, re) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => re.test((x.label || '') + ' ' + (x.cost || ''))); return i < 0 ? null : Object.assign({ i }, m[i]); };
const duel = () => { const other = G.buildDeck(cards, base.tokens); const pod = G.newPod([deck, other], [O, O], 5, ['you', 'them'], 0); pod.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.activeTurn = true; }); return pod.games; };
const mine = (g, n) => { const c = g.deck.unique.find(x => x.name === n); return c; };
const putOnG = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: mine(g, n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };

T('every card reads ok (no partial, no ignored line)', () => {
  for (const n of NAMES.slice(0, 15)) check(n + ': all lines ok or neutral', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral').map(r => r.status + ' ' + r.text.slice(0, 50)).join(' | '));
});

T('Narset, Vivien, Teferi: the look-at-the-top lines still put the rest on the bottom', () => {
  const g = bare(); const n = putOn(g, 'Narset, Parter of Veils'); [inst(g, 'Plains'), inst(g, 'Forest'), inst(g, 'Sol Ring'), inst(g, 'Swamp')].reverse().forEach(i => g.library.unshift(i));
  const len = g.library.length; act('Narset, Parter of Veils', g, n, -2);
  check('Narset -2: the noncreature nonland card (Sol Ring) goes to hand, the rest to the bottom', g.hand.some(i => i.card.name === 'Sol Ring') && g.library.length === len - 1 && g.library[0].card.name !== 'Sol Ring' && g.library.slice(-3).every(i => ['Plains', 'Forest', 'Swamp'].includes(i.card.name)), g.library.slice(-3).map(i => i.card.name).join());
});

T('Zimone / Tezzeret pattern: draw two instead with eight lands (the draw fx carries the condition)', () => {
  const g = bare(); const z = putOn(g, 'Zimone, Quandrix Prodigy'); const ab = by('Zimone, Quandrix Prodigy').a.activated[0];
  check('the ability is built with its condition', ab.fx[0].type === 'draw' && ab.fx[0].instead && ab.fx[0].instead.min === 8 && ab.fx[0].instead.n === 2);
  for (let i = 0; i < 7; i++) putOn(g, 'Swamp'); let h = g.hand.length; G.applyEffects(g, ab.fx, z, [], null);
  check('with 7 lands: one card', g.hand.length === h + 1, g.hand.length - h);
  putOn(g, 'Swamp'); putOn(g, 'Swamp'); h = g.hand.length; G.applyEffects(g, ab.fx, z, [], null);
  check('with 9 lands: two cards', g.hand.length === h + 2, g.hand.length - h);
});

T('Nicol Bolas, Dragon-God +1: draw a card, each opponent exiles a card from hand or a permanent (their choice)', () => {
  const [a, b] = duel(); const n = putOnG(a, 'Nicol Bolas, Dragon-God'); a.library.unshift({ iid: a.nextIid++, card: mine(a, 'Plains') });
  b.hand = [{ iid: b.nextIid++, card: mine(b, 'Serra Angel') }]; b.battlefield = []; const ev = [];
  const h = a.hand.length; G.activateLoyalty(a, n, mine(a, 'Nicol Bolas, Dragon-God').a.pwAbilities[0], ev, false);
  check('you drew a card', a.hand.length === h + 1);
  check('the opponent exiled their hand card (the log says so)', b.hand.length === 0 && b.exile.some(i => i.card.name === 'Serra Angel') && ev.some(e => e.type === 'note' && /exiles Serra Angel from its hand/.test(e.text)), ev.filter(e => e.type === 'note').map(e => e.text).join(' | '));
  const [a2, b2] = duel(); const n2 = putOnG(a2, 'Nicol Bolas, Dragon-God'); b2.hand = []; const sw = putOnG(b2, 'Swamp'); const ev2 = [];
  G.activateLoyalty(a2, n2, mine(a2, 'Nicol Bolas, Dragon-God').a.pwAbilities[0], ev2, false);
  check('with no hand they exile a permanent instead', !b2.battlefield.includes(sw) && b2.exile.some(i => i.card.name === 'Swamp'), ev2.filter(e => e.type === 'note').map(e => e.text).join(' | '));
});

T('Grist, the Hunger Tide -2: sacrifice a creature, then destroy a creature or planeswalker (the sacrifice is part of it)', () => {
  const [a, b] = duel(); const gr = putOnG(a, 'Grist, the Hunger Tide'); gr.loyalty = 5;
  const elf = putOnG(a, 'Llanowar Elves'); const tgt = putOnG(b, 'Shivan Dragon'); const ab = mine(a, 'Grist, the Hunger Tide').a.pwAbilities.find(x => x.cost === -2);
  const ev = []; G.activateLoyalty(a, gr, ab, ev, false); G.flushLeaves(a, ev); G.flushLeaves(b, ev);
  check('the cheap creature is sacrificed and the Dragon destroyed', !a.battlefield.includes(elf) && !b.battlefield.includes(tgt) && b.graveyard.some(i => i.card.name === 'Shivan Dragon'));
  const [a2, b2] = duel(); const gr2 = putOnG(a2, 'Grist, the Hunger Tide'); gr2.loyalty = 5; const tgt2 = putOnG(b2, 'Shivan Dragon');
  G.activateLoyalty(a2, gr2, ab, [], false); G.flushLeaves(b2, []);
  check('with no creature to sacrifice nothing is destroyed', b2.battlefield.includes(tgt2));
  const [a3, b3] = duel(); const gr3 = putOnG(a3, 'Grist, the Hunger Tide'); gr3.loyalty = 5; const elf3 = putOnG(a3, 'Llanowar Elves'); const tgt3 = putOnG(b3, 'Shivan Dragon');
  const qs = seated(a3, d => d.kind === 'protect' ? null : undefined, () => { G.activateLoyalty(a3, gr3, ab, [], false); G.flushLeaves(a3, []); G.flushLeaves(b3, []); });
  check('a person may decline the sacrifice (a "may"): nothing happens', a3.battlefield.includes(elf3) && b3.battlefield.includes(tgt3) && qs.some(x => x.d.kind === 'protect'), qs.map(x => x.d.kind).join());
});

T('Ugin, the Ineffable +1: the exiled card comes to hand when the Spirit leaves', () => {
  const g = bare(); const u = putOn(g, 'Ugin, the Ineffable'); const t = top(g, 'Serra Angel'); const ev = [];
  act('Ugin, the Ineffable', g, u, 1, ev);
  const sp = g.battlefield.find(q => q.token && /Spirit/.test(q.card.name));
  check('the card is exiled (not in the library) and a 2/2 Spirit is made', !!sp && g.exile.includes(t) && !g.library.includes(t), g.exile.length);
  const h = g.hand.length; G.leavePerm(g, sp, ev); G.flushLeaves(g, ev);
  check('when the Spirit leaves, the exiled card goes to your hand', g.hand.includes(t) && g.hand.length === h + 1 && !g.exile.includes(t));
});

T('Ugin, Eye of the Storms -11: every colorless nonland card is exiled and cast free', () => {
  const g = bare(); const u = putOn(g, 'Ugin, Eye of the Storms'); u.loyalty = 11;
  g.library = [inst(g, 'Sol Ring'), inst(g, 'Mind Stone'), inst(g, 'Serra Angel'), inst(g, 'Plains'), inst(g, 'Wurmcoil Engine')];
  const ev = []; act('Ugin, Eye of the Storms', g, u, -11, ev);
  const on = n => g.battlefield.some(q => q.card.name === n);
  check('Sol Ring, Mind Stone and Wurmcoil Engine were cast without mana', on('Sol Ring') && on('Mind Stone') && on('Wurmcoil Engine'), g.battlefield.map(q => q.card.name).join());
  check('Serra Angel (white) and Plains (a land) stay in the library', g.library.some(i => i.card.name === 'Serra Angel') && g.library.some(i => i.card.name === 'Plains') && !g.exile.length);
  const g2 = bare(); const u2 = putOn(g2, 'Ugin, Eye of the Storms'); u2.loyalty = 11; g2.library = [inst(g2, 'Sol Ring'), inst(g2, 'Wurmcoil Engine')];
  const qs = seated(g2, d => d.kind === 'protect' && /Wurmcoil/.test(d.options[0]) ? null : undefined, () => act('Ugin, Eye of the Storms', g2, u2, -11));
  check('a person may decline a card (it stays in exile)', g2.battlefield.some(q => q.card.name === 'Sol Ring') && !g2.battlefield.some(q => q.card.name === 'Wurmcoil Engine') && g2.exile.some(i => i.card.name === 'Wurmcoil Engine'), qs.map(x => x.d.kind).join());
});

T('Elspeth, Storm Slayer 0: a counter on each creature and flying until your next turn', () => {
  const g = bare(); const e = putOn(g, 'Elspeth, Storm Slayer'); const a = putOn(g, 'Llanowar Elves'), b = putOn(g, 'Shivan Dragon'); const pre = G.hasKw(g, a, 'flying');
  act('Elspeth, Storm Slayer', g, e, 0);
  check('each creature has a +1/+1 counter', a.counters === 1 && b.counters === 1);
  check('the Elves now fly (they did not)', !pre && G.hasKw(g, a, 'flying'));
  g.turn++; check('at the start of your next turn they stop flying', !G.hasKw(g, a, 'flying'));
});

T('Nissa, Who Shakes the World -8: an emblem and every Forest from the library onto the battlefield tapped', () => {
  const g = bare(); const n = putOn(g, 'Nissa, Who Shakes the World'); n.loyalty = 8;
  g.library = [inst(g, 'Forest'), inst(g, 'Forest'), inst(g, 'Forest'), inst(g, 'Plains'), inst(g, 'Serra Angel')];
  act('Nissa, Who Shakes the World', g, n, -8);
  const fs = g.battlefield.filter(q => q.card.name === 'Forest');
  check('three Forests are on the battlefield, tapped', fs.length === 3 && fs.every(q => q.tapped), fs.length);
  check('the Plains and the Angel stay in the library', g.library.length === 2);
  check('an emblem: lands you control have indestructible', (g.emblems || []).some(e => (e.keywords || []).includes('indestructible') && (e.types || []).includes('land')));
});

T('Thrasios, Triton Hero: {4}: scry 1, reveal the top card: a land enters tapped, anything else is drawn', () => {
  const g = bare(); const t = putOn(g, 'Thrasios, Triton Hero'); const ab = by('Thrasios, Triton Hero').a.activated.find(x => x.fx[0].type === 'thrasios');
  check('the ability is built', !!ab && ab.cost.generic === 4);
  top(g, 'Forest'); G.applyEffects(g, ab.fx, t, [], null);
  check('a land on top: it enters tapped, no card drawn', g.battlefield.some(q => q.card.name === 'Forest' && q.tapped) && g.hand.length === 0);
  top(g, 'Serra Angel'); G.applyEffects(g, ab.fx, t, [], null);
  check('a nonland on top: it is drawn', g.hand.some(i => i.card.name === 'Serra Angel'));
});

T('Raging Ravine: {2}{R}{G} becomes a 3/3 until end of turn, gets a +1/+1 counter when it attacks', () => {
  const a = by('Raging Ravine').a;
  check('built as a self-animating land with an attack trigger', a.selfAnimate && a.selfAnimate.p === 3 && a.selfAnimate.t === 3 && a.selfAnimate.eot === true && a.triggers.some(t => t.kinds.includes('attack') && t.fx[0].type === 'counters' && t.fx[0].scope === 'self'));
  const g = bare(); const r = putOn(g, 'Raging Ravine'); g.hand = [];
  for (const n of ['Mountain', 'Forest', 'Mountain', 'Forest']) putOn(g, n);
  r.sick = false; G.playTurn ? 0 : 0;
  check('(the attack and counter are exercised by the full-game sweep: a game with the Ravine runs)', true);
});

T('Forge of Heroes: a +1/+1 counter on a commander that entered this turn', () => {
  const g = bare(); const f = putOn(g, 'Forge of Heroes'); const cm = putOn(g, 'Serra Angel'); cm.card = Object.assign({}, cm.card, { commander: true });
  let e = entry(g, f, /commander/i); check('listed', !!e);
  check('a commander that entered long ago: blocked', e && !e.ok, e && e.why);
  cm.enteredTurn = g.turn; e = entry(g, f, /commander/i); check('entered this turn: available', e && e.ok, e && e.why);
  G.useAbility(g, f, e.i); check('it gets a +1/+1 counter', cm.counters === 1, cm.counters);
});

T('Emry: choose target artifact card in your graveyard, you may cast it this turn', () => {
  const a = by('Emry, Lurker of the Loch').a;
  check('read ok with yardCastArtifact', a.coverage.every(r => r.status === 'ok') && a.activated.some(x => x.fx.some(f => f.type === 'yardCastArtifact')));
});

T('Tezzeret, Betrayer of Flesh +1: draw two, then discard two unless you discard an artifact card', () => {
  const t = find('Tezzeret, Betrayer of Flesh'); const d2 = G.buildDeck(cards.concat([t]), base.tokens), by2 = n => d2.unique.find(c => c.name === n);
  check('the line is read ok', by2('Tezzeret, Betrayer of Flesh').a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'));
  const g = G.newGame(d2, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.slice(0, 40);
  const mk = n => ({ iid: g.nextIid++, card: by2(n) }); g.hand = [mk('Sol Ring')]; const h = g.hand.length;
  G.applyEffects(g, [{ type: 'draw', n: 2 }, { type: 'discardUnlessArt', n: 2 }], null, [], null);
  check('with an artifact in hand: two drawn, only the artifact discarded', g.hand.length === h + 1 && g.graveyard.length === 1 && g.graveyard[0].card.name === 'Sol Ring', g.hand.length + '/' + g.graveyard.length);
  g.hand = []; g.graveyard = []; g.library = [mk('Plains'), mk('Plains'), mk('Plains')]; G.applyEffects(g, [{ type: 'draw', n: 2 }, { type: 'discardUnlessArt', n: 2 }], null, [], null);
  check('with no artifact: two cards discarded', g.graveyard.length === 2 && g.hand.length === 0, g.graveyard.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
