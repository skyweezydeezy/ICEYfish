// T-127 stage 4 (docs/PRIORITY-DESIGN.md), with opts.priority on: an activated ability goes on the stack (CR 602.2) and can be responded to; costs are paid at activation.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Arcane Encyclopedia'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };


const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const on = (x, extra) => { x.opts = Object.assign({}, x.opts, { priority: true }, extra || {}); };

const abil = (g, p) => G.abilityMenu(g, p).findIndex(a => /draw a card/i.test(a.label));
T('CR 602.2 / 117.4: a seated opponent may respond to an activated ability; the response resolves first (405.5)', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 3, 'Mountain'); lands(a, 3, 'Mountain'); const mf = putOn(a, 'Arcane Encyclopedia'); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt);
  const i = abil(a, mf); check('the ability is listed and usable', i >= 0 && G.abilityMenu(a, mf)[i].ok);
  const before = G.ABIL_STATS.stacked, h0 = a.hand.length;
  const qs = seated(b, d => d.kind === 'priority' && d.step === 'stack' ? d.options.find(o => o.card && o.card.name === 'Lightning Bolt') : undefined, () => { G.useAbility(a, mf, i); });
  const q = qs.find(x => x.d.kind === 'priority' && x.d.step === 'stack');
  check('asked at the stack step with the ability on top', !!q && /Arcane Encyclopedia/.test(q.q.title), q && q.q.title);
  check('the Bolt was cast in response', b.graveyard.includes(bolt));
  check('the cost ({T} and {3}) was paid at activation, and the card was drawn when it resolved', mf.tapped && a.hand.length === h0 + 1, a.hand.length + ' vs ' + h0);
  check('the stack is empty afterwards', (a.match.stack || []).length === 0);
  check('counted as stacked', G.ABIL_STATS.stacked === before + 1);
});
T('with the rule off the ability resolves in one piece and nothing is asked (legacy path)', () => {
  const [a, b] = match2(); a.opts.priority = false; b.opts.priority = false; lands(b, 3, 'Mountain'); lands(a, 3, 'Mountain'); const mf = putOn(a, 'Arcane Encyclopedia'); b.hand.push(inst(b, 'Lightning Bolt'));
  const l0 = G.ABIL_STATS.legacy, s0 = G.ABIL_STATS.stacked, i = abil(a, mf);
  const qs = seated(b, null, () => { G.useAbility(a, mf, i); });
  check('no priority question', qs.filter(x => x.d.kind === 'priority').length === 0);
  check('not stacked, counted legacy', G.ABIL_STATS.stacked === s0 && G.ABIL_STATS.legacy === l0 + 1);
});
T('goldfish: with the rule on and nobody seated the ability still resolves at once and the stack is left empty', () => {
  const g = bare(5); on(g); lands(g, 3, 'Mountain'); const mf = putOn(g, 'Arcane Encyclopedia'); const h0 = g.hand.length;
  G.useAbility(g, mf, abil(g, mf));
  check('the card was drawn and the stack is empty', g.hand.length === h0 + 1 && (g.stack || []).length === 0, g.hand.length + ' vs ' + h0);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
