// The Commander deck rule (T-040): with the format on Commander, Build loads only 100-card decks with one or two commanders. 99 or 101
// cards, or no commander, gets one short message and the deck already loaded stays. A list marked "// Specialty" may be bigger. A 60-card
// list still loads with the format on 60-card. Built-in decks load without the message.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_tutorial_off', '1'); } catch (e) {} });
  await ctx.addInitScript(() => { try { const t = sessionStorage.getItem('fakeDeck'); if (t) { sessionStorage.removeItem('fakeDeck'); const ui = JSON.parse(localStorage.getItem('isf_state')); ui.deck = t; localStorage.setItem('isf_state', JSON.stringify(ui)); } } catch (e) {} });
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => { if (document.querySelector('.cmdr-rule')) window.__ruleSeen = true; }).observe(document.body, { childList: true, subtree: true })); });
  await ctx.addInitScript(() => { try { if (sessionStorage.getItem('fakeOld')) { sessionStorage.removeItem('fakeOld'); const ui = JSON.parse(localStorage.getItem('isf_state')); ui.v = '1'; ui.ctl.optFormat = '60'; localStorage.setItem('isf_state', JSON.stringify(ui)); } } catch (e) {} });
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
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks option[value^="builtin:"]').length > 10, null, { timeout: 30000 });
  const Source = require(path.join(__dirname, '..', '..', 'goldfish', 'static', 'source.js'));
  const D = path.join(__dirname, '..', '..', 'goldfish', 'static', 'decks'), idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8'));
  const frodo = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
  const lines = frodo.split('\n'), sol = lines.findIndex(l => /^1 Sol Ring\b/.test(l.trim()));
  const ninetyNine = lines.filter((l, i) => i !== sol).join('\n');
  const hundredOne = frodo + '\n1 Arcane Signet';
  // load a list; wait until it is either loaded (the Loaded line) or refused (the rule's message)
  const load = async text => {
    await p.evaluate(() => { window.__isf.deck = null; document.querySelector('#deckMsgs').innerHTML = ''; });
    await p.fill('#deckText', text); await p.click('#loadDeck');
    await p.waitForFunction(() => document.querySelector('#deckMsgs .msg'), null, { timeout: 120000 });
    await p.waitForFunction(() => !document.querySelector('#loadDeck').disabled, null, { timeout: 120000 });
    return p.evaluate(() => ({ loaded: !!window.__isf.deck, msg: document.querySelector('#deckMsgs').textContent }));
  };
  const rule = m => /Not loaded as a Commander deck/.test(m);

  let r = await load(frodo);
  check('a 100-card list with two commanders loads', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  r = await load(ninetyNine);
  check('99 cards: the rule\'s message, saying the count', !r.loaded && rule(r.msg) && /99 cards/.test(r.msg), r.msg.slice(0, 120));
  r = await load(hundredOne);
  check('101 cards, unmarked: the message names the count and the specialty mark', !r.loaded && rule(r.msg) && /101 cards/.test(r.msg) && /\/\/ Specialty/.test(r.msg), r.msg.slice(0, 160));
  r = await load(hundredOne + '\n// Specialty');
  check('101 cards marked // Specialty loads', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  const sixty = ['24 Forest', '24 Mountain', '12 Llanowar Elves'].join('\n');
  r = await load(sixty);
  check('a 60-card list in the Commander format: no commander, so the message', !r.loaded && rule(r.msg) && /No commander/.test(r.msg) && /60-card/.test(r.msg), r.msg.slice(0, 160));
  // a refused list leaves the deck you had
  await load(frodo);
  await p.fill('#deckText', ninetyNine); await p.click('#loadDeck');
  await p.waitForFunction(() => /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 });
  check('...and the deck you had stays loaded', await p.evaluate(() => !!window.__isf.deck && window.__isf.deck.commanders.length === 2));
  // 1. a card the lookup cannot find still counts: a 100-line list with one unknown card loads, and says which card
  r = await load(frodo.replace(/^1 Sol Ring\b.*$/m, '1 Notacard Xyzzy'));
  check('one card not found: the list still loads (the unknown card counts toward 100) and names the card', r.loaded && !rule(r.msg) && /Notacard Xyzzy/.test(r.msg), r.msg.slice(0, 140));
  r = await load(ninetyNine.replace(/^1 Arcane Signet\b.*$/m, '1 Notacard Xyzzy'));
  check('...a list that is short anyway is refused, and the message names the card not found', !r.loaded && rule(r.msg) && /99 cards/.test(r.msg) && /Notacard Xyzzy/.test(r.msg), r.msg.slice(0, 200));
  // ...and with no commander marked: the commander guess counts the card not found too (MAIN's review: it used to say "No commander")
  r = await load(frodo.replace(/^\/\/ COMMANDER\s*$/m, '').replace(/^1 Sol Ring\b.*$/m, '1 Notacard Xyzzy'));
  check('...an unmarked 100-line list with a card not found loads with its commander guessed', r.loaded && !rule(r.msg) && /Notacard Xyzzy/.test(r.msg) && await p.evaluate(() => window.__isf.deck.commanders.length >= 1), r.msg.slice(0, 160));
  // 2. Archidekt: Maybeboard / Sideboard / Considering / Companion lines are not in the deck
  const archidekt = frodo.replace(/^1 Sol Ring\b.*$/m, '1x Sol Ring [Sideboard Hate]') + '\n1x Arcane Signet (c21) 236 [Maybeboard{noDeck}{noPrice},Ramp]\n1x Lightning Greaves [Sideboard{noDeck}]\n1x Lurrus of the Dream-Den [Companion{top}]\n1x Swords to Plowshares [Considering]';
  r = await load(archidekt);
  check('Archidekt: a 100-card deck with Maybeboard, Sideboard, Companion and Considering lines (and a custom "Sideboard Hate" card) loads', r.loaded && !rule(r.msg), r.msg.slice(0, 140));
  { const e = Source.parseDecklist(archidekt); check('...those lines are not parsed as deck cards', e.reduce((s, c) => s + c.qty, 0) === 100 && !e.some(c => /Lurrus/.test(c.name)), e.reduce((s, c) => s + c.qty, 0)); }
  // 5. a deck coming back past the rule (the tutorial's setDeck(prev, true)): refused without force, loaded with it
  await load(frodo);
  { const res = await p.evaluate(() => { const A = window.__isfApi, L = window.__isf.loaded, r = Object.assign({}, L, { cards: L.cards.slice(1), missing: [] });
      const a = A.setDeck(r); const kept = window.__isf.cards.length; const b = A.setDeck(r, true); return { a, kept, full: L.cards.length, b, now: window.__isf.cards.length }; });
    check('setDeck refuses a 99-card deck, and with force (the tutorial giving your deck back) it loads it', res.a === false && res.kept === res.full && res.b !== false && res.now === res.full - 1, JSON.stringify(res)); }
  // 3. a refused built-in leaves the loaded deck, the lab's saved choices and the deck menu alone (T-048: the menu names the loaded deck again)
  { const pol = idx.decks ? idx.decks : idx, withPol = pol.find(d => d.policy && Object.keys(d.policy).length), plain = pol.find(d => !d.policy && d.file !== withPol.file);
    await p.evaluate(() => { window.__isf.deck = null; });
    await p.selectOption('#savedDecks', 'builtin:' + plain.file);
    await p.waitForFunction(() => window.__isf.deck, null, { timeout: 120000 }); await p.waitForTimeout(500);
    const had = await p.evaluate(() => window.__isf.deck.commanders.map(i => i.card.name).join('+'));
    await p.route('**/decks/' + encodeURIComponent(withPol.file), async route => { const res = await route.fetch(); const t = await res.text(); const ls = t.split('\n'); const i = ls.findIndex((l, k) => k > 5 && /^1 /.test(l.trim()) && !/\*CMDR\*/i.test(l)); ls.splice(i, 1); route.fulfill({ response: res, body: ls.join('\n') }); });
    const before = await p.evaluate(() => localStorage.getItem('gf_policy'));
    await p.evaluate(() => { document.querySelector('#deckMsgs').innerHTML = ''; });
    await p.selectOption('#savedDecks', 'builtin:' + withPol.file);
    await p.waitForFunction(() => /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 }); await p.waitForTimeout(1500);
    const after = await p.evaluate(() => ({ pol: localStorage.getItem('gf_policy'), cmdrs: window.__isf.deck.commanders.map(i => i.card.name).join('+'), sel: document.querySelector('#savedDecks').value, saved: (JSON.parse(localStorage.getItem('isf_state') || '{}') || {}).saved }));
    check('a built-in deck that is refused (one card short) saves none of its lab choices', after.pol === before, withPol.file);
    check('...and the deck you had stays loaded', after.cmdrs === had, after.cmdrs + ' / ' + had);
    check('...and the deck menu (and the remembered choice) names the deck that is loaded again', after.sel === 'builtin:' + plain.file && after.saved === after.sel, JSON.stringify({ sel: after.sel, saved: after.saved }));
    await p.unroute('**/decks/' + encodeURIComponent(withPol.file));
    // a refused deck link: added to the saved decks, but the menu goes back to the loaded deck
    await p.evaluate(() => { document.querySelector('#deckMsgs').innerHTML = ''; });
    await p.evaluate(t => { location.hash = 'deck=p.' + btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '&name=Short'; }, ninetyNine.replace(/[^\x00-\x7f]/g, ''));
    await p.waitForFunction(() => /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 }); await p.waitForTimeout(300);
    const l = await p.evaluate(() => ({ sel: document.querySelector('#savedDecks').value, saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')) }));
    check('a refused deck link: it is in the saved decks, and the menu names the loaded deck again', l.saved.includes('Short') && l.sel === 'builtin:' + plain.file, JSON.stringify(l)); }
  // T-048: the menu goes back to the right entry after a pasted deck, and after a reload
  { const pol = idx.decks ? idx.decks : idx, withPol = pol.find(d => d.policy && Object.keys(d.policy).length), plain = pol.find(d => !d.policy && d.file !== withPol.file);
    const short = () => p.route('**/decks/' + encodeURIComponent(withPol.file), async route => { const res = await route.fetch(); const ls = (await res.text()).split('\n'); ls.splice(ls.findIndex((l, k) => k > 5 && /^1 /.test(l.trim()) && !/\*CMDR\*/i.test(l)), 1); route.fulfill({ response: res, body: ls.join('\n') }); });
    const refusedPick = async () => { await p.evaluate(() => { document.querySelector('#deckMsgs').innerHTML = ''; }); await p.selectOption('#savedDecks', 'builtin:' + withPol.file);
      await p.waitForFunction(() => /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 }); await p.waitForTimeout(1500);
      return p.evaluate(() => ({ sel: document.querySelector('#savedDecks').value, saved: (JSON.parse(localStorage.getItem('isf_state') || '{}') || {}).saved })); };
    await short();
    await p.evaluate(() => localStorage.setItem('isf_autosave', '1'));
    r = await load(frodo + '\n// pasted for T-048');
    const pasted = await p.evaluate(() => document.querySelector('#savedDecks').value);
    let m = await refusedPick();
    check('paste and Load a new deck (saved by itself), then pick a refused deck: the menu shows the pasted deck', !!pasted && !pasted.startsWith('builtin:') && m.sel === pasted && m.saved === pasted, JSON.stringify({ pasted, ...m }));
    await p.evaluate(() => localStorage.setItem('isf_autosave', '0'));
    await p.unroute('**/decks/' + encodeURIComponent(withPol.file));
    await p.evaluate(() => { window.__isf.deck = null; });
    await p.selectOption('#savedDecks', 'builtin:' + plain.file); await p.waitForFunction(() => window.__isf.deck, null, { timeout: 120000 }); await p.waitForTimeout(1500);
    await p.reload(); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 }); await p.waitForTimeout(500);
    await short();
    m = await refusedPick();
    check('after a reload, pick a refused deck: the menu shows the remembered deck', m.sel === 'builtin:' + plain.file && m.saved === m.sel, JSON.stringify(m));
    await p.unroute('**/decks/' + encodeURIComponent(withPol.file)); }
  await load(frodo);
  // 6. switching Format to Commander re-checks the deck that is loaded
  await p.selectOption('#optFormat', '60');
  r = await load(['24 Forest', '24 Mountain', '12 Llanowar Elves'].join('\n'));
  await p.selectOption('#optFormat', 'commander'); await p.waitForTimeout(300);
  { const f = await p.evaluate(() => ({ fmt: document.querySelector('#optFormat').value, msg: document.querySelector('#deckMsgs').textContent }));
    check('switching to Commander with a 60-card deck loaded: the rule\'s message, and the format stays 60-card', f.fmt === '60' && rule(f.msg), JSON.stringify(f).slice(0, 160)); }
  // switching to Commander runs the commander guess, as loading does: an unmarked 100-card list stays on Commander
  await p.selectOption('#optFormat', '60');
  r = await load(frodo.replace('// COMMANDER\n', ''));
  await p.selectOption('#optFormat', 'commander'); await p.waitForTimeout(300);
  { const f = await p.evaluate(() => ({ fmt: document.querySelector('#optFormat').value, cmdr: window.__isf.deck.commanders.map(i => i.card.name).join('+'), msg: document.querySelector('#deckMsgs').textContent }));
    check('switching to Commander with an unmarked 100-card list: the commander is guessed and the format stays Commander', f.fmt === 'commander' && f.cmdr && !/Not loaded/.test(f.msg), JSON.stringify(f).slice(0, 160)); }
  // non-Commander: a 60-card list
  await p.selectOption('#optFormat', '60');
  r = await load(sixty);
  check('a 60-card list loads with the format on 60-card', r.loaded && !rule(r.msg), r.msg.slice(0, 80));
  r = await load(frodo); await p.selectOption('#optFormat', 'commander');
  await p.evaluate(() => { document.querySelector('#deckMsgs').innerHTML = ''; });
  // built-in decks: every one is 100 cards with one or two commanders, so they load without the message (all 42, from their files)
  const bad = (idx.decks || idx).filter(d => { const e = Source.parseDecklist(fs.readFileSync(path.join(D, d.file), 'utf8')), n = e.reduce((s, c) => s + c.qty, 0), c = e.filter(x => x.commander).length; return !(c >= 1 && c <= 2 && (n === 100 || /^\s*\/\/\s*specialty\b/im.test(fs.readFileSync(path.join(D, d.file), 'utf8')))); });
  check('every built-in deck meets the rule', !bad.length, bad.map(d => d.file).join(', '));
  const first = await p.$eval('#savedDecks optgroup option', o => o.value);
  await p.evaluate(() => { window.__isf.deck = null; });
  await p.selectOption('#savedDecks', first);
  await p.waitForFunction(() => window.__isf.deck || /Not loaded/.test(document.querySelector('#deckMsgs').textContent), null, { timeout: 120000 });
  check('a built-in deck picked from the menu loads without the message', await p.evaluate(() => !!window.__isf.deck && !/Not loaded/.test(document.querySelector('#deckMsgs').textContent)), first);
  // 4. a deck remembered from before the rule (99 cards) still comes back after a reload
  await load(frodo); await p.waitForTimeout(1500);
  await p.evaluate(t => sessionStorage.setItem('fakeDeck', t), ninetyNine);          // the init script swaps it in after the page's own save on unload
  await p.reload(); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 }); await p.waitForTimeout(500);
  { const back = await p.evaluate(() => ({ deck: !!window.__isf.deck, n: (window.__isf.cards || []).reduce((s, c) => s + c.qty, 0) })); check('a remembered 99-card deck from before the rule comes back after a reload', back.deck && back.n === 99, JSON.stringify(back)); }
  // a deck link opened at startup is checked against the saved format: a 60-card link, saved format 60-card, is not refused
  await p.selectOption('#optFormat', '60'); await load(frodo); await p.waitForTimeout(1500);
  const sixtyLink = 'http://127.0.0.1:8800/?link=1#deck=p.' + Buffer.from(['24 Forest', '24 Mountain', '12 Llanowar Elves'].join('\n')).toString('base64url') + '&name=Sixty';
  await p.goto(sixtyLink); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 }); await p.waitForTimeout(1500);
  { const f = await p.evaluate(() => ({ fmt: document.querySelector('#optFormat').value, seen: !!window.__ruleSeen, saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')) }));
    check('a 60-card deck link opened at startup, saved format 60-card: added and never refused', f.fmt === '60' && !f.seen && f.saved.includes('Sixty'), JSON.stringify(f)); }
  // T-048: a format saved by an older version is not restored at startup (remember.js resets everything else then too)
  await p.evaluate(() => sessionStorage.setItem('fakeOld', '1'));
  await p.goto(sixtyLink.replace('?link=1', '?link=2').replace('name=Sixty', 'name=SixtyOld')); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 }); await p.waitForTimeout(1500);
  { const f = await p.evaluate(() => ({ fmt: document.querySelector('#optFormat').value, seen: !!window.__ruleSeen }));
    check('settings saved by an older version: the saved 60-card format is not restored, so the 60-card link meets the Commander rule', f.fmt === 'commander' && f.seen, JSON.stringify(f)); }
  // T-065: the deck link opened at startup is the deck that is loaded (the remembered deck does not load over it)
  await p.selectOption('#optFormat', '60'); await load(frodo); await p.waitForTimeout(1500);
  await p.goto(sixtyLink.replace('?link=1', '?link=3').replace('name=Sixty', 'name=SixtyThree')); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 }); await p.waitForTimeout(2500);
  { const n = await p.evaluate(() => (window.__isf.cards || []).reduce((s, c) => s + c.qty, 0)); check('a deck link opened at startup wins: the remembered deck does not load over it', n === 60, 'cards ' + n); }
  // T-065: a built-in picked, then Load deck on it again: the menu keeps naming it, so a refused deck puts it back
  await p.selectOption('#optFormat', 'commander');
  await p.selectOption('#savedDecks', first);
  await p.waitForFunction(() => window.__isf.deck, null, { timeout: 120000 }); await p.waitForTimeout(500);
  await p.click('#loadDeck'); await p.waitForFunction(() => !document.querySelector('#loadDeck').disabled, null, { timeout: 120000 }); await p.waitForTimeout(500);
  await load(ninetyNine);
  check('built-in, then Load deck, then a refused deck: the menu names the built-in again', await p.$eval('#savedDecks', e => e.value) === first, await p.$eval('#savedDecks', e => e.value));
  // T-065: a saved deck with Windows line ends is the same deck
  await p.evaluate(t => { const d = JSON.parse(localStorage.getItem('gf_decks') || '{}'); d['CRLF deck'] = t.replace(/\n/g, '\r\n'); localStorage.setItem('gf_decks', JSON.stringify(d)); }, frodo);
  await p.reload(); await p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 120000 });
  await p.selectOption('#savedDecks', 'CRLF deck'); await p.waitForFunction(() => window.__isf.deck, null, { timeout: 120000 }); await p.waitForTimeout(500);
  await p.fill('#deckText', frodo); await p.click('#loadDeck'); await p.waitForFunction(() => !document.querySelector('#loadDeck').disabled, null, { timeout: 120000 }); await p.waitForTimeout(500);
  await load(ninetyNine);
  check('a saved deck with Windows line ends: Load deck of the same text keeps the menu on it, a refused deck puts it back', await p.$eval('#savedDecks', e => e.value) === 'CRLF deck', await p.$eval('#savedDecks', e => e.value));
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
