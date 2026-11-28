// Chandra, Torch of Defiance (KLD, Teach issue #205): +1 exile the top card, you may cast it, if you don't 2 damage to each opponent; +1 add {R}{R}; -3 4 damage to target creature;
// -7 emblem: whenever you cast a spell, it deals 5 damage to any target.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Chandra, Torch of Defiance', 'Llanowar Elves', 'Serra Angel', 'Shivan Dragon', 'Lightning Bolt', 'Oko, Thief of Crowns', 'Forest', 'Plains', 'Mountain'];
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

const CH = 'Chandra, Torch of Defiance';
const ab = (cost, n) => by(CH).a.pwAbilities.filter(a => a.cost === cost)[n || 0];
const act = (g, p, cost, n, ev) => G.activateLoyalty(g, p, ab(cost, n), ev || [], false);
const top = (g, n) => { g.library.unshift(inst(g, n)); return g.library[0]; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) putOn(g, name || 'Mountain'); };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };

T('every line reads ok (the -3 is an opponent-only line: neutral in a solo game, played in matches) and has a rule', () => {
  const c = by(CH), st = c.a.coverage.map(r => r.status);
  check('+1 chandraExile, +1 mana, -3 burnCreature, -7 castEmblem; nothing ignored', st.every(x => x === 'ok' || x === 'neutral') && ab(1, 0).fx[0].type === 'chandraExile' && ab(1, 1).fx[0].type === 'mana' && ab(-3).fx[0].type === 'burnCreature' && ab(-7).fx[0].type === 'castEmblem', JSON.stringify(st));
  check('only the -3 (needs a creature of theirs) is neutral, tagged opp', c.a.coverage.filter(r => r.status === 'neutral').length === 1 && c.a.coverage[2].tag === 'opp');
});

T('+1 (exile): a castable card is exiled and cast, paying its costs', () => {
  const g = bare(); const ch = putOn(g, CH); lands(g, 6); const t = top(g, 'Shivan Dragon'); const ev = [];
  act(g, ch, 1, 0, ev);
  check('Shivan Dragon is on the battlefield, cast from the exile, not in hand/library/exile', g.battlefield.some(q => q.card.name === 'Shivan Dragon') && !g.hand.includes(t) && !g.library.includes(t) && !g.exile.includes(t));
  check('its mana cost was paid (six lands tapped)', g.battlefield.filter(q => q.asLand && q.tapped).length === 6);
  check('no damage was dealt, loyalty 4 -> 5, and the log names the card', (g.damage || 0) === 0 && ch.loyalty === 5 && ev.some(e => e.type === 'note' && /exiles Shivan Dragon and casts it/.test(e.text)));
});

T('+1 (exile): a card that cannot be paid for stays exiled and Chandra deals 2 damage to each opponent', () => {
  const g = bare(); const ch = putOn(g, CH); lands(g, 1); const t = top(g, 'Shivan Dragon'); const ev = [], d0 = g.damage;
  act(g, ch, 1, 0, ev);
  check('exiled, not cast, 2 damage', g.exile.includes(t) && !g.battlefield.some(q => q.card.name === 'Shivan Dragon') && g.damage - d0 === 2, g.damage - d0);
  check('the log says why', ev.some(e => e.type === 'note' && /Shivan Dragon/.test(e.text) && /pay/.test(e.text) && /2 damage/.test(e.text)), JSON.stringify(ev.filter(e => e.type === 'note').map(e => e.text)));
  const h = bare(); const c2 = putOn(h, CH); const l = top(h, 'Mountain'); const d1 = h.damage; act(h, c2, 1, 0);
  check('a land card cannot be cast: exiled, 2 damage', h.exile.includes(l) && h.damage - d1 === 2);
});

T('+1 (exile): the exiled card is gone from the library, an empty library still deals the damage', () => {
  const g = bare(); const ch = putOn(g, CH); g.library = []; const d0 = g.damage; act(g, ch, 1, 0);
  check('2 damage with nothing to exile', g.damage - d0 === 2);
});

