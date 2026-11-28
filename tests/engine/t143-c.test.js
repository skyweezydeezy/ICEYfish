// T-143 group C (CR 602.2b / 603.3d / 608.2b): fight (bite), flickerOne, flickerwisp and the oath flicker choose their target(s) as the ability goes on the stack and check them again as it resolves.
// flickerTwo (Ghostly Flicker) and flickerAll (Eerie Interlude) exist only as spell effects in the card data, and spells lock only the base group, so they are left out (no card can exercise them as an ability).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Lightning Bolt', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Forest', 'Plains', 'Llanowar Elves', 'Ravenous Chupacabra', "Hunter's Talent", 'Felidar Guardian', 'Flickerwisp', 'Oath of Teferi', 'Hullbreaker Horror', 'Wurmcoil Engine', 'Mulldrifter'];
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
const on = (x, extra) => { x.opts = Object.assign({}, x.opts, { priority: true, abilityTargets: true }, extra || {}); };
const gone = (x, p) => { const i = x.battlefield.indexOf(p); if (i >= 0) { x.battlefield.splice(i, 1); x.graveyard.push({ iid: p.iid, card: p.card }); } return i >= 0; };
// the opponent (seated, holding an instant so it is asked at the stack step) removes `victim` of `owner` in response
const respond = (b, owner, victim) => d => { if (d.kind === 'priority' && d.step === 'stack' && !victim.gone) victim.gone = gone(owner, victim); return undefined; };
const noteTexts = ev => (ev || []).map(e => e.text || '').join(' | ');

