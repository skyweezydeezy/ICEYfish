// T-135: the exposed top card of the library is playable. Tap it: the menu / the viewer offers what the cards in play allow right now (Play land, Cast with mana,
// Cast for N life with Bolas's Citadel), what is not allowed is greyed with the reason, and playing it goes through the stack and logs where the card came from.
// Practice (PC and phone) and Duel.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = ["1 Bolas's Citadel", '1 Mystic Forge', '1 Courser of Kruphix', '1 Sol Ring', '1 Experimental Frenzy', '1 Gravecrawler', '1 Sun Titan', '1 Lightning Bolt', '30 Swamp', '10 Island'].join('\n');
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 1000 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_dice', '0'); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.selectOption('#optFormat', '60');
    await p.fill('#deckText', DECK);
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    await p.click('[data-tab=table]');
    await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
    // put a card in play (not through the hand), and put the named cards on top of the library, then draw one junk card so the table redraws
    const put = n => p.evaluate(n => { const g = window.__isf.game, G = window.Goldfish; const k = g.library.findIndex(i => i.card.name === n), i = k >= 0 ? g.library.splice(k, 1)[0] : g.hand.find(x => x.card.name === n); const pm = G.enterWithTriggers(g, i, {}, []); pm.sick = false; return !!pm; }, n);
    const setTop = n => p.evaluate(n => { const g = window.__isf.game, u = x => g.deck.unique.find(c => c.name === x); const k = g.library.findIndex(i => i.card.name === n); const c = k >= 0 ? g.library.splice(k, 1)[0] : { iid: g.nextIid++, card: u(n) }; g.library.unshift(c); g.library.unshift({ iid: g.nextIid++, card: u('Swamp') }); }, n);
    const redraw = async () => { await p.click('#zLibrary .card-back'); await p.waitForTimeout(500); };
    const menu = async () => { await p.evaluate(() => document.querySelector('#zLibrary .lib-top .mtg').click()); await p.waitForSelector('#ctxMenu', { state: 'visible' }); await p.waitForTimeout(450); return p.$$eval('#ctxMenu button', bs => bs.map(b => b.textContent.trim())); };
    const clickItem = async re => { await p.evaluate(src => { const b = [...document.querySelectorAll('#ctxMenu button')].find(x => new RegExp(src).test(x.textContent)); b.click(); }, re); await p.waitForTimeout(700); };
    const logText = () => p.$eval('#gameLog', e => e.textContent);
    const state = () => p.evaluate(() => { const g = window.__isf.game; return { life: g.life, bf: g.battlefield.map(x => x.card.name), lib: g.library.length, top: g.library[0] && g.library[0].card.name, lands: g.landsPlayedThisTurn }; });
    // ---- Practice ----
    await setTop('Gravecrawler'); await redraw();
    check(`${name} Practice: no source in play, the pile stays face down`, await p.$eval('#zLibrary .lib-top', e => e.hidden));
    await put("Bolas's Citadel"); await setTop('Gravecrawler'); await redraw();
    let items = await menu();
    check(`${name} Practice: Bolas's Citadel: tapping the top card offers "Cast for 1 life" (and View card)`, items.some(t => /Cast for 1 life/.test(t)) && items.some(t => /View card/.test(t)), items.join(' | '));
    let s0 = await state(); await clickItem('Cast for 1 life'); let s1 = await state();
    check(`${name} Practice: it is cast: on the battlefield, 1 life paid, no mana`, s1.bf.includes('Gravecrawler') && s1.life === s0.life - 1, JSON.stringify([s0.life, s1.life]));
    check(`${name} Practice: the log says where it came from`, /Gravecrawler cast from the top of the library \(Bolas's Citadel, 1 life\)/.test(await logText()), (await logText()).slice(-200));
    await setTop('Sun Titan'); await p.evaluate(() => { window.__isf.game.life = 5; }); await redraw();
    items = await menu(); check(`${name} Practice: not enough life: the item says why`, items.some(t => /Cast for 6 life.*Not enough life/.test(t)), items.join(' | '));
    await clickItem('View card'); await p.waitForSelector('#lightbox', { state: 'visible' });
    const off = await p.$$eval('#lightbox .lb-act', bs => bs.map(b => ({ t: b.textContent, dis: b.disabled })));
    check(`${name} Practice: in the viewer it is greyed with the reason`, off.some(o => o.dis && /Cast for 6 life/.test(o.t) && /Not enough life/.test(o.t)), JSON.stringify(off));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await setTop('Swamp'); await redraw(); items = await menu();
    check(`${name} Practice: a land on top: Play land`, items.some(t => /Play land/.test(t)), items.join(' | '));
    s0 = await state(); await clickItem('Play land'); s1 = await state();
    check(`${name} Practice: the land is played from the top (a land drop)`, s1.bf.filter(x => x === 'Swamp').length >= 1 && s1.lands === s0.lands + 1, JSON.stringify([s0, s1]));
    // ---- Mystic Forge: artifacts only ----
    await p.evaluate(() => { const g = window.__isf.game; g.battlefield = g.battlefield.filter(x => x.card.name !== "Bolas's Citadel"); g.landsPlayedThisTurn = 0; });
    await put('Mystic Forge'); await setTop('Gravecrawler'); await redraw(); items = await menu();
    check(`${name} Practice: Mystic Forge: a black creature is greyed "Not an artifact or colorless spell"`, items.some(t => /Cast.*Not an artifact or colorless spell/.test(t)), items.join(' | '));
    await p.keyboard.press('Escape');
    // ---- Courser: revealed; lands only ----
    await put('Courser of Kruphix'); await setTop('Sol Ring'); await redraw(); items = await menu();
    check(`${name} Practice: Mystic Forge with Sol Ring on top and a Swamp untapped: Cast offered, no "not now"`, items.some(t => /▶ Cast \(Mystic Forge\)$/.test(t)), items.join(' | '));
    await clickItem('▶ Cast \\(Mystic Forge\\)'); s1 = await state();
    check(`${name} Practice: Sol Ring is cast from the top with mana, and logged`, s1.bf.includes('Sol Ring') && /Sol Ring cast from the top of the library \(Mystic Forge\)/.test(await logText()), JSON.stringify(s1.bf) + (await logText()).slice(-160));
    await setTop('Sun Titan'); await redraw(); items = await menu();
    check(`${name} Practice: no mana left (or too little): Not enough mana`, items.some(t => /Cast.*(Not enough mana|Not an artifact)/.test(t)), items.join(' | '));
    await p.keyboard.press('Escape');
    // ---- Experimental Frenzy: no cards from the hand ----
    await put('Experimental Frenzy');
    await p.evaluate(() => { const g = window.__isf.game; g.hand.push({ iid: g.nextIid++, card: g.deck.unique.find(c => c.name === 'Sol Ring') }); });
    await redraw();
    await p.evaluate(() => { const hs = [...document.querySelectorAll('#zHand .mtg')]; hs[hs.length - 1].click(); }); await p.waitForSelector('#ctxMenu', { state: 'visible' }); await p.waitForTimeout(450);
    items = await p.$$eval('#ctxMenu button', bs => bs.map(b => b.textContent.trim()));
    check(`${name} Practice: Experimental Frenzy: a hand card shows Cast greyed with the reason`, items.some(t => /Cast.*Experimental Frenzy: you can't play cards from your hand/.test(t)), items.join(' | '));
    await p.keyboard.press('Escape');
    check(`${name} Practice: no page errors so far`, errs.length === 0, errs.join(' | '));
    if (name === 'PC') {
      // ---- Duel ----
      await p.click('[data-tab=duel]');
      await p.selectOption('#tab-duel .vs-opp', '');
      await p.click('#tab-duel .vs-new');
      await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
      await p.click('#tab-duel .vs-keep');
      await p.waitForSelector('#tab-duel .vs-end', { timeout: 90000 });
      const dsetup = (cit) => p.evaluate(cit => { const gm = window.__isfVersus.duel.game, g = gm.games[0], G = window.Goldfish, u = x => g.deck.unique.find(c => c.name === x);
        g.battlefield = g.battlefield.filter(q => !/Bolas|Forge|Courser/.test(q.card.name)); const pm = G.enterWithTriggers(g, { iid: g.nextIid++, card: u(cit.src) }, {}, []); pm.sick = false;
        g.library.unshift({ iid: g.nextIid++, card: u(cit.top) }); g.life = cit.life; window.__isfVersus.redraw('duel'); }, cit);
      await dsetup({ src: "Bolas's Citadel", top: 'Gravecrawler', life: 20 }); await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('#tab-duel .vs-seat.me .vs-pile.lib.top-open .mtg').click()); await p.waitForSelector('#lightbox', { state: 'visible' });
      let acts = await p.$$eval('#lightbox .lb-act', bs => bs.map(b => ({ t: b.textContent, dis: b.disabled })));
      check('Duel: tapping your exposed top card opens the viewer with "Cast for 1 life"', acts.some(a => !a.dis && /Cast for 1 life/.test(a.t)), JSON.stringify(acts));
      const l0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].life);
      await p.waitForTimeout(400);
      await p.evaluate(() => { [...document.querySelectorAll('#lightbox .lb-act')].find(b => /Cast for 1 life/.test(b.textContent)).click(); }); await p.waitForTimeout(1500);
      await p.waitForSelector('.ch-none', { state: 'visible', timeout: 20000 });
      check('Duel: the opponent gets the response window: "You cast Gravecrawler: does it resolve?" (the stack, as for a card from the hand)', /does it resolve/.test(await p.evaluate(() => window.__isfVersus.duel.game.choice && window.__isfVersus.duel.game.choice.title || '')));
      await p.click('.ch-none'); await p.waitForTimeout(1500);
      const dres = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; return { life: g.life, bf: g.battlefield.some(q => q.card.name === 'Gravecrawler') }; });
      check('Duel: it is cast for life (1 paid) and enters', dres.bf && dres.life === l0 - 1, JSON.stringify([l0, dres, await p.$eval('#tab-duel .vs-note', e => e.textContent)]));
      await p.keyboard.press('Escape').catch(() => {});
      await dsetup({ src: 'Mystic Forge', top: 'Lightning Bolt', life: 20 }); await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('#tab-duel .vs-seat.me .vs-pile.lib.top-open .mtg').click()); await p.waitForSelector('#lightbox', { state: 'visible' });
      acts = await p.$$eval('#lightbox .lb-act', bs => bs.map(b => ({ t: b.textContent, dis: b.disabled })));
      check('Duel: Mystic Forge, a red instant on top: greyed "Not an artifact or colorless spell"', acts.some(a => a.dis && /Not an artifact or colorless spell/.test(a.t)), JSON.stringify(acts));
      await p.keyboard.press('Escape').catch(() => {});
      // the other seat: a top card only the owner may look at (Mystic Forge) stays a card back for us
      const opp = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[1], G = window.Goldfish, c = g.deck.unique.find(x => x.name === 'Mystic Forge'); G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); window.__isfVersus.redraw('duel'); return true; });
      await p.waitForTimeout(400);
      const piles = await p.evaluate(() => [...document.querySelectorAll('#tab-duel .vs-pile.lib')].map(e => ({ pid: e.dataset.pid, open: e.classList.contains('top-open') })));
      check("Duel: the other seat's Mystic Forge top card is not shown to us", piles.find(x => x.pid === '1') && !piles.find(x => x.pid === '1').open, JSON.stringify(piles));
    }
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
