// T-131: "Guess unknown rules". Off: nothing changes. On: a close unknown line becomes 'guessed' (never 'ok'), plays like its template, stays on the Teach list; a far one stays 'ignored'.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const G = require('../../goldfish/static/sim.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const ROOT = path.join(__dirname, '..', '..'), SETS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'goldfish', 'static', 'data', 'fuzzy-index.json'), 'utf8'));
const COLORS = ['W', 'U', 'B', 'R', 'G'];
G.setTribe('Merfolk');

// every card of the set data, read with the setting off
const cards = []; for (const f of fs.readdirSync(SETS)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(SETS, f), 'utf8')).cards) if (!c.ref && c.oracle_text) cards.push(c); }
const byName = new Map(cards.map(c => [c.name, c]));
const cov = c => JSON.stringify(G.analyze(c, COLORS).coverage.map(r => [r.text, r.status, r.tag || null]));
const off = new Map(); for (const c of cards) off.set(c, cov(c));
check('setting off (default): no line is called guessed', [...off.values()].every(s => !/guessed/.test(s)));
// the index is current and its templates still read (a cheap sample; the whole file is checked by the tool)
if (spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-fuzzy-index.js'), '--check']).status !== 0) console.log('WARN  fuzzy-index.json is older than the set data: it only means fewer templates. MAIN rebuilds it at merge (node tools/build-fuzzy-index.js).');
{ let bad = 0, n = 0; G.traceCoverage(true);
  for (let i = 0; i < idx.templates.length; i += Math.max(1, Math.floor(idx.templates.length / 150))) {
    const [t, from] = idx.templates[i]; n++;
    const src = byName.get(from); if (!src) { bad++; continue; }
    const c = Object.assign({}, src, { oracle_text: t, front_oracle: t, keywords: [], faces: [] });
    const r = G.analyze(c, COLORS).coverage.find(x => x.text === t); if (!r || r.status !== 'ok' || !r.trace || !r.trace.changed) bad++;
  }
  G.traceCoverage(false); check('a sample of ' + n + ' templates still reads ok and builds something', bad === 0, bad + ' bad'); }

// scoring, with a small controlled index: slots are put back, shapes must agree, far lines do not match
G.setFuzzy({ types: ['elf', 'goblin', 'dragon'], templates: [
  ['Whenever you cast a creature spell, put a +1/+1 counter on target Elf you control.', 'Alpha'],
  ['At the beginning of your upkeep, each opponent loses 2 life and you gain 2 life.', 'Beta'],
  ['{2}{G}, {T}: Create a 1/1 green Elf creature token.', 'Gamma'] ] });
{ const m = G.fuzzyMatch('Whenever you cast a creature spell, put a +1/+1 counter on target Goblin you control.');
  check('a close line matches and the template gets this card\'s creature type', m && m.from === 'Alpha' && /target Goblin you control/.test(m.as) && m.score >= 0.8, m && m.score);
  const m2 = G.fuzzyMatch('{3}{R}, {T}: Create a 1/1 red Dragon creature token.');
  check('mana symbols, colours and types are put back', m2 && m2.from === 'Gamma' && m2.as === '{3}{R}, {T}: Create a 1/1 red Dragon creature token.', m2 && m2.as);
  check('a different shape (an extra number) does not match', G.fuzzyMatch('At the beginning of your upkeep, each opponent loses 2 life and you gain 2 life and draw 3 cards.') === null);
  check('a far line does not match', G.fuzzyMatch('Target player thwacks every sprocket in the zorb until the cows come home.') === null);
  check('a key word that differs (each opponent -> target opponent, may) costs score', (() => { const a = G.fuzzyMatch('At the beginning of your upkeep, each opponent loses 2 life and you gain 2 life.'), b = G.fuzzyMatch('At the beginning of your upkeep, you may have target opponent lose 2 life and you gain 2 life.'); return a && a.score === 1 && (!b || b.score < a.score); })()); }

// the real index: close lines become guessed, far lines stay ignored
G.setFuzzy(idx);
// words that change how much, where or who must match: these real near-misses (guessed before MAIN's 2026-11-28 rule) stay unknown
for (const [why, line] of [['twice dropped', "~'s power and toughness are each equal to twice the number of creatures you control."],
  ['"from your graveyard" dropped', 'Whenever you cast your first instant or sorcery spell from your graveyard each turn, copy that spell. You may choose new targets for the copy.'],
  ['"token" turned into "another creature"', 'Whenever a creature token dies, put a +1/+1 counter on ~.'],
  ['"to your hand" read as "to the battlefield"', 'When ~ enters, return target permanent card with mana value 3 or less from your graveyard to your hand.']])
  check('stays unknown: ' + why, G.fuzzyMatch(line) === null);
const guessed = [], far = [];
for (const c of cards) {
  if (!/"ignored"/.test(off.get(c))) continue;
  const a = G.analyze(c, COLORS);
  for (const r of a.coverage) { if (r.back) continue; if (r.status === 'guessed') guessed.push({ c, r, a }); else if (r.status === 'ignored' && r.tag === 'dev' && !G.fuzzyMatch(r.text)) far.push({ c, r }); }
}
check('with the setting on, close unknown lines become guessed (' + guessed.length + ')', guessed.length >= 10);
check('far unknown lines stay ignored (' + far.length + ')', far.length >= 100);
check('every guess carries a score of 0.80 or more, the card it came from and the line it was read as', guessed.every(({ r }) => r.fuzzy && r.fuzzy.score >= 0.8 && r.fuzzy.score <= 1 && r.fuzzy.from && r.fuzzy.as && r.tag === 'guess'));
check('a guessed line keeps the card\'s own text', guessed.every(({ c, r }) => off.get(c).includes(JSON.stringify(r.text))));
check('a card with a guessed line is never fully understood (stays on the Teach list)', guessed.every(({ a }) => a.coverageLevel !== 'ok'));
check('a guess is never called ok or neutral', guessed.every(({ r }) => r.status === 'guessed'));
// a guessed line plays: the card's reading builds more than it did
{ const sig = (c, on) => { G.setFuzzy(on ? idx : null); const a = G.analyze(c, COLORS); return JSON.stringify(a, (k, v) => k === 'coverage' || k === 'coverageLevel' ? undefined : typeof v === 'function' ? 'fn' : v instanceof Set ? [...v] : v instanceof RegExp ? v.source : v); };
  const some = guessed.slice(0, 20); const diff = some.filter(({ c }) => sig(c, true) !== sig(c, false)).length;
  check('guessed cards read differently (play like the template): ' + diff + ' of ' + some.length, diff === some.length); }
// off again: exactly the reading from before
G.setFuzzy(null);
check('switching it off again restores every reading', cards.every(c => cov(c) === off.get(c)));
// and a game with guessed cards plays through
{ G.setFuzzy(idx); const pick = guessed.slice(0, 6).map(g => g.c), fill = cards.filter(c => /^Basic Land/.test(c.type_line || '')).slice(0, 1);
  const list = pick.map(c => Object.assign({ qty: 1 }, c)).concat(fill.map(c => Object.assign({ qty: 40 }, c)));
  let err = 0; try { const deck = G.buildDeck(list, []); for (let i = 0; i < 20; i++) { try { G.simulate(deck, { turns: 8, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 }, 100 + i); } catch (e) { err++; } } } catch (e) { err++; }
  G.setFuzzy(null); check('games with guessed cards run without errors', err === 0, err + ' errors'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
