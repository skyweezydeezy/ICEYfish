// Planeswalker loyalty abilities chosen by a person: the engine's loyaltyState / useLoyalty (sim.js) and the menu (decide.js
// loyaltyQuestion). An ability is activated at sorcery speed, once a turn per planeswalker (twice with Oath of Teferi), and only while
// its loyalty can pay the cost; an ability the engine does not play is shown but cannot be picked. The autopilot keeps its own pick
// (autoLoyalty), which is the menu's default, and its ability pass plays exactly as before.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const SF = load('loyalty-program'), ZA = load('zul-ashur');
const cards = SF.cards.concat(['Oath of Teferi', 'Teferi, Temporal Archmage', 'Estrid, the Masked'].filter(n => !SF.cards.some(c => c.name === n)).map(find));
const O = { turns: 25, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
// "Does it resolve?" (your own spell, or another player's that you have nothing to answer with) is passed by these wrappers: the
// scenarios of the stack itself are in stack.test.js. r.asked counts the other questions only.
const stackPass = q => q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length);
const AT = (games, pid, run, answers) => { const as = []; let i = 0, passes = 0; for (;;) { const r = D.attempt(games, pid, run, as); if (r.done) { r.asked -= passes; return r; } if (stackPass(r.ask)) { passes++; as.push({ sig: r.ask.sig, pick: 'none' }); continue; } if (answers && i < answers.length) { as.push(answers[i++]); continue; } return r; } };
const RS = (games, pid, run, choose) => D.resolveSync(games, pid, run, q => stackPass(q) ? 'none' : choose(q));
const duel = seat => { const p = G.newPod([G.buildDeck(cards, SF.tokens), G.buildDeck(ZA.cards, ZA.tokens)], [O, O], 5, ['you', 'them'], 0); p.games.forEach(g => { g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; }); if (seat) D.seat(p.games[0]); return p; };
const card = (g, n) => g.deck.unique.find(c => c.name === n);
const putOn = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const elspeth = g => putOn(g, card(g, "Elspeth, Sun's Champion"));

// ---- what the menu shows
{ const p = duel(), a = p.games[0], e = elspeth(a); const st = G.loyaltyState(a, e);
  check("Elspeth, Sun's Champion (loyalty 4): three abilities, +1, −3, −7", e.loyalty === 4 && st.list.map(x => x.label).join(' ') === '+1 −3 −7' && /^Create three 1\/1 white Soldier/.test(st.list[0].text), st.list.map(x => x.label + ' ' + x.text.slice(0, 30)).join(' | '));
  check('...+1 and −3 can be used; −7 cannot ("needs 7 loyalty")', st.list[0].ok && st.list[1].ok && !st.list[2].ok && /needs 7 loyalty \(it has 4\)/.test(st.list[2].why), st.list[2].why);
  check('...the menu is available as soon as it is on the battlefield (planeswalkers have no summoning sickness)', !st.why && (() => { const f = putOn(a, card(a, 'Liliana of the Veil')); f.sick = true; f.enteredTurn = a.turn; return G.loyaltyState(a, f).list.some(x => x.ok); })()); }
{ const p = duel(), a = p.games[0], t = putOn(a, card(a, 'Estrid, the Masked')); const st = G.loyaltyState(a, t);
  check('an ability the engine does not play is listed but cannot be used, and says so (Estrid, the Masked +2; Nahiri, the Lithomancer −2 and Teferi, Temporal Archmage −1 has been played since T-100)', st.list.some(x => !x.ok && /does not play this ability yet/.test(x.why || '')), st.list.map(x => x.label + ' ' + (x.ok ? 'ok' : x.why)).join(' | ')); }
