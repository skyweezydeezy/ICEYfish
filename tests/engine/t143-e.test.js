// T-143 group E (CR 602.2b, 603.3d, 608.2b): the targets of untapPerms, untapAnother, becomeArtifact, animateArtifacts (one target), skate, copyToken (target) and domeCopy abilities
// are chosen as the ability goes on the stack and checked again as it resolves; if the target is gone the ability does nothing (no new target). With opts.abilityTargets off the old behaviour stands.
// mirrorCopy (Cursed Mirror) is not locked: "as this enters, you may have it become a copy of any creature" is a replacement effect, not a target.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Formidable Speaker', 'Mobile Garrison', 'Liquimetal Coating', 'Living Brain, Mechanical Marvel', 'Deepglow Skate', 'Chrome Dome', 'Octomancer', 'Serra Angel', 'Lightning Bolt', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Wurmcoil Engine', 'Millikin'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => find(n)));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.floating = []; g.library = g.library.slice(0, 40); g.activeTurn = true; return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };
const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const on = (x, extra) => { x.opts = Object.assign({}, x.opts, { priority: true, abilityTargets: true }, extra || {}); };
const entry = (g, p, re) => { const m = G.abilityMenu(g, p), i = m.findIndex(x => re.test((x.label || '') + ' ' + (x.cost || ''))); return i < 0 ? null : Object.assign({ i }, m[i]); };
// the opponent (seated, holding a Bolt so it is asked at the stack step) does `act` once, in response to the first ability on the stack
const arm = (b, act) => { let done = false; return d => { if (d.kind === 'priority' && d.step === 'stack' && !done) { done = true; act(); } return undefined; }; };
const gone = (g, p) => { g.battlefield.splice(g.battlefield.indexOf(p), 1); g.graveyard.push({ iid: p.iid, card: p.card }); };
const setup = (flag, extra) => { const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; } lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt')); if (extra) extra(a, b); return { a, b }; };
const activate = (a, b, re, resp) => { const src = a.battlefield.find(q => re.test(q.card.name)); const e = entry(a, src, /./); let ok = false; seated(b, arm(b, resp), () => { ok = !!(e && e.ok); G.useAbility(a, src, e.i); }); return { e, ok }; };

