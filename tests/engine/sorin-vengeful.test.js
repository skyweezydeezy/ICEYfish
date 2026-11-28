// Sorin, Vengeful Bloodlord (Teach: Blood Bank deck): "During your turn, creatures and planeswalkers you control have lifelink." and
// "-X: Return target creature card with mana value X from your graveyard to the battlefield. That creature is a Vampire in addition to its other types."
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Sorin, Vengeful Bloodlord', 'Serra Angel', 'Shivan Dragon', 'Llanowar Elves', 'Edgar Markov', 'Mountain', 'Swamp'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const isVamp = p => /\bVampire\b/.test(p.card.type_line || '');
const abIdx = (re) => by('Sorin, Vengeful Bloodlord').a.pwAbilities.findIndex(a => re.test(a.text));

T('every line reads ok', () => {
  const c = by('Sorin, Vengeful Bloodlord'), bad = c.a.coverage.filter(r => r.status !== 'ok' && r.status !== 'neutral');
  check('no line left unread', !bad.length && c.a.coverage.length === 3, JSON.stringify(c.a.coverage.map(r => r.status)));
});

T('lifelink during your turn, creatures and planeswalkers', () => {
  const g = bare(); const s = putOn(g, 'Sorin, Vengeful Bloodlord'), ang = putOn(g, 'Serra Angel'), pw2 = s;
  g.activeTurn = true;
  check('your creature has lifelink on your turn', G.hasKw(g, ang, 'lifelink'));
  check('your planeswalker has lifelink on your turn', G.hasKw(g, pw2, 'lifelink'));
  g.activeTurn = false;
  check('no lifelink on the other player\'s turn', !G.hasKw(g, ang, 'lifelink') && !G.hasKw(g, pw2, 'lifelink'));
  const g2 = bare(); const ang2 = putOn(g2, 'Serra Angel'); g2.activeTurn = true;
  check('without Sorin: no lifelink', !G.hasKw(g2, ang2, 'lifelink'));
});

T('Sorin +2 damage gains life with the lifelink he gives himself', () => {
  const g = bare(); g.life = 20; const s = putOn(g, 'Sorin, Vengeful Bloodlord'); g.activeTurn = true; s.loyalty = 4;
  const i = abIdx(/^\+2/); const l0 = g.life, d0 = g.damage;
  G.activateLoyalty(g, s, s.card.a.pwAbilities[i], [], false);
  check('the damage is dealt and 1 life is gained', g.damage - d0 === 1 && g.life === l0 + 1, (g.damage - d0) + ' / ' + (g.life - l0));
});

T('-X returns a creature with mana value X, removes X loyalty, and it is a Vampire', () => {
  const g = bare(); const s = putOn(g, 'Sorin, Vengeful Bloodlord'); g.activeTurn = true; s.loyalty = 6;
  g.graveyard = [inst(g, 'Serra Angel'), inst(g, 'Llanowar Elves')];
  const i = abIdx(/^[−-]X/);
  const ev = []; G.activateLoyalty(g, s, s.card.a.pwAbilities[i], ev, false);
  const ang = g.battlefield.find(q => q.card.name === 'Serra Angel');
  check('Serra Angel (mana value 5) returned', !!ang && !g.graveyard.some(x => x.card.name === 'Serra Angel'));
  check('Sorin lost X = 5 loyalty (6 -> 1)', s.loyalty === 1, s.loyalty);
  check('it is a Vampire in addition to its other types', !!ang && isVamp(ang) && /Angel/.test(ang.card.type_line), ang && ang.card.type_line);
  check('the creature card keeps its own types in the graveyard (dies as an Angel only)', (() => { G.leavePerm(g, ang, []); G.flushLeaves(g, []); const y = g.graveyard.find(x => x.card.name === 'Serra Angel'); return !!y && !/Vampire/.test(y.card.type_line); })());
});

T('-X cannot reach a card its loyalty cannot pay for', () => {
  const g = bare(); const s = putOn(g, 'Sorin, Vengeful Bloodlord'); g.activeTurn = true; s.loyalty = 3;
  g.graveyard = [inst(g, 'Serra Angel')];
  const st = G.loyaltyState(g, s, true), it = st.list.find(x => x.x);
  check('the menu says there is nothing the loyalty can pay for', it && !it.ok && /loyalty can pay/.test(it.why || ''), it && it.why);
  G.activateLoyalty(g, s, s.card.a.pwAbilities[abIdx(/^[−-]X/)], [], false);
  check('nothing returns and no loyalty is lost', !g.battlefield.some(q => q.card.name === 'Serra Angel') && s.loyalty === 3, s.loyalty);
});

T('a person chooses the card; the default is the autopilot\'s pick', () => {
  const g = bare(); const s = putOn(g, 'Sorin, Vengeful Bloodlord'); g.activeTurn = true; s.loyalty = 6;
  g.graveyard = [inst(g, 'Serra Angel'), inst(g, 'Llanowar Elves')];
  let def = null;
  const qs = seated(g, d => { if (d.kind === 'target' && d.what === 'graveyard') { def = d.def; return d.options.find(o => o.card.name === 'Llanowar Elves'); } }, () => G.activateLoyalty(g, s, s.card.a.pwAbilities[abIdx(/^[−-]X/)], [], false));
  check('a graveyard question lists both creature cards', qs.some(x => x.d.what === 'graveyard' && x.d.options.length === 2));
  check('the default is the autopilot\'s pick (Serra Angel)', def && def.card.name === 'Serra Angel', def && def.card.name);
  check('choosing Llanowar Elves (mana value 1) costs 1 loyalty, and it is a Vampire', s.loyalty === 5 && g.battlefield.some(q => q.card.name === 'Llanowar Elves' && isVamp(q)), s.loyalty);
});

T('the autopilot plays whole games without errors, with Sorin and creatures in the graveyard', () => {
  let ok = true, msg = '';
  for (let seed = 1; seed <= 60; seed++) { try { const g = G.newGame(deck, O, seed); G.simulate(deck, O, 1, seed); } catch (e) { ok = false; msg = String(e && e.stack || e).split('\n').slice(0, 2).join(' | '); break; } }
  check('60 games run', ok, msg);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
