// Planeswalker follow-ups: counter doubling on loyalty (Doubling Season), The Chain Veil chosen by a person, Teferi, Master of Time on
// other players' turns, and permanents that let you cast spells as though they had flash (Leyline of Anticipation, Vedalken Orrery,
// Shimmer Myr, Vivien, Champion of the Wilds, Teferi, Time Raveler's +1). Engine functions (sim.js): loyaltyState / useLoyalty with the
// active player, chainVeilState / useChainVeil, instantSpeedFor; the page lists (decide.js): instants, otherTurnWalkers, loyaltyQuestion.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DIR = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const load = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', n + '-loaded.json'), 'utf8'));
const SF = load('loyalty-program'), ZA = load('zul-ashur');
const EXTRA = ['Leyline of Anticipation', 'Vedalken Orrery', 'Shimmer Myr', 'Vivien, Champion of the Wilds', 'Vorinclex, Monstrous Raider'];
const cards = SF.cards.concat(EXTRA.filter(n => !SF.cards.some(c => c.name === n)).map(find));
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
const toHand = (g, n) => { const i = { iid: g.nextIid++, card: card(g, n) }; g.hand.push(i); return i; };
const lands = (g, n, b) => { for (let k = 0; k < n; k++) putOn(g, card(g, b || 'Plains')); };

// ---- counter doubling on loyalty
{ const p = duel(), a = p.games[0]; putOn(a, card(a, 'Doubling Season')); const e = putOn(a, card(a, "Elspeth, Sun's Champion"));
  check("Doubling Season: Elspeth, Sun's Champion enters with twice her loyalty (8)", e.loyalty === 8, e.loyalty);
  G.useLoyalty(a, e, 0);
  check('...and her +1 puts two loyalty counters on her (10)', e.loyalty === 10, e.loyalty);
  a.turn++; const before = e.loyalty; G.useLoyalty(a, e, 1);
  check('...a minus cost is not doubled: −3 takes three (7)', e.loyalty === before - 3, e.loyalty); }
{ const p = duel(), a = p.games[0]; const e = putOn(a, card(a, "Elspeth, Sun's Champion"));
  check('without Doubling Season: loyalty 4, then 5 after +1', e.loyalty === 4 && (G.useLoyalty(a, e, 0), e.loyalty === 5), e.loyalty); }
{ const p = duel(), a = p.games[0]; putOn(a, card(a, 'Vorinclex, Monstrous Raider')); const e = putOn(a, card(a, "Elspeth, Sun's Champion"));
  check('Vorinclex, Monstrous Raider: enters with twice the loyalty (8), +1 gives two (10)', e.loyalty === 8 && (G.useLoyalty(a, e, 0), e.loyalty === 10), e.loyalty); }

// ---- The Chain Veil
{ const p = duel(), a = p.games[0]; const v = putOn(a, card(a, 'The Chain Veil')), e = putOn(a, card(a, "Elspeth, Sun's Champion"));
  check('The Chain Veil without {4}: it says so ("needs {4} besides itself")', G.chainVeilState(a, v) === 'needs {4} besides itself', G.chainVeilState(a, v));
  lands(a, 4);
  check('...with four untapped lands it can be activated', G.chainVeilState(a, v) === null);
  G.useLoyalty(a, e, 0);
  check('...Elspeth used her +1 once: "already used this turn"', G.loyaltyState(a, e).why === 'already used this turn');
  const ev = G.useChainVeil(a, v);
  check('activating it: the Veil and four lands are tapped, and every planeswalker may activate again', !!ev && v.tapped && a.battlefield.filter(q => q.card.a.isLand && q.tapped).length === 4 && G.loyaltyState(a, e).list[0].ok && /may activate again/.test(ev.map(x => x.text).join(' ')));
  G.useLoyalty(a, e, 0);
  check('...Elspeth activates a second time (loyalty 6), then is done', e.loyalty === 6 && G.loyaltyState(a, e).why === 'used 2 times this turn', e.loyalty);
  check('...and the Veil cannot be used again this turn', G.chainVeilState(a, v) === 'it is tapped' && (v.tapped = false, G.chainVeilState(a, v) === 'already used this turn')); }
{ const p = duel(), a = p.games[0]; const v = putOn(a, card(a, 'The Chain Veil')), e = putOn(a, card(a, "Elspeth, Sun's Champion")); lands(a, 4); G.useLoyalty(a, e, 0);
  a.skipLoyalty = true; const ev = G.useAbilities(a); a.skipLoyalty = false;
  check('a person\'s "Use abilities" does not activate The Chain Veil for them', !v.tapped && !ev.some(x => /may activate again/.test(x.text || ''))); }

