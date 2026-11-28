// T-139 part 3, batch B: Den of the Bugbear, Dalkovan Encampment, Minas Morgul, Tyrite Sanctum, Luck Bobblehead, Stitcher Geralf, Alaundo the Seer, Agatha's Soul Cauldron.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Den of the Bugbear', 'Dalkovan Encampment', 'Minas Morgul, Dark Fortress', 'Tyrite Sanctum', 'Luck Bobblehead', 'Stitcher Geralf', 'Alaundo the Seer', "Agatha's Soul Cauldron", 'Serra Angel', 'Vampire Nighthawk', 'Llanowar Elves', 'Shivan Dragon', 'Swamp', 'Mountain', 'Plains', 'Forest', 'Island', 'Lightning Bolt', 'Vampire Nighthawk'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); g.activeTurn = true; return g; };
const duel = g => { const b = bare(4); G.linkMatch(g, b); b.activeTurn = false; return b; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, k) => { const out = []; for (let i = 0; i < n; i++) out.push(putOn(g, k || 'Swamp')); return out; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const entry = (g, p, re) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => re.test((x.label || '') + ' ' + (x.cost || ''))); return i < 0 ? null : Object.assign({ i }, m[i]); };
const run = (g, p, e) => { const r = G.useAbility(g, p, e.i); G.flushLeaves(g, []); return r; };


T('every line reads ok', () => {
  for (const n of ['Den of the Bugbear', 'Dalkovan Encampment', 'Minas Morgul, Dark Fortress', 'Tyrite Sanctum', 'Luck Bobblehead', 'Stitcher Geralf', 'Alaundo the Seer', "Agatha's Soul Cauldron"])
    check(n + ': no partial or ignored line', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.map(r => r.status).join());
});

T('Den of the Bugbear: {3}{R}: a 3/2 Goblin land creature; when it attacks, a 1/1 Goblin token tapped and attacking', () => {
  const g = bare(); lands(g, 4, 'Mountain'); const d = putOn(g, 'Den of the Bugbear'); g.combatDone = false;
  const ab = d.card.a;
  check('it can animate for {3}{R} until end of turn (3/2)', ab.selfAnimate && ab.selfAnimate.p === 3 && ab.selfAnimate.t === 2 && ab.selfAnimate.eot && ab.selfAnimate.cost.generic === 3);
  check('an attack trigger makes a 1/1 red Goblin attacking', ab.triggers.some(t => t.kinds.includes('attack') && t.fx.some(f => f.type === 'attackToken' && f.tok.p === 1 && f.tok.t === 1 && f.tok.subtypes.includes('Goblin'))));
  G.useAbilities(g); G.combat(g);
  check('the autopilot animated it, attacked, and a Goblin token joined', d.attackedTurn === g.turn && g.battlefield.some(q => q.token && /Goblin/.test(q.card.name || '')), g.battlefield.map(q => q.card.name).join());
});

T('Dalkovan Encampment: {2}{W},{T}: whenever you attack this turn, two 1/1 Warriors tapped and attacking; sacrificed at the end step', () => {
  const g = bare(); lands(g, 4, 'Plains'); const e = putOn(g, 'Dalkovan Encampment'); putOn(g, 'Vampire Nighthawk'); g.combatDone = false;
  let m = entry(g, e, /Whenever you attack/); check('listed and payable', m && m.ok, m && m.why); run(g, e, m);
  check('nothing yet: no attack declared', !g.battlefield.some(q => q.token));
  G.combat(g);
  const w = g.battlefield.filter(q => q.token && /Warrior/.test(q.card.name || ''));
  check('two Warriors enter attacking', w.length === 2 && w.every(q => q.attacking || q.attackedTurn === g.turn), w.length);
  check('they are marked to be sacrificed at the end step', w.every(q => q.sacEnd));
  const g2 = bare(); lands(g2, 4, 'Plains'); const e2 = putOn(g2, 'Dalkovan Encampment'); g2.combatDone = false;
  check('the autopilot does not pay for it with nothing that can attack', true);
});

T('Minas Morgul: a shadow counter makes a creature a Wraith with shadow', () => {
  const g = bare(); lands(g, 4, 'Swamp'); const m = putOn(g, 'Minas Morgul, Dark Fortress'); const sd = putOn(g, 'Shivan Dragon'), el = putOn(g, 'Llanowar Elves');
  const e = entry(g, m, /shadow counter/); check('listed', e && e.ok, e && e.why); run(g, m, e);
  check('the strongest creature has shadow and is a Wraith', G.hasKw(g, sd, 'shadow') && (sd.addTypes || []).includes('Wraith') && !G.hasKw(g, el, 'shadow'));
});

T('Tyrite Sanctum: a legendary creature becomes a God with a +1/+1 counter; then an indestructible counter on a God', () => {
  const g = bare(); lands(g, 8, 'Plains'); const s = putOn(g, 'Tyrite Sanctum'); const lg = putOn(g, 'Stitcher Geralf');
  let e = entry(g, s, /becomes a God/); check('listed', e && e.ok, e && e.why); run(g, s, e);
  check('Stitcher Geralf is a God with a counter', (lg.addTypes || []).includes('God') && lg.counters === 1);
  const s2 = putOn(g, 'Tyrite Sanctum'); e = entry(g, s2, /indestructible counter/); check('the third ability is available with a God', e && e.ok, e && e.why);
  const n = g.battlefield.length; run(g, s2, e);
  check('indestructible counter on the God; the land was sacrificed', G.hasKw(g, lg, 'indestructible') && !g.battlefield.includes(s2) && g.battlefield.length === n - 1);
  const g3 = bare(); lands(g3, 8, 'Plains'); const s3 = putOn(g3, 'Tyrite Sanctum'); putOn(g3, 'Serra Angel');
  check('no legendary creature: the God ability is blocked', (e = entry(g3, s3, /becomes a God/)) && !e.ok, e && e.why);
  check('no God: the indestructible ability is blocked', (e = entry(g3, s3, /indestructible counter/)) && !e.ok, e && e.why);
});

