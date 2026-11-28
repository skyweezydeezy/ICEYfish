// T-098: every mana source in the 50 built-in decks makes mana. A land, rock or dork is put on the battlefield untapped and unsick in a bare game beside some fodder (creatures,
// artifacts, basic lands); allUnits must see mana from it and pay() must tap it. Treasures and rituals too. Sources that make mana through another path (sacrifice, hand,
// imprint, restricted mana) are listed with the reason and checked to be read ('ok'). NO_MANA is the ledger of FALSE 'ok' lines found by T-098: cards whose mana line reads 'ok' although no
// rule gives them mana (Springleaf Drum and its tap-a-creature family, Three Tree Mascot; the Signets were built by T-098). The test asserts they still make none, so it fails the day a card is
// fixed and the card must leave the ledger. The Signets are checked below.
const L = require('../../tools/engine/lib.js'), G = L.engine();
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => L.db().byName.get(n);
const NO_MANA = ['Citanul Stalwart', 'Three Tree Mascot'];
const OTHER = { 'Krark-Clan Ironworks': 'sacrifice', 'Phyrexian Altar': 'sacrifice', "Ashnod's Altar": 'sacrifice', 'Skirk Prospector': 'sacrifice', 'Elvish Spirit Guide': 'from hand', 'Simian Spirit Guide': 'from hand', "Lion's Eye Diamond": 'discard', 'Chrome Mox': 'imprint', 'Vivi Ornitier': 'X mana', 'Gilded Goose': 'Food', 'Pili-Pala': 'untap cost', 'Grand Architect': 'restricted', 'Gyre Sage': 'counters', 'The Cabbage Merchant': 'Foods', 'Mox Opal': 'metalcraft', 'Mishra\'s Workshop': 'restricted', 'Giada, Font of Hope': 'restricted', 'Master of Dark Rites': 'sacrifice, restricted', 'Gwenna, Eyes of Gaea': 'restricted', 'Bag End Banquet': 'per Food' };
const MANA = /^[^:"]*:\s*add\b/im, seen = new Map();
for (const d of L.index().decks) for (const c of L.loadDeck(d)) if (!seen.has(c.name)) seen.set(c.name, c);
const FOD = [['Gigantosaurus', 2], ['Ornithopter', 3], ['Swamp', 3]];
const EXTRA = { 'Selvala, Heart of the Wilds': ['Forest'] };          // a mana ability that costs {G}: it needs a green source to pay it (net X - 1 mana)
function bare(c, extra) {
  const deck = G.buildDeck([c].concat(FOD.map(f => by(f[0]))).concat((extra || []).map(n => by(n))).map(x => Object.assign({}, x, { qty: 1 })), []);
  const g = G.newGame(deck, Object.assign({}, L.O), 3); g.turn = 5; g.hand = []; g.battlefield = []; g.command = []; g.graveyard.length = 0; g.exile = []; g.library = [];
  const put = nm => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: deck.unique.find(x => x.name === nm) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = g.turn - 1; return p; };
  return { g, deck, put };
}
let n = 0; const bad = [];
for (const [name, c] of seen) {
  const first = (c.type_line || '').split('//')[0];
  if (/Instant|Sorcery|Planeswalker/.test(first) || !MANA.test((c.oracle_text || '').split('//')[0]) && !/Basic Land/.test(first)) continue;
  if (/Land/.test(first) && !/Basic/.test(first) && !MANA.test(c.oracle_text || '')) continue;
  if (OTHER[name] || NO_MANA.includes(name.split(' // ')[0])) continue;
  n++;
  try {
    const { g, put } = bare(c, EXTRA[name]); for (const [f, k] of FOD) for (let i = 0; i < k; i++) put(f); for (const f of EXTRA[name] || []) put(f); G.flushLeaves(g, []); G.touch(g);
    const base = G.allUnits(g).length, p = put(c.name.split(' // ')[0] === c.name ? c.name : g.battlefield[0].card.name && (c.name)); G.flushLeaves(g, []); G.touch(g);
    const now = G.allUnits(g);
    if (!(now.length > base || now.some(u => u.src === p))) bad.push(name);
  } catch (e) { bad.push(name + ' (threw: ' + e.message + ')'); }
}
check(`${n} plain mana sources in the built-in decks: each one makes mana (allUnits sees it)`, !bad.length, bad.join(' | '));
// pay() taps the source: a bare game with only that source
const payBad = [];
for (const name of ['Sol Ring', 'Llanowar Elves', 'Arcane Signet', 'Mind Stone', 'Forest', 'Command Tower', 'Birds of Paradise']) {
  if (!seen.has(name)) continue;
  const { g, put } = bare(seen.get(name)); const p = put(name); G.flushLeaves(g, []); G.touch(g);
  const u0 = G.allUnits(g).length, r = G.pay(g, { generic: 1, pips: [], x: 0 });
  check(`${name}: paying {1} works and uses the source up`, r != null && (p.tapped || !g.battlefield.includes(p)) && G.allUnits(g).length < u0, u0 + ' -> ' + G.allUnits(g).length);
}
// a Treasure
{ const { g, put } = bare(by('Sol Ring')); G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Treasure' }, 1, [], null); G.touch(g);
  const t = g.battlefield.find(q => q.card.name === 'Treasure');
  check('a Treasure token makes one mana', !!t && G.allUnits(g).some(u => u.src === t));
  const r = G.pay(g, { generic: 1, pips: [], x: 0 }); check('...and paying with it sacrifices it', r != null && !g.battlefield.includes(t)); }