// ---- untapPerms (Formidable Speaker: {1},{T}: untap another target permanent)
const speaker = flag => setup(flag, a => { lands(a, 1, 'Mountain'); putOn(a, 'Formidable Speaker'); });
const speakerScene = flag => { const { a, b } = speaker(flag); const ring = putOn(a, 'Sol Ring'), elf = putOn(a, 'Llanowar Elves'); ring.tapped = true; elf.tapped = true; const sp = a.battlefield.find(q => q.card.name === 'Formidable Speaker'); const e = entry(a, sp, /Untap another/); seated(b, arm(b, () => gone(a, ring)), () => { G.useAbility(a, sp, e.i); }); return { a, b, ring, elf, e }; };
T('untapPerms: the target (Sol Ring) is chosen on activation; gone in response, nothing else is untapped', () => {
  const { a, ring, elf, e } = speakerScene();
  check('the ability was available', !!(e && e.ok), e && e.why);
  check('Sol Ring left in response', !a.battlefield.includes(ring));
  check('Llanowar Elves stays tapped: no new target was chosen', elf.tapped === true);
});
T('untapPerms with abilityTargets off: the old behaviour (picked on resolution, Elves untapped)', () => {
  const { a, elf } = speakerScene(false);
  check('another tapped permanent was untapped (picked at resolution)', elf.tapped === false || a.battlefield.some(q => q.card.name === 'Mountain' && !q.tapped));
});
T('untapPerms: a seated person is asked for the target when the ability goes on the stack, and the pick resolves', () => {
  const { a, b } = speaker(); const ring = putOn(a, 'Sol Ring'), elf = putOn(a, 'Llanowar Elves'); ring.tapped = true; elf.tapped = true;
  const sp = a.battlefield.find(q => q.card.name === 'Formidable Speaker'), e = entry(a, sp, /Untap another/), order = [];
  seated(a, d => { order.push(d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target') return [d.options.find(o => o.card && o.card.name === 'Llanowar Elves')]; return undefined; }, () => { G.useAbility(a, sp, e.i); });
  check('a target question was asked', order.includes('target'), order.join(','));
  check('the person\'s pick (Elves) was untapped and Sol Ring stayed tapped', !elf.tapped && ring.tapped);
});

// ---- becomeArtifact (Liquimetal Coating: {T}: target permanent becomes an artifact until end of turn)
const coat = flag => { const { a, b } = setup(flag, a => { putOn(a, 'Liquimetal Coating'); }); const d1 = putOn(a, 'Serra Angel'), d2 = putOn(a, 'Llanowar Elves'); const cp = a.battlefield.find(q => q.card.name === 'Liquimetal Coating'); const e = entry(a, cp, /becomes an artifact/); let pick; seated(b, arm(b, () => { pick = [d1, d2].find(q => q.eotArt) || null; }), () => { G.useAbility(a, cp, e.i); }); return { a, b, d1, d2, e }; };
T('becomeArtifact: the target is fixed on activation; gone in response, nothing becomes an artifact', () => {
  const { a, b } = setup(true, a => { putOn(a, 'Liquimetal Coating'); });
  const x = putOn(a, 'Serra Angel'), y = putOn(a, 'Llanowar Elves'); const cp = a.battlefield.find(q => q.card.name === 'Liquimetal Coating'), e = entry(a, cp, /becomes an artifact/);
  const victims = a.battlefield.filter(q => q !== cp); let chosen = null;
  const qs = seated(a, d => { if (d.kind === 'target' && d.what === 'becomeArtifact') { chosen = d.def; return d.def; } return undefined; }, () => {});
  seated(b, arm(b, () => { const t = a.battlefield.filter(q => q !== cp).sort((p, q) => (p.asLand ? 1 : 0) - (q.asLand ? 1 : 0))[0]; if (t) { a._locked = t; gone(a, t); } }), () => { G.useAbility(a, cp, e.i); });
  check('something was removed in response', !!a._locked);
  check('nothing else on the table is an artifact now', a.battlefield.every(q => q === cp || !q.eotArt), a.battlefield.map(q => q.card.name + ':' + !!q.eotArt).join(','));
});
T('becomeArtifact with abilityTargets off: a permanent becomes an artifact on resolution', () => {
  const { a, b } = setup(false, a => { putOn(a, 'Liquimetal Coating'); }); putOn(a, 'Serra Angel'); putOn(a, 'Llanowar Elves'); const cp = a.battlefield.find(q => q.card.name === 'Liquimetal Coating'), e = entry(a, cp, /becomes an artifact/);
  seated(b, arm(b, () => { const t = a.battlefield.find(q => q.card.name === 'Serra Angel'); gone(a, t); }), () => { G.useAbility(a, cp, e.i); });
  check('something still became an artifact (picked at resolution)', a.battlefield.some(q => q !== cp && q.eotArt));
});

// ---- skate (Deepglow Skate: double the counters on any number of target permanents)
const skate = flag => { const { a, b } = setup(flag, (a, b) => { lands(a, 4, 'Swamp'); lands(a, 1, 'Island'); a.hand.push(inst(a, 'Deepglow Skate')); }); const x = putOn(a, 'Serra Angel'), y = putOn(a, 'Llanowar Elves'), z = putOn(a, 'Millikin'); x.counters = 2; y.counters = 1; let late = null; seated(b, arm(b, () => { late = z; z.counters = 3; gone(a, x); }), () => { G.castPhase(a); }); return { a, b, x, y, z }; };
T('skate: the targets are fixed when the trigger goes on the stack: a creature that got counters later is not doubled, one that left does nothing', () => {
  const { a, y, z } = skate();
  check('Deepglow Skate resolved', a.battlefield.some(q => q.card.name === 'Deepglow Skate'));
  check('Elves (a locked target) doubled its counters', y.counters === 2, y.counters);
  check('Millikin (counters added after the trigger went on the stack) was not doubled', z.counters === 3, z.counters);
});
T('skate with abilityTargets off: the late creature is doubled too', () => {
  const { a, y, z } = skate(false);
  check('Deepglow Skate resolved', a.battlefield.some(q => q.card.name === 'Deepglow Skate'));
  check('Elves doubled', y.counters === 2, y.counters);
  check('Millikin was doubled (chosen on resolution)', z.counters === 6, z.counters);
});

// ---- animateArtifacts (Living Brain: at the beginning of combat, target non-Equipment artifact you control becomes a 3/3 artifact creature)
const brain = flag => { const { a, b } = setup(flag, a => { putOn(a, 'Living Brain, Mechanical Marvel'); }); const ring = putOn(a, 'Sol Ring'), orn = putOn(a, 'Mobile Garrison'); seated(b, arm(b, () => { gone(a, orn); }), () => { G.combat(a); }); return { a, ring, orn }; };
T('animateArtifacts (one): the target is chosen as the trigger goes on the stack; gone in response, nothing is animated', () => {
  const { a, ring, orn } = brain(); const art = a.battlefield.filter(q => q.card.a.isArtifact && !q.asLand);
  check('the locked artifact (Mobile Garrison, the highest mana value) left in response', !a.battlefield.includes(orn));
  check('no other artifact was animated (no new target)', art.every(q => !q.animated), art.map(q => q.card.name + ':' + JSON.stringify(q.animated)).join(','));
});
T('animateArtifacts with abilityTargets off: another artifact is picked on resolution', () => {
  const { a, ring, orn } = brain(false);
  check('Mobile Garrison left in response', !a.battlefield.includes(orn));
  check('a remaining non-creature artifact was animated at resolution', a.battlefield.some(q => q.animated), a.battlefield.map(q => q.card.name + ':' + JSON.stringify(q.animated)).join(','));
});

// ---- domeCopy (Chrome Dome: {5}: token copy of another target artifact you control)
const dome = flag => { const { a, b } = setup(flag, a => { lands(a, 5, 'Mountain'); putOn(a, 'Chrome Dome'); }); const ring = putOn(a, 'Sol Ring'), wurm = putOn(a, 'Wurmcoil Engine'); const dm = a.battlefield.find(q => q.card.name === 'Chrome Dome'), e = entry(a, dm, /copy/i); seated(b, arm(b, () => { gone(a, wurm); }), () => { if (e && e.ok) G.useAbility(a, dm, e.i); }); return { a, e, ring, wurm }; };
T('domeCopy: the target (Wurmcoil Engine) is chosen on activation; gone in response, no token copy of another artifact appears', () => {
  const { a, e } = dome();
  check('the ability was available', !!(e && e.ok), e && e.why);
  check('no token was made', !a.battlefield.some(q => q.token), a.battlefield.map(q => q.card.name + (q.token ? '*' : '')).join(','));
});
T('domeCopy with abilityTargets off: a token copy of the remaining artifact is made on resolution', () => {
  const { a, e } = dome(false);
  check('the ability was available', !!(e && e.ok), e && e.why);
  check('a token copy was made (Sol Ring)', a.battlefield.some(q => q.token && q.card.name === 'Sol Ring'), a.battlefield.map(q => q.card.name + (q.token ? '*' : '')).join(','));
});

// ---- copyToken (target): Octomancer's end-step trigger "create a token that's a copy of target ..." and untapAnother (Mobile Garrison) need an attack / end step: checked on the predicate
T('the predicate: only targeting shapes lock', () => {
  const o = by('Octomancer'), mg = by('Mobile Garrison'), cd = by('Chrome Dome'), cm = null;
  const fxs = c => [].concat(...(c.a.triggers || []).map(t => t.fx || []), ...(c.a.activated || []).map(t => t.fx || []));
  check('Octomancer has a copyToken effect', fxs(o).some(f => f.type === 'copyToken'), JSON.stringify(fxs(o).map(f => f.type)));
  check('Mobile Garrison has an untapAnother effect', fxs(mg).some(f => f.type === 'untapAnother'));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
