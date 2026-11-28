// T-139 part 3, batch A: activated lines read in full. Cost changes (Loreseeker's Stone, Deepwood Denizen, Kami of Jealous Thirst), "Activate only"
// (Izzet Generatorium, Kami once a turn, Goro-Goro), "spend only mana of the chosen color" (Throne of Eldraine), and the graveyard / top-card abilities.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Loreseeker's Stone", 'Deepwood Denizen', 'Kami of Jealous Thirst', 'Izzet Generatorium', 'Throne of Eldraine', 'Lion Sash', "General's Enforcer", 'Nylea, Keen-Eyed', 'Druidic Satchel', 'Goro-Goro, Disciple of Ryusei', 'Serra Angel', 'Vampire Nighthawk', 'Llanowar Elves', 'Shivan Dragon', 'Swamp', 'Mountain', 'Plains', 'Forest', 'Island', 'Sol Ring', 'Lightning Bolt'];
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
  for (const n of ["Loreseeker's Stone", 'Deepwood Denizen', 'Kami of Jealous Thirst', 'Izzet Generatorium', 'Throne of Eldraine', 'Lion Sash', "General's Enforcer", 'Nylea, Keen-Eyed', 'Druidic Satchel', 'Goro-Goro, Disciple of Ryusei'])
    check(n + ': no partial or ignored line', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.map(r => r.status).join());
});

