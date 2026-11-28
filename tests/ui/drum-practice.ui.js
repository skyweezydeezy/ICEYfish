// T-097: in Practice, Springleaf Drum ("{T}, Tap an untapped creature you control: Add one mana of any color") makes mana: Lightning Bolt glows with only the Drum
// and a summoning-sick creature on the table, casting it asks which creature to tap (two are there), and the chosen creature and the Drum end up tapped.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = ['1 Springleaf Drum', '4 Lightning Bolt', '4 Goblin Guide', '4 Llanowar Elves', '20 Mountain', '10 Island'].join('\n');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', DECK);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  // the hand: the Drum, two Goblin Guides and a Lightning Bolt; no land anywhere on the table
  await p.evaluate(() => { const g = window.__isf.game; g.library.push(...g.hand.splice(0)); for (const n of ['Springleaf Drum', 'Goblin Guide', 'Llanowar Elves', 'Lightning Bolt']) { const k = g.library.findIndex(x => x.card.name === n); g.hand.push(g.library.splice(k, 1)[0]); } });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(600);
  const menu = (zone, name) => p.evaluate(([z, n]) => { const g = window.__isf.game, inst = (z === 'hand' ? g.hand : g.battlefield.map(x => x.inst || x)).find(i => (i.card || i).name === n); const el = document.querySelector('.table .mtg[data-iid="' + inst.iid + '"]'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); }, [zone, name]);
  for (const n of ['Springleaf Drum', 'Goblin Guide', 'Llanowar Elves']) { await menu('hand', n); await p.click('#ctxMenu button:has-text("Put onto battlefield")'); await p.waitForTimeout(700); }
  const state = () => p.evaluate(() => { const g = window.__isf.game; return { bf: g.battlefield.map(x => x.card.name + (x.tapped ? '*' : '')).join(','), hand: g.hand.map(i => i.card.name).join(','), gy: g.graveyard.map(i => i.card.name).join(','), lands: g.battlefield.filter(x => x.asLand).length, bolt: (() => { const i = g.hand.find(x => x.card.name === 'Lightning Bolt'); return i ? !!document.querySelector('#zHand .mtg[data-iid="' + i.iid + '"].castable') : null; })() }; });
  const s0 = await state();
  check('setup: the Drum, a Goblin Guide and a Llanowar Elves are on the table, no land', /Springleaf Drum/.test(s0.bf) && /Goblin Guide/.test(s0.bf) && /Llanowar Elves/.test(s0.bf) && s0.lands === 0, s0.bf);
  check('Lightning Bolt glows (castable) with only the Drum and the creatures to pay', s0.bolt === true, String(s0.bolt));
  const iid = await p.evaluate(() => window.__isf.game.hand.find(x => x.card.name === 'Lightning Bolt').iid);
  await p.click('#zHand .mtg[data-iid="' + iid + '"]'); await p.waitForTimeout(300);
  await p.click('#ctxMenu button:has-text("▶ Cast")');          // the card's menu: Cast pays with the mana on the table
  await p.waitForSelector('.ch-sheet', { timeout: 15000 }).catch(async () => { console.log('NO SHEET', JSON.stringify(await state())); });
  const sheet = await p.evaluate(() => { const s = document.querySelector('.ch-sheet'); return s ? { title: (s.querySelector('h3, .ch-title') || s).textContent.slice(0, 80), opts: [...s.querySelectorAll('.ch-opt')].map(o => o.title) } : null; });
  check('casting asks which permanent to tap: the Goblin Guide and the Elves are offered', !!sheet && /tap which/i.test(sheet.title) && sheet.opts.length === 2 && sheet.opts.some(t => /^Goblin Guide/.test(t)) && sheet.opts.some(t => /^Llanowar Elves/.test(t)), JSON.stringify(sheet));
  // the one that is not the default is chosen
  const picked = await p.evaluate(() => { const o = document.querySelector('.ch-sheet .ch-opt:not(.def)'); return o ? o.title.split(' (')[0] : null; });
  await p.click('.ch-sheet .ch-opt:not(.def)'); await viewerPick(p); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 });
  await p.waitForTimeout(800);
  const s1 = await state();
  check('the Bolt was cast (it is in the graveyard) and the Drum is tapped', /Lightning Bolt/.test(s1.gy) && /Springleaf Drum\*/.test(s1.bf), JSON.stringify(s1));
  const tappedNames = s1.bf.split(',').filter(x => /\*$/.test(x) && !/Drum/.test(x)).map(x => x.replace('*', ''));
  check('the creature they chose (the non-default one) is the one tapped, and only it', tappedNames.length === 1 && tappedNames[0] === picked, picked + ' / ' + tappedNames.join());
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e.message); process.exit(1); });