// ---- Teferi, Master of Time on other players' turns
{ const p = duel(), [a, b] = p.games; const t = putOn(a, card(a, 'Teferi, Master of Time'));
  const mine = G.loyaltyState(a, t);
  check('Teferi, Master of Time in a match: once on your own turn', mine.allowed === 1, mine.allowed);
  const st = G.loyaltyState(a, t, b);
  check("...and once on the other player's turn (+1 and −3 offered, −10 needs 10 loyalty)", st.allowed === 1 && !st.why && st.other && st.list[0].ok && st.list[1].ok && !st.list[2].ok, [st.allowed, st.why, st.list.map(x => x.ok).join()].join(' | '));
  G.useLoyalty(a, t, 0);
  check("...using it on your turn leaves the other player's turn free", G.loyaltyState(a, t).why === 'already used this turn' && !G.loyaltyState(a, t, b).why);
  a.library.push({ iid: a.nextIid++, card: card(a, 'Plains') });
  const l0 = t.loyalty, ev = G.useLoyalty(a, t, 0, b);
  check("...on the other player's turn: +1 (draw, then discard), loyalty up by one", !!ev && t.loyalty === l0 + 1, t.loyalty);
  check("...then not again that turn", G.loyaltyState(a, t, b).why === 'already used this turn' && G.useLoyalty(a, t, 0, b) === null);
  b.turn++;
  check("...the other player's next turn: again", !G.loyaltyState(a, t, b).why); }
{ const p = duel(), [a, b] = p.games; const e = putOn(a, card(a, "Elspeth, Sun's Champion"));
  const st = G.loyaltyState(a, e, b);
  check("any other planeswalker on the other player's turn: \"only on your own turn\"", st.why === 'only on your own turn' && st.list.every(x => !x.ok) && D.otherTurnWalkers(a, b).length === 0, st.why); }
{ const p = duel(), [a, b] = p.games; const t = putOn(a, card(a, 'Teferi, Master of Time'));
  check('decide.js otherTurnWalkers lists Teferi for the other player\'s turn', D.otherTurnWalkers(a, b).length === 1);
  D.seat(a); const q = D.loyaltyQuestion(a, t, b);
  check("the menu on the other player's turn says so", !!q && /on another player's turn, once each turn/.test(q.text), q && q.text); }
{ const p = duel(), [a, b] = p.games; const t = putOn(a, card(a, 'Teferi, Master of Time')); const l0 = t.loyalty;
  const ev = []; G.instantWindow(a, ev, 'end');
  check("the autopilot uses Teferi at the other player's end step", t.loyalty === l0 + 1 && ev.some(x => /activates a loyalty ability/.test(x.text || '')), ev.map(x => x.text).filter(Boolean).join(' | '));
  const ev2 = []; G.instantWindow(a, ev2, 'end');
  check('...only once that turn', !ev2.some(x => /activates a loyalty ability/.test(x.text || ''))); }
{ const p = duel(true), [a] = p.games; const t = putOn(a, card(a, 'Teferi, Master of Time')); const l0 = t.loyalty;
  const run = gs => { const ev = []; G.instantWindow(gs[0], ev, 'end'); return ev; };
  const r = AT(p.games, 0, run, []);
  check("...a person is asked, with the autopilot's activation as the default (\"End of the other player's turn: Teferi, Master of Time may activate a loyalty ability: respond?\")", !r.done && r.ask.kind === 'protect' && /^End of the other player's turn: Teferi, Master of Time may activate a loyalty ability: respond\?$/.test(r.ask.title) && r.ask.def.length === 1, r.ask && r.ask.title);
  AT(p.games, 0, run, [{ sig: r.ask.sig, pick: 'none' }]);
  check('..."Not now": Teferi is left for the page (click him in the end-of-turn stop)', t.loyalty === l0 && !G.loyaltyState(a, t, a.opp).why); }
{ const p = duel(true), [a] = p.games; const t = putOn(a, card(a, 'Teferi, Master of Time')); const l0 = t.loyalty;
  G.instantWindow(a, [], 'end');          // "Autopilot decides": nothing is asked, the default is taken
  check('...with "Autopilot decides" it is the autopilot\'s game: Teferi activates', t.loyalty === l0 + 1); }
{ const d = G.buildDeck(cards, SF.tokens), g = G.newGame(d, O, 3); g.hand = []; g.battlefield = []; const t = putOn(g, d.unique.find(c => c.name === 'Teferi, Master of Time'));
  check('goldfish (no other player): Teferi activates twice on your own turn, as before', !g.opp && G.loyaltyState(g, t).allowed === 2); }

// ---- spells cast as though they had flash
{ const p = duel(), a = p.games[0]; const sorc = toHand(a, 'Demonic Tutor'), crea = toHand(a, 'Eternal Witness'), art = toHand(a, 'Sol Ring'), ench = toHand(a, 'Rhystic Study');
  const fl = () => [sorc, crea, art, ench].map(i => G.instantSpeedFor(a, i.card) ? 1 : 0).join('');
  check('no enabler: a sorcery, a creature, an artifact and an enchantment are not instant speed', fl() === '0000', fl());
  const ly = putOn(a, card(a, 'Leyline of Anticipation'));
  check('Leyline of Anticipation: every spell has flash', fl() === '1111', fl()); a.battlefield.splice(a.battlefield.indexOf(ly), 1);
  const vo = putOn(a, card(a, 'Vedalken Orrery'));
  check('Vedalken Orrery: every spell has flash', fl() === '1111', fl()); a.battlefield.splice(a.battlefield.indexOf(vo), 1);
  const sm = putOn(a, card(a, 'Shimmer Myr'));
  check('Shimmer Myr: artifact spells only (Sol Ring)', fl() === '0010', fl()); a.battlefield.splice(a.battlefield.indexOf(sm), 1);
  const vv = putOn(a, card(a, 'Vivien, Champion of the Wilds'));
  check('Vivien, Champion of the Wilds: creature spells only (Eternal Witness)', fl() === '0100', fl()); a.battlefield.splice(a.battlefield.indexOf(vv), 1);
  const land = toHand(a, 'Plains'); putOn(a, card(a, 'Leyline of Anticipation'));
  check('...a land is never cast, so never "instant speed"', !G.instantSpeedFor(a, land.card)); }
{ const p = duel(), [a, b] = p.games; const t = putOn(a, card(a, 'Teferi, Time Raveler')), sorc = toHand(a, 'Demonic Tutor');
  const i = G.loyaltyState(a, t).list.findIndex(x => x.label === '+1');
  G.useLoyalty(a, t, i);
  check('Teferi, Time Raveler +1: sorceries have flash until your next turn', G.instantSpeedFor(a, sorc.card) && !G.instantSpeedFor(a, toHand(a, 'Eternal Witness').card));
  check('...so on the other player\'s turn Demonic Tutor is offered (decide.js instants, with the mana)', (lands(a, 2, 'Swamp'), D.instants(a).includes(sorc)));
  a.turn++;
  check('...and on your next turn it ends', !G.instantSpeedFor(a, sorc.card)); }
{ const p = duel(true), [a] = p.games; putOn(a, card(a, 'Leyline of Anticipation')); lands(a, 3, 'Forest'); const w = toHand(a, 'Eternal Witness');
  const run = gs => { const ev = []; G.instantWindow(gs[0], ev, 'end'); return ev; };
  const r = AT(p.games, 0, run, []);
  check("a person is asked at the other player's end step, and the flashed creature is offered (Leyline of Anticipation, Eternal Witness)", !r.done && (r.ask.kind === 'instant' || r.ask.kind === 'priority') && r.ask.options.some(o => o.iid === w.iid), r.ask && r.ask.options.map(o => o.name).join(', '));
  AT(p.games, 0, run, [{ sig: r.ask.sig, pick: r.ask.options.findIndex(o => o.iid === w.iid) }]);
  check('...choosing it casts it', !a.hand.includes(w) && a.battlefield.some(q => q.card.name === 'Eternal Witness')); }
{ const r = G.podMonteCarlo([{ cards, tokens: SF.tokens, name: 'a' }, { cards: ZA.cards, tokens: ZA.tokens, name: 'b' }], O, 30, 7);
  check('thirty duels with these cards: no engine error', r.errors === 0, r.firstError); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
