#!/usr/bin/env node
// T-131: builds goldfish/static/data/fuzzy-index.json, the lines the engine already builds, for "Guess unknown rules" (docs/briefs/t131-fuzzy-rules.md).
//   node tools/build-fuzzy-index.js          rebuild the file
//   node tools/build-fuzzy-index.js --check  say whether the file is current (exit 1 if not): the set data it was built from is hashed into it
// A template is a rules line (the card's own name written ~) that reads 'ok' and builds something, alone on a card of its kind, in a card of the set data.
// One template is kept for each distinct shape (numbers, mana symbols, colours, creature types and counter names count as the same), so the file stays small.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', 'goldfish', 'static', 'data', 'sets'), OUT = path.join(__dirname, '..', 'goldfish', 'static', 'data', 'fuzzy-index.json');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const hash = crypto.createHash('sha1'); for (const f of files) hash.update(f + '\0' + fs.readFileSync(path.join(DIR, f)));
const sets = hash.digest('hex').slice(0, 16);
if (process.argv.includes('--check')) {
  let cur = null; try { cur = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* missing */ }
  if (!cur || cur.sets !== sets) { console.log('fuzzy-index.json is stale: run node tools/build-fuzzy-index.js'); process.exit(1); }
  console.log('fuzzy-index.json is current (' + cur.templates.length + ' templates)'); process.exit(0);
}
G.setTribe('Merfolk'); G.traceCoverage(true);
const types = new Set(), cards = [];
for (const f of files) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).cards) {
  if (c.ref || !c.oracle_text) continue;
  const tl = String(c.type_line || '').split(' // ')[0];
  if (/\bCreature\b/.test(tl) && /—/.test(tl)) for (const t of tl.split('—')[1].trim().split(/\s+/)) if (/^[A-Za-z]+$/.test(t) && t.length > 2) types.add(t.toLowerCase());
  cards.push(c);
}
G.setFuzzy({ templates: [], types: [...types] });          // only for its slot list (the shape key below); no templates, so nothing is guessed
const seen = new Map(), colors = ['W', 'U', 'B', 'R', 'G'];
const shape = line => G.fuzzyShape(line);
for (const c of cards) {
  let a; try { a = G.analyze(c, colors); } catch (e) { continue; }
  for (const r of a.coverage || []) {
    if (r.back || r.status !== 'ok' || r.tag || !r.trace || !r.trace.changed) continue;
    const t = r.text; if (/^•|^\d+\+ \| |^Solved — /.test(t) || t.split(/\s+/).length < 5 || /\n/.test(t)) continue;
    const k = shape(t); if (!seen.has(k)) seen.set(k, { t, c });
  }
}
G.traceCoverage(false);
// keep a template only if it still reads ok and builds something when it is the card's only line (that is how it is put on another card)
const out = [];
for (const { t, c } of seen.values()) {
  const solo = Object.assign({}, c, { oracle_text: t, front_oracle: t, keywords: [], faces: [] }); delete solo.a;
  G.traceCoverage(true);
  let a; try { a = G.analyze(solo, colors); } catch (e) { G.traceCoverage(false); continue; }
  G.traceCoverage(false);
  const r = (a.coverage || []).find(x => x.text === t);
  if (r && r.status === 'ok' && r.trace && r.trace.changed) out.push([t, c.name]);
}
out.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
fs.writeFileSync(OUT, JSON.stringify({ v: 1, sets, types: [...types].sort(), templates: out }));
console.log('fuzzy-index.json: ' + out.length + ' templates from ' + cards.length + ' cards, ' + types.size + ' creature types, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
