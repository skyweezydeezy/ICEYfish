// Tutorial (tutorial.js): a tour on the first visit to each tab, once; Skip, the keyboard and replay from the "?" menu; the spotlight
// sits on the step's element; tours stay off under a test driver unless asked for; iPhone (portrait, landscape) and iPad viewports.
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const TABS = ['deck', 'hands', 'table', 'sim', 'odds', 'duel', 'pod'];
const URL = 'http://127.0.0.1:8800/';
const quiet = () => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); } catch (e) {} };

// how far the spotlight is from the element the step points at (0 = on it)
const spotOff = async p => { let last = null; for (let k = 0; k < 12; k++) { const v = await spotOff1(p); if (v === last) return v; last = v; await p.waitForTimeout(200); } return last; };
const spotOff1 = p => p.evaluate(() => {
  const t = window.ISFTutorial, a = t.active; if (!a) return 'no tour';
  const spot = document.querySelector('.tut-spot'), el = t.target; if (!el) return 'no element';
  const r = el.getBoundingClientRect(), s = spot.getBoundingClientRect();
  const cl = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  return Math.round(Math.max(Math.abs(cl(r.left - 6, 2, innerWidth) - s.left), Math.abs(cl(r.top - 6, 2, innerHeight) - s.top), Math.abs(cl(r.right + 6, 0, innerWidth - 2) - s.right), Math.abs(cl(r.bottom + 6, 0, innerHeight - 2) - s.bottom)));
});
// the bubble is fully on screen
const bubbleIn = p => p.evaluate(() => { const b = document.querySelector('.tut-bubble').getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5 && b.width > 150; });