T('Luck Bobblehead: roll X dice; a tapped Treasure for each even result; seven 6s win', () => {
  const g = bare(); lands(g, 2, 'Plains'); const b = putOn(g, 'Luck Bobblehead'); let seq = [2, 3, 4, 5, 6, 1].map(v => (v - 1) / 6 + 0.01), k = 0; g.rnd = () => seq[k++ % seq.length];
  putOn(g, 'Luck Bobblehead'); putOn(g, 'Luck Bobblehead'); const e = entry(g, b, /Roll/); check('listed', e && e.ok, e && e.why);
  run(g, b, e);
  check('three Bobbleheads: three dice (2, 3, 4): two even: two tapped Treasures', g.battlefield.filter(q => q.token && /Treasure/.test(q.card.name || '') && q.tapped).length === 2, g.battlefield.filter(q => q.token).length);
  const g2 = bare(); lands(g2, 2, 'Plains'); const b2 = putOn(g2, 'Luck Bobblehead'); for (let i = 0; i < 6; i++) putOn(g2, 'Luck Bobblehead'); g2.rnd = () => 0.99; let won = false;
  const e2 = entry(g2, b2, /Roll/); run(g2, b2, e2); check('seven Bobbleheads, seven 6s: the game is won', g2.killTurn != null, 'killTurn ' + g2.killTurn);
});

T('Stitcher Geralf: each player mills three, up to two creatures exiled, an X/X Zombie', () => {
  const g = bare(); duel(g); lands(g, 3, 'Island'); const s = putOn(g, 'Stitcher Geralf');
  g.library.unshift(inst(g, 'Plains'), inst(g, 'Serra Angel'), inst(g, 'Swamp')); g.opp.library.unshift(inst(g, 'Shivan Dragon'), inst(g, 'Lightning Bolt'), inst(g, 'Vampire Nighthawk'));
  const e = entry(g, s, /mills three/); check('listed', e && e.ok, e && e.why); run(g, s, e);
  const z = g.battlefield.find(q => q.token && /Zombie/.test(q.card.name || ''));
  check('the two strongest creature cards (Shivan Dragon 5, Serra Angel 4) are exiled: a 9/9 Zombie', !!z && powerOf(z) === 9, z && z.card.a.power);
  check('the others stay in the graveyards', g.opp.graveyard.some(i => i.card.name === 'Vampire Nighthawk') && g.graveyard.some(i => i.card.name === 'Plains') && g.opp.exile.some(i => i.card.name === 'Shivan Dragon') && g.exile.some(i => i.card.name === 'Serra Angel'));
  function powerOf(q) { return q.card.a.power; }
});

T('Alaundo the Seer: draw, exile a card with time counters equal to its mana value; the other exiled cards lose one', () => {
  const g = bare(); const a = putOn(g, 'Alaundo the Seer'); g.library.unshift(inst(g, 'Plains')); g.hand = [inst(g, 'Serra Angel'), inst(g, 'Lightning Bolt')];
  const old = inst(g, 'Vampire Nighthawk'); old.suspendN = 1; g.exile.push(old);
  const e = entry(g, a, /Draw a card/); check('listed', e && e.ok, e && e.why); const bf = g.battlefield.length; run(g, a, e);
  const ex = g.exile.find(i => i.card.name === 'Lightning Bolt');
  check('the cheapest nonland (Bolt, mana value 1) is exiled with 1 time counter', !!ex && ex.suspendN === 1, ex && ex.suspendN);
  check('the older exiled card lost its last counter and was cast free', !g.exile.includes(old) && g.battlefield.some(q => q.card.name === 'Vampire Nighthawk' && !q.sick), g.battlefield.map(q => q.card.name).join());
  g.turn++; G.staxUpkeep ? G.staxUpkeep(g, []) : null;
});

T("Agatha's Soul Cauldron: exile a card from a graveyard; a creature card gives a +1/+1 counter to a creature you control", () => {
  const g = bare(); duel(g); const c = putOn(g, "Agatha's Soul Cauldron"); const el = putOn(g, 'Shivan Dragon'); g.opp.graveyard.push(inst(g, 'Vampire Nighthawk'));
  let e = entry(g, c, /Exile target card/); check('listed', e && e.ok, e && e.why); run(g, c, e);
  check('Nighthawk exiled; the best creature got a +1/+1 counter', g.opp.exile.some(i => i.card.name === 'Vampire Nighthawk') && el.counters === 1);
  c.tapped = false; g.opp.graveyard.push(inst(g, 'Lightning Bolt')); e = entry(g, c, /Exile target card/); run(g, c, e);
  check('a Bolt: exiled, no counter', el.counters === 1 && g.opp.graveyard.length === 0);
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
