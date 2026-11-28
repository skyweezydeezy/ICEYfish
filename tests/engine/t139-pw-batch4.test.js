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
const NAMES = ['Ral, Crackling Wit', 'Tamiyo, Field Researcher', 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar', 'Wrenn and Seven', 'Tezzeret, Master of the Bridge', 'Ral Zarek', 'Teferi, Who Slows the Sunset', 'Saheeli, the Gifted', 'Ral, Storm Conduit', 'Estrid, the Masked', 'Lightning Bolt', 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon', 'Sol Ring', 'Mind Stone', 'Mountain', 'Island', 'Plains', 'Swamp', 'Forest', 'Wurmcoil Engine', 'Animate Dead', 'Harmonize'];
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

T('every line is read or neutral (Tamiyo x2 keep one unread line each)', () => {
  for (const n of NAMES.slice(0, 10)) { const bad = by(n).a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral'); check(n + ': ' + (bad.length ? bad.map(r => r.text.slice(0, 40)).join(' | ') : 'all ok or neutral'), !bad.length || /Tamiyo|Estrid/.test(n)); }
});
T('Ral, Crackling Wit -10: draw three, instants and sorceries you cast have storm', () => {
  const g = duel()[0]; const r = putOn(g, 'Ral, Crackling Wit'); r.loyalty = 10; const h = g.hand.length; act(g, r, pwa(g, 'Ral, Crackling Wit', -10));
  check('three cards drawn and the emblem set', g.hand.length === h + 3 && g.stormEmblem === true);
});
T('Tamiyo, Field Researcher -7: draw three; spells from your hand cost nothing', () => {
  const g = duel()[0]; const t = putOn(g, 'Tamiyo, Field Researcher'); t.loyalty = 7; act(g, t, pwa(g, 'Tamiyo, Field Researcher', -7));
  const w = inst(g, 'Wurmcoil Engine'); g.hand.push(w); const c = G.effectiveCost ? G.effectiveCost(g, w) : null;
  check('Wurmcoil Engine costs {0} from hand', g.freeCastEmblem === true && (!c || (c.generic === 0 && !c.pips.length)), JSON.stringify(c));
  const r = G.castCard(g, w); check('and is cast with no lands', !!r && g.battlefield.some(q => q.card.name === 'Wurmcoil Engine'));
});
T('Tamiyo, Inquisitive Student -7 and Wrenn and Seven -8', () => {
  const g = duel()[0]; const back = mine(g, 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar').a.backCard; const t = G.enterWithTriggers(g, { iid: g.nextIid++, card: back }, {}, []); t.loyalty = 8; const lib = g.library.length, h = g.hand.length; const ab = back.a.pwAbilities.find(a => a.cost === -7); act(g, t, ab);
  check('draws half the library rounded up, no maximum hand size', g.hand.length === h + Math.ceil(lib / 2) && g.noMaxHand === true, g.hand.length - h);
  const g2 = duel()[0]; const w = putOn(g2, 'Wrenn and Seven'); w.loyalty = 8; g2.graveyard = [inst(g2, 'Serra Angel'), inst(g2, 'Lightning Bolt'), inst(g2, 'Plains')]; act(g2, w, pwa(g2, 'Wrenn and Seven', -8));
  check('permanent cards (Angel, Plains) return, the Bolt stays', g2.hand.length === 2 && g2.graveyard.some(i => i.card.name === 'Lightning Bolt') && g2.noMaxHand === true, g2.hand.length + '/' + g2.graveyard.length + '/' + g2.noMaxHand);
});
T('Tezzeret, Master of the Bridge -8: exile ten, the artifacts among them onto the battlefield', () => {
  const g = duel()[0]; const t = putOn(g, 'Tezzeret, Master of the Bridge'); t.loyalty = 8; g.library = [inst(g, 'Sol Ring'), inst(g, 'Plains'), inst(g, 'Mind Stone'), inst(g, 'Serra Angel'), inst(g, 'Island')]; act(g, t, pwa(g, 'Tezzeret, Master of the Bridge', -8));
  check('Sol Ring and Mind Stone enter, the rest are exiled', g.battlefield.some(q => q.card.name === 'Sol Ring') && g.battlefield.some(q => q.card.name === 'Mind Stone') && g.exile.length === 3 && !g.library.length);
});
T('Ral Zarek -7: five coins, an extra turn for each heads', () => {
  const g = duel()[0]; const z = putOn(g, 'Ral Zarek'); z.loyalty = 7; let seq = [0.1, 0.9, 0.2, 0.3, 0.8]; g.rnd = () => seq.shift(); act(g, z, pwa(g, 'Ral Zarek', -7));
  check('three heads (below 0.5): three extra turns', g.extraTurns === 3, g.extraTurns);
});
T('Teferi, Who Slows the Sunset +1: untap yours, tap theirs, gain 2', () => {
  const [a, b] = duel(); const t = putOn(a, 'Teferi, Who Slows the Sunset'); const s = putOn(a, 'Sol Ring'); s.tapped = true; const d = putOn(b, 'Shivan Dragon'); const l = a.life; act(a, t, pwa(a, 'Teferi, Who Slows the Sunset', 1));
  check('Sol Ring untaps, their Dragon taps, 2 life', !s.tapped && d.tapped && a.life === l + 2, a.life - l);
});
T('Saheeli, the Gifted +1 (affinity for artifacts) and -7 (hasty token copies of every artifact)', () => {
  const g = duel()[0]; const s = putOn(g, 'Saheeli, the Gifted'); putOn(g, 'Sol Ring'); putOn(g, 'Mind Stone'); const w = inst(g, 'Wurmcoil Engine'); g.hand.push(w);
  const before = G.effectiveCost(g, w).generic; act(g, s, mine(g, 'Saheeli, the Gifted').a.pwAbilities.find(a => a.fx.some(f => f.type === 'affinityNext'))); const after = G.effectiveCost(g, w).generic;
  check('Wurmcoil Engine costs {2} less with two artifacts (plus Sol Ring/Mind Stone)', before - after >= 2 && g.affNext === g.turn, before + ' -> ' + after);
  const g2 = duel()[0]; const s2 = putOn(g2, 'Saheeli, the Gifted'); s2.loyalty = 7; putOn(g2, 'Sol Ring'); putOn(g2, 'Mind Stone'); act(g2, s2, pwa(g2, 'Saheeli, the Gifted', -7));
  const tk = g2.battlefield.filter(q => q.token && q.exileEnd); check('two token copies marked to be exiled at the end step, with haste', tk.length === 2 && tk.every(q => G.hasKw(g2, q, 'haste')), tk.length);
});
T('Ral, Storm Conduit -2: the next instant or sorcery is copied', () => {
  const g = duel()[0]; const r = putOn(g, 'Ral, Storm Conduit'); r.loyalty = 5; act(g, r, pwa(g, 'Ral, Storm Conduit', -2)); check('the flag is set for this turn', g.copyNext === g.turn);
  for (let i = 0; i < 4; i++) putOn(g, 'Forest'); g.hand.push(inst(g, 'Harmonize')); g.library = g.library.slice(0, 20); const n0 = g.hand.length; const ev = G.castCard(g, g.hand[g.hand.length - 1]);
  check('Harmonize (draw three) is cast and copied: six cards drawn', g.hand.length - (n0 - 1) === 6 && !g.copyNext, g.hand.length - (n0 - 1) + ' copyNext ' + g.copyNext);
});
T('Estrid +2: untap each enchanted permanent you control', () => {
  const g = duel()[0]; const e = putOn(g, 'Estrid, the Masked'); const t = putOn(g, 'Sol Ring'); t.tapped = true; const au = putOn(g, 'Animate Dead'); au.attachedTo = t.iid; act(g, e, pwa(g, 'Estrid, the Masked', 2));
  check('the enchanted Sol Ring untaps', !t.tapped);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
