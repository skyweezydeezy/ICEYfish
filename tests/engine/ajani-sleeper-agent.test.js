// Ajani, Sleeper Agent (DMU): Compleated; +1 reveal the top card (creature or planeswalker to hand, otherwise you may bottom it); -3 distribute three +1/+1 counters
// among up to three target creatures, they gain vigilance until end of turn; -6 emblem: whenever you cast a creature or planeswalker spell, target opponent gets two poison counters.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Ajani, Sleeper Agent', 'Llanowar Elves', 'Serra Angel', 'Shivan Dragon', 'Lightning Bolt', 'Oko, Thief of Crowns', 'Forest', 'Plains', 'Mountain'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const ab = (c) => by('Ajani, Sleeper Agent').a.pwAbilities.find(a => a.cost === c);
const act = (g, p, cost, ev) => G.activateLoyalty(g, p, ab(cost), ev || [], false);
const top = (g, n) => { g.library.unshift(inst(g, n)); return g.library[0]; };

T('every line reads ok and has a rule', () => {
  const c = by('Ajani, Sleeper Agent'), bad = c.a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  check('no line left unread; Compleated, +1 (revealTake), -3 (distribute), -6 (emblem) are built', !bad.length && c.a.compleated === true && ab(1).fx[0].type === 'revealTake' && ab(-3).fx[0].type === 'distribute' && ab(-6).fx[0].type === 'ajaniEmblem', JSON.stringify(c.a.coverage.map(r => r.status)));
});

T('+1: a creature on top is revealed and goes to hand', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); const t = top(g, 'Serra Angel'); const ev = []; const n0 = g.library.length;
  act(g, aj, 1, ev);
  check('Serra Angel is in hand, not on top', g.hand.includes(t) && g.library.length === n0 - 1);
  check('the log names the card and where it went, and a reveal event is sent', ev.some(e => e.type === 'reveal' && e.inst === t) && ev.some(e => e.type === 'note' && /reveals Serra Angel/.test(e.text) && /into your hand/.test(e.text)), JSON.stringify(ev.filter(e => e.type === 'note').map(e => e.text)));
  check('Ajani gained a loyalty counter (4 -> 5)', aj.loyalty === 5, aj.loyalty);
});

T('+1: a planeswalker on top goes to hand too', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); const t = top(g, 'Oko, Thief of Crowns'); act(g, aj, 1);
  check('Oko is in hand', g.hand.includes(t));
});

T('+1: another card is revealed and may go to the bottom (a person is asked)', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); const t = top(g, 'Lightning Bolt'); const ev = [];
  const qs = seated(g, d => d.kind === 'may' ? 'yes' : undefined, () => act(g, aj, 1, ev));
  check('a yes/no question names the card', qs.some(x => x.d.kind === 'may' && /Lightning Bolt/.test(x.d.title)));
  check('answering yes puts it on the bottom, not in hand', g.library[g.library.length - 1] === t && !g.hand.includes(t));
  check('the log says it went to the bottom', ev.some(e => e.type === 'note' && /reveals Lightning Bolt/.test(e.text) && /bottom/.test(e.text)));
  const g2 = bare(); const aj2 = putOn(g2, 'Ajani, Sleeper Agent'); const t2 = top(g2, 'Lightning Bolt'); const ev2 = [];
  seated(g2, d => d.kind === 'may' ? 'no' : undefined, () => act(g2, aj2, 1, ev2));
  check('answering no leaves it on top', g2.library[0] === t2 && !g2.hand.includes(t2) && ev2.some(e => e.type === 'note' && /stays on top/.test(e.text)));
});

T('+1: with every default taken, the person plays the autopilot\'s choice', () => {
  for (const nm of ['Lightning Bolt', 'Forest', 'Shivan Dragon']) {
    const g = bare(), h = bare(); const a1 = putOn(g, 'Ajani, Sleeper Agent'), a2 = putOn(h, 'Ajani, Sleeper Agent'); top(g, nm); top(h, nm);
    act(g, a1, 1); seated(h, null, () => act(h, a2, 1));
    check(`${nm}: same place (library top ${g.library[0].card.name} / ${h.library[0].card.name}, hand ${g.hand.length}/${h.hand.length}, bottom ${g.library[g.library.length - 1].card.name}/${h.library[h.library.length - 1].card.name})`, g.library[0].card.name === h.library[0].card.name && g.hand.length === h.hand.length && g.library[g.library.length - 1].card.name === h.library[h.library.length - 1].card.name);
  }
});

T('+1 with an empty library does nothing and says so', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); g.library = []; const ev = []; act(g, aj, 1, ev);
  check('a note says the library is empty', ev.some(e => e.type === 'note' && /library is empty/.test(e.text)));
});

T('-3: three +1/+1 counters among up to three creatures, they gain vigilance', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); aj.loyalty = 5; const a = putOn(g, 'Serra Angel'), b = putOn(g, 'Shivan Dragon'), c = putOn(g, 'Llanowar Elves');
  act(g, aj, -3);
  const n = x => x.counters || 0;
  check('three counters in all, one on each of the three creatures', n(a) + n(b) + n(c) === 3 && n(a) === 1 && n(b) === 1 && n(c) === 1, [n(a), n(b), n(c)].join('/'));
  check('they all gain vigilance until end of turn', [a, b, c].every(q => q.eotKw && q.eotKw.has('vigilance')));
  check('Ajani lost 3 loyalty (5 -> 2)', aj.loyalty === 2, aj.loyalty);
});

