// T-131: Settings → Display → "Guess unknown rules": off by default, it persists, a guessed line shows a "guessed N%" pill naming the card it was matched to,
// and the card stays on the Teach list. Switching it off puts the line back as not understood.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };

// a real card the engine guesses a line of (found now, so a card that is taught later does not break the test)
const G = require('../../goldfish/static/sim.js'), root = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data');
G.setTribe('Merfolk'); G.setFuzzy(JSON.parse(fs.readFileSync(path.join(root, 'fuzzy-index.json'), 'utf8')));
let pick = null;
for (const f of fs.readdirSync(path.join(root, 'sets'))) {
  if (f === 'index.json' || pick) continue;
  for (const c of JSON.parse(fs.readFileSync(path.join(root, 'sets', f), 'utf8')).cards) {
    if (c.ref || !c.oracle_text || /Land/.test(c.type_line || '') || (c.faces || []).length > 1) continue;
    const g = G.analyze(c, ['W', 'U', 'B', 'R', 'G']).coverage.find(r => r.status === 'guessed'); if (g && /^[A-Za-z' ,-]+$/.test(c.name)) { pick = { name: c.name, text: g.text }; break; }
  }
}
G.setFuzzy(null);

(async () => {
  if (!pick) { check('found a card with a guessed line', false); process.exit(1); }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const load = async () => {
    await p.goto('http://127.0.0.1:8800/');
    await p.selectOption('#optFormat', '60'); await p.fill('#deckText', `1 ${pick.name}\n59 Forest\n`);
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    if (await p.isChecked('#covOnlyGaps')) await p.uncheck('#covOnlyGaps');
  };
  const set = on => p.evaluate(on => { const e = document.querySelector('#dispFuzzy'); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }, on);
  const lineOf = () => p.evaluate(name => {
    const card = [...document.querySelectorAll('#coverage .cov-card')].find(c => (c.querySelector('.lines b') || {}).textContent === name);
    return card ? [...card.querySelectorAll('.lines > div')].map(d => ({ cls: d.className, text: d.textContent, pill: (d.querySelector('.pill.guess') || {}).textContent || null })) : null;
  }, pick.name);
  const teach = () => p.evaluate(name => { const t = document.querySelector('#teachBanner'); return !!t && !t.hidden && t.textContent.includes(name); }, pick.name);

  await load();
  check('the setting exists and is off by default', await p.evaluate(() => document.querySelector('#dispFuzzy') && !document.querySelector('#dispFuzzy').checked));
  let rows = await lineOf();
  check('off: the line is not guessed (no pill, no guessed class)', rows && rows.length && !rows.some(r => /guessed/.test(r.cls) || r.pill), JSON.stringify(rows).slice(0, 160));
  check('off: the card is on the Teach list', await teach());

  await set(true); await p.waitForFunction(() => window.__isf.deck.unique.some(c => c.a.coverage.some(r => r.status === 'guessed')), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(500);
  rows = await lineOf();
  const g = rows && rows.find(r => /guessed/.test(r.cls));
  check('on: the line shows a "guessed N%" pill', g && /^guessed \d+%$/.test(g.pill || ''), g && g.pill);
  check('on: the pill names the card the line was matched to ("like ...")', g && /like .+/.test(g.text), g && g.text.slice(0, 120));
  check('on: the score shown is 80% or more', g && +(g.pill.match(/\d+/) || [0])[0] >= 80);
  check('on: the guessed line still shows the card\'s own words', g && g.text.includes(pick.text.slice(0, 30)));
  check('on: the card is still on the Teach list (a guess is not a lesson)', await teach());
  check('on: the setting is stored', await p.evaluate(() => JSON.parse(localStorage.getItem('isf_display')).fuzzy === true));

  await load();          // a new page load: the setting persists and the deck is read with it
  await p.waitForFunction(() => window.__isf.deck.unique.some(c => c.a.coverage.some(r => r.status === 'guessed')), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(500);
  check('after a reload the setting is still on', await p.isChecked('#dispFuzzy'));
  rows = await lineOf();
  check('after a reload the pill shows', rows && rows.some(r => r.pill && /^guessed \d+%$/.test(r.pill)));

  await set(false); await p.waitForTimeout(500);
  rows = await lineOf();
  check('switched off: the pill is gone and the line is not understood again', rows && !rows.some(r => r.pill || /guessed/.test(r.cls)) && rows.some(r => /ignored/.test(r.cls)), JSON.stringify(rows).slice(0, 160));
  check('switched off: stored as off', await p.evaluate(() => JSON.parse(localStorage.getItem('isf_display')).fuzzy === false));
  check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  crashed: ' + e.message); process.exit(1); });
