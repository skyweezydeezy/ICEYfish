// T-128 (builds on T-087): Atraxa, Praetors' Voice ("At the beginning of your end step, proliferate") for a person: the end-step trigger goes off, the sheet lets them
// choose among all permanents with a counter (an opponent's too, CR 701.34a), the log says what was proliferated (it used to read "nothing happens"),
// and other end-step triggers fire for a person. The autopilot adds a counter to its own permanents and to an opponent's only when shrunk by -1/-1.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const SD = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(SD)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = (n, qty) => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: qty || 1 }); };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); } };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
const NAMES = ["Atraxa, Praetors' Voice", 'Llanowar Elves', 'Serra Angel', 'Brightcap Badger // Fungus Frolic', 'Jace Beleren', 'Plains', 'Island'];
const deck = G.buildDeck(NAMES.map(n => get(n, /^(Plains|Island)$/.test(n) ? 30 : 1)), []);
const by = n => deck.unique.find(c => c.name === n);
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.command = []; g.graveyard = []; g.exile = []; g.library = []; return g; };
function setup(person, mine) {
  const g = bare(3), b = bare(4); G.linkMatch(g, b); if (person) D.seat(g);
  const put = (who, n) => { const p = G.enterWithTriggers(who, { iid: who.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; return p; };
  for (const n of mine || ["Atraxa, Praetors' Voice"]) put(g, n);
  return { g, b, put };
}
const endTurn = (g, b, pick) => { const qs = []; const ev = D.resolveSync([g, b], 0, gs => G.endTurn(gs[0]), q => { qs.push(q); return pick(q); }); return { qs, ev }; };
const notes = ev => (ev || []).map(e => e.text).filter(Boolean).join(' | ');
const prolifQ = qs => qs.find(q => q.kind === 'target' && /proliferate/.test(q.title));


const names = q => q.options.map(o => o.name + (o.note ? ' (' + o.note + ')' : '')).join(' | ');
const idxOf = (q, name) => q.options.findIndex(o => o.name === name);
T('a subset: an opponent\'s +1/+1 creature and your -1/-1 creature are skipped, the opponent\'s poison and your +1/+1 creature get a counter', () => {
  const { g, b, put } = setup(true); const mine = put(g, 'Llanowar Elves'); mine.counters = 2; const bad = put(g, 'Serra Angel'); bad.counters = -1;
  const theirs = put(b, 'Serra Angel'); theirs.counters = 3; g.poisonDealt = 4;
  const { qs } = endTurn(g, b, q => (prolifQ([q]) ? [idxOf(q, 'Llanowar Elves'), idxOf(q, 'Opponent')] : 'auto')); const q = prolifQ(qs);
  check('the sheet lists the counters of each: "+1/+1 ×2", "-1/-1 ×1", "poison ×4"', q && q.options.some(o => o.name === 'Llanowar Elves' && /\+1\/\+1 ×2/.test(o.note)) && q.options.some(o => /-1\/-1 ×1/.test(o.note)) && q.options.some(o => o.name === 'Opponent' && /poison ×4/.test(o.note)), q && names(q));
  check('the question says the kinds can\'t be split and that none is fine', q && /can't be split/.test(q.text) && /none/.test(q.text), q && q.text);
  check('your +1/+1 creature 2 -> 3', mine.counters === 3, mine.counters);
  check('your -1/-1 creature stays -1', bad.counters === -1, bad.counters);
  check('their +1/+1 creature stays 3', theirs.counters === 3, theirs.counters);
  check('the opponent\'s poison 4 -> 5', g.poisonDealt === 5, g.poisonDealt);
});
T('the defaults equal the autopilot\'s pick: your counters, the opponent\'s poison and -1/-1 checked; their +1/+1 and player experience not', () => {
  const { g, b, put } = setup(true); const mine = put(g, 'Llanowar Elves'); mine.counters = 2; const sh = put(b, 'Serra Angel'); sh.counters = -2; const gr = put(b, 'Llanowar Elves'); gr.counters = 1; g.poisonDealt = 2; g.experience = 3;
  const { qs } = endTurn(g, b, q => 'auto'); const q = prolifQ(qs); const on = new Set(q.def.map(k => q.options[k].name + (q.options[k].owner != null ? '@' : '')));
  const defNotes = q.def.map(k => q.options[k].name + ':' + q.options[k].note);
  check('five or six entries: 3 permanents + you + opponent', q.options.length === 5 || q.options.length === 6, q.options.length);
  check('checked (the autopilot\'s pick): Llanowar Elves (yours), the shrunk one, Opponent\'s poison; not You (experience) and not their +1/+1 Llanowar Elves', q.def.length === 3 && q.def.some(k => q.options[k].name === 'Serra Angel') && q.def.filter(k => q.options[k].name === 'Llanowar Elves').length === 1, defNotes.join(' | '));
  check('the autopilot-style default result: mine 3, shrunk -3, grown 1, poison 3, experience 3 (left alone, as the autopilot does)', mine.counters === 3 && sh.counters === -3 && gr.counters === 1 && g.poisonDealt === 3 && g.experience === 3, [mine.counters, sh.counters, gr.counters, g.poisonDealt, g.experience].join(','));
});
T('choosing none: nothing changes, poison included', () => {
  const { g, b, put } = setup(true); const mine = put(g, 'Llanowar Elves'); mine.counters = 2; g.poisonDealt = 4; g.experience = 1;
  const { ev } = endTurn(g, b, q => (prolifQ([q]) ? [] : 'auto'));
  check('nothing grew', mine.counters === 2 && g.poisonDealt === 4 && g.experience === 1, [mine.counters, g.poisonDealt, g.experience].join(','));
  check('the log says nothing was chosen', /nothing with a counter was chosen/.test(notes(ev)), notes(ev));
});
T('only a player with counters (no permanent has any): the sheet is still asked', () => {
  const { g, b } = setup(true); g.poisonDealt = 3;
  const { qs } = endTurn(g, b, q => 'auto'); const q = prolifQ(qs);
  check('the sheet has Opponent only', q && q.options.some(o => o.name === 'Opponent') && g.poisonDealt === 4, q && names(q) + ' / ' + g.poisonDealt);
});
T('planeswalker loyalty and counter kinds on a permanent all grow (they can\'t be split)', () => {
  const { g, b, put } = setup(true); const pw = put(g, 'Jace Beleren'); const l0 = pw.loyalty; pw.other = { charge: 2 };
  const { qs } = endTurn(g, b, q => (prolifQ([q]) ? [idxOf(q, 'Jace Beleren')] : 'auto')); const q = prolifQ(qs);
  check('the sheet lists loyalty and charge', q && q.options.some(o => o.name === 'Jace Beleren' && /loyalty ×/.test(o.note) && /charge ×2/.test(o.note)), q && names(q));
  check('loyalty +1 and charge 2 -> 3', pw.loyalty === l0 + 1 && pw.other.charge === 3, pw.loyalty + '/' + l0 + ' ' + JSON.stringify(pw.other));
});
T('player counters: experience, energy and rad, yours; an opponent\'s rad', () => {
  const { g, b } = setup(true); g.experience = 2; g.energy = 3; g.rad = 1; b.rad = 2;
  const { qs } = endTurn(g, b, q => (prolifQ([q]) ? q.options.map((o, k) => k) : 'auto')); const q = prolifQ(qs);
  check('You: experience ×2 · energy ×3 · rad ×1', q && q.options.some(o => o.name === 'You' && /experience ×2/.test(o.note) && /energy ×3/.test(o.note) && /rad ×1/.test(o.note)), q && names(q));
  check('all chosen: experience 3, energy 4, rad 2 (yours), the opponent\'s rad 3', g.experience === 3 && g.energy === 4 && g.rad === 2 && b.rad === 3, [g.experience, g.energy, g.rad, b.rad].join(','));
});
T('the autopilot is unchanged: no sheet, own counters and their -1/-1, poison +1, experience untouched', () => {
  const { g, b, put } = setup(false); const mine = put(g, 'Llanowar Elves'); mine.counters = 1; const sh = put(b, 'Serra Angel'); sh.counters = -1; const gr = put(b, 'Llanowar Elves'); gr.counters = 1; g.poisonDealt = 2; g.experience = 5;
  G.endTurn(g);
  check('mine 2, shrunk -2, grown 1, poison 3, experience 5', mine.counters === 2 && sh.counters === -2 && gr.counters === 1 && g.poisonDealt === 3 && g.experience === 5, [mine.counters, sh.counters, gr.counters, g.poisonDealt, g.experience].join(','));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
