const L = require('./lib.js'), G = L.engine(), fs = require('fs');
const out = {}; let n = 0;
for (const c of L.db().all) {
  if (!/\b(Planeswalker|Creature|Artifact|Enchantment|Land|Instant|Sorcery|Battle)\b/.test(c.type_line || c.type || '') && c.type_line) continue;
  try { const a = G.analyze(Object.assign({ qty: 1 }, c), ['W','U','B','R','G']); const cov = (a.a || a).coverage || []; out[c.name] = cov.map(r => [r.line || r.text || '', r.status]); n++; } catch (e) { out[c.name] = 'ERR ' + e.message; }
}
fs.writeFileSync(process.argv[2], JSON.stringify(out)); console.log(n);
