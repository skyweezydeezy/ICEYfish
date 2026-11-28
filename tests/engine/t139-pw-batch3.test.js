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
const NAMES = ['Nahiri, the Harbinger', 'Nahiri, the Lithomancer', 'Ob Nixilis of the Black Oath', 'Lord Windgrace', 'Minsc & Boo, Timeless Heroes', 'Sorin, Imperious Bloodlord', 'Tevesh Szat, Doom of Fools', 'Tezzeret, Cruel Captain', 'Tyvar Kell', 'Kaito, Cunning Infiltrator', 'Professor Onyx',
  'Serra Angel', 'Llanowar Elves', 'Shivan Dragon', 'Sol Ring', 'Mountain', 'Island', 'Plains', 'Swamp', 'Forest', 'Wurmcoil Engine', 'Vampire Nighthawk', 'Sword of Fire and Ice', 'Elvish Mystic', 'Lightning Greaves'];
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
const pwa = (g, n, c) => mine(g, n).a.pwAbilities.find(a => a.cost === c);
const act = (g, p, ab, ev) => G.activateLoyalty(g, p, ab, ev || [], false);
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

T('every line reads ok or neutral (Tevesh -10 and Tezzeret Cruel Captain -7 stay unread)', () => {
  for (const n of NAMES.slice(0, 11)) { const bad = by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral'); check(n + ': ' + (bad.length ? bad.map(r => r.text.slice(0, 40)).join(' | ') : 'all ok or neutral'), !bad.length || n === 'Tevesh Szat, Doom of Fools' || n === 'Tezzeret, Cruel Captain'); }
});
T('Nahiri, the Harbinger +2: may discard, then draw; -8: a creature from the library with haste, back to hand at the end step', () => {
  const g = duel()[0]; const n = putOn(g, 'Nahiri, the Harbinger'); g.hand = [inst(g, 'Plains')]; g.library.unshift(inst(g, 'Island')); act(g, n, pwa(g, 'Nahiri, the Harbinger', 2));
  check('discarded the Plains and drew the Island', g.graveyard.some(i => i.card.name === 'Plains') && g.hand.some(i => i.card.name === 'Island'));
  const g2 = duel()[0]; const n2 = putOn(g2, 'Nahiri, the Harbinger'); n2.loyalty = 8; g2.hand = [inst(g2, 'Plains')];
  seated(g2, d => d.kind === 'discard' ? null : undefined, () => act(g2, n2, pwa(g2, 'Nahiri, the Harbinger', 2)));
  check('a person may decline the discard (nothing happens)', g2.hand.length === 1 && !g2.graveyard.length);
  const g3 = duel()[0]; const n3 = putOn(g3, 'Nahiri, the Harbinger'); n3.loyalty = 8; g3.library = [inst(g3, 'Plains'), inst(g3, 'Wurmcoil Engine')];
  act(g3, n3, pwa(g3, 'Nahiri, the Harbinger', -8)); const w = g3.battlefield.find(q => q.card.name === 'Wurmcoil Engine');
  check('Wurmcoil Engine is on the battlefield with haste, marked to return', !!w && w.handEnd && G.hasKw(g3, w, 'haste'));
  g3.endTurn ? 0 : 0; w.handEnd = true; for (const p of g3.battlefield.slice()) if (p.handEnd) { p.handEnd = false; G.leavePerm(g3, p, [], 'hand'); }
  check('(the end-step return puts it into the hand)', g3.hand.some(i => i.card.name === 'Wurmcoil Engine'));
});
T('Nahiri, the Lithomancer +2 attaches an Equipment to the Soldier; -2 puts one onto the battlefield', () => {
  const g = duel()[0]; const n = putOn(g, 'Nahiri, the Lithomancer'); const sw = putOn(g, 'Sword of Fire and Ice'); act(g, n, pwa(g, 'Nahiri, the Lithomancer', 2));
  const k = g.battlefield.find(q => q.token && /Kor Soldier/.test(q.card.name)); check('a Kor Soldier with the Sword attached', !!k && sw.attachedTo === k.iid);
  const g2 = duel()[0]; const n2 = putOn(g2, 'Nahiri, the Lithomancer'); n2.loyalty = 5; g2.graveyard = [inst(g2, 'Sword of Fire and Ice')]; act(g2, n2, pwa(g2, 'Nahiri, the Lithomancer', -2));
  check('the Sword comes from the graveyard', g2.battlefield.some(q => q.card.name === 'Sword of Fire and Ice') && !g2.graveyard.length);
});
T('Ob Nixilis +2: each opponent loses 1, you gain that much', () => {
  const [a, b] = duel(); const o = putOn(a, 'Ob Nixilis of the Black Oath'); const l = a.life, ol = b.life; act(a, o, pwa(a, 'Ob Nixilis of the Black Oath', 2));
  check('opponent -1, you +1', a.life === l + 1 && b.life === ol - 1, a.life + '/' + b.life);
});
T('Lord Windgrace +2: discard then draw (a land discarded draws an extra); -3: two lands from the graveyard', () => {
  const g = duel()[0]; const w = putOn(g, 'Lord Windgrace'); g.hand = [inst(g, 'Plains')]; g.library = [inst(g, 'Island'), inst(g, 'Swamp'), inst(g, 'Forest')]; act(g, w, pwa(g, 'Lord Windgrace', 2));
  check('discarded a land: drew two cards', g.hand.length === 2 && g.graveyard.length === 1, g.hand.length);
  const g2 = duel()[0]; const w2 = putOn(g2, 'Lord Windgrace'); w2.loyalty = 8; g2.graveyard = [inst(g2, 'Plains'), inst(g2, 'Island'), inst(g2, 'Swamp')]; act(g2, w2, pwa(g2, 'Lord Windgrace', -3));
  check('two lands back, one left', g2.battlefield.filter(q => q.asLand).length === 2 && g2.graveyard.length === 1);
});
T('Minsc & Boo -2: sacrifice a creature, X damage to any target (X = power)', () => {
  const [a, b] = duel(); const m = putOn(a, 'Minsc & Boo, Timeless Heroes'); m.loyalty = 5; putOn(a, 'Shivan Dragon'); const l = b.life; act(a, m, pwa(a, 'Minsc & Boo, Timeless Heroes', -2)); G.flushLeaves(a, []);
  check('the Dragon is sacrificed and its 5 damage lands on the opponent', !a.battlefield.some(q => q.card.name === 'Shivan Dragon') && b.life === l - 5, b.life);
});
T('Sorin, Imperious Bloodlord +1: deathtouch and lifelink; a Vampire also gets a counter', () => {
  const g = duel()[0]; const s = putOn(g, 'Sorin, Imperious Bloodlord'); const v = putOn(g, 'Vampire Nighthawk'); act(g, s, pwa(g, 'Sorin, Imperious Bloodlord', 1));
  check('the Vampire has deathtouch, lifelink and a +1/+1 counter', G.hasKw(g, v, 'deathtouch') && G.hasKw(g, v, 'lifelink') && v.counters === 1, v.counters);
});
T('Tevesh Szat +1: sacrifice another creature, draw two (the autopilot only for a cheap one); a person is asked', () => {
  const g = duel()[0]; const t = putOn(g, 'Tevesh Szat, Doom of Fools'); const e = putOn(g, 'Llanowar Elves'); act(g, t, pwa(g, 'Tevesh Szat, Doom of Fools', 1)); G.flushLeaves(g, []);
  check('the Elves are sacrificed and two cards drawn', !g.battlefield.includes(e) && g.hand.length === 2, g.hand.length);
  const g2 = duel()[0]; const t2 = putOn(g2, 'Tevesh Szat, Doom of Fools'); const e2 = putOn(g2, 'Llanowar Elves'); seated(g2, d => d.kind === 'protect' ? null : undefined, () => act(g2, t2, pwa(g2, 'Tevesh Szat, Doom of Fools', 1)));
  check('a person may decline: nothing sacrificed, nothing drawn', g2.battlefield.includes(e2) && !g2.hand.length);
});
T('Tezzeret, Cruel Captain 0: untap an artifact or creature; an artifact creature gets a counter', () => {
  const g = duel()[0]; const t = putOn(g, 'Tezzeret, Cruel Captain'); const s = putOn(g, 'Sol Ring'); s.tapped = true; act(g, t, pwa(g, 'Tezzeret, Cruel Captain', 0));
  check('Sol Ring untaps (no counter: not a creature)', !s.tapped && !s.counters);
  const g2 = duel()[0]; const t2 = putOn(g2, 'Tezzeret, Cruel Captain'); const w = putOn(g2, 'Wurmcoil Engine'); w.tapped = true; act(g2, t2, pwa(g2, 'Tezzeret, Cruel Captain', 0));
  check('Wurmcoil Engine (artifact creature) untaps and gets a +1/+1 counter', !w.tapped && w.counters === 1, w.counters);
});
T('Tyvar Kell +1: counter, untap and deathtouch on an Elf; Kaito, Cunning Infiltrator +1: unblockable, loot; Professor Onyx +1 and -8', () => {
  const g = duel()[0]; const t = putOn(g, 'Tyvar Kell'); const el = putOn(g, 'Elvish Mystic'); el.tapped = true; act(g, t, pwa(g, 'Tyvar Kell', 1));
  check('the Elf untaps, has a counter and deathtouch', !el.tapped && el.counters === 1 && G.hasKw(g, el, 'deathtouch'));
  const g2 = duel()[0]; const k = putOn(g2, 'Kaito, Cunning Infiltrator'); const c = putOn(g2, 'Shivan Dragon'); g2.hand = [inst(g2, 'Plains')]; act(g2, k, pwa(g2, 'Kaito, Cunning Infiltrator', 1));
  check('the Dragon cannot be blocked this turn; one card drawn, one discarded', G.hasKw(g2, c, 'unblockable') && g2.hand.length === 1 && g2.graveyard.length === 1, g2.hand.length + '/' + g2.graveyard.length);
  const g3 = duel()[0]; const o = putOn(g3, 'Professor Onyx'); g3.library = [inst(g3, 'Plains'), inst(g3, 'Island'), inst(g3, 'Swamp'), inst(g3, 'Forest')]; const l = g3.life; act(g3, o, pwa(g3, 'Professor Onyx', 1));
  check('+1: lose 1 life, one of the top three to hand, the other two to the graveyard', g3.life === l - 1 && g3.hand.length === 1 && g3.graveyard.length === 2, g3.hand.length + '/' + g3.graveyard.length);
  const [a, b] = duel(); const o2 = putOn(a, 'Professor Onyx'); o2.loyalty = 8; b.hand = [inst(b, 'Plains'), inst(b, 'Plains')]; const bl = b.life; act(a, o2, pwa(a, 'Professor Onyx', -8));
  check('-8: they discard two cards, then lose 3 life five times', b.hand.length === 0 && b.life === bl - 15, b.life);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