// ---- fight (Hunter's Talent: the biter and the bitten creature) ----
const fightScene = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 3, 'Forest'); a.hand.push(inst(a, "Hunter's Talent"));
  const dragon = putOn(a, 'Shivan Dragon');
  const angel = putOn(b, 'Serra Angel'), elves = putOn(b, 'Llanowar Elves'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, dragon, angel, elves };
};
T('fight/bite: the bitten creature (Serra Angel) is chosen when the trigger goes on the stack; if it leaves in response, nothing else is bitten', () => {
  const { a, b, dragon, angel, elves } = fightScene();
  seated(b, (d, q) => respond(b, b, angel)(d), () => { G.castPhase(a); });
  check('Hunter\'s Talent is on the table', a.battlefield.some(x => x.card.name === "Hunter's Talent"));
  check('the response happened (Serra Angel left)', !!angel.gone && !b.battlefield.includes(angel));
  check('Llanowar Elves was not bitten: no new target on resolution', b.battlefield.includes(elves));
  check('Shivan Dragon is untouched', a.battlefield.includes(dragon) && !(dragon.dmg > 0));
});
T('fight/bite: the biter leaving in response also stops the effect (both targets are checked)', () => {
  const { a, b, dragon, angel, elves } = fightScene();
  const dragon2 = putOn(a, 'Shivan Dragon');
  seated(b, (d, q) => { if (d.kind === 'priority' && d.step === 'stack') { if (!dragon.gone) dragon.gone = gone(a, dragon); if (!dragon2.gone) dragon2.gone = gone(a, dragon2); } }, () => { G.castPhase(a); });
  check('both of the caster\'s dragons left in response', !!dragon.gone && !!dragon2.gone);
  check('nothing of the opponent died (no new fighter was chosen)', b.battlefield.includes(angel) && b.battlefield.includes(elves));
});
T('fight/bite with abilityTargets off: the old behaviour (the target is picked at resolution, Llanowar Elves is bitten)', () => {
  const { a, b, angel, elves } = fightScene(false);
  seated(b, (d, q) => respond(b, b, angel)(d), () => { G.castPhase(a); });
  check('Llanowar Elves died (picked at resolution)', !b.battlefield.includes(elves));
});
T('fight/bite: a seated person is asked for the biter and the bitten creature before the stack question', () => {
  const [a, b] = match2(); on(a); on(b);
  lands(b, 3, 'Forest'); b.hand.push(inst(b, "Hunter's Talent")); const dragon = putOn(b, 'Shivan Dragon');
  const angel = putOn(a, 'Serra Angel'), elves = putOn(a, 'Llanowar Elves'), order = [];
  seated(b, (d, q) => { order.push(d.kind === 'target' ? 'target:' + d.what : d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target' && d.what === 'bitten') return d.options.find(o => o.card && o.card.name === 'Llanowar Elves') || undefined; return undefined; }, () => { G.castPhase(b); });
  const stackAt = order.indexOf('priority:stack');
  check('both questions were asked, before any stack question', order.indexOf('target:biter') >= 0 && order.indexOf('target:bitten') >= 0 && (stackAt < 0 || (order.indexOf('target:bitten') < stackAt)), order.join(','));
  check('the person\'s pick (Llanowar Elves) was bitten, Serra Angel stayed', !a.battlefield.includes(elves) && a.battlefield.includes(angel) && b.battlefield.includes(dragon), a.battlefield.map(x => x.card.name).join(','));
  check('each question was asked once (not again at resolution)', order.filter(x => x === 'target:bitten').length === 1, order.join(','));
});

// ---- flickerOne (Felidar Guardian: another creature of yours) ----
const guardScene = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 4, 'Plains'); a.hand.push(inst(a, 'Felidar Guardian'));
  const wisp = putOn(a, 'Flickerwisp'), chupa = putOn(a, 'Ravenous Chupacabra');
  lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, wisp, chupa };
};
T('flickerOne: the creature to flicker is chosen when the trigger goes on the stack; if it leaves in response, no other creature is flickered', () => {
  const { a, b, wisp, chupa } = guardScene();
  // find out which one the autopilot picks, with a plain run
  const probe = guardScene(); G.castPhase(probe.a);
  const picked = [probe.wisp, probe.chupa].find(p => !probe.a.battlefield.includes(p));
  check('probe: the autopilot flickers one of them (inline pick)', !!picked, probe.a.battlefield.map(x => x.card.name).join(','));
  const which = picked === probe.wisp ? wisp : chupa, other = which === wisp ? chupa : wisp;
  seated(b, respond(b, a, which), () => { G.castPhase(a); });
  check('Felidar Guardian is on the table', a.battlefield.some(x => x.card.name === 'Felidar Guardian'));
  check('the response happened', !!which.gone && !a.battlefield.includes(which));
  check('the other creature was not flickered (still the same permanent)', a.battlefield.includes(other));
});
T('flickerOne with abilityTargets off: the old behaviour (the other creature is picked at resolution and flickered)', () => {
  const probe = guardScene(); G.castPhase(probe.a);
  const picked = [probe.wisp, probe.chupa].find(p => !probe.a.battlefield.includes(p));
  const { a, b, wisp, chupa } = guardScene(false);
  const which = picked === probe.wisp ? wisp : chupa, other = which === wisp ? chupa : wisp;
  seated(b, respond(b, a, which), () => { G.castPhase(a); });
  check('the other creature was flickered at resolution (a new permanent)', !a.battlefield.includes(other) || !!a.battlefield.find(x => x.card === other.card && x !== other), a.battlefield.map(x => x.card.name).join(','));
});

