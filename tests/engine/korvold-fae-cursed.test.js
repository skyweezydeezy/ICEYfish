// Korvold, Fae-Cursed King (Teach request from MAIN 4): Flying; "Whenever Korvold enters or attacks, sacrifice another permanent."; "Whenever you sacrifice a permanent,
// put a +1/+1 counter on Korvold and draw a card." Every sacrifice goes through sacEvent (sacPerm): costs, outlets, fetch lands, edicts, upkeep costs.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Korvold, Fae-Cursed King', 'Llanowar Elves', 'Serra Angel', 'Evolving Wilds', "Ashnod's Altar", 'Forest', 'Swamp', 'Mountain', 'Sol Ring', 'Viscera Seer'];
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
const K = 'Korvold, Fae-Cursed King';

T('every line reads ok', () => {
  const c = by(K), st = c.a.coverage.map(r => r.status);
  check('Flying, the sacrifice trigger and the payoff are all ok (no approx, no neutral)', st.length === 3 && st.every(x => x === 'ok'), JSON.stringify(st));
  check('the sacrifice trigger is on enter and attack, the payoff is an anySac trigger', c.a.triggers.some(t => t.kinds.includes('etb') && t.kinds.includes('attack') && t.fx[0].type === 'sacAnother') && c.a.triggers.some(t => t.kinds.includes('anySac')));
});

T('enters: sacrifices another permanent, then a +1/+1 counter and a card', () => {
  const g = bare(); const elf = putOn(g, 'Llanowar Elves'); g.library.unshift(inst(g, 'Serra Angel')); const h0 = g.hand.length, ev = [];
  const k = G.enterWithTriggers(g, inst(g, K), {}, ev); G.flushLeaves(g, ev); G.resolveTriggers && G.resolveTriggers(g, ev);
  check('the Elves were sacrificed (Korvold was not)', !g.battlefield.includes(elf) && g.battlefield.includes(k) && g.graveyard.some(i => i.card.name === 'Llanowar Elves'));
  check('Korvold got a +1/+1 counter and the controller drew a card', (k.counters || 0) === 1 && g.hand.length === h0 + 1, (k.counters || 0) + ' counters, ' + (g.hand.length - h0) + ' cards');
});

T('enters with nothing else on the battlefield: nothing happens', () => {
  const g = bare(); const h0 = g.hand.length; const ev = []; const k = G.enterWithTriggers(g, inst(g, K), {}, ev); G.flushLeaves(g, ev);
  check('Korvold stays, no counter, no card', g.battlefield.includes(k) && !(k.counters || 0) && g.hand.length === h0);
});

T('the autopilot gives up what it needs least', () => {
  const g = bare(); putOn(g, 'Serra Angel'); const sol = putOn(g, 'Sol Ring'); const f1 = putOn(g, 'Forest'); g.library.unshift(inst(g, 'Swamp'));
  const ev = []; G.enterWithTriggers(g, inst(g, K), {}, ev); G.flushLeaves(g, ev);
  check('it did not sacrifice the Serra Angel or the Sol Ring', g.battlefield.some(q => q.card.name === 'Serra Angel') && g.battlefield.some(q => q.card.name === 'Sol Ring'), g.battlefield.map(q => q.card.name).join());
});

T('a person chooses what is sacrificed; the default is the autopilot\'s pick', () => {
  const g = bare(); const ang = putOn(g, 'Serra Angel'), elf = putOn(g, 'Llanowar Elves'); let def = null;
  const qs = seated(g, d => { if (d.kind === 'sacrifice') { def = d.def; return ang; } }, () => { const ev = []; G.enterWithTriggers(g, inst(g, K), {}, ev); G.flushLeaves(g, ev); });
  check('a question lists the other permanents only, Korvold not among them', qs.some(x => x.d.kind === 'sacrifice' && x.d.options.length === 2 && !x.d.options.some(o => o.card.name === K)));
  check('the default is the Elves, the choice (Serra Angel) is sacrificed and Korvold gets its counter', def === elf && !g.battlefield.includes(ang), def && def.card.name);
  const h = bare(), k2 = bare(); for (const x of [h, k2]) { putOn(x, 'Serra Angel'); putOn(x, 'Llanowar Elves'); putOn(x, 'Forest'); }
  G.enterWithTriggers(h, inst(h, K), {}, []); G.flushLeaves(h, []); seated(k2, null, () => { G.enterWithTriggers(k2, inst(k2, K), {}, []); G.flushLeaves(k2, []); });
  check('with every default taken: the same permanents remain', h.battlefield.map(q => q.card.name).join() === k2.battlefield.map(q => q.card.name).join());
});