// the ledger of false 'ok' lines: the line reads 'ok' (a generic matcher), but the card still makes no mana
for (const name of NO_MANA) { const c = by(name); if (!c) { check(name + ' is in the database', false); continue; }
  const { g, put } = bare(c); for (const [f, k] of FOD) for (let i = 0; i < k; i++) put(f); G.flushLeaves(g, []); G.touch(g);
  const base = G.allUnits(g).length, p = put(name); G.flushLeaves(g, []); G.touch(g);
  check(`${name}: KNOWN FALSE 'ok': still makes no mana (when a rule builds it, remove it from NO_MANA)`, G.allUnits(g).length === base && !G.allUnits(g).some(u => u.src === p), G.allUnits(g).length + ' vs ' + base); }
// the Signets: {1}, {T}: Add two colors. One more mana than they use, so alone they make none; paying with one taps another source for the {1}
for (const [name, cols] of [['Azorius Signet', 'WU'], ['Dimir Signet', 'UB'], ['Orzhov Signet', 'WB'], ['Simic Signet', 'GU'], ['Izzet Signet', 'UR'], ['Selesnya Signet', 'GW']]) {
  const c = by(name), mk = n => bare(c); let { g, put } = mk(); put('Swamp'); put(name); G.flushLeaves(g, []); G.touch(g);
  const u = G.allUnits(g), sig = u.find(x => x.src && x.src.signetOf);
  check(`${name}: with a Swamp it makes two mana, the Signet's of ${cols}`, u.length === 2 && sig && cols.split('').every(x => sig.colors.has(x)), u.length);
  const r = G.pay(g, { generic: 0, pips: [[cols[0]]], x: 0 });
  check(`${name}: paying {${cols[0]}} taps the Signet and the Swamp that paid its {1}`, r != null && g.battlefield.every(q => q.tapped), g.battlefield.map(q => q.card.name + (q.tapped ? 'T' : '-')).join(','));
  ({ g, put } = mk()); put(name); G.flushLeaves(g, []); G.touch(g); check(`${name}: alone it makes nothing (it has no {1} to pay)`, G.allUnits(g).length === 0); }
// a Signet beside a T-097 fodder source (Springleaf Drum): the Signet's {1} may be paid by the Drum's mana, which taps the Drum and its creature
{ const c = by('Azorius Signet'); const { g, put } = bare(c, ['Springleaf Drum']); put('Springleaf Drum'); put('Gigantosaurus'); put('Azorius Signet'); G.flushLeaves(g, []); G.touch(g);
  const u0 = G.allUnits(g).length, r = G.pay(g, { generic: u0, pips: [], x: 0 });
  check('Signet + Springleaf Drum + a creature: paying everything works and leaves no free mana', r != null && G.allUnits(g).length === 0, u0 + ' units, left ' + G.allUnits(g).length);
  const t = g.battlefield.map(q => q.card.name + (q.tapped ? 'T' : '-')).join(',');
  check('...the Drum, the creature and the Signet are all tapped', g.battlefield.every(q => q.tapped), t); }
for (const [name, why] of Object.entries(OTHER)) { const c = by(name); if (!c) { check(name + ' is in the database', false); continue; }
  const a = G.analyze(Object.assign({ qty: 1 }, c), ['W', 'U', 'B', 'R', 'G']), aa = a.a || a; const line = aa.coverage.find(r => MANA.test(r.text));
  check(`${name} (${why}): its mana line is read, not ignored`, !!line && line.status !== 'ignored', line && line.status); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