// ---- flickerwisp (their token or your permanent) ----
const wispScene = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 3, 'Plains'); a.hand.push(inst(a, 'Flickerwisp'));
  const guard = putOn(a, 'Felidar Guardian'), chupa = putOn(a, 'Ravenous Chupacabra');
  putOn(b, 'Serra Angel'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, chupa, guard };
};
T('flickerwisp: the permanent is chosen when the trigger goes on the stack; if it leaves in response, nothing is exiled', () => {
  const { a, b, chupa, guard } = wispScene();
  const probe = wispScene(false); G.castPhase(probe.a); const inl = probe.a.exile.length + (probe.a.endFlicker || []).length;
  check('probe: with the option off the autopilot exiles a card at resolution', inl >= 1, inl);
  seated(b, respond(b, a, guard), () => { G.castPhase(a); });
  check('Flickerwisp is on the table', a.battlefield.some(x => x.card.name === 'Flickerwisp'));
  check('the response happened (the autopilot\'s pick, Felidar Guardian, left)', !!guard.gone);
  check('no card of the caster was exiled', !(a.exile || []).length && !(a.endFlicker || []).length, 'exile ' + (a.exile || []).length);
});
T('flickerwisp with abilityTargets off: the old behaviour (a card is exiled at resolution when the first pick is gone)', () => {
  const { a, b, chupa, guard } = wispScene(false);
  seated(b, respond(b, a, guard), () => { G.castPhase(a); });
  check('Flickerwisp is on the table', a.battlefield.some(x => x.card.name === 'Flickerwisp'));
  check('the response happened', !!guard.gone);
  check('the pick was made at resolution: another card (Ravenous Chupacabra) was exiled', a.exile.length + (a.endFlicker || []).length >= 1, 'exile ' + a.exile.length);
});
T('flickerwisp: a seated person is asked for the target before the stack question and the pick is exiled until the end step', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 3, 'Plains'); b.hand.push(inst(b, 'Flickerwisp'));
  const chupa = putOn(b, 'Ravenous Chupacabra'), order = [];
  seated(b, (d, q) => { order.push(d.kind === 'target' ? 'target:' + d.what : d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target' && d.what === 'flickerwisp') return d.options.find(o => o.card && o.card.name === 'Ravenous Chupacabra') || undefined; return undefined; }, () => { G.castPhase(b); });
  check('the target question came before the stack question and was asked once', order.filter(x => x === 'target:flickerwisp').length === 1 && (order.indexOf('priority:stack') < 0 || order.indexOf('target:flickerwisp') < order.indexOf('priority:stack')), order.join(','));
  check('Ravenous Chupacabra was exiled until the end step', !b.battlefield.includes(chupa) && b.exile.some(i => i.card.name === 'Ravenous Chupacabra'), b.exile.map(i => i.card.name).join(','));
});

// ---- oath flicker (Oath of Teferi) ----
const oathScene = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 4, 'Plains'); lands(a, 1, 'Island');
  const chupa = putOn(a, 'Mulldrifter'), chupa2 = putOn(a, 'Mulldrifter'); a.hand = [inst(a, 'Oath of Teferi')];          // (their enter ability drew cards)
  lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, chupa, chupa2 };
};
T('oath flicker: the permanent is chosen when the trigger goes on the stack; if it leaves in response, nothing is exiled', () => {
  const { a, b, chupa } = oathScene();
  seated(b, respond(b, a, chupa), () => { G.castPhase(a); });
  check('Oath of Teferi is on the table', a.battlefield.some(x => x.card.name === 'Oath of Teferi'));
  check('the response happened', !!chupa.gone);
  check('nothing was set to return at the end step (the second Mulldrifter was not chosen instead)', !(a.flickering || []).length && !(a.exile || []).length, 'flickering ' + (a.flickering || []).length);
});
T('oath flicker with abilityTargets off: the old behaviour (the second Mulldrifter is picked at resolution)', () => {
  const { a, b, chupa } = oathScene(false);
  seated(b, respond(b, a, chupa), () => { G.castPhase(a); });
  check('the response happened and the other creature is set to return at the end step', !!chupa.gone && (a.flickering || []).length === 1, (a.flickering || []).length);
});
T('oath flicker: a seated person is asked once, before the stack question, and the pick returns at the end step', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 4, 'Plains'); lands(b, 1, 'Island'); b.hand.push(inst(b, 'Oath of Teferi'));
  const chupa = putOn(b, 'Mulldrifter'), order = []; b.hand = [inst(b, 'Oath of Teferi')];
  seated(b, (d, q) => { order.push(d.kind === 'target' ? 'target:' + d.what : d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target' && d.what === 'oath') return d.options.find(o => o.card && o.card.name === 'Mulldrifter') || undefined; return undefined; }, () => { G.castPhase(b); });
  check('asked once and before the stack question', order.filter(x => x === 'target:oath').length === 1 && (order.indexOf('priority:stack') < 0 || order.indexOf('target:oath') < order.indexOf('priority:stack')), order.join(','));
  check('Mulldrifter was exiled to return at the end step', !b.battlefield.includes(chupa) && (b.flickering || []).some(i => i.card.name === 'Mulldrifter'), (b.flickering || []).length);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