T('every kind of sacrifice you make is counted', () => {
  // a sacrifice outlet (Viscera Seer) paid with another creature
  { const g = bare(); const k = putOn(g, K), vs = putOn(g, 'Viscera Seer'), elf = putOn(g, 'Llanowar Elves'); const c0 = k.counters || 0, h0 = g.hand.length; g.library.unshift(inst(g, 'Swamp'));
    const m = G.abilityMenu(g, vs), i = m.findIndex(x => /sacrifice/i.test(x.label || '')); if (i >= 0) G.useAbility(g, vs, i);
    check('Viscera Seer: sacrificing a creature gives Korvold a counter and a card', i >= 0 && (k.counters || 0) === c0 + 1 && g.hand.length === h0 + 1, i + ' / ' + (k.counters || 0)); }
  // a fetch land cracks as it enters (the engine's crackFetch)
  { const g = bare(); const k = putOn(g, K); putOn(g, 'Forest'); g.library.unshift(inst(g, 'Swamp'), inst(g, 'Mountain')); const c0 = k.counters || 0, h0 = g.hand.length;
    putOn(g, 'Evolving Wilds'); G.flushLeaves(g, []);
    check('Evolving Wilds: cracking it is a sacrifice (a counter and a card)', (k.counters || 0) === c0 + 1 && g.hand.length === h0 + 1 && !g.battlefield.some(q => q.card.name === 'Evolving Wilds'), (k.counters || 0) + ' / ' + (g.hand.length - h0)); }
  // a land sacrificed to a Dust Bowl style cost is the same code path as sacLandCost (sacPerm); an Ashnod's Altar activation too
  { const g = bare(); const k = putOn(g, K), al = putOn(g, "Ashnod's Altar"), elf = putOn(g, 'Llanowar Elves'); const c0 = k.counters || 0;
    const m = G.abilityMenu(g, al), i = m.findIndex(x => /sacrifice/i.test(x.label || '')); if (i >= 0) G.useAbility(g, al, i);
    check("Ashnod's Altar: a counter for Korvold", i >= 0 && (k.counters || 0) === c0 + 1, i + ' / ' + (k.counters || 0)); }
});

T('a sacrifice is counted once (no double trigger)', () => {
  const g = bare(); const k = putOn(g, K); putOn(g, 'Forest'); g.library.unshift(inst(g, 'Swamp')); const c0 = k.counters || 0; putOn(g, 'Evolving Wilds'); G.flushLeaves(g, []);
  check('exactly one counter for one fetch land', (k.counters || 0) - c0 === 1, (k.counters || 0) - c0);
});

T('attacks: sacrifices another permanent (an attack trigger), then the counter and the card', () => {
  const g = bare(); g.opts.oppLife = 200; const k = putOn(g, K); for (let i = 0; i < 3; i++) putOn(g, 'Forest'); const n0 = g.battlefield.length; const ev = [];
  G.combat(g, ev); G.flushLeaves(g, ev);
  check('Korvold attacked: one permanent less, a +1/+1 counter, and it is still there', g.battlefield.includes(k) && (k.counters || 0) >= 1 && g.battlefield.length < n0, (k.counters || 0) + ' counters, ' + n0 + ' -> ' + g.battlefield.length);
});

T('games run clean', () => { let ok = true, msg = ''; try { G.simulate(deck, Object.assign({}, O, { turns: 10 }), 60, 5); } catch (e) { ok = false; msg = String(e.stack).split('\n').slice(0, 2).join(' | '); } check('sixty games with Korvold, a fetch land and sacrifice outlets run clean', ok, msg); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
