// Browser test for a person's choices in the played 1v1 and Pod games (needs playwright, a static server on :8800 and internet access
// to Scryfall): the library search (Vampiric Tutor), two questions in a row (Diabolic Intent), a removal target, the end of the
// opponent's turn, a counterspell when the opponent casts a spell, targets across a pod, the steps of the turn and "Autopilot decides".
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  const loadDeck = async (name, has, extra) => {
    await p.click('[data-tab=deck]');
    await p.fill('#deckText', deck(name) + (extra ? '\n// Specialty\n' + extra : ''));          // the extra test cards make it more than 100: a specialty deck
    await p.click('#loadDeck');
    await p.waitForFunction(n => window.__isf && window.__isf.deck && (window.__isf.cards || []).some(c => c.name === n), has, { timeout: 120000 });
    await p.waitForTimeout(800);
  };
  // the state of the played game; answer everything the game asks with its default until `want` holds
  const state = mode => p.evaluate(m => { const g = window.__isfVersus[m].game; return { phase: g.phase, choice: g.choice ? g.choice.kind : null, over: g.over, turn: g.games[0].turn, step: g.step, acting: g.acting, busy: g.busy }; }, mode);
  const until = async (mode, want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 90000)) {
      const s = await state(mode);
      if (s.over || want(s)) return s;
      if (s.choice) await p.click('.ch-sheet .ch-auto');
      else if (s.phase === 'block') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-block-go').click(), mode);
      else if (s.phase === 'respond') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-pass').click(), mode);
      await p.waitForTimeout(120);
    }
    throw new Error('timed out waiting for the game');
  };
  const start = async mode => {
    await p.click('[data-tab=' + mode + ']');
    for (const sel of await p.$$('#tab-' + mode + ' .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-' + mode + ' .vs-you', 'human');
    await p.selectOption('#tab-' + mode + ' .vs-ask', 'ask');
    await p.click('#tab-' + mode + ' .vs-new');
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 90000 });
    await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-keep').click(), mode);
    return until(mode, s => s.phase === 'main');
  };
  // put cards in my hand and permanents on the table, then redraw
  const arrange = async (mode, spec) => {
    await p.evaluate(({ m, spec }) => {
      const G = window.Goldfish, gm = window.__isfVersus[m].game, me = gm.games[0];
      const find = (g, n) => g.deck.unique.find(c => c.name === n);
      const put = (g, c) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
      if (spec.clear) { me.hand = []; me.battlefield = []; }
      (spec.hand || []).forEach(n => me.hand.push({ iid: me.nextIid++, card: find(me, n) }));
      (spec.lands || []).forEach(([n, k]) => { for (let i = 0; i < k; i++) put(me, find(me, n)); });
      (spec.mine || []).forEach(n => put(me, find(me, n)));
      gm.games.slice(1).forEach(o => { if (spec.oppClear) { o.battlefield = []; } (spec.opp || []).forEach(n => { const c = find(o, n); if (c) put(o, c); }); });
      if (spec.untap) me.battlefield.forEach(q => { q.tapped = false; });
    }, { m: mode, spec });
    await p.evaluate(m => window.__isfVersus.redraw(m), mode);
  };
  const clickHand = async (mode, name) => { const ok = await p.evaluate(({ m, name }) => { const me = window.__isfVersus[m].game.games[0], c = me.hand.find(i => i.card.name === name), el = c && document.querySelector('#tab-' + m + ' .vs-hand .vs-card.can[data-iid="' + c.iid + '"]'); if (el) el.click(); return !!el; }, { m: mode, name }); if (ok) await viewerPick(p); return ok; };          // T-134: the card opens in the viewer; Cast is its button
  const sheet = () => p.evaluate(() => { const s = document.querySelector('.ch-sheet'); if (!s) return null; return { title: s.querySelector('.ch-title').textContent, text: s.querySelector('.ch-text').textContent, tiles: s.querySelectorAll('.ch-opt').length, shown: [...s.querySelectorAll('.ch-opt')].filter(x => !x.hidden).length, def: [...s.querySelectorAll('.ch-opt.def .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), stars: s.querySelectorAll('.ch-star').length, ok: s.querySelector('.ch-ok').textContent, okOff: s.querySelector('.ch-ok').disabled, none: s.querySelector('.ch-none') ? s.querySelector('.ch-none').textContent : null, names: [...s.querySelectorAll('.ch-opt .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), dest: s.querySelector('.ch-dest b') ? s.querySelector('.ch-dest b').textContent : null, fanned: s.classList.contains('fanned'), picked: s.querySelector('.ch-picked') ? s.querySelector('.ch-picked').textContent : null, notes: [...s.querySelectorAll('.ch-opt .ch-note')].map(x => x.textContent) }; });
  const pickTile = async name => { const ok = await p.evaluate(n => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => x.querySelector('.ch-name').textContent.replace(/ ×\d+$/, '') === n); if (b) b.click(); return !!b; }, name); await viewerPick(p); return ok; };
  // "does it resolve?": every spell waits on the stack. Pass on your own spell (or let another player's resolve when you have nothing)
  const stackQ = () => p.evaluate(() => { const q = window.__isfChoices.current(); return q && (q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length)) ? q.kind : null; });
  const passStack = async mode => {
    for (let k = 0; k < 8; k++) {
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return document.querySelector('.ch-sheet') || (!g.acting && !g.busy) || g.over; }, mode, { timeout: 15000 });          // a sheet, or nothing going on (an action of yours, or another player's turn)
      if (!(await stackQ())) return;
      await p.click('.ch-sheet .ch-none'); await p.waitForTimeout(200);
    }
  };
  const log = (mode, n) => p.$$eval('#tab-' + mode + ' .vs-log .vs-line', (ls, n) => ls.slice(-n).map(l => (l.dataset.step ? '[' + l.dataset.step + '] ' : '') + l.textContent), n || 6);

  // ================= 1v1 with the Frodo deck =================
  await loadDeck('frodo', 'Vampiric Tutor');
  await start('duel');
  check('the setup row has "My choices: Ask me / Autopilot decides"', (await p.$$eval('#tab-duel .vs-ask option', os => os.map(o => o.textContent).join(' | '))) === 'Ask me | Autopilot decides');
  await arrange('duel', { clear: true, hand: ['Vampiric Tutor', 'Diabolic Intent', 'Anguished Unmaking', 'Swords to Plowshares'], lands: [['Swamp', 5], ['Plains', 5]], mine: ['Samwise Gamgee', 'Peregrin Took'], oppClear: true, opp: ['Bloodthirsty Conqueror', 'Academy Manufactor'] });

  // ---- the steps of the turn
  const strip = await p.$$eval('#tab-duel .vs-steps i', is => ({ all: is.map(i => i.textContent).join(' '), on: is.filter(i => i.classList.contains('on')).map(i => i.textContent).join(',') }));
  check('the bar shows the steps of the turn, with the one being played lit', strip.all === 'Untap Upkeep Draw Main Combat Main 2 End' && strip.on === 'Main', strip.all + ' / on: ' + strip.on);
  const steps0 = await p.$$eval('#tab-duel .vs-log .vs-line[data-step]', ls => ls.map(l => l.dataset.step + ':' + l.querySelector('.vs-t').textContent));
  check('the log says which step a thing happened in (your draw is in the draw step)', steps0.some(t => /^draw:.*turn \d+ · draw/.test(t)), steps0.slice(-4).join(' | '));

  // ---- a library search: Vampiric Tutor
  const lib0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].library.length);
  check('Vampiric Tutor glows in your hand', await clickHand('duel', 'Vampiric Tutor'));
  await p.waitForSelector('.ch-sheet', { timeout: 10000 });
  let sh = await sheet();
  // ---- the stack: your spell waits, and you may respond to it before the other player answers
  const stk = await p.evaluate(() => { const s = document.querySelector('.ch-sheet'), gm = window.__isfVersus.duel.game; return { kind: gm.choice && gm.choice.kind, spell: !!s.querySelector('.ch-spell .mtg'), note: (s.querySelector('.ch-spell small') || {}).textContent, ok: s.querySelector('.ch-ok').hidden, inHand: gm.games[0].hand.some(i => i.card.name === 'Vampiric Tutor') }; });
  check('casting it first puts it on the stack: "You cast Vampiric Tutor: does it resolve?", the card shown "on the stack", Pass', stk.kind === 'resolve' && sh.title === 'You cast Vampiric Tutor: does it resolve?' && stk.spell && stk.note === 'on the stack' && sh.none === 'Pass' && stk.inHand, sh.title + ' / ' + JSON.stringify(stk));
  check('...your instants you can pay for are offered as responses (Anguished Unmaking, Swords to Plowshares)', sh.names.includes('Anguished Unmaking') && sh.names.includes('Swords to Plowshares') && sh.notes.every(n => /in response: (?:it resolves first|activate)/.test(n)), sh.names.join(', ') + ' / ' + sh.notes.join(' | '));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-stack.png') });
  await p.click('.ch-sheet .ch-none');
  await p.waitForSelector('.ch-sheet.search', { timeout: 10000 });
  sh = await sheet();
  const mid = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; return { kind: gm.choice && gm.choice.kind, opts: gm.choice.options.length, names: new Set(gm.choice.options.map(o => o.name)).size, lib: me.library.length, inHand: me.hand.some(i => i.card.name === 'Vampiric Tutor'), viewHand: gm.preview[0].hand.some(i => i.card.name === 'Vampiric Tutor'), life: me.life, viewLife: gm.preview[0].life }; });
  check('casting it opens the search: every card of your library, one tile per card name', mid.kind === 'search' && /Vampiric Tutor: search your library/.test(sh.title) && mid.opts === lib0 && sh.tiles === mid.names && /top of your library/.test(sh.text), `${sh.title} — ${mid.opts} cards, ${sh.tiles} tiles`);
  check('...the autopilot\'s pick is marked and chosen to begin with', sh.def.length === 1 && sh.stars === 1 && sh.ok === 'Submit' && !sh.okOff && sh.dest === 'Top of your library (after the shuffle)' && sh.fanned, sh.def.join(','));
  check('...the game itself waits: the Tutor is still in your hand, and the table shows the moment of the question', mid.inHand && !mid.viewHand && mid.lib === lib0 && mid.viewLife === mid.life - 2, JSON.stringify(mid));
  check('...the control box says a choice is open', /Vampiric Tutor/.test(await p.$eval('#tab-duel .vs-me', e => e.textContent)) && /Your choice/.test(await p.$eval('#tab-duel .vs-bar', e => e.textContent)));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-search.png') });
  // the deal is random: take a card that is in the library of this game, and not the autopilot's
  const want = await p.evaluate(() => { const q = window.__isfVersus.duel.game.choice; return (q.options.find(o => !o.def && o.name === 'Sol Ring') || q.options.find(o => !o.def && !o.card.a.isLand && !q.options[q.def[0]].name.includes(o.name))).name; });
  await p.fill('.ch-sheet .ch-filter', want.slice(0, 6).toLowerCase());
  sh = await sheet();
  check('the filter narrows the tiles', sh.shown >= 1 && sh.shown < sh.tiles, sh.shown + ' of ' + sh.tiles);
  await p.fill('.ch-sheet .ch-filter', '');
  await pickTile(want);
  sh = await sheet();
  check('clicking a card selects it (it lifts out of the fan) and Submit is ready', sh.ok === 'Submit' && sh.picked === 'Selected: ' + want, sh.picked);
  await p.click('.ch-sheet .ch-peek');
  check('"Look at the table" folds the sheet away, and brings it back', await p.$eval('.ch-sheet', s => s.classList.contains('peek') && getComputedStyle(s.querySelector('.ch-body')).display === 'none'));
  await p.click('.ch-sheet .ch-peek');
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const after = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { top: me.library[0].card.name, lib: me.library.length, hand: me.hand.map(i => i.card.name), gy: me.graveyard.map(i => i.card.name) }; });
  check('the chosen card is on top of your library and the Tutor is in the graveyard', after.top === want && after.lib === lib0 && !after.hand.includes('Vampiric Tutor') && after.gy.includes('Vampiric Tutor'), after.top);
  check('...and the log says so, in the main step', (await log('duel', 3)).some(t => t.startsWith('[main1]') && t.includes('Tutored ' + want + ' to the top')), (await log('duel', 2)).join(' || '));

  // ---- two questions in a row: Diabolic Intent (sacrifice a creature, then search)
  await clickHand('duel', 'Diabolic Intent');
  await p.waitForSelector('.ch-sheet.sacrifice', { timeout: 10000 });          // a cost: asked as it is cast, before the stack
  sh = await sheet();
  check('Diabolic Intent first asks which creature to sacrifice', /sacrifice a creature to cast it/.test(sh.title) && sh.tiles === 2 && sh.none === 'Do not cast it', sh.title + ' — ' + sh.names.join(', '));
  await pickTile('Peregrin Took'); await p.click('.ch-sheet .ch-ok');
  await passStack('duel');
  await p.waitForSelector('.ch-sheet.search', { timeout: 10000 });
  sh = await sheet();
  const viewBf = await p.evaluate(() => window.__isfVersus.duel.game.preview[0].battlefield.some(q => q.card.name === 'Peregrin Took'));
  check('...then what to search for; the table already shows the sacrifice', /Diabolic Intent: search your library/.test(sh.title) && /into your hand/.test(sh.text) && !viewBf, sh.title);
  const autoPick = sh.def[0];
  await p.click('.ch-sheet .ch-auto');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const di = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), bf: me.battlefield.map(q => q.card.name) }; });
  check('"Let the autopilot decide" takes the marked card: it is in your hand, and the creature you chose is gone', di.hand.includes(autoPick) && !di.bf.includes('Peregrin Took') && di.bf.includes('Samwise Gamgee'), autoPick);

  // ---- a removal target
  await clickHand('duel', 'Anguished Unmaking');
  await p.waitForSelector('.ch-sheet.target', { timeout: 10000 });          // the target is chosen as the spell is cast (CR 601.2c), before the stack
  sh = await sheet();
  check('removal asks for its target among the opponent\'s nonland permanents', /Anguished Unmaking: choose a target/.test(sh.title) && sh.names.includes('Bloodthirsty Conqueror') && sh.names.includes('Academy Manufactor') && sh.def.length === 1, sh.names.join(', ') + ' / default ' + sh.def.join(','));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-target.png') });
  const victim = sh.names.find(n => n !== sh.def[0] && /Bloodthirsty|Academy/.test(n));
  await pickTile(victim); await p.click('.ch-sheet .ch-ok');
  await passStack('duel');          // then it waits on the stack: "You cast Anguished Unmaking: does it resolve?"
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 10000 });
  const rm = await p.evaluate(() => { const o = window.__isfVersus.duel.game.games[1]; return { bf: o.battlefield.map(q => q.card.name), ex: o.exile.map(i => i.card.name) }; });
  check('the permanent you chose (not the autopilot\'s) is exiled', !rm.bf.includes(victim) && rm.ex.includes(victim) && rm.bf.includes(sh.def[0]), victim);

  // ---- the end of the opponent's turn
  await arrange('duel', { untap: true });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  // the opponent attacks: you are asked whether to cast an instant now (Swords to Plowshares); say "Not now" and keep it for the end step
  let s = await until('duel', x => (x.choice === 'instant' && x.step === 'combat') || (x.choice === 'instant' && x.step === 'end') || x.phase === 'respond' || (x.phase === 'main' && x.turn >= 2));
  if (s.choice === 'instant' && s.step === 'combat') {
    const iq = await sheet();
    check('when the opponent attacks you are asked whether to cast an instant, with "Not now"', /attacks: cast an instant\?/.test(iq.title) && iq.names.includes('Swords to Plowshares') && iq.none === 'Not now', iq.title + ' / ' + iq.names.join(', '));
    await p.click('.ch-sheet .ch-none');
  } else console.log('SKIP  the opponent did not attack in this game: no instant question at its attack');
  // the end of the opponent's turn: the same question, "End of ...'s turn"; this time cast Swords to Plowshares
  s = await until('duel', x => (x.choice === 'instant' && x.step === 'end') || x.phase === 'respond' || (x.phase === 'main' && x.turn >= 2));
  const eq = s.choice === 'instant' ? await sheet() : null;
  check('at the end of the opponent\'s turn you are asked again, with the End step lit', !!eq && /^End of Copy of your deck's turn: cast an instant\?/.test(eq.title) && eq.names.includes('Swords to Plowshares') && (await p.$$eval('#tab-duel .vs-steps i.on', is => is.map(i => i.textContent).join())) === 'End', eq ? eq.title : JSON.stringify(s) + ' ' + (await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return 'hand: ' + me.hand.map(i => i.card.name).join('/') + ' lands: ' + me.battlefield.filter(q => q.asLand).map(q => q.card.name[0] + (q.tapped ? 'T' : 'u')).join('') + ' gy: ' + me.graveyard.map(i => i.card.name).join('/'); })) + ' ' + (await log('duel', 16)).join(' || '));
  if (eq) {
    if (shot) await p.screenshot({ path: path.join(shot, 'choice-endstep.png') });
    const oppCre = await p.evaluate(() => window.__isfVersus.duel.game.games[1].battlefield.filter(q => window.Goldfish.isCreaturePerm(q)).length);
    await pickTile('Swords to Plowshares'); await p.click('.ch-sheet .ch-ok');
    if (oppCre > 1) { await p.waitForSelector('.ch-sheet.target', { timeout: 10000 }); await p.click('.ch-sheet .ch-ok'); }          // its target is chosen as it is cast (one legal target is not a question)
    await passStack('duel');          // then your instant waits on the stack ("You cast Swords to Plowshares: does it resolve?")
    s = await until('duel', x => x.phase === 'main' && x.turn >= 2);
    const sw = await p.evaluate(() => { const gm = window.__isfVersus.duel.game; return { gy: gm.games[0].graveyard.map(i => i.card.name), cre: gm.games[1].battlefield.filter(q => window.Goldfish.isCreaturePerm(q)).length }; });
    check('...the instant resolves at the end step and the game goes on to your turn, with no second stop for the same instants', sw.gy.includes('Swords to Plowshares') && (oppCre === 0 || sw.cre <= oppCre - 1) && !!s && s.turn >= 2, JSON.stringify(sw));
    check('...the log files it under the opponent\'s end step', (await p.$$eval('#tab-duel .vs-log .vs-line[data-step=end]', ls => ls.map(l => l.textContent))).some(t => /Swords to Plowshares|Exiled/.test(t)));
  }
  const stepsSeen = await p.$$eval('#tab-duel .vs-log .vs-line.b[data-step]', ls => [...new Set(ls.map(l => l.dataset.step))]);
  check('the opponent\'s turn is logged step by step', stepsSeen.includes('draw') && stepsSeen.length >= 2, stepsSeen.join(','));
  const walk = await p.$$eval('#tab-duel .vs-log .vs-line.b[data-step]', ls => { const t = ls[ls.length - 1] && ls[ls.length - 1].querySelector('.vs-t').textContent.match(/turn \d+/)[0]; return ls.filter(l => l.querySelector('.vs-t').textContent.includes(t + ' ')).map(l => l.dataset.step + (l.classList.contains('quiet') ? '(quiet)' : '')); });
  const walkOrder = walk.map(x => x.replace('(quiet)', '')).filter((x, k, l) => l[k - 1] !== x);
  check('every turn goes through every step, logged in order even when nothing happens: untap, upkeep, draw, main, combat, second main, end', walkOrder.join(',') === 'untap,upkeep,draw,main1,combat,main2,end' && walk.some(x => /quiet/.test(x)), walk.join(' '));

  // ---- the cleanup step: more than seven cards at the end of your turn
  if (!(await state('duel')).over && (await state('duel')).phase === 'main') {
    await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; me.battlefield = me.battlefield.filter(q => !q.card.a.statics.noMaxHand); while (me.hand.length < 9) me.hand.push(me.library.shift()); });
    await arrange('duel', {});
    await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
    await p.waitForSelector('.ch-sheet.discard', { timeout: 15000 });
    const cs = await sheet();
    check('ending your turn with nine cards asks what to discard, one card at a time', /End of turn: discard down to 7/.test(cs.title) && /2 to go/.test(cs.text) && cs.def.length === 1 && !cs.none, cs.title + ' / ' + cs.text);
    const first = cs.names.find(n => !cs.def.includes(n)).replace(/ ×\d+$/, '');
    await pickTile(first); await p.click('.ch-sheet .ch-ok');
    await p.waitForFunction(() => /1 to go/.test((document.querySelector('.ch-sheet .ch-text') || {}).textContent || ''), null, { timeout: 10000 });
    await p.click('.ch-sheet .ch-auto');
    await until('duel', x => x.phase === 'main' && x.turn >= 3);
    const cl = await p.$$eval('#tab-duel .vs-log .vs-line.a[data-step=end]', ls => ls.map(l => l.textContent).join(' || '));
    check('...the card you chose is discarded and the log files the cleanup under the end step', /Cleanup: discards down to 7/.test(cl) && cl.includes('Discarded ' + first), cl.slice(-220));
  }

  // ---- "Autopilot decides": no questions
  if (!(await state('duel')).over) {
    await p.selectOption('#tab-duel .vs-ask', 'auto');
    await arrange('duel', { hand: ['Vampiric Tutor'], untap: true });
    const exp = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return window.Goldfish.bestTutorTarget(me, { filters: [] }).inst.card.name; });
    await clickHand('duel', 'Vampiric Tutor');
    await p.waitForTimeout(400);
    const ap = await p.evaluate(() => ({ sheet: !!document.querySelector('.ch-sheet'), top: window.__isfVersus.duel.game.games[0].library[0].card.name }));
    check('with "Autopilot decides" the same Tutor asks nothing and takes the autopilot\'s card', !ap.sheet && ap.top === exp, ap.top);
    await p.selectOption('#tab-duel .vs-ask', 'ask');
  }

  // ================= the Ring tempts you: Frodo attacks after you gained 3 life =================
  await start('duel');
  await arrange('duel', { clear: true, mine: ['Frodo, Adventurous Hobbit', 'Samwise Gamgee'], oppClear: true });
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; me.lifeGainedThisTurn = 3; me.battlefield.forEach(q => { q.sick = false; }); gm.games[1].hand = []; window.__isfVersus.redraw('duel'); });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-attack').click());
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return (g.choice && g.choice.kind === 'ringbearer') || !!g.picking; }, null, { timeout: 15000 });
  if (!(await state('duel')).choice) {                                            // send Frodo only
    await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0], f = me.battlefield.find(q => /^Frodo/.test(q.card.name)); gm.pick = new Set([f.iid]); });
    await p.evaluate(() => document.querySelector('#tab-duel .vs-attack-go').click());
  }
  await p.waitForSelector('.ch-sheet.ringbearer', { timeout: 15000 });
  sh = await sheet();
  check('when the Ring tempts you, the sheet asks which creature becomes your Ring-bearer', /The Ring tempts you \(first time\): choose your Ring-bearer/.test(sh.title) && sh.names.includes('Frodo, Adventurous Hobbit') && sh.names.includes('Samwise Gamgee') && sh.def.length === 1, sh.title + ' / ' + sh.names.join(', '));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-ring.png') });
  await pickTile('Samwise Gamgee'); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet.ringbearer') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const rg = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0], sam = me.battlefield.find(q => q.card.name === 'Samwise Gamgee');
    const el = sam && document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + sam.iid + '"]');
    return { tempts: me.ring && me.ring.tempts, bearer: sam && me.ring.bearer === sam.iid, marked: !!(el && el.classList.contains('ringbearer')), plate: (document.querySelector('#tab-duel .vs-seat.me .vs-ring') || {}).textContent || '' }; });
  check('...Samwise carries the Ring: 💍 on his card and "💍 1" by your name', rg.tempts === 1 && rg.bearer && rg.marked && /💍 1/.test(rg.plate), JSON.stringify(rg));
  check('...and the log says the Ring tempted you', (await log('duel', 6)).some(t => /the Ring tempts you \(1st time\): Samwise Gamgee is the Ring-bearer/.test(t)), (await log('duel', 3)).join(' || '));

  // ================= a planeswalker's loyalty abilities: the menu, and its place in the creature row =================
  await start('duel');
  await arrange('duel', { clear: true, mine: ["Elspeth, Sun's Champion", 'Samwise Gamgee'], oppClear: true });
  const lay = await p.evaluate(() => { const r = document.querySelector('#tab-duel .vs-seat.me .vs-row.front'), w = r && r.querySelector('.vs-grp.walkers'), c = r && r.querySelector('.vs-grp.creatures');
    const name = el => { const me = window.__isfVersus.duel.game.games[0], q = me.battlefield.find(x => String(x.iid) === el.dataset.iid); return q ? q.card.name : '?'; };
    return { walkers: w ? [...w.querySelectorAll('.mtg[data-iid]')].map(name) : [], creatures: c ? [...c.querySelectorAll('.mtg[data-iid]')].map(name) : [], walkersRight: !!(w && c && w.getBoundingClientRect().left > c.getBoundingClientRect().left), backHasPw: !!document.querySelector('#tab-duel .vs-seat.me .vs-row.back .mtg.vs-loyal') }; });
  check('your planeswalker sits in the creature row, at the opposite end from your creatures', lay.walkers.join() === "Elspeth, Sun's Champion" && lay.creatures.includes('Samwise Gamgee') && lay.walkersRight && !lay.backHasPw, JSON.stringify(lay));
  const glow = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0], e = me.battlefield.find(x => /^Elspeth, Sun/.test(x.card.name)); const el = document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + e.iid + '"]'); return { glow: el.classList.contains('vs-loyal'), iid: e.iid }; });
  check('in your main phase it glows: a loyalty ability can be used', glow.glow);
  await p.evaluate(iid => document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]').click(), glow.iid);
  await p.waitForSelector('.ch-sheet.loyalty', { timeout: 10000 });
  const lm = await p.evaluate(() => { const s = document.querySelector('.ch-sheet.loyalty'); return { title: s.querySelector('.ch-title').textContent, tiles: [...s.querySelectorAll('.ch-opt')].map(b => (b.disabled ? '(off) ' : '') + b.querySelector('.ch-name').textContent.slice(0, 26)), notes: [...s.querySelectorAll('.ch-opt.off .ch-note')].map(n => n.textContent), card: !!s.querySelector('.ch-spell .mtg'), ok: s.querySelector('.ch-ok').textContent, none: (s.querySelector('.ch-none') || {}).textContent }; });
  check('clicking it opens the loyalty menu: +1, −3, −7 (dimmed: not enough loyalty), the card shown, "Not now"', /Elspeth, Sun's Champion: loyalty abilities/.test(lm.title) && lm.tiles.length === 3 && lm.tiles.some(t => /^\+1: Create three/.test(t)) && lm.tiles.some(t => /^\(off\) −7/.test(t)) && /needs 7 loyalty/.test(lm.notes.join()) && lm.card && lm.none === 'Not now', JSON.stringify(lm));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-loyalty.png') });
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /^\+1:/.test(x.querySelector('.ch-name').textContent)); b.click(); });
  check('...picking +1 makes the button "Activate +1"', (await p.$eval('.ch-sheet .ch-ok', b => b.textContent)) === 'Activate +1');
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const af = await p.evaluate(iid => { const me = window.__isfVersus.duel.game.games[0], e = me.battlefield.find(x => x.iid === iid); const el = document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]'); return { loyalty: e.loyalty, soldiers: me.battlefield.filter(q => q.token && /Soldier/.test(q.card.name)).length, glow: el.classList.contains('vs-loyal'), badge: (el.querySelector('.loyalty') || {}).textContent }; }, glow.iid);
  check('...+1 resolves: three Soldiers, loyalty 5 (the badge says ◆ 5), and it stops glowing (once a turn)', af.soldiers === 3 && af.loyalty === 5 && af.badge === '◆ 5' && !af.glow, JSON.stringify(af));
  check('...the log names the ability', (await log('duel', 4)).some(t => /Elspeth, Sun's Champion \+1: Create three 1\/1 white Soldier/.test(t)), (await log('duel', 2)).join(' || '));

  // ================= a pod: targets at any opponent =================
  await start('pod');
  await arrange('pod', { clear: true, hand: ['Anguished Unmaking'], lands: [['Swamp', 3], ['Plains', 3]], oppClear: true, opp: ['Academy Manufactor'] });
  await clickHand('pod', 'Anguished Unmaking');
  await p.waitForSelector('.ch-sheet.target', { timeout: 10000 });          // chosen as it is cast
  sh = await sheet();
  const owners = await p.evaluate(() => { const gm = window.__isfVersus.pod.game; return { owners: [...new Set(gm.choice.options.map(o => o.owner))].sort().join(','), focus: gm.games[0].opp.pid, third: gm.choice.options.find(o => o.owner === 3).k }; });
  check('in a pod the target sheet offers the permanents of all three opponents, each under its player\'s name', owners.owners === '1,2,3' && sh.tiles === 3 && new Set(sh.notes.map(n => n.split(' · ')[0])).size === 3, sh.notes.join(' | '));
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-pod-target.png') });
  await p.evaluate(k => document.querySelector('.ch-sheet .ch-opt[data-k="' + k + '"]').click(), owners.third);
  await p.click('.ch-sheet .ch-ok');
  await passStack('pod');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.pod.game.acting, null, { timeout: 10000 });
  const pr = await p.evaluate(() => { const gs = window.__isfVersus.pod.game.games; return { left: gs.slice(1).map(o => o.battlefield.length).join(','), exile: gs[3].exile.map(i => i.card.name).join(','), focus: gs[0].opp.pid }; });
  check('the chosen opponent\'s permanent is exiled, the others stay, and you still face the same player', pr.left === '1,1,0' && pr.exile === 'Academy Manufactor' && pr.focus === owners.focus, JSON.stringify(pr));

  // ================= The Chain Veil, Teferi, Master of Time on the other player's turn, a spell given flash =================
  await loadDeck('frodo', 'Teferi, Master of Time', '1 The Chain Veil\n1 Teferi, Master of Time\n1 Leyline of Anticipation');
  await start('duel');
  await arrange('duel', { clear: true, mine: ["Elspeth, Sun's Champion", 'The Chain Veil'], lands: [['Plains', 4]], oppClear: true });
  const iidOf = n => p.evaluate(n => window.__isfVersus.duel.game.games[0].battlefield.find(q => q.card.name === n).iid, n);
  const glows = iid => p.evaluate(iid => { const el = document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]'); return !!el && el.classList.contains('vs-loyal'); }, iid);
  const els = await iidOf("Elspeth, Sun's Champion"), veil = await iidOf('The Chain Veil');
  check('The Chain Veil glows in your main phase when {4} is free', await glows(veil));
  await p.evaluate(iid => document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]').click(), els);
  await p.waitForSelector('.ch-sheet.loyalty', { timeout: 10000 });
  await p.evaluate(() => [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /^\+1:/.test(x.querySelector('.ch-name').textContent)).click());
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  check('...Elspeth used her +1: she stops glowing', !(await glows(els)));
  await p.evaluate(iid => document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]').click(), veil);
  await p.waitForFunction(() => !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const cv = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { veil: me.battlefield.find(q => q.card.name === 'The Chain Veil').tapped, plains: me.battlefield.filter(q => q.card.name === 'Plains' && q.tapped).length }; });
  check('clicking The Chain Veil pays {4} and taps it; Elspeth glows again, the Veil does not', cv.veil && cv.plains === 4 && (await glows(els)) && !(await glows(veil)), JSON.stringify(cv));
  check('...and the log says every planeswalker may activate again', (await log('duel', 4)).some(t => /The Chain Veil: every planeswalker may activate again/.test(t)), (await log('duel', 2)).join(' || '));
  await arrange('duel', { clear: true, hand: ['Samwise Gamgee'], mine: ['Teferi, Master of Time', 'Leyline of Anticipation'], lands: [['Plains', 3], ['Forest', 3]], oppClear: true });
  const tef = await iidOf('Teferi, Master of Time');
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  s = await until('duel', x => (x.phase === 'respond' || (x.choice === 'protect' && x.step === 'end')) && x.turn >= 1, 90000);
  if (s.choice === 'protect') {          // the engine asks first: the autopilot would activate Teferi here ("Not now": choose on the table)
    sh = await sheet();
    check("at the other player's end step you are asked whether Teferi, Master of Time activates (the autopilot's default)", /^End of the other player's turn: Teferi, Master of Time may activate a loyalty ability: respond\?/.test(sh.title) && sh.none === 'Not now' && sh.def.length === 1, sh.title);
    await p.click('.ch-sheet .ch-none');
    s = await until('duel', x => x.phase === 'respond' && x.turn >= 1, 30000);
  } else check("at the other player's end step you are asked whether Teferi, Master of Time activates (the autopilot's default)", false, JSON.stringify(s));
  if (s.phase === 'respond') {
    const rs = await p.evaluate(iid => { const gm = window.__isfVersus.duel.game, me = gm.games[0], w = me.hand.find(i => i.card.name === 'Samwise Gamgee');
      return { teferi: document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]').classList.contains('vs-loyal'), text: document.querySelector('#tab-duel .vs-me').textContent, sam: !!(w && document.querySelector('#tab-duel .vs-hand .vs-card.can[data-iid="' + w.iid + '"]')), loyalty: me.battlefield.find(q => q.iid === iid).loyalty }; }, tef);
    check("at the end of the other player's turn Teferi, Master of Time glows, and the box says why", rs.teferi && /Teferi, Master of Time glows: click it for a loyalty ability/.test(rs.text), rs.text.slice(0, 200));
    check('...Leyline of Anticipation: the creature in your hand (Samwise Gamgee) glows too: it can be cast now', rs.sam);
    await p.evaluate(iid => document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]').click(), tef);
    await p.waitForSelector('.ch-sheet.loyalty', { timeout: 10000 });
    sh = await sheet();
    check("...clicking Teferi opens his menu for the other player's turn", /Teferi, Master of Time: loyalty abilities/.test(sh.title) && /on another player's turn, once each turn/.test(sh.text), sh.text);
    await p.evaluate(() => [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /^\+1:/.test(x.querySelector('.ch-name').textContent)).click());
    await p.click('.ch-sheet .ch-ok');
    await until('duel', x => !x.choice && !x.acting, 20000);          // its +1 draws, then asks which card to discard: the autopilot's pick
    const ta = await p.evaluate(iid => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; const el = document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + iid + '"]'); return { loyalty: me.battlefield.find(q => q.iid === iid).loyalty, glow: !!el && el.classList.contains('vs-loyal'), phase: gm.phase }; }, tef);
    check("...+1 resolves on the other player's turn (loyalty up by one), and Teferi stops glowing for that turn", ta.loyalty === rs.loyalty + 1 && !ta.glow, JSON.stringify(ta) + ' was ' + rs.loyalty);
    if (ta.phase === 'respond') await p.evaluate(() => document.querySelector('#tab-duel .vs-pass').click());
  } else check("the game reached the end of the other player's turn", false, JSON.stringify(s));

  // ================= 1v1 with a deck that holds counterspells =================
  await loadDeck('veyran', 'Counterspell');
  await start('duel');
  // my turn: Counterspell in hand, two Islands; then the opponent, who has lands and one big spell in hand
  await arrange('duel', { clear: true, hand: ['Counterspell'], lands: [['Island', 2]] });
  await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, op = gm.games[1], find = n => op.deck.unique.find(c => c.name === n);
    op.battlefield = []; op.hand = [];
    for (const n of ['Island', 'Island', 'Mountain', 'Mountain', 'Mountain', 'Mountain']) { const q = G.enterWithTriggers(op, { iid: op.nextIid++, card: find(n) }, {}, []); q.tapped = false; q.enteredTurn = 0; }
    const big = op.deck.unique.filter(c => c.a.isCreature && !c.commander && c.a.castMv >= 4 && c.a.castMv <= 6 && !c.a.cost.x).sort((x, y) => y.a.castMv - x.a.castMv)[0];
    op.hand.push({ iid: op.nextIid++, card: big }); window.__big = big.name;
  });
  const big = await p.evaluate(() => window.__big);
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.over || g.choice || (g.phase === 'main' && g.games[0].turn >= 2) || g.phase === 'block' || g.phase === 'respond'; }, null, { timeout: 60000 });
  s = await state('duel');
  sh = await sheet();
  check('when the opponent casts a spell and you hold a counterspell you can pay for, the game asks', s.choice === 'counter' && !!sh && /casts /.test(sh.title) && sh.names.includes('Counterspell') && sh.none === 'Let it resolve', sh ? sh.title + ' — ' + sh.names.join(', ') : JSON.stringify(s));
  if (sh) {
    const spell = sh.title.replace(/^.* casts /, '').replace(/: does it resolve\?$/, '');
    check('...the spell being cast is shown, the opponent\'s main step is lit', !!(await p.$('.ch-sheet .ch-spell .mtg')) && (await p.$$eval('#tab-duel .vs-steps i.on', is => is.map(i => i.textContent).join())) === 'Main', spell);
    if (shot) await p.screenshot({ path: path.join(shot, 'choice-counter.png') });
    await pickTile('Counterspell'); await p.click('.ch-sheet .ch-ok');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return !g.choice || g.choice.kind !== 'counter' || !g.choice.options.some(o => o.name === 'Counterspell') || !document.querySelector('.ch-sheet'); }, null, { timeout: 10000 });          // its next spell asks "does it resolve?" again
    await until('duel', x => x.phase === 'main' && x.turn >= 2);
    const cr = await p.evaluate(spell => { const gm = window.__isfVersus.duel.game, me = gm.games[0], op = gm.games[1]; return { myGy: me.graveyard.map(i => i.card.name), opGy: op.graveyard.concat(op.command).map(i => i.card.name), opBf: op.battlefield.map(q => q.card.name), spell }; }, spell);
    check('Counterspell counters it: the spell is in the opponent\'s graveyard (a commander: back in the command zone) and never entered the battlefield', cr.myGy.includes('Counterspell') && cr.opGy.includes(spell) && !cr.opBf.includes(spell), spell + (spell === big ? '' : ' (not the set-up spell ' + big + ')'));
    check('...and the log says so, in the opponent\'s main step', (await p.$$eval('#tab-duel .vs-log .vs-line.b[data-step=main1]', ls => ls.map(l => l.textContent))).some(t => /Counterspell counters /.test(t)));
  }
  // ================= explore: Hakbal cast in the first main phase, then every step of the turn in order =================
  await loadDeck('mermaids', 'Hakbal of the Surging Soul');
  await start('duel');
  await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[0];
    gm.games[1].hand = [];                                                                       // no counterspell for the opponent this time
    me.battlefield = me.battlefield.filter(q => !q.asLand);
    ['Island', 'Forest', 'Island', 'Forest'].forEach(n => { const q = G.enterWithTriggers(me, { iid: me.nextIid++, card: me.deck.unique.find(c => c.name === n) }, {}, []); q.tapped = false; q.enteredTurn = 0; });
    const fw = me.library.find(i => i.card.name === 'Force of Will') || me.hand.find(i => i.card.name === 'Force of Will'); [me.library, me.hand].forEach(z => { const j = z.indexOf(fw); if (j >= 0) z.splice(j, 1); }); me.library.unshift(fw);          // on top, wherever it was dealt (the library or the opening hand)
    window.__isfVersus.redraw('duel');
  });
  const hk = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0], h = me.command.find(i => /^Hakbal/.test(i.card.name)), el = document.querySelector('#tab-duel .vs-seat.me .vs-czone .mtg.can[data-iid="' + h.iid + '"]'); if (el) el.click(); return !!el; });
  await passStack('duel');
  await p.waitForFunction(() => !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const cast = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0], h = me.battlefield.find(q => /^Hakbal/.test(q.card.name)); return { ok: !!h, sick: !!(h && h.sick), q: !!document.querySelector('.ch-sheet') }; });
  check('Hakbal is cast from the command zone in the first main phase (summoning sick), and nothing explores yet', hk && cast.ok && cast.sick && !cast.q, JSON.stringify(cast));
  await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; const fw = me.library.find(i => i.card.name === 'Force of Will') || me.hand.find(i => i.card.name === 'Force of Will'); [me.library, me.hand].forEach(z => { const j = z.indexOf(fw); if (j >= 0) z.splice(j, 1); }); me.library.unshift(fw); });          // on top right before combat
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  await p.waitForSelector('.ch-sheet.explore', { timeout: 20000 });
  const at = await p.evaluate(() => ({ step: window.__isfVersus.duel.game.step, lit: [...document.querySelectorAll('#tab-duel .vs-steps i.on')].map(i => i.textContent).join() }));
  sh = await sheet();
  check('End turn goes to combat first: at the beginning of combat Hakbal explores, though summoning sick, and asks about the revealed card', /explores: Force of Will/.test(sh.title) && at.step === 'combat' && at.lit === 'Combat' && sh.names.slice().sort().join(' | ') === 'Keep it on top of your library | Put it into your graveyard' && sh.def.length === 1 && !!(await p.$('.ch-sheet .ch-spell .mtg')), sh.title + ' / step ' + at.step);
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-explore.png') });
  await pickTile('Keep it on top of your library'); await p.click('.ch-sheet .ch-ok');
  await until('duel', x => x.phase === 'main' && x.turn >= 2);
  const xp = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), ctr: (me.battlefield.find(q => /^Hakbal/.test(q.card.name)) || {}).counters }; });
  check('..."keep it on top": Hakbal has its +1/+1 counter and Force of Will is the next card drawn', xp.ctr >= 1 && xp.hand.includes('Force of Will'), JSON.stringify(xp));
  const order = await p.$$eval('#tab-duel .vs-log .vs-line.a[data-step]', ls => ls.filter(l => /turn 1 /.test(l.textContent)).map(l => l.dataset.step + ': ' + l.textContent.replace(/^.*?turn 1 · [a-z ]+ /, '').slice(0, 70)));
  const seq = order.map(x => x.split(':')[0]).filter((x, k, l) => l[k - 1] !== x);
  check('the log walks the steps in order: draw, main, combat (beginning of combat, the explore, no attack), second main or end', seq.indexOf('main1') < seq.indexOf('combat') && order.some(x => /^combat: Beginning of combat/.test(x)) && order.some(x => /^combat: .*explores/.test(x)) && order.some(x => /^combat: No attack/.test(x)) && seq.indexOf('combat') === seq.length - 1 || seq.slice(-1)[0] === 'end' || seq.slice(-1)[0] === 'main2', order.join(' | '));

  // ================= Metallic Mimic announces its creature type, and the type sits on the card =================
  if (!(await state('duel')).over) {
    await arrange('duel', { hand: ['Metallic Mimic'], lands: [['Island', 2]], untap: true });
    check('Metallic Mimic glows in your hand', await clickHand('duel', 'Metallic Mimic'));
    await passStack('duel');
    await p.waitForSelector('.ch-sheet.tribe', { timeout: 15000 });
    sh = await sheet();
    check('as it enters, a sheet asks "Metallic Mimic: choose a creature type": your deck\'s types, the learned one (Merfolk) first and preselected', sh.title === 'Metallic Mimic: choose a creature type' && sh.names[0] === 'Merfolk' && sh.def.length === 1 && sh.def[0] === 'Merfolk' && sh.names.includes('Wizard') && /^learned/.test(sh.notes[0]) && sh.ok === 'Choose Merfolk', sh.names.slice(0, 6).join(', ') + ' / ' + sh.ok);
    if (shot) await p.screenshot({ path: path.join(shot, 'chosen-type-sheet.png') });
    await pickTile('Wizard'); await p.click('.ch-sheet .ch-ok');
    await p.waitForFunction(() => !window.__isfVersus.duel.game.acting && !document.querySelector('.ch-sheet'), null, { timeout: 15000 });
    const mm = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0], q = me.battlefield.find(x => x.card.name === 'Metallic Mimic'), el = q && document.querySelector('#tab-duel .vs-seat.me .mtg[data-iid="' + q.iid + '"]'), tg = el && el.querySelector('.tag.chosen');
      return { on: !!q, tag: tg && tg.textContent, title: tg && tg.title, chosen: q && q.card.chosenType, inside: !!(tg && el.contains(tg)), vis: !!(tg && tg.getBoundingClientRect().width > 10) }; });
    check('choosing Wizard: Metallic Mimic shows "Wizard" on the card, and the engine plays it as a Wizard Mimic', mm.on && mm.tag === 'Wizard' && mm.chosen === 'Wizard' && mm.inside && mm.vis && /The chosen creature type: Wizard/.test(mm.title), JSON.stringify(mm));
    check('...and the log announces it as it enters: "Metallic Mimic: the chosen creature type is Wizard"', (await log('duel', 6)).some(t => /Metallic Mimic: the chosen creature type is Wizard/.test(t)), (await log('duel', 3)).join(' || '));
    if (shot) await p.screenshot({ path: path.join(shot, 'chosen-type-duel.png') });
  }

  // ================= landcycling and transmute from your hand =================
  await loadDeck('frodo', 'Twisted Abomination', '1 Twisted Abomination\n1 Drift of Phantasms\n1 Island');
  await start('duel');
  await arrange('duel', { clear: true, hand: ['Twisted Abomination', 'Drift of Phantasms'], lands: [['Swamp', 2], ['Island', 3]] });
  const btns = await p.$$eval('#tab-duel .vs-hand .vs-asland', bs => bs.map(b => b.textContent));
  check('cards with landcycling and transmute get a button in your hand', btns.includes('Swampcycle') && btns.includes('Transmute'), btns.join(', '));
  await p.evaluate(() => document.querySelector('#tab-duel .vs-hand .vs-cycle').click());
  await p.waitForSelector('.ch-sheet.search', { timeout: 15000 });
  sh = await sheet();
  check('Swampcycle opens the search fan with the lands that have the Swamp type, to your hand', /Twisted Abomination/.test(sh.title) && sh.fanned && sh.dest === 'Your hand' && sh.none === 'Find nothing', sh.title + ' / ' + sh.names.join(', '));
  const land = sh.names.find(n => !sh.def.includes(n)) || sh.names[0];
  await pickTile(land); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const cy = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { hand: me.hand.map(i => i.card.name), gy: me.graveyard.map(i => i.card.name) }; });
  check('...the chosen land is in your hand and Twisted Abomination in the graveyard', cy.hand.includes(land) && cy.gy.includes('Twisted Abomination'), land);
  await p.evaluate(() => document.querySelector('#tab-duel .vs-hand .vs-transmute').click());
  await p.waitForSelector('.ch-sheet.search', { timeout: 15000 });
  sh = await sheet();
  check('Transmute opens the search fan with nonland cards of mana value 3', /Drift of Phantasms/.test(sh.title) && /mana value 3/.test(sh.text), sh.text);
  await p.click('.ch-sheet .ch-auto');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  check('..."Let the autopilot decide": Drift of Phantasms is in the graveyard and a three-drop is in your hand', await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return me.graveyard.some(i => i.card.name === 'Drift of Phantasms') && me.hand.some(i => i.card.a.mv === 3 && !i.card.a.isLand); }));
  // ================= a two-faced card: Esika, God of the Tree // The Prismatic Bridge =================
  await loadDeck('frodo', 'Esika, God of the Tree // The Prismatic Bridge', '1 Esika, God of the Tree // The Prismatic Bridge\n1 Island\n1 Mountain');
  // the Simulation tab: the face Esika is goldfished for
  await p.click('[data-tab=sim]');
  const fb = await p.evaluate(() => { const b = document.querySelector('#faceBox'); return { shown: b && !b.hidden, rows: [...document.querySelectorAll('#faceList .face-row')].map(r => r.textContent.slice(0, 80)), opts: [...document.querySelectorAll('#faceList select option')].map(o => o.textContent) }; });
  const esel = '#faceList select[data-card="Esika, God of the Tree // The Prismatic Bridge"]';
  const eo = await p.$$eval(esel + ' option', os => os.map(o => o.textContent));
  check('the Simulation tab lists every two-faced card (Esika and Jennifer Walters here) with Autopilot / Front face / Back face', fb.shown && fb.rows.length === 2 && fb.rows.some(r => /Esika, God of the Tree/.test(r)) && eo.length === 3 && /^Front face: Esika/.test(eo[1]) && /^Back face: The Prismatic Bridge/.test(eo[2]), eo.join(' | '));
  await p.selectOption(esel, 'back');
  check('...choosing the back face is saved with the deck\'s choices', await p.evaluate(() => { const t = document.querySelector('#plSaved').textContent; return /Two-faced cards = Esika, God of the Tree: back face/.test(t); }), await p.$eval('#plSaved', e => e.textContent.slice(0, 160)));
  // the Goldfish Table: clicking Esika with both faces affordable asks which face; the menu names both faces
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; if (!g.hand.some(i => /^Esika/.test(i.card.name))) { const k = g.library.findIndex(i => /^Esika/.test(i.card.name)); g.hand.push(g.library.splice(k, 1)[0]); }          // in your hand (it may have been dealt there)
    ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Forest'].forEach(n => { const c = g.deck.unique.find(x => x.name === n); const q = G.enter(g, { iid: g.nextIid++, card: c }, {}); q.tapped = false; }); });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);
  const eiid = await p.evaluate(() => window.__isf.game.hand.find(i => /^Esika/.test(i.card.name)).iid);
  await p.evaluate(id => document.querySelector('#zHand .mtg[data-iid="' + id + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })), eiid);
  const menu = await p.$$eval('#ctxMenu button', bs => bs.map(b => b.textContent));
  check('the Goldfish Table\'s card menu offers both faces by name', menu.some(t => /Cast the front: Esika, God of the Tree/.test(t)) && menu.some(t => /Cast the back: The Prismatic Bridge/.test(t)), menu.join(' | '));
  await p.click('#ctxMenu button >> text="▶ Cast"');          // the plain Cast: the face is asked
  await p.waitForSelector('.ch-sheet.face', { timeout: 10000 });
  sh = await sheet();
  const faceSheet = () => p.evaluate(() => { const s = document.querySelector('.ch-sheet.face'), f = s && s.querySelector('.flip'); return s && { title: s.querySelector('.ch-title').textContent, one: s.querySelectorAll('.flip').length === 1 && !s.querySelector('.ch-opt'), flipped: !!(f && f.classList.contains('flipped')), btn: !!(f && f.querySelector('.flip-btn')), info: (s.querySelector('.ch-faceinfo b') || {}).textContent, ok: s.querySelector('.ch-ok').textContent }; });
  let fs1 = await faceSheet();
  check('casting Esika on the Goldfish Table asks which face: one card (not two side by side) with a ⟲ button, turned to the back face set for this deck', !!fs1 && /^Esika, God of the Tree: which face do you cast\?/.test(fs1.title) && fs1.one && fs1.btn && fs1.flipped && fs1.info === 'The Prismatic Bridge' && fs1.ok === 'Cast The Prismatic Bridge', JSON.stringify(fs1));
  await p.click('.ch-sheet .flip-btn'); await p.waitForTimeout(700);
  const fs2 = await faceSheet();
  check('...⟲ swings the card around to the front face, and Submit now casts Esika', !fs2.flipped && fs2.info === 'Esika, God of the Tree' && fs2.ok === 'Cast Esika, God of the Tree', JSON.stringify(fs2));
  await p.click('.ch-sheet .flip-btn'); await p.waitForTimeout(700);
  if (shot) await p.screenshot({ path: path.join(shot, 'choice-face.png') });
  await p.click('.ch-sheet .ch-ok');
  await p.waitForTimeout(800);
  const tb = await p.evaluate(() => { const g = window.__isf.game; return { bridge: g.battlefield.some(q => q.card.name === 'The Prismatic Bridge'), esika: g.battlefield.some(q => q.card.layout === 'modal_dfc' && /^Esika/.test(q.card.name)) }; });
  check('...Submit casts The Prismatic Bridge (not Esika)', tb.bridge && !tb.esika, JSON.stringify(tb));
  // the card viewer: a two-faced card is one card with ⟲, not two pictures side by side
  await p.evaluate(() => { const c = window.__isf.cards.find(x => /^Esika/.test(x.name)), A = window.__isfApi; A.viewCard(window.__isf.deck.unique.find(x => x.name === c.name)); });
  await p.waitForSelector('#lightbox.show .lb-faces .flip', { timeout: 10000 });
  const lv1 = await p.evaluate(() => ({ cards: document.querySelectorAll('#lightbox .lb-faces > .mtg, #lightbox .lb-faces > .flip').length, flipped: document.querySelector('#lightbox .flip').classList.contains('flipped') }));
  await p.click('#lightbox .flip-btn'); await p.waitForTimeout(700);
  const lv2 = await p.evaluate(() => document.querySelector('#lightbox .flip').classList.contains('flipped'));
  await p.keyboard.press('f'); await p.waitForTimeout(700);
  const lv3 = await p.evaluate(() => document.querySelector('#lightbox .flip').classList.contains('flipped'));
  check('the card viewer shows Esika as one card; ⟲ (or the F key) turns it over to The Prismatic Bridge and back', lv1.cards === 1 && !lv1.flipped && lv2 && !lv3, JSON.stringify({ lv1, lv2, lv3 }));
  await p.keyboard.press('Escape');
  // the 1v1 table: the same question; this time cast the front face
  await start('duel');
  await arrange('duel', { clear: true, hand: ['Esika, God of the Tree // The Prismatic Bridge'], lands: [['Plains', 1], ['Island', 1], ['Swamp', 1], ['Mountain', 1], ['Forest', 2]] });
  await clickHand('duel', 'Esika, God of the Tree // The Prismatic Bridge');
  await p.waitForSelector('.ch-sheet.face', { timeout: 10000 });
  if (await p.evaluate(() => document.querySelector('.ch-sheet.face .flip').classList.contains('flipped'))) { await p.click('.ch-sheet .flip-btn'); await p.waitForTimeout(700); }          // turn it to the front
  await p.click('.ch-sheet .ch-ok');
  await passStack('duel');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const dv = await p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { esika: me.battlefield.some(q => q.card.layout === 'modal_dfc' && /^Esika/.test(q.card.name)), bridge: me.battlefield.some(q => q.card.name === 'The Prismatic Bridge') }; });
  check('in a 1v1 game the same question comes up; choosing the front casts Esika', dv.esika && !dv.bridge, JSON.stringify(dv));
  await p.click('[data-tab=sim]'); await p.selectOption(esel, 'auto');          // leave the deck's choices as they were

  // ================= the Goldfish Table asks too: Imperial Seal, and the cleanup discard =================
  await loadDeck('frodo', 'Imperial Seal', '1 Imperial Seal\n1 The Chain Veil\n1 Metallic Mimic');
  await p.click('[data-tab=table]');
  await p.click('#tNew'); await p.waitForTimeout(600);
  await p.waitForFunction(() => window.__isf.game && !document.querySelector('.ch-sheet'), null, { timeout: 30000 }).catch(async () => { await p.click('.ch-sheet .ch-auto'); });
  await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; if (!g.hand.some(i => i.card.name === 'Imperial Seal')) { const k = g.library.findIndex(i => i.card.name === 'Imperial Seal'); g.hand.push(g.library.splice(k, 1)[0]); }          // it may have been dealt into your hand
    const sw = g.deck.unique.find(x => x.name === 'Swamp'); const q = G.enter(g, { iid: g.nextIid++, card: sw }, {}); q.tapped = false; });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  const seal = await p.evaluate(() => window.__isf.game.hand.find(i => i.card.name === 'Imperial Seal').iid);
  await p.evaluate(id => document.querySelector('#zHand .mtg[data-iid="' + id + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })), seal);
  await p.click('#ctxMenu button >> text="▶ Cast"');
  await p.waitForSelector('.ch-sheet.search', { timeout: 10000 });
  sh = await sheet();
  const lib = await p.evaluate(() => window.__isf.game.library.length);
  check('Goldfish Table: casting Imperial Seal opens the search fan with your whole library, going on top', /Imperial Seal: search your library/.test(sh.title) && sh.fanned && sh.dest === 'Top of your library (after the shuffle)' && (await p.evaluate(() => window.__isfChoices.current().options.length)) === lib, sh.title + ' / ' + lib + ' cards');
  const pickS = sh.names.find(n => !sh.def.includes(n) && n !== 'Imperial Seal');
  await pickTile(pickS); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 }); await p.waitForTimeout(1200);
  const gs = await p.evaluate(() => { const g = window.__isf.game; return { top: g.library[0].card.name, gy: g.graveyard.map(i => i.card.name), life: g.life, log: [...document.querySelectorAll('#gameLog li')].slice(-3).map(l => l.textContent).join(' | ') }; });
  check('...the card you picked is on top of your library, the Seal in the graveyard, 2 life paid', gs.top === pickS && gs.gy.includes('Imperial Seal') && gs.life === 38, JSON.stringify(gs));
  await p.evaluate(() => { const g = window.__isf.game; g.battlefield = g.battlefield.filter(q => !q.card.a.statics.noMaxHand); while (g.hand.length < 9) g.hand.push(g.library.shift()); });
  await p.click('#tNext');
  await p.waitForSelector('.ch-sheet.discard', { timeout: 20000 });
  sh = await sheet();
  check('Goldfish Table: Next turn with nine cards asks what to discard at cleanup', /End of turn: discard down to 7/.test(sh.title), sh.title);
  await p.click('.ch-sheet .ch-auto'); await p.waitForSelector('.ch-sheet.discard', { timeout: 10000 }); await p.click('.ch-sheet .ch-auto');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && window.__isf.game.turn >= 2, null, { timeout: 20000 });
  check('...and the next turn begins with seven cards (plus the one drawn)', await p.evaluate(() => window.__isf.game.hand.length === 8));
  await p.click('#tAuto'); await p.waitForTimeout(2500);
  check('Goldfish Table: "Autopilot turn" still plays by itself, without questions', !(await p.$('.ch-sheet')));
  // the Practice table: the same planeswalker menu, from the card's menu
  await p.waitForFunction(() => !window.__isf.busy, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; g.battlefield = g.battlefield.filter(q => !q.card.a.isPlaneswalker); const c = g.deck.unique.find(x => x.name === "Elspeth, Sun's Champion"); const q = G.enter(g, { iid: g.nextIid++, card: c }, {}); q.loyalty = 4; q.enteredTurn = g.turn; window.__pw = q.iid; });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);
  const pwRow = await p.evaluate(() => { const row = document.querySelector('#zCreatures'), el = row.querySelector('.mtg[data-iid="' + window.__pw + '"]'); const kids = [...row.children]; const sp = kids.findIndex(k => k.classList.contains('row-spacer')), at = kids.findIndex(k => k.contains(el)); return { inRow: !!el, afterSpacer: sp >= 0 && at > sp, glow: !!(el && el.classList.contains('castable')) }; });
  check('Practice: the planeswalker sits in the creature row past a spacer (its far end), glowing', pwRow.inRow && pwRow.afterSpacer && pwRow.glow, JSON.stringify(pwRow));
  await p.evaluate(() => document.querySelector('#zCreatures .mtg[data-iid="' + window.__pw + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })));
  await p.click('#ctxMenu button >> text="◆ Loyalty abilities…"');
  await p.waitForSelector('.ch-sheet.loyalty', { timeout: 10000 });
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /^\+1:/.test(x.querySelector('.ch-name').textContent)); b.click(); });
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 }); await p.waitForTimeout(1200);
  const pa = await p.evaluate(() => { const g = window.__isf.game, e = g.battlefield.find(q => q.iid === window.__pw); return { loyalty: e && e.loyalty, soldiers: g.battlefield.filter(q => q.token && /Soldier/.test(q.card.name)).length, log: [...document.querySelectorAll('#gameLog li')].slice(-3).map(l => l.textContent).join(' | ') }; });
  check('..."◆ Loyalty abilities…" opens the same menu; +1 makes three Soldiers and loyalty 5', pa.loyalty === 5 && pa.soldiers >= 3, JSON.stringify(pa));
  await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game, put = n => { const q = G.enter(g, { iid: g.nextIid++, card: g.deck.unique.find(x => x.name === n) }, {}); q.tapped = false; return q; };
    g.battlefield.filter(q => q.card.a.isLand).forEach(q => { q.tapped = true; }); for (let k = 0; k < 4; k++) put('Plains'); window.__veil = put('The Chain Veil').iid; });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);
  const pwOff = await p.evaluate(() => document.querySelector('.bf-row .mtg[data-iid="' + window.__pw + '"]').classList.contains('castable'));
  await p.evaluate(() => document.querySelector('.bf-row .mtg[data-iid="' + window.__veil + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })));
  const veilItem = await p.$$eval('#ctxMenu button', bs => bs.map(b => b.textContent).find(t => /Chain Veil|Activate: \{4\}/.test(t)) || '');
  check('Practice: The Chain Veil\'s card menu offers its activation', /^◆ Activate: \{4\}, tap: one more loyalty ability/.test(veilItem) && !pwOff, veilItem + ' / Elspeth glowing before: ' + pwOff);
  await p.click('#ctxMenu button >> text=/^◆ Activate: \\{4\\}/');
  await p.waitForTimeout(1500);
  const pv = await p.evaluate(() => { const g = window.__isf.game, v = g.battlefield.find(q => q.iid === window.__veil); return { tapped: v.tapped, glow: document.querySelector('.bf-row .mtg[data-iid="' + window.__pw + '"]').classList.contains('castable') }; });
  check('...activating it taps the Veil, and Elspeth can activate again (she glows)', pv.tapped && pv.glow, JSON.stringify(pv));

  // the Practice table: the chosen type on Metallic Mimic too
  await p.evaluate(() => { const G = window.Goldfish, g = window.__isf.game; const q = G.enter(g, { iid: g.nextIid++, card: g.deck.unique.find(x => x.name === 'Metallic Mimic') }, {}); q.sick = false; window.__mimic = q.iid; });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(800);
  const pm = await p.evaluate(() => { const g = window.__isf.game, el = document.querySelector('.bf-row .mtg[data-iid="' + window.__mimic + '"]'), tg = el && el.querySelector('.tag.chosen'); return { tag: tg && tg.textContent, tribe: g.deck.tribe }; });
  check('Practice: Metallic Mimic shows its chosen type on the card (the deck\'s type)', !!pm.tag && pm.tag === pm.tribe, JSON.stringify(pm));
  check('...and the Game log announces it', await p.$$eval('#gameLog li', (ls, t) => ls.some(l => l.textContent === 'Metallic Mimic: the chosen creature type is ' + t), pm.tribe), (await p.$$eval('#gameLog li', ls => ls.slice(-3).map(l => l.textContent))).join(' | '));
  if (shot) await p.screenshot({ path: path.join(shot, 'chosen-type-practice.png') });

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
