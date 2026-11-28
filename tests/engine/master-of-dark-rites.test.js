// Master of Dark Rites: "{T}, Sacrifice another creature: Add {B}{B}{B}. Spend this mana only to cast Vampire, Cleric, and/or Demon spells." (CR 106.6, 605)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Master of Dark Rites', 'Vampire Nighthawk', 'Bloodline Keeper // Lord of Lineage', 'Serra Angel', 'Shivan Dragon', 'Llanowar Elves', 'Swamp', 'Mountain'];
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
const menu = (g, p) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => /Sacrifice another creature/.test(x.label || '')); if (i < 0) return undefined; return Object.assign({}, m[i], { run: ev => { const r = G.useAbility(g, p, i); (r || []).forEach(e => ev.push(e)); return r; } }); };
const bUnits = g => G.allUnits(g).filter(u => u.floating && u.restrict).length;

T('the line is built, not just read', () => {
  const a = by('Master of Dark Rites').a, r = a.coverage[0];
  check('status ok and a restricted sacrifice ability is built', r.status === 'ok' && !!a.sacRestrict && a.sacRestrict.amount === 3 && a.sacRestrict.colors.has('B') && a.sacRestrict.ts.join() === 'vampire,cleric,demon', JSON.stringify(a.sacRestrict && a.sacRestrict.ts));
});

T('menu: needs another creature, {T} and no summoning sickness', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites');
  let e = menu(g, m); check('with no other creature it is blocked', e && !e.ok && /no other creature/.test(e.why || ''), e && e.why);
  putOn(g, 'Llanowar Elves'); e = menu(g, m); check('with another creature it is available', e && e.ok, e && e.why);
  m.sick = true; e = menu(g, m); check('summoning sick: blocked', e && !e.ok && /summoning/.test(e.why || ''), e && e.why);
  m.sick = false; m.tapped = true; e = menu(g, m); check('tapped: blocked', e && !e.ok, e && e.why);
});

T('sacrificing another creature (the cost) makes {B}{B}{B} that only a Vampire, Cleric or Demon spell can use', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites'); const elf = putOn(g, 'Llanowar Elves'); g.hand = [inst(g, 'Bloodline Keeper // Lord of Lineage'), inst(g, 'Serra Angel')];
  const e = menu(g, m), ev = []; e.run(ev); G.flushLeaves(g, ev);
  check('Master tapped, the Elves sacrificed, three mana floating', m.tapped && !g.battlefield.includes(elf) && g.graveyard.some(i => i.card.name === 'Llanowar Elves') && g.floating.length === 3, g.floating.length);
  const bk = g.hand.find(i => i.card.name.startsWith('Bloodline Keeper')), sa = g.hand.find(i => i.card.name === 'Serra Angel');
  check('it can pay for a Vampire spell (Bloodline Keeper): three units for it', (g._payFor = bk, G.allUnits(g).filter(u => u.floating).length === 3));
  check('it cannot pay for a non-Vampire spell (Serra Angel): no units for it', (g._payFor = sa, G.allUnits(g).filter(u => u.floating).length === 0));
  check('it cannot pay for anything that is not a spell (an ability): no units', (() => { g._payFor = null; const n = G.allUnits(g).filter(u => u.floating).length; return n === 0; })());
});

T('the mana pays for the Vampire spell and the leftover stays restricted', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites'); putOn(g, 'Llanowar Elves'); g.hand = [inst(g, 'Vampire Nighthawk')];
  const ev = []; menu(g, m).run(ev); G.flushLeaves(g, ev);
  const vs = g.hand[0];
  const r = G.castCard(g, vs); G.flushLeaves(g, []);
  check('Vampire Nighthawk ({1}{B}{B}) is cast with the sacrificed creature\'s mana alone', !!r && g.battlefield.some(q => q.card.name === 'Vampire Nighthawk') && g.battlefield.filter(q => q.asLand).length === 0, g.battlefield.map(q => q.card.name).join());
  check('nothing is left over (three mana, three spent)', g.floating.length === 0, g.floating.length);
  g.hand.push(inst(g, 'Serra Angel')); const sa = g.hand[g.hand.length - 1];
  check('the leftover cannot help cast a non-Vampire (Serra Angel is not cast)', !G.castCard(g, sa) || !g.battlefield.some(q => q.card.name === 'Serra Angel'));
});

T('a person chooses which creature is sacrificed (the default is the autopilot\'s pick)', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites'); const elf = putOn(g, 'Llanowar Elves'), ang = putOn(g, 'Serra Angel');
  let def = null;
  const qs = seated(g, d => { if (d.kind === 'sacrifice') { def = d.def; return ang; } }, () => { const ev = []; menu(g, m).run(ev); G.flushLeaves(g, ev); });
  check('a sacrifice question lists the other creatures only', qs.some(x => x.d.kind === 'sacrifice' && x.d.options.length === 2 && !x.d.options.includes(m)));
  check('the default is the cheaper creature', def === elf, def && def.card.name);
  check('the chosen creature is sacrificed', !g.battlefield.includes(ang) && g.battlefield.includes(elf));
});

T('autopilot (a token to lose): sacrifices only for a Vampire/Cleric/Demon spell it cannot pay for otherwise', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites'); const elf = putOn(g, 'Llanowar Elves'); elf.token = true; g.hand = [inst(g, 'Serra Angel')];
  G.castOne(g); check('with only a non-Vampire spell in hand nothing is sacrificed', g.battlefield.includes(elf) && !m.tapped);
  const g2 = bare(); const m2 = putOn(g2, 'Master of Dark Rites'); putOn(g2, 'Llanowar Elves').token = true; g2.hand = [inst(g2, 'Vampire Nighthawk')];
  G.castOne(g2); check('with Vampire Nighthawk in hand and no other mana it sacrifices the Elves and casts it', g2.battlefield.some(q => q.card.name === 'Vampire Nighthawk') && !g2.battlefield.some(q => q.card.name === 'Llanowar Elves'), g2.battlefield.map(q => q.card.name).join());
  const g3 = bare(); putOn(g3, 'Master of Dark Rites'); putOn(g3, 'Llanowar Elves').token = true; for (let i = 0; i < 4; i++) putOn(g3, 'Swamp'); g3.hand = [inst(g3, 'Vampire Nighthawk')];
  G.castOne(g3); check('when its lands already pay, no creature is sacrificed', g3.battlefield.some(q => q.card.name === 'Vampire Nighthawk') && g3.battlefield.some(q => q.card.name === 'Llanowar Elves'), g3.battlefield.map(q => q.card.name).join());
});

T('autopilot keeps a creature worth keeping', () => {
  const g = bare(); const m = putOn(g, 'Master of Dark Rites'); const ang = putOn(g, 'Serra Angel'); g.hand = [inst(g, 'Vampire Nighthawk')];
  G.castOne(g); check('Serra Angel is not sacrificed for a three-mana Vampire', g.battlefield.includes(ang) && !m.tapped);
});

T('games run clean', () => { let ok = true, msg = ''; try { G.simulate(deck, Object.assign({}, O, { turns: 8 }), 60, 5); } catch (e) { ok = false; msg = String(e.stack).split('\n').slice(0, 2).join(' | '); } check('sixty games with these cards run clean', ok, msg); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
