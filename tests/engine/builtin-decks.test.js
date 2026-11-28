// Every built-in deck (goldfish/static/decks): all its cards are in the set database, every rules line is read by the engine,
// and the deck plays goldfish games, matches against the next deck and a four-player pod without an engine error.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), Source = require(path.join(ROOT, 'goldfish', 'static', 'source.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), DECKS = path.join(ROOT, 'goldfish', 'static', 'decks');
const idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8'));
const O = { turns: 10, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };

const loaded = [];
let unread = 0, missing = 0;
for (const d of index.decks) {
  const entries = Source.parseDecklist(fs.readFileSync(path.join(DECKS, d.file), 'utf8')), cards = [], gone = [];
  for (const e of entries) { const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) { gone.push(e.name); continue; } const hit = cards.find(x => x.name === c.name); if (hit) { hit.qty += e.qty; hit.commander = hit.commander || e.commander; } else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander })); }
  if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; }
  const deck = G.buildDeck(cards, []), bad = [];
  for (const c of deck.unique) for (const x of [c].concat(c.a.backCard ? [c.a.backCard] : [])) for (const v of x.a.coverage || []) if (v.status === 'ignored' || v.status === 'partial') bad.push(c.name + ': ' + v.text.slice(0, 60));
  missing += gone.length; unread += bad.length;
  if (gone.length || bad.length) check(d.name + ': every card is in the database and every rules line is read', false, gone.map(n => 'not in the database: ' + n).concat(bad).slice(0, 5).join(' || '));
  loaded.push({ d, cards, deck });
}
check(`all ${index.decks.length} built-in decks: every card is in the set database`, missing === 0, missing + ' missing');
check(`all ${index.decks.length} built-in decks: every rules line is read (none "in development")`, unread === 0, unread + ' unread lines');

{ let errs = 0, first = null, games = 0;
  for (const L of loaded) { const r = G.monteCarlo(L.cards, Object.assign({}, O, { n: 12 }), 12, 11, null, []); games += 12; if (r.errors) { errs += r.errors; first = first || L.d.name + ': ' + String(r.firstError).slice(0, 300); } }
  check(`${games} goldfish games (twelve with each deck) run without an engine error`, errs === 0, first || undefined); }
{ let errs = 0, first = null, games = 0; const cmd = loaded.filter(L => L.d.commanders.length);
  for (let i = 0; i < cmd.length; i++) { const A = cmd[i], B = cmd[(i + 1) % cmd.length]; const r = G.matchMonteCarlo(A.cards, [], B.cards, [], Object.assign({}, O, { turns: 14 }), 4, 5 + i); games += 4; if (r.errors) { errs += r.errors; first = first || A.d.name + ' vs ' + B.d.name + ': ' + String(r.firstError).slice(0, 300); } }
  check(`${games} matches (each commander deck against the next one) run without an engine error`, errs === 0, first || undefined); }
{ let errs = 0, first = null, games = 0; const cmd = loaded.filter(L => L.d.commanders.length);
  for (let i = 0; i + 3 < cmd.length; i += 4) { const ps = cmd.slice(i, i + 4).map(L => ({ cards: L.cards, tokens: [], name: L.d.name, policy: {} })); const r = G.podMonteCarlo(ps, Object.assign({}, O, { turns: 16 }), 3, 9 + i); games += 3; if (r.errors) { errs += r.errors; first = first || ps.map(p => p.name).join(' / ') + ': ' + String(r.firstError).slice(0, 300); } }
  check(`${games} four-player pod games across the commander decks run without an engine error`, errs === 0, first || undefined); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