T('-3: with one creature all three counters go on it', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); aj.loyalty = 5; const a = putOn(g, 'Serra Angel'); act(g, aj, -3);
  check('three counters on the only creature', (a.counters || 0) === 3, a.counters);
});

T('-3: a person chooses the targets and who gets the extra counter', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); aj.loyalty = 5; const a = putOn(g, 'Serra Angel'), b = putOn(g, 'Shivan Dragon'), c = putOn(g, 'Llanowar Elves');
  let step = 0;
  const qs = seated(g, d => { if (d.what === 'distribute') { step++; return step === 1 ? c : step === 2 ? a : null; } if (d.what === 'distributeExtra') return a; }, () => act(g, aj, -3));
  check('targets Elves and Angel, the extra counter on the Angel (2 and 1)', (c.counters || 0) === 1 && (a.counters || 0) === 2 && !(b.counters || 0), [a.counters, b.counters, c.counters].join('/'));
  check('only the chosen creatures gain vigilance', a.eotKw && a.eotKw.has('vigilance') && c.eotKw && c.eotKw.has('vigilance') && !(b.eotKw && b.eotKw.has('vigilance')));
  check('the questions were asked (targets, then the extra counter)', qs.some(x => x.d.what === 'distribute') && qs.some(x => x.d.what === 'distributeExtra'));
  const h = bare(), k = bare(); const ah = putOn(h, 'Ajani, Sleeper Agent'), ak = putOn(k, 'Ajani, Sleeper Agent'); ah.loyalty = ak.loyalty = 5;
  for (const x of [h, k]) { putOn(x, 'Serra Angel'); putOn(x, 'Shivan Dragon'); putOn(x, 'Llanowar Elves'); }
  act(h, ah, -3); seated(k, null, () => act(k, ak, -3));
  check('with every default taken, the same counters as the autopilot', h.battlefield.map(q => q.counters || 0).join() === k.battlefield.map(q => q.counters || 0).join(), h.battlefield.map(q => q.counters || 0).join() + ' / ' + k.battlefield.map(q => q.counters || 0).join());
});

T('-6: the emblem gives the opponent two poison counters for each creature or planeswalker spell, ten poison win', () => {
  const g = bare(); const aj = putOn(g, 'Ajani, Sleeper Agent'); aj.loyalty = 6; act(g, aj, -6);
  check('Ajani is gone (loyalty 0) and the emblem exists', !g.battlefield.includes(aj) && g.ajaniPoison === 2);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 6; k++) g.battlefield.push(...[]);
  g.hand.push(inst(g, 'Llanowar Elves')); for (let i = 0; i < 2; i++) putOn(g, 'Forest');
  const p0 = g.poisonDealt || 0; G.castCard(g, g.hand[0]);
  check('casting a creature spell: two poison counters', (g.poisonDealt || 0) === p0 + 2, g.poisonDealt);
  g.hand.push(inst(g, 'Lightning Bolt')); const p1 = g.poisonDealt; G.castCard(g, g.hand[g.hand.length - 1]);
  check('casting an instant gives none', g.poisonDealt === p1);
  const h = bare(); h.ajaniPoison = 2; h.poisonDealt = 8; h.hand.push(inst(h, 'Llanowar Elves')); putOn(h, 'Forest'); G.castCard(h, h.hand[0]);
  check('ten poison counters: the opponent loses (CR 704.5c)', h.poisonWin === true || h.killTurn != null || h.winner != null, JSON.stringify({ pw: h.poisonWin, kt: h.killTurn }));
});

T('Compleated: paying life for {G/W/P} means two fewer loyalty counters', () => {
  const mk = lands => { const g = bare(); g.life = 20; for (const l of lands) putOn(g, l); g.hand.push(inst(g, 'Ajani, Sleeper Agent')); return g; };
  const g = mk(['Forest', 'Forest', 'Plains']); G.castCard(g, g.hand[0]); const aj = g.battlefield.find(q => q.card.name === 'Ajani, Sleeper Agent');
  check('three lands: cast by paying 2 life, it enters with 2 loyalty', !!aj && g.life === 18 && aj.loyalty === 2, aj && (aj.loyalty + ' loyalty, ' + g.life + ' life'));
  const h = mk(['Forest', 'Forest', 'Plains', 'Plains']); G.castCard(h, h.hand[0]); const aj2 = h.battlefield.find(q => q.card.name === 'Ajani, Sleeper Agent');
  check('four lands: the autopilot pays mana, 4 loyalty and no life', !!aj2 && h.life === 20 && aj2.loyalty === 4, aj2 && (aj2.loyalty + ' loyalty, ' + h.life + ' life'));
  const k = mk(['Forest', 'Forest', 'Plains', 'Plains']);
  const qs = seated(k, d => d.kind === 'may' && /Phyrexian|pay 2 life/.test(d.title) ? 'yes' : undefined, () => G.castCard(k, k.hand[0])); const aj3 = k.battlefield.find(q => q.card.name === 'Ajani, Sleeper Agent');
  check('a person may pay life even with the mana: 2 loyalty, 18 life, and the question mentions Compleated', !!aj3 && aj3.loyalty === 2 && k.life === 18 && qs.some(x => /Compleated/.test(x.d.text || '')), aj3 && (aj3.loyalty + ' / ' + k.life));
});

T('the autopilot plays whole games without errors', () => { let ok = true, msg = ''; try { G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); } catch (e) { ok = false; msg = String(e.stack).split('\n').slice(0, 2).join(' | '); } check('sixty games with these cards run clean', ok, msg); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
