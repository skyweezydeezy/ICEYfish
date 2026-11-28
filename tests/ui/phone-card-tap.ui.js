// T-102 + T-134: on every device a tap or click on a card opens it enlarged in the viewer with its actions as buttons; nothing is played until a button is pressed.
// (T-134 replaced the select-before-play sheet and the iPad / PC differences with this one flow.) Checked in Practice and in Duel, at phone sizes (390x844, 375x667, 430x932, sideways 844x390) and on iPads
// (upright and sideways), where the flow must be what it was: no enlarged preview, and a glowing card in Duel plays at once.
// Needs playwright, a static server on :8800 (node tests/run.js --ui phone-card-tap) and internet access to Scryfall.
// (T-102, extended: every touch device selects first, iPad too; a desktop mouse keeps its own flow.)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const phone = (w, h) => ({ ...devices['iPhone 13'], viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1 });
const RUNS = [
  ['phone 390x844', phone(390, 844), true], ['phone 375x667', phone(375, 667), true], ['phone 430x932', phone(430, 932), true], ['phone sideways 844x390', phone(844, 390), true],
  ['iPad upright', { ...devices['iPad (gen 7)'], deviceScaleFactor: 1 }, true], ['iPad sideways', { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 }, true],
  ['desktop mouse', { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 }, false],
];
const ONLY = new RegExp(process.env.PHONE_TAP_ONLY || '^phone');          // the phones; ipad-card-tap.ui.js runs the iPads and the desktop mouse
const SHOTS = process.env.PHONE_TAP_SHOTS;                                  // a folder: save the selected-card screenshots there