(async () => {
  const b = await chromium.launch();

  // ---- off by default under a test driver ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(1200);
    await p.click('[data-tab=table]'); await p.waitForTimeout(900);
    check('tours stay off under a test driver (existing tests are not interrupted)', !(await p.$('.tut-bubble')));
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    check('… but "?" still replays a tour', (await p.evaluate(() => ISFTutorial.active.id)) === 'tab:table');
    await p.keyboard.press('Escape');
    await ctx.close();
  }

  // ---- desktop: every tab's tour once, the spotlight on its element, Skip, keyboard, replay, restart ----
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); if (!localStorage.getItem('isf_tutorial')) localStorage.setItem('isf_tutorial', JSON.stringify({ seen: {}, welcome: 1 })); });          // past the welcome card (stage 4 tests it)
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    for (const t of TABS) {
      if (t !== 'deck') await p.click(`[data-tab=${t}]`);
      const ok = await p.waitForFunction(id => window.ISFTutorial.active && window.ISFTutorial.active.id === id, 'tab:' + t, { timeout: 5000 }).then(() => true, () => false);
      check(`${t}: the first visit shows its tour`, ok);
      if (!ok) continue;
      const n = await p.evaluate(() => ISFTutorial.active.of);
      check(`${t}: three to six steps`, n >= 3 && n <= 6, n);
      const role = await p.$eval('.tut-bubble', e => [e.getAttribute('role'), document.activeElement === e, e.querySelector('.tut-count').textContent]);
      check(`${t}: the bubble is a dialog with the focus and a step count`, role[0] === 'dialog' && role[1] && role[2] === `1 of ${n}`, role.join(' / '));
      let worst = 0, inView = true, seen = 0;
      while (await p.evaluate(() => !!window.ISFTutorial.active)) {
        await p.waitForTimeout(500);          // the smooth scroll and the spotlight's slide
        const off = await spotOff(p); worst = Math.max(worst, typeof off === 'number' ? off : 999);
        inView = inView && await bubbleIn(p); seen++;
        if (seen > 8) break;
        if (t === 'hands' && seen === 2) { await p.keyboard.press('ArrowRight'); continue; }          // the arrow keys step too
        await p.click('.tut-next');
      }
      check(`${t}: the spotlight sits on each step's element`, worst <= 3, `worst ${worst}px over ${seen} steps`);
      check(`${t}: the bubble stays on screen`, inView);
    }
    // a second visit: no tour
    await p.click('[data-tab=deck]'); await p.waitForTimeout(900); await p.click('[data-tab=table]'); await p.waitForTimeout(900);
    check('a tour shows only once', !(await p.$('.tut-bubble')));
    const prog = await p.evaluate(() => Object.keys(ISFTutorial.progress().seen).sort().join(','));
    check('progress is saved in localStorage', TABS.every(t => prog.includes('tab:' + t)), prog);
    // replay from "?", then Skip
    await p.click('.top-help');
    check('"?" opens the help menu', !!(await p.$('#tutMenu .tut-m-tour')));
    await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    check('"Tour of Practice" replays the current tab\'s tour', (await p.evaluate(() => ISFTutorial.active.id)) === 'tab:table');
    await p.click('.tut-close'); await p.waitForTimeout(200);
    check('Skip closes it in one tap', !(await p.$('.tut-bubble')));
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    check('Esc skips', !(await p.$('.tut-bubble')));
    // the dimmed page does not take clicks (the tour stays), the app works again once it is closed
    await p.click('.top-help'); await p.click('.tut-m-tour'); await p.waitForSelector('.tut-bubble');
    await p.mouse.click(5, 790); await p.waitForTimeout(200);
    check('a tap on the dimmed page does not reach the app', (await p.evaluate(() => window.ISFTutorial.active && window.ISFTutorial.active.id)) === 'tab:table');
    await p.click('.tut-close');
    await p.click('[data-tab=deck]');
    check('the app works after a tour', (await p.evaluate(() => document.body.dataset.view)) === 'deck');
    // restart: progress gone, the current tab's tour again, and the others on their next visit
    await p.click('.top-help'); await p.click('.tut-m-restart');
    const again = await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:deck', null, { timeout: 5000 }).then(() => true, () => false);
    check('"Restart the tutorial" shows the tours again', again);
    await p.keyboard.press('Escape');
    await p.click('[data-tab=odds]');
    check('… and the other tabs\' tours on their next visit', await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:odds', null, { timeout: 5000 }).then(() => true, () => false));
    await p.keyboard.press('Escape');
    check('desktop: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- a tap step: the tap reaches the app and the tour goes on ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(800);
    await p.evaluate(() => { window.__tapped = 0; document.querySelector('#clearDeck').addEventListener('click', () => window.__tapped++);
      window.ISFTutorial.start('', [{ el: '#clearDeck', title: 'Tap it', text: 'Tap Clear.', tap: true }, { title: 'Done', text: 'That was it.' }]); });
    await p.waitForSelector('.tut-bubble');
    check('a tap step hides Next', await p.$eval('.tut-next', e => e.hidden));
    await p.click('#clearDeck'); await p.waitForTimeout(300);
    check('the tap on the spotlit element reaches the app', (await p.evaluate(() => window.__tapped)) === 1);
    check('… and the tour goes on', (await p.evaluate(() => window.ISFTutorial.active && window.ISFTutorial.active.step)) === 1);
    await p.click('.tut-next');
    await ctx.close();
  }

  // ---- iPhone portrait and landscape, iPad ----
  for (const [name, dev, tabs] of [['iPhone portrait', devices['iPhone 13'], ['deck', 'duel', 'table']], ['iPhone landscape', devices['iPhone 13 landscape'], ['table', 'pod']], ['iPad', devices['iPad (gen 7)'], ['deck', 'table', 'sim']]]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); if (!localStorage.getItem('isf_tutorial')) localStorage.setItem('isf_tutorial', JSON.stringify({ seen: {}, welcome: 1 })); });          // past the welcome card (stage 4 tests it)
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    if (!tabs.includes('deck')) { await p.waitForSelector('.tut-bubble'); await p.tap('.tut-close'); }
    for (const t of tabs) {
      if (t !== 'deck') await p.tap(`[data-tab=${t}]`);
      const ok = await p.waitForFunction(id => window.ISFTutorial.active && window.ISFTutorial.active.id === id, 'tab:' + t, { timeout: 5000 }).then(() => true, () => false);
      if (!ok) { check(`${name} ${t}: tour shows`, false); continue; }
      let worst = 0, inView = true, k = 0;
      while (await p.evaluate(() => !!window.ISFTutorial.active) && k++ < 8) {
        await p.waitForTimeout(500);
        const off = await spotOff(p); worst = Math.max(worst, typeof off === 'number' ? off : 999);
        inView = inView && await bubbleIn(p);
        await p.tap('.tut-next');
      }
      check(`${name} ${t}: spotlight on each element, bubble on screen`, worst <= 3 && inView, `worst ${worst}px`);
    }
    const help = await p.evaluate(() => { const v = [...document.querySelectorAll('.tut-help')].filter(e => e.getBoundingClientRect().width > 0); if (!v.length) return 'none'; v[0].scrollIntoView({ inline: 'nearest', block: 'nearest' }); const r = v[0].getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0 ? 'ok' : 'off screen'; });
    check(`${name}: the "?" button is there on the table (in the toolbar, which scrolls on a phone)`, help === 'ok', help);
    await p.tap('.tut-help >> visible=true'); await p.waitForTimeout(200);
    check(`${name}: the "?" menu opens on screen`, await p.evaluate(() => { const m = document.querySelector('#tutMenu'); if (!m) return false; const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- stage 4: the welcome card ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForSelector('.tut-bubble', { timeout: 6000 }).catch(() => {});
    const w = await p.evaluate(() => { const b = document.querySelector('.tut-bubble'); return b ? [b.querySelector('.tut-title').textContent, b.querySelector('.tut-next').textContent, b.querySelector('.tut-close').textContent] : null; });
    check('welcome: the first visit shows the welcome card with Take the tour / Skip', w && /Welcome/.test(w[0]) && w[1] === 'Take the tour' && w[2] === 'Skip', w && w.join(' / '));
    await p.click('.tut-next');
    check('welcome: Take the tour starts this tab\'s tour', await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:deck', null, { timeout: 4000 }).then(() => true, () => false));
    await p.keyboard.press('Escape');
    await p.reload(); await p.waitForTimeout(1500);
    check('welcome: only once', !(await p.$('.tut-bubble')));
    // Skip: no tour by itself afterwards, all of them still under ?
    await p.evaluate(() => { localStorage.removeItem('isf_tutorial'); }); await p.reload();
    await p.waitForSelector('.tut-bubble', { timeout: 6000 }); await p.click('.tut-close');
    await p.click('[data-tab=sim]'); await p.waitForTimeout(1200);
    check('welcome: Skip keeps the tours quiet (no tour on a first tab visit)', !(await p.$('.tut-bubble')));
    await p.click('.top-help'); await p.click('.tut-m-tour');
    check('welcome: … and a tour still opens from ?', await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:sim', null, { timeout: 4000 }).then(() => true, () => false));
    await p.keyboard.press('Escape');

    // ---- first goals: in the ? menu, ticked as they happen, "Show me" ----
    await p.click('.top-help');
    const gl = await p.$eval('.tut-m-goals', e => e.textContent);
    check('goals: the ? menu shows the first goals with a count', /First goals · 0 of 4/.test(gl), gl);
    await p.click('.tut-m-goals');
    const rows = await p.$$eval('#tutMenu .tut-goal', es => es.map(e => e.textContent.replace(/Show me/, '').trim()));
    check('goals: load a deck, run a simulation, win a Practice game, play a Duel', rows.join('|') === '○Load a deck|○Run a simulation|○Win a Practice game|○Play a Duel', rows.join('|'));
    await p.click('#tutMenu .tut-goal[data-goal=sim] .tut-showme');
    check('goals: Show me goes to the tab and points at the button', await p.waitForFunction(() => document.body.dataset.view === 'sim' && window.ISFTutorial.target && window.ISFTutorial.target.id === 'runSim', null, { timeout: 4000 }).then(() => true, () => false));
    await p.keyboard.press('Escape');
    await p.evaluate(() => { window.__isf.sim = { fake: true }; });          // as if a simulation had run
    await p.waitForTimeout(1800);
    const tick = await p.evaluate(() => [(window.ISFTutorial.progress().goals || {}).sim, document.querySelector('#toast').textContent]);
    check('goals: a goal ticks itself when it happens, with a short note', tick[0] === 1 && /First goal: Run a simulation \(1 of 4\)/.test(tick[1]), tick.join(' / '));
    await p.evaluate(() => { window.__isf.sim = null; });

    // ---- first-time tips: once, not after the feature is used, "Show me" runs it ----
    await p.evaluate(() => { const d = document.createElement('div'); d.className = 'dice-box meld-box'; d.id = 'fakeMeld'; d.style.cssText = 'position:fixed;left:40%;top:30%;width:120px;height:80px'; document.body.appendChild(d); });
    await p.waitForSelector('.tut-tip[data-tip=meld]', { timeout: 4000 }).catch(() => {});
    check('tips: the first meld shows a one-line tip, without dimming the page', !!(await p.$('.tut-tip[data-tip=meld]')) && !(await p.$('.tut')));
    await p.click('.tut-tip-ok'); await p.waitForTimeout(1800);
    check('tips: once only', !(await p.$('.tut-tip')), await p.evaluate(() => [...document.querySelectorAll('.tut-tip')].map(t => t.dataset.tip + ':' + t.textContent).join(' / ')));
    await p.evaluate(() => { document.getElementById('fakeMeld').outerHTML = ''; const p = JSON.parse(localStorage.getItem('isf_tutorial')); p.used = { sheet: 1 }; localStorage.setItem('isf_tutorial', JSON.stringify(p));
      const d = document.createElement('div'); d.className = 'ch-sheet'; d.id = 'fakeSheet'; d.innerHTML = '<div class="ch-head">Q</div>'; d.style.cssText = 'position:fixed;left:10%;top:20%;width:300px;height:100px'; document.body.appendChild(d); });
    await p.waitForTimeout(1800);
    check('tips: a tip about something already used is not shown', !(await p.$('.tut-tip')) && (await p.evaluate(() => (window.ISFTutorial.progress().tips || {}).sheet)) === 1);
    await p.evaluate(() => { document.getElementById('fakeSheet').outerHTML = ''; });
    await p.click('[data-tab=table]'); await p.waitForTimeout(400);
    await p.evaluate(() => { const t = window.ISFTutorial.tips.find(x => x.id === 'loop'); t.when = () => true; });          // as if the goldfish had just died
    await p.waitForSelector('.tut-tip[data-tip=loop] .tut-tip-show', { timeout: 4000 }).catch(() => {});
    await p.evaluate(() => { window.__loopClicked = 0; document.querySelector('#tLoop').addEventListener('click', e => { window.__loopClicked++; e.stopImmediatePropagation(); }, true); });
    const show = await p.$('.tut-tip[data-tip=loop] .tut-tip-show');
    if (show) await show.click();
    check('tips: "Show me" runs the action (Loop)', !!show && (await p.evaluate(() => window.__loopClicked)) === 1);

    // ---- what's new: after an update, only what is new since the last version, once; Reset leaves it ----
    const now = await p.evaluate(() => self.ISF_VERSION);
    await p.route('**/whatsnew.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [{ v: now, lines: ['Brand new thing.'] }, { v: now - 1, lines: ['Older thing.'] }, { v: now - 5, lines: ['Long ago.'] }] }) }));
    await p.evaluate(v => { localStorage.setItem('isf_whatsnew', String(v - 2)); localStorage.removeItem('isf_state'); }, now);
    await p.reload();
    await p.waitForSelector('.tut-new', { timeout: 6000 }).catch(() => {});
    const wn = await p.evaluate(() => [document.querySelector('.tut-new li').textContent, document.querySelector('.tut-count').textContent]);
    check('what\'s new: after an update it shows only what is new since your last version, newest card first', /Brand new/.test(wn[0]) && wn[1] === '1 of 2', wn.join(' | '));
    await p.click('.tut-next'); await p.click('.tut-next');
    await p.reload(); await p.waitForTimeout(1500);
    check('what\'s new: once', !(await p.$('.tut-new')));
    await p.evaluate(() => localStorage.removeItem('isf_tutorial'));          // what Reset (Remember State) does
    check('what\'s new: Reset leaves the last version seen', (await p.evaluate(() => localStorage.getItem('isf_whatsnew'))) === String(now));
    await p.evaluate(() => { localStorage.setItem('isf_tutorial', JSON.stringify({ seen: {}, welcome: 1 })); }); await p.reload(); await p.waitForTimeout(900);
    await p.keyboard.press('Escape');
    await p.click('.top-help'); await p.click('.tut-m-new'); await p.waitForSelector('.tut-new', { timeout: 4000 }).catch(() => {});
    check('what\'s new: also from the ? menu', (await p.evaluate(() => document.querySelector('.tut-count').textContent)) === '1 of 3');
    await p.keyboard.press('Escape');
    check('stage 4: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- Play a friend: a step in the Duel tours, and a first-time tip for people who saw the Duel tour before it existed ----
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); if (!localStorage.getItem('isf_tutorial')) localStorage.setItem('isf_tutorial', JSON.stringify({ welcome: 1, seen: { 'tab:deck': 1, 'tab:duel': 1 } })); });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1200);
    await p.click('[data-tab=duel]');
    await p.waitForSelector('.tut-tip[data-tip=friend]', { timeout: 5000 }).catch(() => {});
    check('friend: someone who saw the Duel tour before gets a one-line tip about Play a friend', !!(await p.$('.tut-tip[data-tip=friend] .tut-tip-show')) && !(await p.$('.tut')));
    const sm = await p.$('.tut-tip[data-tip=friend] .tut-tip-show'); if (sm) await sm.click();
    const on = await p.waitForFunction(() => { const t = window.ISFTutorial.target; return t && t.classList.contains('rm-box'); }, null, { timeout: 4000 }).then(() => true, () => false);
    check('friend: "Show me" points at the Play a friend box', on, await spotOff(p));
    await p.keyboard.press('Escape');
    // a new visitor: the short Duel tour has the step, and then no tip
    await p.evaluate(() => localStorage.setItem('isf_tutorial', JSON.stringify({ welcome: 1, seen: { 'tab:deck': 1 } }))); await p.reload(); await p.waitForTimeout(1200);
    if (await p.evaluate(() => document.body.dataset.view !== 'duel')) await p.click('[data-tab=duel]');          // Remember State may have reopened Duel already
    await p.waitForSelector('.tut-bubble', { timeout: 5000 }).catch(() => {});
    let hit = null, k = 0;
    while (await p.evaluate(() => !!window.ISFTutorial.active) && k++ < 20) {
      if ((await p.$eval('.tut-title', e => e.textContent)) === 'Play a friend') hit = [await p.evaluate(() => window.ISFTutorial.target && window.ISFTutorial.target.classList.contains('rm-box')), await spotOff(p)];
      await p.click('.tut-next'); await p.waitForTimeout(150);
    }
    check('friend: the short Duel tour shows Play a friend, the spotlight on its box', !!hit && hit[0] && hit[1] <= 3, JSON.stringify(hit));
    await p.waitForTimeout(2000);
    check('friend: … and after that tour no tip repeats it', !(await p.$('.tut-tip[data-tip=friend]')));
    const fl = await p.evaluate(() => window.ISFTutorial.full.duel.map(s => s.title).filter(t => /friend|Invite|shared/.test(t)).join('|') + ' / pod: ' + window.ISFTutorial.full.pod.some(s => /friend/.test(s.title)));
    check('friend: "Every feature" for Duel has Play a friend, What is shared, Invite or join (not Pod)', fl === 'Play a friend|What is shared|Invite or join / pod: false', fl);
    check('friend: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- "Every feature": the long tour of a tab, of every tab, and the style for first visits ----
  for (const [name, o] of [['PC', { viewport: { width: 1280, height: 800 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...o, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); if (!localStorage.getItem('isf_tutorial')) localStorage.setItem('isf_tutorial', JSON.stringify({ welcome: 1, seen: { 'tab:deck': 1, 'tab:hands': 1, 'tab:table': 1, 'tab:sim': 1, 'tab:odds': 1, 'tab:duel': 1, 'tab:pod': 1 } })); });
    await ctx.addInitScript(quiet);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(1500);
    const tapc = sel => name === 'iPhone' ? p.tap(sel) : p.click(sel);
    // every tab, one after another
    await tapc('.top-help'); await tapc('.tut-m-fullall');
    await p.waitForSelector('.tut-bubble');
    const total = await p.evaluate(() => window.ISFTutorial.active.of);
    const short = await p.evaluate(() => Object.values(window.ISFTutorial.tours).reduce((n, t) => n + t.length, 0));
    check(`${name} every feature: the long tour has far more steps than the short tours together`, total > 2 * short, `${total} vs ${short}`);
    const views = new Set(); let worst = 0, inView = true, k = 0, worstAt = '';
    while (await p.evaluate(() => !!window.ISFTutorial.active) && k++ < 200) {
      const off = await spotOff(p); if (typeof off === 'number' && off > worst) { worst = off; worstAt = await p.$eval('.tut-title', e => e.textContent); }
      if (!(await bubbleIn(p))) { inView = false; worstAt += ' [off screen: ' + (await p.$eval('.tut-title', e => e.textContent)) + ']'; }
      views.add(await p.evaluate(() => document.body.dataset.view));
      await tapc('.tut-next'); await p.waitForTimeout(120);
    }
    await tapc('[data-tab=deck]'); await p.waitForTimeout(500);
    check(`${name} every feature: it walks through all seven tabs to the end`, views.size === 7 && k < 200, [...views].join(','));
    check(`${name} every feature: the spotlight sits on each element, the bubble on screen`, worst <= 3 && inView, `worst ${worst}px at ${worstAt}`);
    // the step count names the tab; "Next tab ›" jumps ahead
    await tapc('.top-help'); await tapc('.tut-m-fullall'); await p.waitForFunction(() => /\d/.test((document.querySelector('.tut-count') || {}).textContent || ''));
    const c1 = await p.$eval('.tut-count', e => e.textContent);
    await tapc('.tut-jump'); await p.waitForTimeout(700);
    const c2 = await p.$eval('.tut-count', e => e.textContent), v2 = await p.evaluate(() => document.body.dataset.view);
    check(`${name} every feature: the count names the tab, and Next tab › jumps to the next tab`, /^Build · 1 of \d+/.test(c1) && /^Mulligan · /.test(c2) && v2 === 'hands', `${c1} → ${c2}`);
    await tapc('.tut-close');
    // one tab, every feature
    await tapc('[data-tab=hands]'); await p.waitForTimeout(400);
    await tapc('.top-help'); await tapc('.tut-m-full'); await p.waitForSelector('.tut-bubble');
    const one = await p.evaluate(() => [window.ISFTutorial.active.id, window.ISFTutorial.active.of, window.ISFTutorial.full.hands.length]);
    check(`${name} every feature: "Every feature: Mulligan" is this tab's long tour`, one[0] === 'tab:hands' && one[1] === one[2], one.join(' / '));
    await tapc('.tut-close');
    // the style for first visits
    await tapc('.top-help'); await tapc('.tut-m-style');
    await p.evaluate(() => { const pr = window.ISFTutorial.progress(); pr.seen = { 'tab:deck': 1, 'tab:hands': 1 }; localStorage.setItem('isf_tutorial', JSON.stringify(pr)); });
    await tapc('[data-tab=odds]');
    const auto = await p.waitForFunction(() => window.ISFTutorial.active && window.ISFTutorial.active.id === 'tab:odds' && window.ISFTutorial.active.of === window.ISFTutorial.full.odds.length, null, { timeout: 5000 }).then(() => true, () => false);
    check(`${name} every feature: chosen as the style, a first visit shows the long tour`, auto);
    await tapc('.tut-close');
    check(`${name} every feature: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- reduced motion: no transitions ----
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { localStorage.setItem('isf_tutorial_force', '1'); if (!localStorage.getItem('isf_tutorial')) localStorage.setItem('isf_tutorial', JSON.stringify({ seen: {}, welcome: 1 })); });          // past the welcome card (stage 4 tests it)
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForSelector('.tut-bubble');
    const dur = await p.evaluate(() => { document.querySelector('.tut').classList.add('tut-moving'); return getComputedStyle(document.querySelector('.tut-spot')).transitionDuration; });
    check('prefers-reduced-motion: the spotlight does not slide', dur.split(',').every(d => parseFloat(d) < 0.01), dur);
    await ctx.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
