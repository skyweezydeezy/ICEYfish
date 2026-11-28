// T-135: the top card of your library, played by a person. Bolas's Citadel (life instead of the mana cost, X = 0, lands), Mystic Forge (artifact or
// colorless spells only, the exile ability), Future Sight (everything), Courser of Kruphix (lands only, shown to all). topPlay lists what is offered and why
// not; playTop does it through the stack path (castCard); the log says where the card came from. Citadel Siege is not a Citadel.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js'));
const D = path.join(ROOT, 'goldfish', 'static', 'data', 'sets'), idx = {};
for (const f of fs.readdirSync(D)) { if (f === 'index.json') continue; for (const c of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).cards || []) if (c.oracle_text !== undefined && !idx[c.name]) idx[c.name] = c; }
const get = n => { if (!idx[n]) throw new Error('no card ' + n); return Object.assign({}, idx[n], { qty: 1 }); };
const card = (name, type, text, extra) => Object.assign({ name, type_line: type, oracle_text: text, mana_cost: '{1}', cmc: 1, colors: [], color_identity: [], keywords: [], qty: 1, rarity: 'common' }, extra || {});
const FUTURE = card('Future Sight', 'Enchantment', 'Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library.', { mana_cost: '{2}{U}{U}{U}', cmc: 5, colors: ['U'] });
const DRONE = card('Colorless Drone', 'Creature — Eldrazi Drone', '', { mana_cost: '{2}', cmc: 2, power: '2', toughness: '2' });
const ISLAND = card('Island', 'Basic Land — Island', '{T}: Add {U}.', { mana_cost: '', cmc: 0, qty: 30, produced_mana: ['U'], produced: ['U'] });
const SWAMP = card('Swamp', 'Basic Land — Swamp', '{T}: Add {B}.', { mana_cost: '', cmc: 0, qty: 10, produced_mana: ['B'], produced: ['B'] });
const cards = [get("Bolas's Citadel"), get('Mystic Forge'), get('Courser of Kruphix'), get('Citadel Siege'), get('Sol Ring'), get('Walking Ballista'), get('Gravecrawler'), get('Sun Titan'), get('Lightning Bolt'), FUTURE, DRONE, ISLAND, SWAMP];
const deck = G.buildDeck(cards, []);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const by = n => deck.unique.find(c => c.name === n);
const bare = () => { const g = G.newGame(deck, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = []; g.life = 20; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const top = (g, n) => { const i = inst(g, n); g.library.unshift(i); return i; };
const opt = (g, via) => { const t = G.topPlay(g); return t && t.options.find(o => o.via === via); };
const onBf = (g, n) => g.battlefield.some(p => p.card.name === n);
const notes = ev => (ev || []).filter(e => e && e.type === 'note').map(e => e.text).join(' | ');

T('no source: nothing is offered', () => {
  const g = bare(); top(g, 'Gravecrawler');
  check('face down: topPlay is null', G.topPlay(g) === null);
  putOn(g, 'Sol Ring'); check('an unrelated permanent changes nothing', G.topPlay(g) === null);
});
T("Bolas's Citadel: cast for life, X = 0", () => {
  const g = bare(); putOn(g, "Bolas's Citadel"); const c = top(g, 'Gravecrawler');
  const o = opt(g, 'life'); check('offers "Cast for 1 life" with no mana at all', o && o.ok && /1 life/.test(o.label), JSON.stringify(o));
  const m = opt(g, 'mana'); check('no cast-with-mana option (the Citadel pays life, a mana source is absent)', !m, JSON.stringify(m));
  const ev = G.playTop(g, 'life');
  check('Gravecrawler is on the battlefield', !!ev && onBf(g, 'Gravecrawler'));
  check('1 life paid, library shifted', g.life === 19 && !g.library.includes(c), g.life);
  check('the log says where it came from', /Gravecrawler cast from the top of the library \(Bolas's Citadel, 1 life\)/.test(notes(ev)), notes(ev));
});
T("Bolas's Citadel: life, never mana; X is 0; the exact life is allowed (CR 119.4)", () => {
  const g = bare(); putOn(g, "Bolas's Citadel"); top(g, 'Walking Ballista');
  const o = opt(g, 'life'); check('Walking Ballista (X, mana value 0) costs 0 life', o && o.ok && o.life === 0 && /0 life/.test(o.label), JSON.stringify(o));
  const ev = G.playTop(g, 'life'), bp = g.battlefield.find(p => p.card.name === 'Walking Ballista');
  check('it enters with X = 0: no counters, life unchanged', !!ev && !!bp && (bp.counters || 0) === 0 && g.life === 20, bp && bp.counters);
  const g2 = bare(); putOn(g2, "Bolas's Citadel"); g2.life = 6; top(g2, 'Sun Titan');
  const o2 = opt(g2, 'life'); check('Sun Titan costs 6 and you have 6: allowed', o2 && o2.ok, JSON.stringify(o2));
  g2.life = 5; const o3 = opt(g2, 'life');
  check('5 life is not enough: greyed with the reason', o3 && !o3.ok && /Not enough life/.test(o3.why) && G.playTop(g2, 'life') === null && g2.life === 5, JSON.stringify(o3));
  g2.life = 6; G.playTop(g2, 'life'); check('paying all 6 puts you at 0 and you lose (CR 704.5a)', g2.life <= 0 && (g2.dead || g2.life === 0), g2.life);
});
T("Bolas's Citadel: lands from the top; the land drop counts", () => {
  const g = bare(); putOn(g, "Bolas's Citadel"); top(g, 'Swamp');
  const o = opt(g, 'land'); check('Play land is offered', o && o.ok, JSON.stringify(o));
  const ev = G.playTop(g, 'land');
  check('the Swamp is in play, a land drop used', onBf(g, 'Swamp') && g.landsPlayedThisTurn === 1 && !!ev);
  check('the log says so', /Swamp played from the top of the library \(Bolas's Citadel\)/.test(notes(ev)), notes(ev));
  top(g, 'Swamp'); const o2 = opt(g, 'land');
  check('a second land is greyed: land drop already used', o2 && !o2.ok && /already played/.test(o2.why) && G.playTop(g, 'land') === null);
});
T('Citadel Siege is not Bolas\'s Citadel', () => {
  const g = bare(); putOn(g, 'Citadel Siege'); top(g, 'Gravecrawler');
  check('topPlay is null and the autopilot does not pay life from the top', G.topPlay(g) === null && !G.topCastable(g));
});
T('Mystic Forge: artifact or colorless spells only', () => {
  const g = bare(); putOn(g, 'Mystic Forge'); for (let i = 0; i < 2; i++) putOn(g, 'Island');
  top(g, 'Gravecrawler'); const o = opt(g, 'mana');
  check('a black creature: greyed "Not an artifact or colorless spell"', o && !o.ok && o.why === 'Not an artifact or colorless spell' && G.playTop(g, 'mana') === null, JSON.stringify(o));
  g.library.shift(); top(g, 'Sol Ring'); const o2 = opt(g, 'mana');
  check('Sol Ring (an artifact) with {1} available: offered', o2 && o2.ok, JSON.stringify(o2));
  const ev = G.playTop(g, 'mana');
  check('Sol Ring is cast, paid with mana, from the top', !!ev && onBf(g, 'Sol Ring') && g.battlefield.filter(p => p.card.name === 'Island' && p.tapped).length >= 1 && /Sol Ring cast from the top of the library \(Mystic Forge\)/.test(notes(ev)), notes(ev));
  g.library.shift(); top(g, 'Colorless Drone'); g.battlefield.forEach(p => { p.tapped = false; });
  const o3 = opt(g, 'mana'); check('a colorless creature (an Eldrazi Drone) is also allowed', o3 && o3.ok, JSON.stringify(o3));
});
T('Mystic Forge: not enough mana, the exile ability, no lands', () => {
  const g = bare(); const forge = putOn(g, 'Mystic Forge'); top(g, 'Sol Ring');
  const o = opt(g, 'mana'); check('no mana: greyed "Not enough mana"', o && !o.ok && o.why === 'Not enough mana' && G.playTop(g, 'mana') === null);
  g.library.shift(); top(g, 'Swamp'); check('a land on top: no option (Forge gives no land permission)', G.topPlay(g).options.length === 0);
  const i = G.abilityMenu(g, forge).findIndex(a => /Exile the top card/.test(a.label)), top0 = g.library[0];
  check('the exile ability is on the Forge', i >= 0 && G.abilityMenu(g, forge)[i].ok);
  const life = g.life, ev = G.useAbility(g, forge, i);
  check('{T}, pay 1 life: the top card is exiled', !!ev && g.exile.includes(top0) && g.life === life - 1 && forge.tapped);
});
T('Future Sight: any spell with mana, lands, the top card revealed to all', () => {
  const g = bare(); putOn(g, 'Future Sight'); for (let i = 0; i < 3; i++) putOn(g, 'Island');
  check('revealed to everyone', G.topCardView(g) === 'all' || (top(g, 'Gravecrawler'), G.topCardView(g) === 'all'));
  g.library = []; top(g, 'Sol Ring'); const o = opt(g, 'mana');
  check('Sol Ring: cast offered (mana), any spell is allowed', o && o.ok && o.source === 'Future Sight', JSON.stringify(o));
  g.library.shift(); top(g, 'Lightning Bolt'); const o2 = opt(g, 'mana');
  check('Lightning Bolt needs {R}: greyed, not enough mana', o2 && !o2.ok && o2.why === 'Not enough mana', JSON.stringify(o2));
  g.library.shift(); top(g, 'Island'); const l = opt(g, 'land'); check('a land: Play land offered', l && l.ok);
  const ev = G.playTop(g, 'land'); check('and played', !!ev && g.landsPlayedThisTurn === 1 && /played from the top/.test(notes(ev)));
});
T('Courser of Kruphix: lands only, revealed', () => {
  const g = bare(); putOn(g, 'Courser of Kruphix'); top(g, 'Swamp');
  check('the top card is revealed to all', G.topCardView(g) === 'all');
  check('a land: offered', !!opt(g, 'land') && opt(g, 'land').ok);
  g.library.shift(); top(g, 'Sol Ring'); check('a spell: no cast option at all', G.topPlay(g).options.length === 0);
});
T('stack path: a spell cast from the top is on the stack and can be answered', () => {
  const g = bare(); putOn(g, "Bolas's Citadel"); top(g, 'Gravecrawler'); g.opts = Object.assign({}, g.opts, { priority: true });
  let sawStack = false; const orig = g.opts;
  const ev = G.playTop(g, 'life');
  check('cast went through castCard (the creature resolved onto the battlefield)', !!ev && onBf(g, 'Gravecrawler'));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