(async () => {
  const b = await chromium.launch();
  for (const [name, dev, touch] of RUNS) {          // touch: a touch device (a tap), otherwise a mouse click; the flow is the same
    const isPhone = true;
    const tapIt = (loc, o) => touch ? loc.tap(o) : loc.click(o);
    const tapAt = (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
    const act = async () => { await p.waitForTimeout(450); await tapIt(p.locator('#lightbox .lb-act.primary').first()); };          // the viewer's ghost-tap guard is 350 ms
    if (ONLY && !ONLY.test(name)) continue;
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    const sheet = () => p.evaluate(() => {          // the viewer: what is shown, the enlarged card, and the action buttons
      const lbx = document.querySelector('#lightbox'), shown = !!lbx && lbx.classList.contains('show');
      const r = e => { const x = e.getBoundingClientRect(); return { t: x.top, b: x.bottom, l: x.left, r: x.right }; };
      const card = shown && lbx.querySelector('.lb-faces .mtg'), a1 = shown && lbx.querySelector('.lb-act');
      return { shown, preview: !!card, glow: shown, primary: shown ? ((lbx.querySelector('.lb-act.primary') || {}).textContent || '') : '',
        sheet: a1 ? r(a1) : null, card: card ? r(card) : null, cardW: card ? card.getBoundingClientRect().width : 0, vw: innerWidth, vh: innerHeight };
    });
    const geometry = (tag, s) => {
      check(`${name}: ${tag}: the enlarged card is inside the screen sideways`, !!s.card && s.card.l >= 0 && s.card.r <= s.vw + 1, s.card ? `${Math.round(s.card.l)}-${Math.round(s.card.r)} of ${s.vw}` : 'none');
      check(`${name}: ${tag}: the action button starts on the screen`, !!s.sheet && s.sheet.t >= 0 && s.sheet.t < s.vh, s.sheet ? `${Math.round(s.sheet.t)} of ${s.vh}` : 'none');
      check(`${name}: ${tag}: the card is enlarged (wider than 90 px)`, s.cardW > 90, Math.round(s.cardW) + ' px');
    };

    // ---- Practice: find a land as the last (fully visible) card of the hand ----
    await p.click('[data-tab=table]');
    let land = null;
    for (let k = 0; k < 14 && !land; k++) {
      await p.click('#tNew'); await p.waitForTimeout(500);
      land = await p.evaluate(() => { const g = window.__isf.game, els = [...document.querySelectorAll('#zHand .mtg')], last = els[els.length - 1]; if (!g || !last) return null; const i = g.hand.find(x => x.iid === +last.dataset.iid); return i && i.card.a.isLand ? { iid: i.iid, n: g.hand.length } : null; });
    }
    check(`${name}: Practice: a land is the last card of the hand`, !!land);
    if (land) {
      const card = p.locator(`#zHand .mtg[data-iid="${land.iid}"]`);
      await tapIt(card);
      await p.waitForTimeout(500);
      const s = await sheet(), n = await p.evaluate(() => window.__isf.game.hand.length);
      check(`${name}: Practice: a tap on a land does not play it`, n === land.n, `hand ${land.n} -> ${n}`);
      check(`${name}: Practice: the options sheet is open`, s.shown);
      check(`${name}: Practice: ${isPhone ? 'the card is enlarged and glows' : 'a mouse keeps its menu without the preview'}`, isPhone ? s.preview && s.glow : !s.preview && !s.glow);
      if (isPhone) {
        geometry('Practice', s);
        check(`${name}: Practice: the first option casts or plays it`, /Play land|Cast/.test(s.primary), s.primary);
        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `practice-${name.replace(/ /g, '-')}.png`) });
        // a second quick tap on the same spot closes the sheet, it does not play the card
        await tapIt(p.locator('#lightbox .lb-x')); await p.waitForTimeout(300);
        const s2 = await sheet(), n2 = await p.evaluate(() => window.__isf.game.hand.length);
        check(`${name}: Practice: tapping off the card deselects it and plays nothing`, !s2.shown && !s2.preview && !s2.glow && n2 === land.n);
        await tapIt(card); await p.waitForTimeout(500);
      }
      await act(); await p.waitForTimeout(700);
      const n3 = await p.evaluate(() => window.__isf.game.hand.length), s3 = await sheet();
      check(`${name}: Practice: the option plays the land`, n3 === land.n - 1 && !s3.shown && !s3.preview, `hand ${land.n} -> ${n3}`);
    }

    // ---- Duel: a land in hand glows; a tap selects (phone) or plays at once (iPad) ----
    await p.click('[data-tab=duel]');
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-you', 'human');
    await p.selectOption('#tab-duel .vs-ask', 'ask');
    await p.click('#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 40000 }).catch(async e => { console.log('DBG', await p.evaluate(() => (document.querySelector('#tab-duel') || {}).innerText.slice(0, 400)), errs.join('|')); throw e; });
    await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && (g.phase === 'main' || g.over); }, null, { timeout: 30000 }).catch(async e => { console.log('DBG', await p.evaluate(() => { const g = window.__isfVersus.duel.game; return JSON.stringify({ ph: g.phase, ch: g.choice && g.choice.kind, acting: g.acting, bottom: [...(g.bottom||[])].length, txt: document.querySelector('#tab-duel').innerText.slice(0, 300), sheet: (document.querySelector('.ch-sheet')||{}).innerText }); })); throw e; });
    const duelLand = await p.evaluate(() => {
      const gm = window.__isfVersus.duel.game, me = gm.games[0], c = me.deck.unique.find(x => x.a.isLand && !x.a.mdfcLand && !/Command|Tower|Cavern/.test(x.name));
      me.landPlayed = false; me.landThisTurn = false; me.landsPlayedThisTurn = 0;
      const inst = { iid: me.nextIid++, card: c }; me.hand.push(inst); window.__isfVersus.redraw('duel'); return { iid: inst.iid, n: me.hand.length };
    });
    await p.waitForTimeout(600);
    const el = p.locator(`#tab-duel .vs-hand .vs-card.can[data-iid="${duelLand.iid}"]`);
    check(`${name}: Duel: the land glows as playable`, await el.count() === 1);
    if (await el.count() === 1) {
      await tapIt(el, { position: { x: 20, y: 40 } }); await p.waitForTimeout(700);
      const s = await sheet(), n = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.length);
      if (isPhone) {
        check(`${name}: Duel: a tap does not play the land`, n === duelLand.n, `hand ${duelLand.n} -> ${n}`);
        check(`${name}: Duel: the card is enlarged, glows, and its options are shown`, s.shown && s.preview && s.glow && /Play land/.test(s.primary), s.primary);
        geometry('Duel', s);
        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `duel-${name.replace(/ /g, '-')}.png`) });
        await tapIt(p.locator('#lightbox .lb-x')); await p.waitForTimeout(300);
        const s2 = await sheet(), n2 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.length);
        check(`${name}: Duel: tapping off the card deselects it and plays nothing`, !s2.shown && n2 === duelLand.n);
        await tapIt(el, { position: { x: 20, y: 40 } }); await p.waitForTimeout(500);
        await act(); await p.waitForTimeout(1200);
        const n3 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.length);
        check(`${name}: Duel: the option plays the land`, n3 === duelLand.n - 1, `hand ${duelLand.n} -> ${n3}`);
      } else {
        await p.waitForTimeout(500);
        const n1 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.length);
        check(`${name}: Duel: with a mouse a click on a glowing card plays it at once, as before`, n1 === duelLand.n - 1 && !s.preview, `hand ${duelLand.n} -> ${n1}`);
      }
    }
    if (isPhone) {
      // tap targets: upright phones keep their action buttons at least 44 px tall
      if (await p.evaluate(() => innerHeight >= 560 && innerWidth <= 600)) {
        const hs = await p.evaluate(() => [...document.querySelectorAll('#tab-duel .vs-ask button, #tab-duel .vs-me button')].filter(e => e.offsetWidth).map(e => Math.round(e.getBoundingClientRect().height)));
        check(`${name}: Duel: action buttons are at least 44 px tall`, hs.length > 0 && hs.every(v => v >= 44), hs.join(','));
      }
      // attackers: a tap selects the creature, an option attacks with it
      const cr = await p.evaluate(() => {
        const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[0], c = me.deck.unique.find(x => x.a.isCreature && !x.a.isLand);
        if (!c) return null;
        const q = G.enterWithTriggers(me, { iid: me.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; window.__isfVersus.redraw('duel'); return q.iid;
      });
      if (cr != null) {
        await p.waitForTimeout(400);
        await p.evaluate(() => document.querySelector('#tab-duel .vs-attack').click()); await p.waitForTimeout(600);
        const st = p.locator('#tab-duel .vs-seat.me .vs-stack.pickable').first();
        if (await st.count()) {
          const before = await p.evaluate(() => window.__isfVersus.duel.game.pick.size);
          await tapIt(st.locator('.mtg').first()); await p.waitForTimeout(600);
          const s = await sheet(), mid = await p.evaluate(() => window.__isfVersus.duel.game.pick.size);
          check(`${name}: Duel: a tap on an attacker only selects it`, s.shown && s.preview && /Attack with it|Hold it back/.test(s.primary) && mid === before, `${before} -> ${mid}, ${s.primary}`);
          await act(); await p.waitForTimeout(500);
          const after = await p.evaluate(() => window.__isfVersus.duel.game.pick.size);
          check(`${name}: Duel: the option toggles the attacker`, after !== before, `${before} -> ${after}`);
        } else check(`${name}: Duel: an attacker can be tapped`, false, 'no creature stack');
      }
      // blockers: the opponent attacks with a big creature; a tap on my creature selects it and offers to block; the go button confirms
      await p.evaluate(() => { const b = document.querySelector('#tab-duel .vs-noattack'); if (b) b.click(); }); await p.waitForTimeout(800);
      const setup = await p.evaluate(() => {
        const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[0], opp = gm.games[1];
        const c = me.deck.unique.find(x => x.a.isCreature && !x.a.isLand); if (!c || !opp) return false;
        const oc = opp.deck.unique.find(x => x.card === undefined && x.a.isCreature && !x.a.isLand) || c;
        const put = (g, card) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
        me.battlefield.forEach(q => { q.tapped = false; });
        const big = put(opp, oc); try { G.addCounters(opp, big, '+1/+1', 6, [], null); } catch (e) {}
        window.__isfVersus.redraw('duel'); return true;
      });
      if (setup) {
        await p.evaluate(() => { const b = document.querySelector('#tab-duel .vs-end'); if (b) b.click(); });
        let blk = false, t0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].turn);
        for (let k = 0; k < 240 && !blk; k++) {
          if (await p.evaluate(() => !!window.__isfVersus.duel.game.over)) break;
          if (await p.evaluate(t => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && g.games[0].turn > t; }, t0)) { t0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].turn); await p.evaluate(() => { const b = document.querySelector('#tab-duel .vs-end'); if (b) b.click(); }); } blk = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return g.phase === 'block' && !!g.block; }); if (!blk) { if (await p.evaluate(() => !!window.__isfVersus.duel.game.choice)) await p.locator('.ch-sheet .ch-auto').first().click().catch(() => {}); await p.waitForTimeout(500); } }
        if (!blk) console.log('DBG', await p.evaluate(() => { const g = window.__isfVersus.duel.game, o = g.games[1]; return JSON.stringify({ ph: g.phase, cur: g.cur, step: g.step, over: g.over, ch: g.choice && g.choice.kind, opp: o.battlefield.map(q => q.card.name + ':' + q.sick + ':' + q.tapped + ':p' + window.Goldfish.powerOf(o, q) + ':' + JSON.stringify(q.counters||null) + ':ca' + window.Goldfish.canAttack(o, q)), log: [...document.querySelectorAll('#tab-duel .vs-log li, #tab-duel .vs-feed li')].slice(-6).map(l => l.innerText).join(' / '), t: o.turn, my: g.games[0].turn, txt: document.querySelector('#tab-duel .vs-ask').innerText.slice(0, 200) }); }));
        const ended = !blk && await p.evaluate(() => !!window.__isfVersus.duel.game.over);          // the autopilots finished the game first: nothing to block
        if (!ended) check(`${name}: Duel: the opponent's attack reaches the block question`, blk);
        if (blk) {
          const mine = p.locator('#tab-duel .vs-seat.me .mtg[data-iid]').filter({ has: p.locator('xpath=self::*') });
          const iid = await p.evaluate(() => { const s = document.querySelector('#tab-duel .vs-blk'); return s ? s.dataset.iid : null; });
          if (iid) {
            const val0 = await p.evaluate(() => document.querySelector('#tab-duel .vs-blk').value);
            await tapIt(p.locator(`#tab-duel .vs-seat.me .mtg[data-iid="${iid}"]`).first()); await p.waitForTimeout(600);
            const s = await sheet(), val1 = await p.evaluate(() => document.querySelector('#tab-duel .vs-blk').value);
            check(`${name}: Duel: a tap on a blocker only selects it and offers the blocks`, s.shown && s.preview && /Block|Does not block/.test(s.primary) && val1 === val0 && await p.evaluate(() => document.querySelector('#tab-duel .vs-block-go') !== null), `${s.primary}`);
            geometry('Duel blocker', s);
            const want = await p.evaluate(() => { const o = [...document.querySelector('#tab-duel .vs-blk').options].find(x => x.value && !x.selected); return o ? o.value : null; });
            const label = await p.evaluate(() => [...document.querySelectorAll('#lightbox .lb-act')].map(b => b.textContent).join(' | '));
            if (want) {
              await p.evaluate(v => { const bs = [...document.querySelectorAll('#lightbox .lb-act.primary')]; bs.find(b => !b.textContent.startsWith('✓')).click(); }, want);
              await p.waitForTimeout(500);
              const val2 = await p.evaluate(() => document.querySelector('#tab-duel .vs-blk').value);
              check(`${name}: Duel: the option sets the block`, val2 === want, `${val1} -> ${val2} (${label})`);
            } else check(`${name}: Duel: a block is offered`, false, label);
          }
        }
      }
    }
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
