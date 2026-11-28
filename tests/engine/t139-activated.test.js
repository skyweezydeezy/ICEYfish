// T-139 batch 1: generic activated abilities read as written: "Activate only ..." conditions and "This ability costs {N} less ..." are built, not dropped.
// A line reads ok only when every sentence is read (parseEffectsWhole); these cards were ok before although the restriction was ignored.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => (x.name === n || x.name.split(' // ')[0] === n) && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ["Bonders' Enclave", 'Idol of Oblivion', 'Minas Tirith', 'Arch of Orazca', 'Speaker of the Heavens', 'The Raven Man', 'Tinybones, Bauble Burglar', 'Ozolith, the Shattered Spire', 'Voldaren Estate', 'Serra Angel', 'Vampire Nighthawk', 'Llanowar Elves', 'Shivan Dragon', 'Swamp', 'Mountain', 'Plains', 'Forest', 'Island', 'Endless Atlas', 'Raving Visionary', 'Sea Gate Wreckage', 'Resonating Lute', 'Leechridden Swamp', 'Luminarch Ascension', 'The Gold Saucer'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); g.activeTurn = true; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, k) => { for (let i = 0; i < n; i++) putOn(g, k || 'Swamp'); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const entry = (g, p, re) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => re.test((x.label || '') + ' ' + (x.cost || ''))); return i < 0 ? null : Object.assign({ i }, m[i]); };
const run = (g, p, e) => { const r = G.useAbility(g, p, e.i); G.flushLeaves(g, []); return r; };
const cov = n => by(n).a.coverage.filter(r => /^(\{|[A-Z][a-z]+ — \{)/.test(r.text) && /Activate only|costs \{1\} less|: Create a|: Draw|discards/i.test(r.text)).map(r => r.status);

T('every line reads ok (the restriction is built) and carries its condition', () => {
  for (const n of ["Bonders' Enclave", 'Idol of Oblivion', 'Minas Tirith', 'Arch of Orazca', 'Speaker of the Heavens', 'The Raven Man', 'Tinybones, Bauble Burglar', 'Ozolith, the Shattered Spire', 'Voldaren Estate'])
    check(n + ': no partial or ignored line', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.map(r => r.status).join());
  check("Bonders' Enclave: only = power 4", JSON.stringify(by("Bonders' Enclave").a.activated.map(x => x.only)) === '[[{"k":"power","n":4}]]');
  check('Speaker: life over 7 and sorcery', JSON.stringify(by('Speaker of the Heavens').a.activated[0].only) === '[{"k":"lifeOver","n":7},{"k":"sorcery"}]', JSON.stringify(by('Speaker of the Heavens').a.activated[0].only));
  check('Voldaren Estate: {1} less per Vampire', JSON.stringify(by('Voldaren Estate').a.activated.map(x => x.lessPer).filter(Boolean)) === '[{"n":1,"filter":"vampire"}]');
});

T("Bonders' Enclave: only with a creature of power 4 or greater (CR 602.5b)", () => {
  const g = bare(); lands(g, 3); const p = putOn(g, "Bonders' Enclave"); g.library.unshift(inst(g, 'Plains'));
  let e = entry(g, p, /Draw a card/); check('the ability is listed', !!e);
  check('no creature: blocked, with the reason', e && !e.ok && /power 4/.test(e.why || ''), e && e.why);
  putOn(g, 'Llanowar Elves'); e = entry(g, p, /Draw a card/); check('only a 1/1: still blocked', e && !e.ok, e && e.why);
  putOn(g, 'Shivan Dragon'); e = entry(g, p, /Draw a card/); check('a 5/5: available', e && e.ok, e && e.why);
  const h = g.hand.length; run(g, p, e); check('it draws a card', g.hand.length === h + 1 && p.tapped);
});

T('Idol of Oblivion: only after you created a token this turn', () => {
  const g = bare(); const p = putOn(g, 'Idol of Oblivion'); g.library.unshift(inst(g, 'Plains'));
  g.tokenTurn = undefined; let e = entry(g, p, /Draw a card/);
  check('no token this turn: blocked', e && !e.ok && /token/.test(e.why || ''), e && e.why);
  G.createTokens(g, { type: 'token', n: 1, creature: false, name: 'Treasure', artifact: true }, 1, [], null);
  e = entry(g, p, /Draw a card/); check('after a Treasure was made: available', e && e.ok, e && e.why);
  g.turn++; e = entry(g, p, /Draw a card/); check('next turn: blocked again', e && !e.ok, e && e.why);
});

T('Minas Tirith: only after attacking with two or more creatures', () => {
  const g = bare(); lands(g, 2, 'Plains'); const p = putOn(g, 'Minas Tirith'); g.library.unshift(inst(g, 'Plains'));
  let e = entry(g, p, /Draw a card/); check('no attack: blocked', e && !e.ok && /attacked/.test(e.why || ''), e && e.why);
  g.atkMax = 1; e = entry(g, p, /Draw a card/); check('one attacker: blocked', e && !e.ok, e && e.why);
  g.atkMax = 2; e = entry(g, p, /Draw a card/); check('two attackers: available', e && e.ok, e && e.why);
});

T("Arch of Orazca: only with the city's blessing (ten permanents)", () => {
  const g = bare(); const p = putOn(g, 'Arch of Orazca'); lands(g, 5); g.library.unshift(inst(g, 'Plains'));
  let e = entry(g, p, /Draw a card/); check('under ten permanents: blocked', e && !e.ok && /blessing/.test(e.why || ''), e && e.why);
  for (let i = 0; i < 4; i++) putOn(g, 'Swamp'); // Arch + 5 + 4 = 10
  e = entry(g, p, /Draw a card/); check('ten permanents: blessed and available', e && e.ok, e && e.why);
});

T('Speaker of the Heavens: 7 more life than the starting life total, and only on your turn', () => {
  const g = bare(); const p = putOn(g, 'Speaker of the Heavens');
  g.life = 40; let e = entry(g, p, /Angel/); check('at the starting life total: blocked', e && !e.ok && /life/.test(e.why || ''), e && e.why);
  g.life = 46; e = entry(g, p, /Angel/); check('+6: blocked', e && !e.ok, e && e.why);
  g.life = 47; e = entry(g, p, /Angel/); check('+7: available', e && e.ok, e && e.why);
  g.activeTurn = false; e = entry(g, p, /Angel/); check('not your turn (sorcery timing): blocked', e && !e.ok && /your turn/.test(e.why || ''), e && e.why);
  g.activeTurn = true; run(g, p, entry(g, p, /Angel/)); check('it makes a 4/4 Angel', g.battlefield.some(q => q.token && /Angel/.test(q.card.name)));
});

T('The Raven Man and Tinybones: each opponent discards, only as a sorcery', () => {
  for (const n of ['The Raven Man', 'Tinybones, Bauble Burglar']) {
    const g = bare(); lands(g, 4); const p = putOn(g, n);
    let e = entry(g, p, /discards/i); check(n + ': listed and available on your turn', e && e.ok, e && e.why);
    g.activeTurn = false; e = entry(g, p, /discards/i); check(n + ': not on the opponent\'s turn', e && !e.ok && /your turn/.test(e.why || ''), e && e.why);
  }
});

T("Ozolith, the Shattered Spire: a counter on a creature or artifact, only as a sorcery", () => {
  const g = bare(); lands(g, 2, 'Forest'); putOn(g, 'Serra Angel'); const p = putOn(g, 'Ozolith, the Shattered Spire');
  let e = entry(g, p, /counter/i); check('available on your turn', e && e.ok, e && e.why);
  g.activeTurn = false; e = entry(g, p, /counter/i); check('not on the opponent\'s turn', e && !e.ok, e && e.why);
});

T('Voldaren Estate: {5}, {T}: Blood token, {1} less for each Vampire you control', () => {
  const g = bare(); lands(g, 4); const p = putOn(g, 'Voldaren Estate');
  let e = entry(g, p, /Blood/i); check('five mana needed, four lands + itself cannot pay while it taps: blocked', e && !e.ok, e && e.why);
  putOn(g, 'Vampire Nighthawk'); e = entry(g, p, /Blood/i); check('one Vampire: {4} suffices', e && e.ok, e && e.why);
  const n = g.battlefield.length; run(g, p, e); check('a Blood token is made and the four lands are tapped', g.battlefield.length === n + 1 && g.battlefield.some(q => q.token && /Blood/.test(q.card.name)) && g.battlefield.filter(q => q.asLand && q.tapped).length >= 4);
});

T('Endless Atlas, Sea Gate Wreckage, Resonating Lute, Raving Visionary, Leechridden Swamp, Luminarch Ascension: their "Activate only" conditions', () => {
  for (const n of ['Endless Atlas', 'Raving Visionary', 'Sea Gate Wreckage', 'Resonating Lute', 'Leechridden Swamp', 'Luminarch Ascension']) check(n + ': every line ok or neutral', by(n).a.coverage.every(r => r.status === 'ok' || r.status === 'neutral'), by(n).a.coverage.map(r => r.status).join());
  let g = bare(); lands(g, 5, 'Island'); let p = putOn(g, 'Endless Atlas'); g.library.unshift(inst(g, 'Plains'));
  let e = entry(g, p, /Draw a card/); check('Endless Atlas: three lands with the same name needed (Islands + the Atlas itself)', e && e.ok, e && e.why);
  g = bare(); putOn(g, 'Island'); putOn(g, 'Island'); putOn(g, 'Swamp'); lands(g, 2, 'Plains'); p = putOn(g, 'Endless Atlas'); e = entry(g, p, /Draw a card/); check('...two of each name only: blocked', e && !e.ok && /same name/.test(e.why || ''), e && e.why);
  g = bare(); lands(g, 3, 'Island'); p = putOn(g, 'Sea Gate Wreckage'); g.hand = [inst(g, 'Plains')]; e = entry(g, p, /Draw a card/); check('Sea Gate Wreckage: blocked with a card in hand', e && !e.ok && /in hand/.test(e.why || ''), e && e.why);
  g.hand = []; putOn(g, 'Sol Ring'); e = entry(g, p, /Draw a card/); check('...available with an empty hand', e && e.ok, e && e.why);
  g = bare(); lands(g, 2, 'Island'); p = putOn(g, 'Resonating Lute'); g.hand = Array.from({ length: 6 }, () => inst(g, 'Plains')); e = entry(g, p, /Draw a card/); check('Resonating Lute: six cards in hand: blocked', e && !e.ok, e && e.why);
  g.hand.push(inst(g, 'Plains')); e = entry(g, p, /Draw a card/); check('...seven: available', e && e.ok, e && e.why);
  g = bare(); lands(g, 2, 'Swamp'); p = putOn(g, 'Raving Visionary'); e = entry(g, p, /Draw a card/ ); g.graveyard = [inst(g, 'Plains'), inst(g, 'Serra Angel'), inst(g, 'Sol Ring')]; const e3 = G.abilityMenu(g, p).filter(x => /Draw a card$/.test(x.label || '') || /Draw a card/.test(x.label || ''));
  check('Raving Visionary: delirium (four card types) needed for the second ability', e3.some(x => !x.ok && /card types/.test(x.why || '')), JSON.stringify(e3.map(x => x.why)));
  g.graveyard.push(inst(g, 'Swamp')); g.graveyard.push({ iid: g.nextIid++, card: by('Shivan Dragon') }); g.graveyard.push(inst(g, 'Llanowar Elves'));
  g = bare(); lands(g, 2, 'Swamp'); p = putOn(g, 'Leechridden Swamp'); let m = G.abilityMenu(g, p).find(x => /loses 1 life/.test(x.label || '')); check('Leechridden Swamp: blocked below two black permanents', m && !m.ok && /color/.test(m.why || ''), m && m.why);
  putOn(g, 'Vampire Nighthawk'); putOn(g, 'Vampire Nighthawk'); m = G.abilityMenu(g, p).find(x => /loses 1 life/.test(x.label || '')); check('...a black creature makes it available', m && m.ok, m && m.why);
  g = bare(); lands(g, 2, 'Plains'); p = putOn(g, 'Luminarch Ascension'); e = entry(g, p, /Angel/); check('Luminarch Ascension: blocked with no quest counters', e && !e.ok && /quest/.test(e.why || ''), e && e.why);
  p.other = { quest: 4 }; e = entry(g, p, /Angel/); check('...available with four', e && e.ok, e && e.why);
  g = bare(); lands(g, 2, 'Island'); p = putOn(g, 'The Gold Saucer'); g.rnd = () => 0.1; e = entry(g, p, /Flip a coin/); run(g, p, e); check('The Gold Saucer: a won flip makes a Treasure', g.battlefield.some(q => q.token && /Treasure/.test(q.card.name)));
  g = bare(); lands(g, 2, 'Island'); p = putOn(g, 'The Gold Saucer'); g.rnd = () => 0.9; e = entry(g, p, /Flip a coin/); run(g, p, e); check('...a lost flip does not', !g.battlefield.some(q => q.token && /Treasure/.test(q.card.name)));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