T('+1 (exile): a person chooses; Cast is greyed with the reason when it cannot be cast', () => {
  const g = bare(); const ch = putOn(g, CH); lands(g, 6); const t = top(g, 'Shivan Dragon');
  const qs = seated(g, d => d.kind === 'may' ? 'no' : undefined, () => act(g, ch, 1, 0));
  const q = qs.find(x => x.d.kind === 'may');
  check('a question names the card, with Cast and Don\'t cast: 2 damage', q && /Shivan Dragon/.test(q.d.title) && /Cast Shivan Dragon/.test(q.d.yes) && /2 damage to each opponent/.test(q.d.no));
  check('declining: 2 damage, the card stays exiled', g.damage === 2 && g.exile.includes(t));
  const h = bare(); const c2 = putOn(h, CH); lands(h, 1); top(h, 'Shivan Dragon');
  const qs2 = seated(h, d => d.kind === 'may' ? 'yes' : undefined, () => act(h, c2, 1, 0));
  const q2 = qs2.find(x => x.d.kind === 'may');
  check('cannot pay: the Cast option is disabled with a reason, and choosing it anyway does not cast', q2 && q2.q.options.find(o => /Cast/.test(o.name)).disabled === true && /pay/.test(q2.q.options.find(o => /Cast/.test(o.name)).note) && h.damage === 2 && !h.battlefield.some(q => q.card.name === 'Shivan Dragon'), q2 && JSON.stringify(q2.q.options.map(o => [o.name, o.disabled, o.note])));
  const k = bare(), k2 = bare(); const ck = putOn(k, CH), ck2 = putOn(k2, CH); lands(k, 6); lands(k2, 6); top(k, 'Shivan Dragon'); top(k2, 'Shivan Dragon');
  act(k, ck, 1, 0); seated(k2, null, () => act(k2, ck2, 1, 0));
  check('with every default taken the person plays the autopilot\'s choice', k.battlefield.map(q => q.card.name).join() === k2.battlefield.map(q => q.card.name).join() && k.damage === k2.damage);
});

T('+1 (mana): adds {R}{R}', () => {
  const g = bare(); const ch = putOn(g, CH); act(g, ch, 1, 1);
  check('two red mana are floating and loyalty rises', g.floating.length === 2 && g.floating.every(u => u.colors.has('R')) && ch.loyalty === 5, g.floating.length);
});

T('-3: 4 damage to target creature (chosen by a person, a creature of the opponent)', () => {
  const [g, b] = match2(); const ch = putOn(g, CH); const ang = putOn(b, 'Serra Angel'), elf = putOn(b, 'Llanowar Elves'); ch.loyalty = 4;
  const qs = seated(g, d => d.kind === 'target' ? ang : undefined, () => act(g, ch, -3));
  check('a target question lists the creatures; Serra Angel (toughness 4) dies', qs.some(x => x.d.kind === 'target') && !b.battlefield.includes(ang) && b.battlefield.includes(elf));
  check('Chandra lost 3 loyalty (4 -> 1)', ch.loyalty === 1, ch.loyalty);
  const [h, c] = match2(); const c2 = putOn(h, CH), big = putOn(c, 'Shivan Dragon'), small = putOn(c, 'Llanowar Elves'); act(h, c2, -3);
  check('the autopilot kills a creature 4 damage can kill (the Elves; the 5/5 Dragon survives)', !c.battlefield.includes(small) && c.battlefield.includes(big));
});

T('-7: the emblem deals 5 damage to any target whenever you cast a spell', () => {
  const [g, b] = match2(); const ch = putOn(g, CH); ch.loyalty = 7; act(g, ch, -7);
  check('Chandra is gone and there is an emblem', !g.battlefield.includes(ch) && g.castEmblems && g.castEmblems.length === 1);
  lands(g, 2, 'Forest'); const foe = putOn(b, 'Serra Angel'); g.hand.push(inst(g, 'Llanowar Elves'));
  const l0 = b.life; G.castCard(g, g.hand[0]);
  check('casting a spell: 5 damage to the Angel (it dies) or to the opponent', !b.battlefield.includes(foe) || b.life < l0, b.life);
  const [h, c] = match2(); h.castEmblems = [{ n: 5 }]; lands(h, 4); h.hand.push(inst(h, 'Lightning Bolt')); const l1 = c.life; G.castCard(h, h.hand[0]);
  check('an instant counts too (the emblem triggers on every spell): the opponent takes 5 plus the Bolt\'s 3', l1 - c.life >= 5, l1 - c.life);
  const k = bare(); k.castEmblems = [{ n: 5 }, { n: 5 }]; lands(k, 2, 'Forest'); k.hand.push(inst(k, 'Llanowar Elves')); const d0 = k.damage; G.castCard(k, k.hand[0]);
  check('two emblems: two triggers (10 damage in a goldfish game)', k.damage - d0 === 10, k.damage - d0);
});

T('the autopilot plays whole games without errors', () => { let ok = true, msg = ''; try { G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); } catch (e) { ok = false; msg = String(e.stack).split('\n').slice(0, 2).join(' | '); } check('sixty games with these cards run clean', ok, msg); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