T("Loreseeker's Stone: {3}, {T}: draw three; {1} more for each card in your hand", () => {
  const g = bare(); lands(g, 8, 'Plains'); const p = putOn(g, "Loreseeker's Stone");
  let e = entry(g, p, /Draw three/); check('listed', !!e);
  check('empty hand: {3}', e && /\{3\}/.test(e.cost) || (G.abilityMenu(g, p)[e.i].ok), e && e.cost);
  g.hand = [inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains'), inst(g, 'Plains')];          // 6 cards: costs {3}+{6} = 9 but only 8 lands (the Stone taps itself, not a land)
  e = entry(g, p, /Draw three/); check('six cards in hand: {9} needs more than 8 lands: blocked', e && !e.ok, e && e.why);
  g.hand.length = 5; e = entry(g, p, /Draw three/); check('five cards in hand: {8} is paid', e && e.ok, e && e.why);
  const h = g.hand.length; run(g, p, e); check('draws three and taps all eight lands', g.hand.length === h + 3 && g.battlefield.filter(q => q.asLand && q.tapped).length === 8);
});

T('Deepwood Denizen: {1} less for each +1/+1 counter on creatures you control', () => {
  const g = bare(); lands(g, 6, 'Forest'); const p = putOn(g, 'Deepwood Denizen'); const el = putOn(g, 'Llanowar Elves');
  let e = entry(g, p, /Draw a card/); check('no counters: {5}{G} paid with six lands', e && e.ok, e && e.why);
  g.battlefield.filter(q => q.asLand).slice(0, 3).forEach(l => { l.tapped = true; });
  e = entry(g, p, /Draw a card/); check('three lands left: blocked', e && !e.ok, e && e.why);
  el.counters = 2; p.counters = 1; e = entry(g, p, /Draw a card/); check('three counters on creatures: {2}{G} with three lands', e && e.ok, e && e.why);
});

T('Kami of Jealous Thirst: costs {4}{B} less after three draws; once each turn', () => {
  const g = bare(); duel(g); lands(g, 5, 'Swamp'); const p = putOn(g, 'Kami of Jealous Thirst'); g.opp.life = 20; g.drawSeq = 0;
  let e = entry(g, p, /loses 2 life/); check('listed', !!e && e.ok, e && e.why);
  g.battlefield.filter(q => q.asLand).slice(0, 5).forEach(l => { l.tapped = true; });
  e = entry(g, p, /loses 2 life/); check('no mana and fewer than three draws: blocked', e && !e.ok);
  g.drawSeq = 3; e = entry(g, p, /loses 2 life/); check('three cards drawn this turn: free', e && e.ok, e && e.why);
  const l0 = g.life, o0 = g.opp.life; run(g, p, e); check('drains 2', g.life === l0 + 2 && g.opp.life === o0 - 2, g.life + '/' + g.opp.life);
  e = entry(g, p, /loses 2 life/); check('a second time this turn: blocked (once each turn)', e && !e.ok && /once/.test(e.why || ''), e && e.why);
  g.turn++; g.drawSeq = 3; e = entry(g, p, /loses 2 life/); check('next turn: available again', e && e.ok, e && e.why);
});

T('Izzet Generatorium: only if you have paid or lost four or more {E} this turn', () => {
  const g = bare(); const p = putOn(g, 'Izzet Generatorium'); g.library.unshift(inst(g, 'Plains'));
  let e = entry(g, p, /Draw a card/); check('no energy paid: blocked', e && !e.ok && /\{E\}/.test(e.why || ''), e && e.why);
  g.energy = 6; G.payEnergy(g, 3); e = entry(g, p, /Draw a card/); check('three paid: blocked', e && !e.ok, e && e.why);
  G.payEnergy(g, 1); e = entry(g, p, /Draw a card/); check('four paid: available', e && e.ok, e && e.why);
  const h = g.hand.length; run(g, p, e); check('it draws', g.hand.length === h + 1);
  g.turn++; e = entry(g, p, /Draw a card/); check('next turn: the count starts again', e && !e.ok, e && e.why);
});

T('Throne of Eldraine: {3}, {T}: draw two with mana of the chosen color only', () => {
  const g = bare(); const p = putOn(g, 'Throne of Eldraine'); p.chosenColor = 'R';
  lands(g, 3, 'Plains'); g.library.unshift(inst(g, 'Plains'), inst(g, 'Plains'));
  let e = entry(g, p, /Draw two/); check('three white lands, chosen red: blocked', e && !e.ok, e && e.why);
  lands(g, 3, 'Mountain'); e = entry(g, p, /Draw two/); check('three Mountains: available', e && e.ok, e && e.why);
  const h = g.hand.length; run(g, p, e); check('draws two and taps only the Mountains', g.hand.length === h + 2 && g.battlefield.filter(q => q.asLand && !q.tapped).every(q => q.card.name === 'Plains') && g.battlefield.filter(q => q.card.name === 'Plains' && q.tapped).length === 0);
});

T('Lion Sash: exile a card from a graveyard; a permanent card gives a +1/+1 counter', () => {
  const g = bare(); duel(g); lands(g, 3, 'Plains'); const p = putOn(g, 'Lion Sash');
  let e = entry(g, p, /Exile target card/); check('both graveyards empty: blocked', e && !e.ok, e && e.why);
  g.opp.graveyard.push(inst(g, 'Serra Angel')); g.opp.graveyard.push(inst(g, 'Lightning Bolt'));
  e = entry(g, p, /Exile target card/); check('a card to exile: available', e && e.ok, e && e.why);
  run(g, p, e); check('Serra Angel (a permanent card) exiled: +1/+1 counter', p.counters === 1 && g.opp.graveyard.length === 1 && g.opp.exile.some(i => i.card.name === 'Serra Angel'), 'counters ' + p.counters + ' gy ' + g.opp.graveyard.map(i => i.card.name));
  g.opp.graveyard = [inst(g, 'Lightning Bolt')]; g.turn++; e = entry(g, p, /Exile target card/); run(g, p, e);
  check('Lightning Bolt (not a permanent card): exiled, no counter', p.counters === 1 && g.opp.graveyard.length === 0, 'e ' + JSON.stringify(e && [e.ok, e.why]) + ' c ' + p.counters + ' gy ' + g.opp.graveyard.length);
});

T("General's Enforcer: exile a card; a creature card gives a 1/1 white Human Soldier", () => {
  const g = bare(); duel(g); lands(g, 4, 'Plains'); const p = putOn(g, "General's Enforcer");
  lands(g, 2, 'Swamp'); g.opp.graveyard.push(inst(g, 'Vampire Nighthawk'));
  const e = entry(g, p, /Exile target card/); check('listed and payable', e && e.ok, e && e.why);
  const n = g.battlefield.length; run(g, p, e);
  const tok = g.battlefield.find(q => q.token && /Human Soldier/.test(q.card.name || ''));
  check('Nighthawk exiled and a 1/1 Human Soldier made', g.opp.exile.some(i => i.card.name === 'Vampire Nighthawk') && !!tok && g.battlefield.length === n + 1, g.battlefield.map(q => q.card.name).join());
});

T('Nylea, Keen-Eyed: a creature on top goes to your hand; otherwise you may put it into your graveyard', () => {
  const g = bare(); lands(g, 6, 'Forest'); const p = putOn(g, 'Nylea, Keen-Eyed'); g.ask = null;
  let e = entry(g, p, /Reveal the top card/); check('listed', !!e && e.ok, e && e.why);
  g.library.unshift(inst(g, 'Serra Angel')); const h = g.hand.length; run(g, p, e);
  check('Serra Angel: into your hand', g.hand.length === h + 1 && g.hand[g.hand.length - 1].card.name === 'Serra Angel');
  g.turn++; g.library.unshift(inst(g, 'Lightning Bolt')); e = entry(g, p, /Reveal the top card/); const gy = g.graveyard.length, lib = g.library.length; run(g, p, e);
  check('a Bolt on top with few lands: it may stay (the autopilot keeps a spell)', g.library.length === lib && g.graveyard.length === gy);
});

T('Druidic Satchel: creature: Saproling; land: onto the battlefield; otherwise 2 life', () => {
  const g = bare(); lands(g, 6, 'Forest'); const p = putOn(g, 'Druidic Satchel');
  g.library.unshift(inst(g, 'Serra Angel')); let e = entry(g, p, /Reveal the top card/); run(g, p, e);
  check('creature: a 1/1 Saproling, the card stays on top', g.battlefield.some(q => q.token && /Saproling/.test(q.card.name || '')) && g.library[0].card.name === 'Serra Angel');
  p.tapped = false; g.library.shift(); g.library.unshift(inst(g, 'Plains')); const n = g.battlefield.length; e = entry(g, p, /Reveal the top card/); run(g, p, e);
  check('land: it enters the battlefield', g.battlefield.length === n + 1 && g.battlefield.some(q => q.card.name === 'Plains'));
  p.tapped = false; g.library.unshift(inst(g, 'Lightning Bolt')); const life = g.life; e = entry(g, p, /Reveal the top card/); run(g, p, e);
  check('noncreature, nonland: gain 2 life', g.life === life + 2);
});

T('Goro-Goro: {R}: haste for your creatures; the Dragon only with an attacking modified creature', () => {
  const g = bare(); lands(g, 8, 'Mountain'); const p = putOn(g, 'Goro-Goro, Disciple of Ryusei'); const sick = putOn(g, 'Shivan Dragon'); sick.sick = true;
  let e = entry(g, p, /gain haste/); check('haste listed', e && e.ok, e && e.why); run(g, p, e);
  check('the new creature has haste this turn', G.hasKw ? G.hasKw(g, sick, 'haste') : g.eot.kw.has('haste'));
  e = entry(g, p, /Dragon Spirit/); check('no attacking modified creature: blocked', e && !e.ok && /attacking modified/.test(e.why || ''), e && e.why);
  const atk = putOn(g, 'Llanowar Elves'); atk.attacking = true; e = entry(g, p, /Dragon Spirit/); check('an attacker that is not modified: still blocked', e && !e.ok, e && e.why);
  atk.counters = 1; e = entry(g, p, /Dragon Spirit/); check('a +1/+1 counter makes it modified: available', e && e.ok, e && e.why);
  run(g, p, e); check('a 5/5 flying Dragon Spirit token', g.battlefield.some(q => q.token && /Dragon Spirit/.test(q.card.name || '')));
});

T('Goro-Goro: the autopilot makes the Dragon when attackers are declared (a modified attacker, mana to spare)', () => {
  const g = bare(); lands(g, 5, 'Mountain'); putOn(g, 'Goro-Goro, Disciple of Ryusei'); const el = putOn(g, 'Shivan Dragon'); el.counters = 1; g.combatDone = false;
  G.combat(g);
  check('a Dragon Spirit token exists after the attack', g.battlefield.some(q => q.token && /Dragon Spirit/.test(q.card.name || '')), g.battlefield.map(q => q.card.name).join());
  const g2 = bare(); lands(g2, 5, 'Mountain'); putOn(g2, 'Goro-Goro, Disciple of Ryusei'); putOn(g2, 'Shivan Dragon'); g2.combatDone = false; G.combat(g2);
  check('without a modified attacker: no Dragon', !g2.battlefield.some(q => q.token && /Dragon Spirit/.test(q.card.name || '')));
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
