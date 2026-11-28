// T-141: What's new shows one card per version (newest first): "N of M", Back/Next, real touch swipe (CDP), arrow keys, stops at the ends,
// "Got it" closes. Phone portrait, phone landscape, iPad and desktop. Needs playwright and a static server on :8800 (node tests/run.js --ui whatsnew-cards).
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const URL = 'http://127.0.0.1:8800/';
const N = 4;
(async () => {
  const b = await chromium.launch();
  const sizes = [['iPhone portrait', { ...devices['iPhone 13'] }], ['iPhone landscape', { ...devices['iPhone 13 landscape'] }], ['iPad', { ...devices['iPad (gen 7)'] }], ['desktop', { viewport: { width: 1180, height: 820 } }]];
  for (const [label, dev] of sizes) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_tutorial', JSON.stringify({ seen: {}, welcome: 1 })); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(800);
    await p.keyboard.press('Escape');
    const now = await p.evaluate(() => self.ISF_VERSION);
    await p.route('**/whatsnew.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: Array.from({ length: N + 3 }, (_, k) => ({ v: now - k, lines: ['Line A of ' + (now - k) + '.', 'Line B.'] })) }) }));
    await p.evaluate(v => localStorage.setItem('isf_whatsnew', String(v - 4)), now);
    await p.evaluate(() => { window.ISFTutorial.whatsNew(false); }); await p.waitForSelector('.tut-new', { timeout: 6000 });
    const st = () => p.evaluate(() => ({ title: (document.querySelector('.tut-title') || {}).textContent, count: (document.querySelector('.tut-count') || {}).textContent, lis: document.querySelectorAll('.tut-new li').length, back: (document.querySelector('.tut-back') || {}).disabled, next: (document.querySelector('.tut-next') || {}).textContent, open: !!document.querySelector('.tut-bubble') }));
    let s = await st();
    check(`${label}: first card is the newest, "1 of ${N}", one entry only`, s.title === `What's new in v${now}` && s.count === `1 of ${N}` && s.lis === 2, JSON.stringify(s));
    check(`${label}: Back is disabled on the first card`, s.back === true);
    const fits = await p.evaluate(() => { const r = document.querySelector('.tut-bubble').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5; });
    check(`${label}: the card is on screen`, fits);
    await p.click('.tut-next'); s = await st();
    check(`${label}: Next goes to the older entry`, s.title === `What's new in v${now - 1}` && s.count === `2 of ${N}` && s.back === false, JSON.stringify(s));
    await p.click('.tut-back'); s = await st(); check(`${label}: Back returns`, s.count === `1 of ${N}`);
    await p.keyboard.press('ArrowRight'); s = await st(); check(`${label}: ArrowRight`, s.count === `2 of ${N}`);
    await p.keyboard.press('ArrowLeft'); s = await st(); check(`${label}: ArrowLeft`, s.count === `1 of ${N}`);
    if (dev.hasTouch) {
      const cdp = await ctx.newCDPSession(p);
      const swipe = async (dx, dy) => {
        const r = await p.evaluate(() => { const f = document.querySelector('.tut-title').getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + f.height / 2 }; });
        const pt = (x, y) => [{ x, y, id: 1 }], x0 = r.x - dx / 2, y0 = r.y - dy / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
        for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + dx * i / 6, y0 + dy * i / 6) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(400);
      };
      await swipe(120, 0); s = await st(); check(`${label}: swiping right on the first card stays`, s.count === `1 of ${N}`);
      await swipe(-120, 0); s = await st(); check(`${label}: swiping left goes to the next (older) card`, s.count === `2 of ${N}`, s.count);
      await swipe(10, 200); s = await st(); check(`${label}: a vertical drag does not move`, s.count === `2 of ${N}`);
      await swipe(120, 0); s = await st(); check(`${label}: swiping right goes back`, s.count === `1 of ${N}`);
    }
    for (let k = 1; k < N; k++) await p.click('.tut-next');
    s = await st(); check(`${label}: the last card reads "Got it"`, s.count === `${N} of ${N}` && s.next === 'Got it', JSON.stringify(s));
    await p.keyboard.press('ArrowRight'); s = await st(); check(`${label}: ArrowRight at the end stays`, s.open && s.count === `${N} of ${N}`);
    await p.click('.tut-next'); await p.waitForTimeout(300);
    check(`${label}: "Got it" closes and the key is the running version`, !(await p.$('.tut-bubble')) && (await p.evaluate(() => localStorage.getItem('isf_whatsnew'))) === String(now));
    await p.evaluate(() => { window.ISFTutorial.whatsNew(true); }); await p.waitForSelector('.tut-new', { timeout: 4000 });
    s = await st(); check(`${label}: from the menu there are 6 cards`, s.count === '1 of 6', s.count);
    await p.click('.tut-close'); await p.waitForTimeout(200);
    check(`${label}: Close closes`, !(await p.$('.tut-bubble')));
    check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
