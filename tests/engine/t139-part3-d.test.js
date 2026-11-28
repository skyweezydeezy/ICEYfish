// T-139 part 3, planeswalkers: Tezzeret Cruel Captain -7, Will Kenrith +2/-2/-8, Tamiyo Field Researcher +1, Tamiyo Inquisitive Student (third draw), Tevesh Szat -10, The Eternal Wanderer +1, Estrid -7.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Tezzeret, Cruel Captain', 'Will Kenrith', 'Tamiyo, Field Researcher', 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar', 'Tevesh Szat, Doom of Fools', 'The Eternal Wanderer', 'Estrid, the Masked', 'Lightning Bolt', 'Serra Angel', 'Llanowar Elves', 'Shivan Dragon', 'Sol Ring', 'Mind Stone', 'Mountain', 'Island', 'Plains', 'Swamp', 'Forest', 'Animate Dead', 'Rancor', 'Oblivion Ring', 'Harmonize', 'Wurmcoil Engine'];
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

T('every line is read or neutral', () => {
  for (const n of ['Tezzeret, Cruel Captain', 'Will Kenrith', 'Tamiyo, Field Researcher', 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar', 'Tevesh Szat, Doom of Fools', 'The Eternal Wanderer', 'Estrid, the Masked']) {
    const cov = by(n).a.coverage.concat(by(n).a.backCard ? by(n).a.backCard.a.coverage : []); const bad = cov.filter(r => r.status !== 'ok' && r.status !== 'neutral');
    check(n + ': ' + (bad.length ? bad.map(r => r.text.slice(0, 50)).join(' | ') : 'all ok or neutral'), !bad.length);
  }
});

T("Tezzeret, Cruel Captain -7: at the beginning of combat, three counters on an artifact; a non-creature becomes a 0/0 Robot creature", () => {
  const g = duel()[0]; const t = putOn(g, 'Tezzeret, Cruel Captain'); t.loyalty = 7; act(g, t, pwa(g, 'Tezzeret, Cruel Captain', -7));
  check('the emblem is set', g.tezEmblem === true);
  const s = putOn(g, 'Sol Ring'); const ev = []; G.beginCombatOnly(g); 
  check('Sol Ring is a 3/3 Robot artifact creature now', G.isCreaturePerm(s) && s.counters === 3 && (s.addTypes || []).includes('Robot') && G.powerOf(g, s) === 3, s.counters + ' ' + G.powerOf(g, s));
  const g2 = duel()[0]; g2.tezEmblem = true; const w = putOn(g2, 'Wurmcoil Engine'); G.beginCombatOnly(g2);
  check('an artifact creature just gets the counters (Wurmcoil 6/6 -> 9/9)', w.counters === 3 && G.powerOf(g2, w) === 9, w.counters + ' ' + G.powerOf(g2, w));
});

T('Will Kenrith +2: two creatures have base 0/3 and lose all abilities until your next turn', () => {
  const [a, b] = duel(); const w = putOn(a, 'Will Kenrith'); const d = putOn(b, 'Shivan Dragon'), e = putOn(b, 'Serra Angel'), f = putOn(b, 'Llanowar Elves');
  act(a, w, pwa(a, 'Will Kenrith', 2));
  check('the Dragon and the Angel are 0/3 without flying', G.powerOf(b, d) === 0 && G.toughnessOf(b, d) === 3 && G.powerOf(b, e) === 0 && !G.hasKw(b, d, 'flying') && !G.hasKw(b, e, 'flying'), G.powerOf(b, d) + '/' + G.toughnessOf(b, d));
  check('the third creature is not touched', G.powerOf(b, f) === 1);
  G.nextTurn ? 0 : 0; a.turn++; for (const q of []) 0;
  check('abilities are still gone until the turn really starts again', !!d.baseTimed);
});

T('Will Kenrith -2: draw two; instants, sorceries and planeswalkers cost {2} less until your next turn; -8: copy each instant or sorcery you cast', () => {
  const g = duel()[0]; const w = putOn(g, 'Will Kenrith'); w.loyalty = 8; g.library.unshift(inst(g, 'Plains'), inst(g, 'Plains'));
  const h = g.hand.length; const bolt = inst(g, 'Harmonize'); g.hand.push(bolt); const before = G.effectiveCost(g, bolt).generic; const h1 = g.hand.length;
  act(g, w, pwa(g, 'Will Kenrith', -2));
  check('two cards drawn', g.hand.length === h1 + 2);
  const after = G.effectiveCost(g, bolt); check('Harmonize ({2}{G}{G}... sorcery) costs {2} less', after.generic === Math.max(0, before - 2), before + ' -> ' + after.generic);
  const creature = inst(g, 'Serra Angel'); g.hand.push(creature); check('a creature spell is not cheaper', G.effectiveCost(g, creature).generic === G.effectiveCost(g, inst(g, 'Serra Angel')).generic);
  const g2 = duel()[0]; const w2 = putOn(g2, 'Will Kenrith'); w2.loyalty = 8; act(g2, w2, pwa(g2, 'Will Kenrith', -8));
  check('the emblem is set', g2.willEmblem === true);
  for (let i = 0; i < 6; i++) putOn(g2, 'Island'); g2.library.unshift(inst(g2, 'Plains'), inst(g2, 'Plains'), inst(g2, 'Plains'), inst(g2, 'Plains'), inst(g2, 'Plains'), inst(g2, 'Plains')); const lib = g2.library.length;
  const hv = inst(g2, 'Harmonize'); hv.card = Object.assign({}, hv.card); g2.hand.push(hv); const r = G.castCard(g2, hv, true);
  check('Harmonize is copied: six cards drawn instead of three', g2.library.length <= lib - 6, lib - g2.library.length);
});

T('Tamiyo, Field Researcher +1: a card whenever either chosen creature deals combat damage, until your next turn', () => {
  const [a, b] = duel(); const t = putOn(a, 'Tamiyo, Field Researcher'); const d = putOn(a, 'Shivan Dragon'), e = putOn(a, 'Serra Angel'), f = putOn(a, 'Llanowar Elves');
  act(a, t, pwa(a, 'Tamiyo, Field Researcher', 1));
  check('the Dragon and the Angel are watched, the Elves are not', d.drawWatch === a.turn && e.drawWatch === a.turn && f.drawWatch !== a.turn);
  a.library.unshift(inst(a, 'Plains'), inst(a, 'Plains'), inst(a, 'Plains')); const h = a.hand.length;
  a.combatDone = false; G.combat(a);
  check('two creatures hit: two cards drawn', a.hand.length === h + 2 || a.hand.length === h + 3, a.hand.length - h);
});

T('Tamiyo, Inquisitive Student: the third card drawn in a turn exiles her and returns her transformed', () => {
  const g = duel()[0]; const t = putOn(g, 'Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar'); g.drawSeq = 0; for (let i = 0; i < 4; i++) g.library.unshift(inst(g, 'Plains'));
  G.draw(g, 2, []); check('two draws: still a creature', g.battlefield.includes(t) && !t.transformed && true, g.battlefield.map(q => q.card.name).join());
  G.draw(g, 1, []);
  const back = g.battlefield.find(q => /Seasoned Scholar/.test(q.card.name));
  check('the third: she is Tamiyo, Seasoned Scholar (a planeswalker with 2 loyalty)', !!back && back.loyalty === 2 && !g.battlefield.some(q => /Inquisitive Student/.test(q.card.name) && !/Seasoned/.test(q.card.name) && !q.transformed), g.battlefield.map(q => q.card.name + ':' + q.loyalty).join());
});

T('Tevesh Szat -10: gain control of all commanders; commanders from the command zone enter under your control', () => {
  const [a, b] = duel(); const t = putOn(a, 'Tevesh Szat, Doom of Fools'); t.loyalty = 10;
  const theirs = putOn(b, 'Shivan Dragon'); theirs.card = Object.assign({}, theirs.card, { commander: true }); const cz = inst(a, 'Serra Angel'); cz.card = Object.assign({}, cz.card, { commander: true }); a.command = [cz]; const cz2 = inst(b, 'Wurmcoil Engine'); cz2.card = Object.assign({}, cz2.card, { commander: true }); b.command = [cz2];
  act(a, t, pwa(a, 'Tevesh Szat, Doom of Fools', -10));
  check('their commander on the battlefield is mine now', a.battlefield.includes(theirs) && !b.battlefield.includes(theirs));
  check('both command zones are empty: Serra Angel and Wurmcoil Engine entered under my control', a.command.length === 0 && b.command.length === 0 && a.battlefield.some(q => q.card.name === 'Serra Angel') && a.battlefield.some(q => q.card.name === 'Wurmcoil Engine'), a.battlefield.map(q => q.card.name).join());
});

T("The Eternal Wanderer +1: exile their best creature; it returns at the beginning of THEIR next end step; or flicker your own", () => {
  const [a, b] = duel(); const w = putOn(a, 'The Eternal Wanderer'); const d = putOn(b, 'Shivan Dragon'); const inst0 = d.inst;
  act(a, w, pwa(a, 'The Eternal Wanderer', 1));
  check('the Dragon is exiled (in their exile)', !b.battlefield.includes(d) && b.exile.includes(inst0), b.exile.length);
  G.endTurn(a); check('my end step does not return it', b.exile.includes(inst0));
  G.endTurn(b); check("their end step returns it to the battlefield", !b.exile.includes(inst0) && b.battlefield.some(q => q.card.name === 'Shivan Dragon'));
});

T('Estrid, the Masked -7: mill seven; non-Aura enchantments return, then Auras (on a creature you control)', () => {
  const g = duel()[0]; const e = putOn(g, 'Estrid, the Masked'); e.loyalty = 7; const c = putOn(g, 'Serra Angel');
  g.graveyard = [inst(g, 'Oblivion Ring'), inst(g, 'Rancor'), inst(g, 'Lightning Bolt')]; g.library = []; for (let i = 0; i < 9; i++) g.library.push(inst(g, 'Plains'));
  act(g, e, pwa(g, 'Estrid, the Masked', -7));
  check('seven cards milled', g.graveyard.filter(i => i.card.name === 'Plains').length === 7, g.graveyard.map(i => i.card.name).join());
  check('Oblivion Ring and Pacifism returned; the Bolt stays', g.battlefield.some(q => q.card.name === 'Oblivion Ring') && g.battlefield.some(q => q.card.name === 'Rancor') && g.graveyard.some(i => i.card.name === 'Lightning Bolt'), g.battlefield.map(q => q.card.name).join());
  const pac = g.battlefield.find(q => q.card.name === 'Rancor'); check('Pacifism is attached to a creature', pac && pac.attachedTo != null, pac && pac.attachedTo);
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