// ---- using one
{ const p = duel(), a = p.games[0], e = elspeth(a);
  const ev = G.useLoyalty(a, e, 0);
  check('choosing +1: three 1/1 Soldiers, loyalty 5', !!ev && a.battlefield.filter(q => q.token && /Soldier/.test(q.card.name)).length === 3 && e.loyalty === 5 && ev.some(x => x.type === 'pw'), e.loyalty);
  const st = G.loyaltyState(a, e);
  check('...then not again this turn: every ability says "already used this turn" and useLoyalty refuses', st.why === 'already used this turn' && st.list.every(x => !x.ok) && G.useLoyalty(a, e, 1) === null && e.loyalty === 5);
  a.turn++;
  check('...next turn it can be used again', G.loyaltyState(a, e).list.some(x => x.ok)); }
{ const p = duel(), a = p.games[0], [, b] = p.games; const e = elspeth(a); const big = putOn(b, b.deck.unique.find(c => c.a.isCreature && (c.a.power || 0) >= 4)), small = putOn(a, a.deck.unique.find(c => c.a.isCreature && (c.a.power || 0) < 4));
  G.useLoyalty(a, e, 1);
  check('choosing −3: creatures with power 4 or greater are destroyed, loyalty 1', !b.battlefield.includes(big) && a.battlefield.includes(small) && e.loyalty === 1, big.card.name); }
{ const p = duel(), a = p.games[0], e = elspeth(a); e.loyalty = 7;
  G.useLoyalty(a, e, 2);
  check('choosing −7 with exactly 7 loyalty: the emblem, and the planeswalker dies (loyalty 0)', (a.emblems || []).length === 1 && !a.battlefield.includes(e) && a.graveyard.some(i => i.card.name === "Elspeth, Sun's Champion")); }
{ const p = duel(), a = p.games[0], e = elspeth(a); putOn(a, card(a, 'Oath of Teferi'));
  const st0 = G.loyaltyState(a, e); G.useLoyalty(a, e, 0); const st1 = G.loyaltyState(a, e); G.useLoyalty(a, e, 0); const st2 = G.loyaltyState(a, e);
  check('Oath of Teferi: twice a turn ("2 left", then "1 left", then used)', st0.allowed === 2 && st1.list[0].ok && st2.why === 'used 2 times this turn' && e.loyalty === 6, [st0.allowed, st1.used, st2.why, e.loyalty].join(', ')); }

// ---- the menu (decide.js) and the choices inside an ability
{ const p = duel(true), a = p.games[0], e = elspeth(a); const q = D.loyaltyQuestion(a, e);
  check('the menu: a tile per ability ("+1: Create three…"), −7 dimmed with its reason, "Not now", the autopilot\'s pick marked', !!q && q.kind === 'loyalty' && q.options.length === 3 && /^\+1: Create three/.test(q.options[0].name) && q.options[2].disabled && /needs 7 loyalty/.test(q.options[2].note) && q.none === 'Not now' && q.def.length === 1 && G.loyaltyState(a, e).list[q.options[q.def[0]].i].ab === G.autoLoyalty(a, e) && /^Elspeth, Sun's Champion: loyalty abilities/.test(q.title) && /Loyalty 4\. Choose one \(once a turn\)/.test(q.text), q && q.title + ' / ' + q.text + ' / default ' + (q.def.length ? q.options[q.def[0]].label : 'none')); }
{ const p = duel(true), [a, b] = p.games; const k = putOn(a, card(a, 'Kaya the Inexorable')); const t1 = putOn(b, b.deck.unique.find(c => c.a.isCreature && c.a.power >= 2)), t2 = putOn(b, b.deck.unique.filter(c => c.a.isCreature && c.name !== t1.card.name)[0]); G.podFocus(a, b);
  const i = G.loyaltyState(a, k).list.findIndex(x => x.label === '−3');
  const run = gs => G.useLoyalty(gs[0], gs[0].battlefield.find(x => x.iid === k.iid), i);
  const r = AT(p.games, 0, run, []);
  check('an ability with a target asks for it (Kaya −3: exile target nonland permanent)', !r.done && r.ask.kind === 'target' && r.ask.options.some(o => o.iid === t2.iid), r.ask && r.ask.title);
  const kk = r.ask.options.findIndex(o => o.iid === t2.iid);
  AT(p.games, 0, run, [{ sig: r.ask.sig, pick: kk }]);
  check('...and the chosen permanent is exiled, Kaya at loyalty 2', !b.battlefield.includes(t2) && b.battlefield.includes(t1) && k.loyalty === 2); }

// ---- "Use abilities" for a person leaves loyalty abilities alone; the autopilot's pass is unchanged
{ const p = duel(), a = p.games[0], e = elspeth(a); a.skipLoyalty = true; const ev = G.useAbilities(a); a.skipLoyalty = false;
  check('with skipLoyalty (a person\'s "Use abilities") no loyalty ability is activated', !ev.some(x => x.type === 'pw') && e.loyalty === 4);
  const ev2 = G.useAbilities(a);
  check('...without it, the autopilot activates its own pick', ev2.some(x => x.type === 'pw' && x.text === G.loyaltyState(a, e).list.find(it => it.ab.text === x.text).ab.text)); }
{ const r = G.podMonteCarlo([{ cards, tokens: SF.tokens, name: 'a' }, { cards, tokens: SF.tokens, name: 'b' }, { cards: ZA.cards, tokens: ZA.tokens, name: 'c' }], O, 30, 6);
  check('thirty pods with the planeswalker deck: no engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
