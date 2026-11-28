// Every deck dropdown has the same layout; by default (Deck order: Bracket, then rank) one heading per bracket, highest first (the other orders: deck-order.ui.js). Checked on the Build tab's deck list, the mirror opponent, the 1v1 and Pod opponents and the lab's opponent list.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('gf_decks', JSON.stringify({ 'My brew': '1 Forest' })); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks option[value^="builtin:"]').length > 10, null, { timeout: 30000 });
  await p.click('[data-tab=duel]'); await p.click('[data-tab=pod]'); await p.waitForTimeout(500);
  await p.evaluate(() => { const m = document.querySelector('#plMode'), o = document.querySelector('#plOpp'); if (m && o) { m.value = 'field'; m.dispatchEvent(new Event('change', { bubbles: true })); o.value = 'selected'; o.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.waitForTimeout(300);
  const read = sel => p.$$eval(sel, els => els.map(el => [...el.querySelectorAll('optgroup')].map(g => ({ label: g.label, n: g.children.length, colors: [...g.children].map(o => (o.textContent.split(' · ')[1] || '').trim()) }))));
  for (const [name, sel] of [['Build: deck list', '#savedDecks'], ['Simulate: mirror opponent', '#mmOpp'], ['Duel: opponent', '#tab-duel .vs-opp'], ['Pod: opponents', '#tab-pod .vs-opp'], ['Lab: opponent list', '#plOppList']]) {
    const lists = await read(sel);
    check(`${name}: the dropdown is there`, lists.length > 0, lists.length + ' dropdown(s)');
    for (const groups of lists.slice(0, 1)) {
      const built = groups.filter(g => g.label !== 'Saved in this browser'), br = built.filter(g => /^Bracket \d/.test(g.label)).map(g => +g.label.match(/\d/)[0]);
      check(`${name}: default order, every heading is a bracket (or "No bracket" last)`, built.length >= 2 && built.every((g, i) => /^Bracket \d/.test(g.label) || (g.label === 'No bracket' && i === built.length - 1)), built.map(g => g.label).join(' | '));
      check(`${name}: brackets from the highest down`, br.length >= 2 && br.every((x, i) => !i || x < br[i - 1]), br.join(','));
      check(`${name}: saved decks come last, under their own heading`, groups[groups.length - 1].label === 'Saved in this browser' && groups[groups.length - 1].n === 1);
    }
  }
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
