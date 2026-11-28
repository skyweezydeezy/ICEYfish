/* ICEYfish - UI */
(function () {
  'use strict';
  const G = window.Goldfish, C = window.Charts;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pct = C.pct;
  const sfx = (name, at) => { if (window.__isfAudio) window.__isfAudio.play(name, at); };          // sound effects (audio.js); silent when sound is off
  // "Less is more, until the user says more is best." Explanations and report details start folded; headers stay in view.
  // tidy(el): an explanation (.hint) that sits under a header folds behind an ⓘ toggle beside it; every report group (.sg)
  // folds to its heading. In a .fold-items group the group heading stays and each item folds to its own bold heading instead.
  function infoToggle(head, text, inside) {
    const b = h('button', 'info-tog', 'i'); b.type = 'button'; b.title = 'What is this?'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'What is this?');
    text.classList.add('folded');
    b.addEventListener('click', e => { e.stopPropagation(); const open = text.classList.toggle('folded') === false; b.setAttribute('aria-expanded', String(open)); b.classList.toggle('on', open); });
    if (inside) head.appendChild(b); else head.after(b);          // inside a heading of its own, so it sits on the heading's line
  }
  function tidy(el) {
    if (!el) return;
    el.querySelectorAll('.box-head').forEach(bh => { const t = bh.querySelector(':scope > .hint:not(.folded)'); const hd = bh.querySelector(':scope > h2, :scope > h3'); if (t && hd && !bh.querySelector('.info-tog')) infoToggle(hd, t); });
    el.querySelectorAll('h2 + p.hint:not([id]):not(.folded), h3 + p.hint:not([id]):not(.folded)').forEach(t => { const hd = t.previousElementSibling; if (!hd.querySelector('.info-tog')) infoToggle(hd, t, true); });
    el.querySelectorAll('.hint[data-fold]:not(.folded)').forEach(t => { if (t.previousElementSibling) infoToggle(t.previousElementSibling, t); });          // a how-to line without a header of its own
    el.querySelectorAll('.sg:not(.folded-sg)').forEach(sg => {
      sg.classList.add('folded-sg');
      if (sg.classList.contains('fold-items')) {
        sg.querySelectorAll(':scope > ul > li').forEach(li => { const b = li.firstElementChild; if (!b || b.tagName !== 'B' || li.childNodes.length < 2) return;
          const d = h('details', 'fold'), s = h('summary'); s.appendChild(b); const body = h('div', 'fold-body'); while (li.firstChild) body.appendChild(li.firstChild);
          body.innerHTML = body.innerHTML.replace(/^\s*:\s*/, ''); d.append(s, body); li.appendChild(d); });
        return;
      }
      const b = sg.firstElementChild; if (!b || b.tagName !== 'B' || sg.children.length < 2) return;
      const n = sg.querySelectorAll(':scope > ul > li').length;
      const d = h('details', 'fold'), s = h('summary'); s.appendChild(b); if (n) s.appendChild(h('span', 'fold-n', String(n)));
      const body = h('div', 'fold-body'); while (sg.firstChild) body.appendChild(sg.firstChild); d.append(s, body); sg.appendChild(d);
    });
  }
  const sfxEv = (ev, o) => { if (window.__isfAudio) window.__isfAudio.events(ev, o); if (window.__isfFx) window.__isfFx.events(ev); };   // sounds, and on-screen card effects (card-effects.js)

  const S = { cards: [], deck: null, byUid: [], game: null, undo: [], sim: null, oddsSel: new Set(), busy: false };
  window.__isfShowTab = t => showTab(t);
  window.__isf = S;                                  // read-only handle for automated UI tests

  // ======================= setup =======================
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const dirty = () => window.dispatchEvent(new Event('isf-dirty'));          // something worth remembering changed (remember.js saves it shortly)
  function showTab(t) {
    document.body.dataset.view = t; document.body.classList.remove('tleft', 'tbar-open'); if (window.__isfFocus) window.__isfFocus.apply();
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    if (t === 'hands' && S.deck) renderOpenLandsChart();
    requestAnimationFrame(refit);
    if (t === 'table' && S.deck && !S.game) newTableGame();
    if (t === 'sim') { fillMirror(); renderLabSaved(); renderComboRaise(); }          // recomputes only when the deck or play/draw changed
    if (t === 'sim' && S.sim) renderSim();
    if (t === 'odds' && S.deck) renderOdds();
    dirty();
  }

  tidy(document.querySelector('main'));
  // ---- T-069: every report box folds to its header (click the header; ▾ shows it). The long reference boxes start folded; on a phone so do the charts.
  const FOLD_SHUT = /^(Curve wall|Lands & mana|How the engine reads|Sample games|When each card gets played|What a keepable|Play many games|Tags|Lands in your opening|Combos and win|Mirror match|Two-faced|Policy lab|Tune|A\/B test|Swaps|Raise your combo)/i;
  const FOLD_SHUT_PHONE = /^(Mana available|Hitting every|Commander cast|Goldfish kill|Total damage|Board power)/i;
  const foldDefault = () => { try { const f = localStorage.getItem('isf_fold'); if (f) return f === 'on'; } catch (e) {} return !navigator.webdriver; };   // scripted browsers keep every box open unless isf_fold = on
  function foldBoxes() {
    const phone = window.matchMedia('(max-width: 700px)').matches;
    document.querySelectorAll('main .card-box:not([data-fold])').forEach(box => {
      if (box.closest('.vs-game') || box.classList.contains('deck-input') || box.classList.contains('rm-box')) return;
      const hd = box.querySelector(':scope > .box-head, :scope > h2'); if (!hd) return;
      const title = (hd.querySelector('h2') || hd).textContent.trim();
      box.dataset.fold = '1';
      if (foldDefault() && (FOLD_SHUT.test(title) || (phone && FOLD_SHUT_PHONE.test(title)))) box.classList.add('box-closed');
    });
  }
  document.addEventListener('click', e => {
    const hd = e.target.closest && e.target.closest('.card-box[data-fold] > .box-head, .card-box[data-fold] > h2'); if (!hd) return;
    if (e.target.closest('button, a, input, select, label, summary, .info-tog, textarea')) return;
    hd.parentElement.classList.toggle('box-closed');
  });
  foldBoxes();
  { let ft; new MutationObserver(() => { clearTimeout(ft); ft = setTimeout(foldBoxes, 120); }).observe(document.querySelector('main'), { childList: true, subtree: true }); }

  Source.init().then(st => {
    const el = $('#mirrorStatus');
    if (st.mode === 'local') {
      const i = st.info;
      el.textContent = `Local cards (Scryfall data): ${i.names.toLocaleString()} card names${i.images ? '' : ' (no image folder!)'}`; el.className = 'status-pill ok'; el.title = i.root;
    } else {
      el.textContent = 'Cards: Scryfall (live)';
      el.className = 'status-pill ok'; el.title = 'Card data and images load from Scryfall in your browser.';
    }
  });

  // The version pill next to the card-source pill: the version this copy of the app is running (the service worker's cache version,
  // "isf-v54" shows as "v54"). When a newer one has been deployed the pill gets a thin outline (the number stays), and a tap loads it.
  let versionOk; const runningVersion = new Promise(r => { versionOk = r; });          // the version this copy runs (remember.js forgets what an older version saved)
  (async function showVersion() {
    const el = $('#appVersion');
    const num = s => (String(s || '').match(/isf-v(\d+)/) || [])[1] || null;
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    const running = sw ? await new Promise(res => { const ch = new MessageChannel(), t = setTimeout(() => res(null), 1500); ch.port1.onmessage = e => { clearTimeout(t); res(e.data && e.data.version); }; sw.postMessage('version', [ch.port2]); }) : null;
    let latest = null; try { const r = await fetch('version.js', { cache: 'no-store' }); if (r.ok) latest = ((await r.text()).match(/ISF_VERSION = (\d+)/) || [])[1] || null; } catch (e) { /* offline: show the running version only */ }          // version.js holds the number: one more with every merge
    const v = num(running) || latest || (self.ISF_VERSION ? String(self.ISF_VERSION) : null);
    versionOk(v);
    if (!v || !el) return;
    el.hidden = false; el.textContent = 'v' + v; el.title = 'ICEYfish version ' + v + ' · © 2026 SWD Marketing, all rights reserved. Licensed to SWD Marketing';
    if (latest && +latest > +v) { el.classList.add('update'); el.title = 'Version ' + latest + ' is out. Tap to update.'; }          // the pill keeps showing only the version you run; a thin outline says a newer one is ready
    else el.title += '. Tap to check for a newer one.';
    // A tap loads the newest version for certain. Asking the service worker to update and reloading straight away is not enough: the reload
    // comes before the new worker is ready, so the old cached copy opens again. So: drop the old worker and the cached app files (card images
    // stay), then reload; the page comes from the network and installs the new worker itself.
    el.addEventListener('click', async () => {
      el.disabled = true; el.textContent = '↻';          // as short as the number, so the top bar does not move
      try { for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister(); } catch (e) { /* no service worker */ }
      try { for (const k of await caches.keys()) if (k !== 'gf-img-v1') await caches.delete(k); } catch (e) { /* no cache storage */ }
      location.reload();
    });
  })();

  function opts() {
    const fmt = $('#optFormat').value;
    return {
      turns: +$('#optTurns').value || 10,
      minLands: +$('#optMinLands').value, maxLands: +$('#optMaxLands').value,
      freeMulligan: $('#optFreeMull').checked, onPlay: $('#optOnPlay').checked,
      prioritizeCommander: $('#optCmdrFirst').checked, oppLife: +$('#optLife').value || 40,
      noMaxHand: $('#optNoMaxHand').checked,                 // no discarding down to seven in the cleanup step
      turnTimer: $('#optTurnTimer') ? $('#optTurnTimer').checked : true,          // Duel, Pod and Play a friend: a clock on each person's turn (versus.js)
      startLife: +$('#optMyLife').value || (fmt === 'commander' ? 40 : 20),   // your life at the start (in Duel and Pod, every player's)
      minHandSize: +$('#optMullTo').value || 5, idealLandRatio: fmt === 'commander' ? 0.42 : 0.4, n: +$('#optN').value || 2000,
      policy: currentPolicy(),                                // choices learned in the Policy lab for this deck
      bookCombos: S.bookCombos || [],                         // the Commander Spellbook combos the goldfish counts for this deck (renderComboBook)
      ...(window.__isfAutoPass && window.__isfAutoPass !== 'smart' ? { autoPass: window.__isfAutoPass } : {}),          // 'never' asks at every step, 'always' never asks (Settings → Display → Stop to respond)
    };
  }
  $('#optFormat').addEventListener('change', () => {
    const c = $('#optFormat').value === 'commander';
    if (c && S.loaded && S.cards) {          // the Commander deck rule, for the deck already loaded: a deck that breaks it keeps the 60-card format
      const bad = commanderProblem(S.cards, S.cards.reduce((s, x) => s + x.qty, 0), S.loaded.specialty, S.loaded.missing);
      if (bad) {          // loaded again in the Commander format: the commander guess runs as on loading, so an unmarked 100-card list is fine
        const msgs = $('#deckMsgs').innerHTML;
        if (setDeck(S.loaded) === false) {
          $('#optFormat').value = '60';
          $('#deckMsgs').innerHTML = ruleMsg(bad, S.loaded.missing).replace('Fix the list, or choose 60-card in Format for a non-Commander deck.', 'The format stays 60-card.') + msgs;
          return;
        }
      }
    }
    $('#optLife').value = c ? 40 : 20; $('#optMyLife').value = c ? 40 : 20; $('#optFreeMull').checked = c; $('#optMaxLands').value = c ? 5 : 4;
  });
  // "Reset rules to defaults": every goldfish rule back to its default for the chosen format (the format itself stays)
  const RULE_DEFAULTS = c => ({ optTurns: 10, optMinLands: 2, optMaxLands: c ? 5 : 4, optFreeMull: c, optOnPlay: false, optCmdrFirst: true, optLife: c ? 40 : 20, optMyLife: c ? 40 : 20, optN: 2000, optMullTo: 5, optNoMaxHand: false, optTurnTimer: true });
  $('#optReset').addEventListener('click', () => {
    const d = RULE_DEFAULTS($('#optFormat').value === 'commander');
    for (const [id, v] of Object.entries(d)) {
      const el = $('#' + id); if (!el) continue;
      if (el.type === 'checkbox') el.checked = v; else el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    toast('Rules back to their defaults');
  });

  // Display (app-wide, kept in this browser like sound and the playmat): how a tab fades in, and the order of the built-in deck menus
  const DECK_ORDERS = ['bracket', 'color-bracket', 'color'], LEGACY_ORDER = { 'bracket-rank': 'bracket', 'color-rank': 'color', rank: 'bracket' };          // the old rank orders are gone
  let deckOrder = 'bracket', decksListed = false;                // decksListed: the built-in index has loaded, so the menus can be refilled
  (() => {
    const KEY = 'isf_display', FADE = { smooth: '2s', quick: '.35s', off: '0s' };
    let d = {}; try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { d = {}; }
    const apply = () => {
      const fade = $('#dispFade').value;          // one spacing for everyone: Standard (the user, 2026-11-26: Compact and Roomy removed)
      const ord = $('#dispDeckOrder').value; if (ord !== deckOrder) { deckOrder = ord; if (decksListed) refillDeckMenus(); }
      document.documentElement.style.setProperty('--mode-fade', FADE[fade] || FADE.smooth);
      window.__isfPayChoose = $('#dispPayChoose').checked;          // T-089: read by the question sheet (choices.js)
      window.__isfAutoPass = $('#dispStop').value;          // T-130: "Stop to respond": Smart = 'smart', At every step = 'never', Never = 'always' (opts.autoPass, read by opts())
    };
    if (d.fade && FADE[d.fade]) $('#dispFade').value = d.fade;
    { const o = LEGACY_ORDER[d.deckOrder] || d.deckOrder; if (o && DECK_ORDERS.includes(o)) $('#dispDeckOrder').value = o; }
    $('#dispPayChoose').checked = d.payChoose !== false;          // T-099: on unless the person switched it off
    if (['smart', 'never', 'always'].includes(d.stop)) $('#dispStop').value = d.stop;
    $('#dispFuzzy').checked = d.fuzzy === true;          // T-131: off unless the person turned it on
    // T-131 "Guess unknown rules": the lines the engine can read are loaded the first time it is switched on; the deck is read again with it on or off.
    // Only this page's own reading changes. Simulations (worker.js), the rankings and the bracket checks never guess.
    let fuzzyIdx = null;
    const applyFuzzy = async () => {
      let on = $('#dispFuzzy').checked;
      if (on) { try { if (!fuzzyIdx) { const r = await fetch('data/fuzzy-index.json'); if (!r.ok) throw new Error(r.status); fuzzyIdx = await r.json(); } G.setFuzzy(fuzzyIdx); } catch (e) { on = false; $('#dispFuzzy').checked = false; toast('Could not load the rules to guess from: guessing stays off.'); } }
      if (!on) G.setFuzzy(null);
      if (typeof S !== 'undefined' && S.deck) { S.deck = G.buildDeck(S.cards, S.tokens, currentPolicy().tribe); S.byUid = S.deck.unique; if (typeof renderCoverage === 'function') renderCoverage(); }
    };
    if (d.fuzzy === true) setTimeout(applyFuzzy, 0);
    apply();
    for (const id of ['#dispFade', '#dispDeckOrder', '#dispPayChoose', '#dispStop', '#dispFuzzy']) $(id).addEventListener('change', () => {
      apply(); if (id === '#dispFuzzy') applyFuzzy();
      try { localStorage.setItem(KEY, JSON.stringify({ fade: $('#dispFade').value, deckOrder: $('#dispDeckOrder').value, payChoose: $('#dispPayChoose').checked, stop: $('#dispStop').value, fuzzy: $('#dispFuzzy').checked })); } catch (e) { /* storage blocked */ }
    });
  })();

  // ======================= card elements & zoom =======================
  function imgFor(card, face) {
    const i = face || 0;
    return (card.images && card.images[i]) || (card.remote_images && card.remote_images[i]) || null;
  }
  // A two-faced card shown one face at a time: the ⟲ button swings it around (a 3D turn) to the other face. o.face starts on the back;
  // o.onFlip(face) is told when it turns. box.setFace(0|1) turns it from outside; box.face() says which face shows.
  function hasTwoFaces(card) { return Math.max((card.images || []).length, (card.remote_images || []).length) >= 2 || (card.faces || []).length >= 2; }
  function flipCardEl(card, o) {
    o = o || {};
    const box = h('div', 'flip' + (o.face ? ' flipped' : '')), inner = h('div', 'flip-inner');
    const front = cardEl(card, Object.assign({}, o, { face: 0 })), back = cardEl(card, Object.assign({}, o, { face: 1 }));
    front.classList.add('flip-front'); back.classList.add('flip-back');
    inner.append(front, back); box.appendChild(inner);
    const btn = h('button', 'flip-btn', '⟲'); btn.type = 'button'; btn.title = 'Turn the card over'; btn.setAttribute('aria-label', 'Turn the card over');
    box.face = () => (box.classList.contains('flipped') ? 1 : 0);
    box.setFace = f => { box.classList.toggle('flipped', !!f); front.setAttribute('aria-hidden', f ? 'true' : 'false'); back.setAttribute('aria-hidden', f ? 'false' : 'true'); };
    box.turn = () => { box.setFace(!box.face()); sfx('transform'); if (o.onFlip) o.onFlip(box.face()); };
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); box.turn(); });
    box.appendChild(btn); box.setFace(o.face ? 1 : 0);
    return box;
  }
  function cardEl(card, o) {
    o = o || {};
    const e = h('div', 'mtg');
    e.dataset.uid = card.uid;
    e._card = card;                                         // the card itself: hover preview and viewer use this, so cards of other decks (1v1, Pod) work too
    e._o = o;                                               // how it was built, so a changed printing can redraw its picture in place (refreshArt)
    if (o.iid != null) e.dataset.iid = o.iid;
    const src = imgFor(card, o.face);
    const fb = () => { e.innerHTML = `<div class="fallback"><b>${esc(card.name)}</b><span>${esc(card.mana_cost)}</span><span>${esc(card.type_line)}</span></div>`; addExtras(); };
    function addExtras() {
      if (o.badge) e.appendChild(h('span', 'badge', esc(o.badge)));
      if (o.tag) e.appendChild(h('span', 'tag', esc(o.tag)));
    }
    if (src) {
      const img = new Image(); img.loading = o.eager ? 'eager' : 'lazy'; img.alt = card.name; img.src = src;
      img.onerror = () => {
        const alt = card.remote_images && card.remote_images[o.face || 0];
        if (alt && img.src !== alt && !img.dataset.tried) { img.dataset.tried = 1; img.src = alt; } else fb();
      };
      e.appendChild(img); addExtras();
    } else fb();
    if (card.commander) e.classList.add('commander');
    return e;
  }

  const zoom = $('#zoom');
  const canHover = matchMedia('(hover: hover)').matches;
  document.addEventListener('mouseover', e => {
    if (!canHover) return;
    const m = e.target.closest('.mtg');
    if (!m || m.closest('.zoom, #lightbox')) return;
    const card = cardOf(m); if (!card) return;
    zoom.innerHTML = '';
    const faces = h('div', 'faces');
    const n = Math.max(1, (card.images || []).length || (card.remote_images || []).length);
    for (let i = 0; i < Math.min(2, n); i++) faces.appendChild(cardEl(card, { face: i }));
    zoom.appendChild(faces);
    { const ts = S.tags && isDeckCard(card) && S.tags.ofCard.get(card.uid);                 // the card's tags (tags.js), without the shape tags
      if (ts) { const keep = [...ts].filter(t => !/^(mv|color|engine|type):/.test(t)); if (keep.length) zoom.appendChild(h('div', 'zoom-tags', keep.slice(0, 14).map(esc).join(' · '))); } }
    zoom.classList.toggle('two', n > 1);
    zoom.classList.add('show');
    placeZoom(e);
  });
  document.addEventListener('mousemove', e => { if (zoom.classList.contains('show')) placeZoom(e); });
  document.addEventListener('mouseout', e => { const m = e.target.closest('.mtg'); if (m && !m.contains(e.relatedTarget)) zoom.classList.remove('show'); });
  function placeZoom(e) {
    const w = zoom.classList.contains('two') ? 608 : 300, hgt = 420;
    let x = e.clientX + 24, y = e.clientY - hgt / 2;
    if (x + w > innerWidth - 10) x = e.clientX - w - 24;
    y = Math.max(10, Math.min(innerHeight - hgt - 10, y));
    zoom.style.left = x + 'px'; zoom.style.top = y + 'px';
  }

  // Every rules line that is not simulated says why: it needs an opponent, does nothing solo, or is still in development.
  const TAG_LABEL = { dev: 'In development', opp: 'Needs opponent', solo: 'No solo effect', approx: 'Approximated', unsim: "Can't be simulated", yours: 'Yours to use' };
  const TAG_HELP = { yours: 'You can use this ability yourself from the card\'s menu (Practice, Duel, Pod). The autopilot does not use it, so simulations leave it out', dev: 'A real effect when playing alone that is not built yet', opp: 'Only matters against an opponent, so it does nothing in a goldfish', solo: 'Does nothing when you play alone (for example lifegain or scry)', approx: 'Simulated roughly, not exactly', unsim: 'Depends on something outside the game (card art, a toy, the time of day, a random card name), so the engine leaves it out' };
  function pillHtml(x) {
    const side = x.back ? '<span class="pill back" title="A rule on the back face of this double-faced card">Back</span> ' : '';
    if (x.mirror) return side + '<span class="pill opp" title="Does nothing against a goldfish. It is used in a Mirror match (Simulation tab).">Mirror matches only</span> ';
    if (x.status === 'guessed' && x.fuzzy) return side + `<span class="pill guess" title="${esc('Guessed, not understood: this line is played like "' + x.fuzzy.as + '" (from ' + x.fuzzy.from + '). The guess can be wrong. The card stays on the Teach list.')}">guessed ${Math.round(x.fuzzy.score * 100)}%</span><span class="guess-from">like ${esc(x.fuzzy.from)}</span> `;          // T-131
    if (x.status === 'ok' || !x.tag) return side;
    return side + `<span class="pill ${x.tag}" title="${esc(TAG_HELP[x.tag] || '')}">${TAG_LABEL[x.tag] || ''}</span> `;
  }
  // Any element with class "mtg" and a data-uid this function knows is a viewable card: on every page, now and later,
  // clicking it opens the card viewer (price, printings, shops), unless the click already means something else there
  // (the Goldfish Table, the Draw Odds picker, the sample hands): then the 🔍 in its corner, right-click or a long press opens it.
  const previewCards = new Map();
  const cardOf = m => m ? (m._card || (m.dataset.uid != null ? getCard(m.dataset.uid) : null)) : null;      // the card a picture shows
  const isDeckCard = c => !!(S.deck && c && S.deck.unique[+c.uid] && S.deck.unique[+c.uid].name === c.name);   // false for an opponent's card whose number collides
  function getCard(uid) {
    if (!S.deck) return null;
    const s = String(uid);
    if (s.startsWith('preview:')) return previewCards.get(s) || null;
    if (s.startsWith('t:')) return S.deck.tokenCache[uid];
    if (s.startsWith('b:')) { const f = S.deck.unique[+s.slice(2)]; return f && f.a.backCard; }          // the back face of a transformed card
    return S.deck.unique[+uid];
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

  // ======================= deck loading =======================
  $('#loadDeck').addEventListener('click', loadDeck);
  // Clear: empty the decklist box, ready for a new deck (the deck already loaded stays until you load another)
  $('#clearDeck').addEventListener('click', () => {
    const box = $('#deckText');
    box.value = '';
    localStorage.setItem('gf_last', '');
    $('#deckMsgs').innerHTML = '';
    $('#savedDecks').value = '';
    box.focus();
    toast('Cleared. Paste your new deck, then tap Load deck.');
  });
  // loadDeck({ text, quiet }): remember.js loads the deck you had, without saving it again or touching the decklist box
  let selLoaded = '';          // the deck menu's choice for the deck that is loaded
  // after a deck loads (and autoSave has picked its entry): the menu's entry for it, a built-in being loaded, or the saved deck with this text
  function noteLoadedSel(trust) {          // trust: the menu already names the loaded deck (remember.js has just put it back)
    const v = $('#savedDecks').value, d = getDecks();
    const same = t => lf(t) === lf(S.deckText);
    selLoaded = trust || (loadingBuiltin && v) || (v && d[v] != null && same(d[v])) || (v && builtinLoaded && builtinByValue(v) && same(builtinLoaded)) ? v : (Object.keys(d).find(n => same(d[n])) || '');
    builtinLoaded = loadingBuiltin ? $('#deckText').value : (builtinLoaded && selLoaded === v && builtinByValue(v) ? builtinLoaded : '');
    showSpeed(selLoaded && builtinByValue(selLoaded));
  }
  // "Fastest possible" for a built-in deck that was checked: the earliest win turn seen and the share of games won by turns 2, 3 and 4 (T-093).
  // One compact line; what it means is behind the ⓘ.
  const pctS = x => (x < 1 && x > 0 ? x.toFixed(1) : Math.round(x * 10) / 10) + '%';
  function showWatch(d) {          // T-137: one line under the speed line: "Fastest win vs <deck>: turn N ▶ Watch"
    const el = $('#deckWatch'); if (!el) return;
    const f = d && FASTEST[d.file], opp = f && !f.none && builtinByValue('builtin:' + f.opp);
    if (!f || f.none || !opp) { el.hidden = true; el.dataset.file = ''; return; }
    el.querySelector('.dw-line').textContent = `Fastest win vs ${opp.name.replace(/\s*\([^)]*\)\s*$/, '')}: turn ${f.turn}`;
    el.dataset.file = d.file; el.hidden = false;
  }
  $('#deckWatch .dw-go').addEventListener('click', () => {
    const f = FASTEST[$('#deckWatch').dataset.file];
    if (f && window.__isfVersus && window.__isfVersus.watch) window.__isfVersus.watch({ file: $('#deckWatch').dataset.file, opp: f.opp, seed: f.seed, first: f.first, turn: f.turn, round: f.round });
  });
  { const t = $('#deckWatch .info-tog'); if (t) t.addEventListener('click', () => { const p = $('#deckWatch .hint'), open = p.classList.toggle('folded') === false; t.setAttribute('aria-expanded', String(open)); t.classList.toggle('on', open); }); }
  { const t = $('#deckSpeed .info-tog'); if (t) t.addEventListener('click', () => { const p = $('#deckSpeed .hint'), open = p.classList.toggle('folded') === false; t.setAttribute('aria-expanded', String(open)); t.classList.toggle('on', open); }); }
  let FASTEST = {};          // decks/fastest.json (tools/fastest-kill.js): each built-in deck's fastest Duel win
  function showSpeed(d) {
    showWatch(d);
    const el = $('#deckSpeed'); if (!el) return;
    if (!d || d.by2 == null) { el.hidden = true; return; }
    el.querySelector('.ds-line').textContent = `Fastest win ${d.earliestKill ? 'T' + d.earliestKill : 'after T4'} · ${pctS(d.by2)} by T2 · ${pctS(d.by3)} by T3 · ${pctS(d.by4)} by T4`;
    el.hidden = false;
  }
  const lf = t => String(t || '').replace(/\r\n?/g, '\n');          // a saved deck with Windows line ends is the same deck
  let builtinLoaded = '';          // the text of the built-in deck that is loaded: Load deck on it again keeps the menu on it
  async function loadDeck(o) {
    const quiet = !!(o && o.quiet), text = quiet ? o.text : $('#deckText').value;
    if (!text.trim()) return toast('Paste a decklist first');
    { const link = readLink(text); if (link && text.trim().split(/\s+/).length === 1) return addFromLink(link, 'from the link'); }          // an ICEYfish deck link pasted in the box
    { const site = deckSite(text); if (site && text.trim().split(/\s+/).length === 1) return toast(`${site[0].toUpperCase() + site.slice(1)} does not let other web pages read its decks. On the deck's page use Export (or Copy) as text, then paste the list here.`); }
    const btn = $('#loadDeck');
    let ok = false;
    btn.disabled = true; btn.textContent = 'Resolving…';
    try {
      await Source.init();
      const r = await Source.loadDeck(text, m => { btn.textContent = m; });
      if (!r.cards.length) { $('#deckMsgs').innerHTML = '<div class="msg err">No cards could be found. Check the list format (one card per line, like <code>1 Sol Ring</code>).</div>'; }
      else {
        r.specialty = SPECIALTY_RE.test(text); ok = setDeck(r, !!(o && o.lenient)) !== false;
        if (ok) { S.deckText = text; if (!quiet) autoSave(text); noteLoadedSel(); renderTeach(); }          // again: the banner first drew before the menu named the deck (Save to Drive is for decks that are not built in)
        else { $('#savedDecks').value = selLoaded; dirty(); }          // refused: the deck menu names the deck that is still loaded again (and so does the remembered state)
      }
    } catch (err) {
      console.error(err);
      $('#deckMsgs').innerHTML = `<div class="msg err">Could not load cards: ${esc(err.message || err)}. ${Source.state.mode === 'scryfall' ? 'Check your internet connection and try again.' : 'Is the local server still running?'}</div>`;
    }
    btn.disabled = false; btn.textContent = 'Load deck';
    return ok;
  }

  // "Save every deck I load" (on unless you turn it off in Saved decks): a list you paste or import goes into your saved decks by itself
  const autoSaveOn = () => localStorage.getItem('isf_autosave') !== '0';
  let loadingBuiltin = false;
  function autoSave(text) {
    if (!autoSaveOn() || loadingBuiltin || !S.deck) return;
    const d = getDecks(); if (Object.values(d).some(t => lf(t) === lf(text))) return;
    const base = S.deck.commanders.length ? S.deck.commanders.map(c => c.card.name.split(',')[0]).join(' + ') : 'Imported deck';
    const m = getMeta(), name = uniqueName(base, d);
    d[name] = text; m[name] = { saved: Date.now(), auto: true };
    if (putDecks(d, m)) { refreshSaved(); $('#savedDecks').value = name; toast(`Saved as "${name}" (Rename it in Manage)`); keepData(); }
  }
  // The Commander deck rule (T-040): in the Commander format a deck is 100 cards, one commander and 99 or two and 98. A bigger deck
  // loads only when its list has a "// Specialty" line. A list that breaks the rule is not loaded; the deck you had stays.
  const SPECIALTY_RE = /^\s*\/\/\s*specialty\b/im;
  // Cards the lookup could not find (r.missing) still count: a list is never refused for a count that is off only because of them.
  function commanderProblem(cards, total, specialty, missing) {
    const n = cards.concat(missing || []).filter(c => c.commander).reduce((s, c) => s + c.qty, 0);
    total += (missing || []).reduce((s, c) => s + (c.qty || 1), 0);
    if (!n) return `No commander. Put it in a <code>Commander</code> section or tag it <code>*CMDR*</code>.`;
    if (n > 2) return `${n} commanders. A Commander deck has one, or two partners.`;
    if (total === 100 || (specialty && total > 100)) return null;
    return `${total} cards. A Commander deck is 100: the commander${n === 2 ? 's' : ''} and ${100 - n}.` + (total > 100 ? ' A bigger specialty deck needs a <code>// Specialty</code> line.' : '');
  }
  const ruleMsg = (bad, missing) => `<div class="msg err cmdr-rule">Not loaded as a Commander deck: ${bad}${(missing || []).length ? ` Not found in the card data: ${missing.map(m => esc(m.name)).join(', ')}.` : ''}<span class="hint"> Fix the list, or choose 60-card in Format for a non-Commander deck.</span></div>`;
  // setDeck(r, force): force skips the rule (a deck that was already loaded coming back: the tutorial, a deck remembered from before the rule)
  function setDeck(r, force) {
    let cards = r.cards;
    // if no commander marked and it's a 100-card list whose first card is legendary creature, ask nothing: just guess
    const total = cards.reduce((s, c) => s + c.qty, 0);
    const listed = total + (r.missing || []).reduce((s, c) => s + (c.qty || 1), 0);          // cards not found still count, as in commanderProblem
    if (!cards.some(c => c.commander) && $('#optFormat').value === 'commander' && listed >= 99) {
      const cand = cards.find(c => /Legendary/.test(c.type_line) && /Creature/.test(c.type_line) && c.qty === 1);
      if (cand && (listed === 100 || (r.specialty && listed > 100))) { cand.commander = true; cand._guessed = true; }
    }
    if ($('#optFormat').value === 'commander' && !force) {
      const bad = commanderProblem(cards, total, r.specialty, r.missing);
      if (bad) {
        cards.forEach(c => { if (c._guessed) { c.commander = false; delete c._guessed; } });
        $('#deckMsgs').innerHTML = ruleMsg(bad, r.missing);
        return false;
      }
    }
    S.cards = cards; S.loaded = r;          // r: the tutorial puts the person's deck back with setDeck(r) after its sample game
    S.tokens = r.tokens || [];
    S.deck = G.buildDeck(cards, S.tokens, currentPolicy().tribe);
    S.byUid = S.deck.unique;
    S.game = null; S.sim = null; S.bookCombos = []; S.oddsSel.clear();
    try { nbReset(); } catch (e) { /* the box is not built yet */ }          // another deck: the next-bracket box (a result for the old deck, a run in progress) goes
    const msgs = $('#deckMsgs'); msgs.innerHTML = '';
    const add = (cls, html) => msgs.appendChild(h('div', 'msg ' + cls, html));
    const cmdrs = S.deck.commanders.map(i => i.card.name);
    add('ok', `Loaded <b>${total}</b> cards${cmdrs.length ? ` · Commander: <b>${esc(cmdrs.join(' + '))}</b>` : ''}${cards.some(c => c._guessed) ? ' (guessed, mark it with *CMDR* to be sure)' : ''}`);
    if (r.missing.length) add('err', `<b>${r.missing.length}</b> not found in the card data: ${r.missing.map(m => esc(m.name)).join(', ')}`);
    if (cmdrs.length) {
      const ci = new Set(); S.deck.commanders.forEach(i => (i.card.color_identity || []).forEach(c => ci.add(c)));
      const bad = S.deck.unique.filter(c => !c.commander && (c.color_identity || []).some(x => !ci.has(x)));
      if (bad.length) add('warn', `Outside the commander's color identity: ${bad.map(c => esc(c.name)).join(', ')}`);
      const banned = S.deck.unique.filter(c => c.legal_commander && c.legal_commander !== 'legal' && c.legal_commander !== 'restricted');
      if (banned.length) add('warn', `Not commander-legal: ${banned.map(c => esc(c.name)).join(', ')}`);
    }
    const noImg = S.deck.unique.filter(c => !(c.images || []).length && !(c.remote_images || []).length);
    if (noImg.length) add('warn', `No local image for: ${noImg.map(c => esc(c.name)).join(', ')}`);
    renderDeck();
    renderProfile();
    foldTags(); buildTags(); renderTags();
    fillLabChoices();
    renderCoverage();
    $('#handStage').innerHTML = '<div class="empty-note">Draw a hand.</div>'; $('#handGrid').innerHTML = ''; H = null;
    dirty();
  }

  // ---- strengths and weaknesses (profile.js): from the decklist, plus the kill speed once a simulation has run ----
  function renderProfile(sim) {
    const box = $('#deckProfile');
    if (!S.deck || typeof Profile === 'undefined') { box.hidden = true; return; }
    let p = Profile.analyze(S.deck, { format: $('#optFormat').value === 'commander' ? 'commander' : '60' });
    if (sim) p = Profile.withSim(p, sim);
    const KIND = { strength: 'good', weakness: 'warn', trait: '' }, LBL = { strength: 'Strengths', weakness: 'Weaknesses', trait: 'Traits' };
    let html = '';
    ['strength', 'weakness', 'trait'].forEach(k => {
      const xs = p.ids.filter(x => x.kind === k);
      if (!xs.length) return;
      html += `<div class="sg fold-items ${KIND[k]}"><b>${LBL[k]}</b><ul>${xs.map(x => `<li><b>${esc(x.label)}</b>: ${esc(x.detail)}${x.cards ? `<div class="hint">${x.cards.map(esc).join(', ')}</div>` : ''}</li>`).join('')}</ul></div>`;
    });
    const c = p.counts, n = k => c[k] || 0;
    html += `<details class="fold"><summary>Card counts</summary><p class="hint">Counted: ${n('land')} lands, ${n('ramp')} ramp, ${n('draw')} card draw, ${n('removal')} removal, ${n('wipe')} wipe${n('wipe') === 1 ? '' : 's'}, ${n('counter')} counterspell${n('counter') === 1 ? '' : 's'}, ${n('protection')} protection, ${n('tutor')} tutors, ${n('wincon')} finishers. Average mana value ${p.avgMv.toFixed(2)}. Rules-text matching can miss unusual wordings.</p>`;
    $('#profileList').innerHTML = html ? html.replace(/(<details class="fold"><summary>Card counts<\/summary><p class="hint">Counted: [\s\S]*?<\/p>)/, '$1</details>') : '<div class="empty-note">Nothing stands out.</div>';
    tidy($('#profileList'));
    box.hidden = false;
    renderCombos();
    if (!sim) $('#simWins').hidden = true;          // a new list: the last run's wins are not this deck's
  }

  // ---- combos and win conditions: the combo lines the engine finds in the list (sim.js deckCombos) and the cards that end a game ----
  function renderCombos() {
    const box = $('#deckCombos');
    if (!S.deck || !G.deckCombos) { box.hidden = true; return; }
    const combos = G.deckCombos(S.deck), list = xs => xs.map(esc).join(', ');
    const text = c => (c.faces && c.faces.length ? c.faces.map(f => f.oracle_text || '').join('\n') : c.oracle_text || '');
    const wins = typeof Profile === 'undefined' ? [] : S.deck.unique.filter(c => Profile.roles(c).has('wincon'));
    const outright = wins.filter(c => /you win the game|loses the game/i.test(text(c))), finishers = wins.filter(c => !outright.includes(c));
    let html = '';
    if (combos.length) html += `<div class="sg fold-items good"><b>${combos.length} combo${combos.length === 1 ? '' : 's'}</b><ul>${combos.map(c =>
      `<li><b>${esc(c.name)}: ${esc(c.slots.map(s => s.cards[0] + (s.cards.length > 1 ? ' +' + (s.cards.length - 1) : '')).join(' + '))}</b>: ${esc(c.how)}${c.open ? ' Nothing in this list wins with the mana yet: add an outlet (Walking Ballista, an X damage spell, a creature that draws or deals damage for mana).' : ''}<div class="hint">${c.slots.map(s => `${esc(s.label)}: ${list(s.cards)}`).join('<br>')}</div></li>`).join('')}</ul></div>`;
    else html += '<div class="sg"><b>No combo found</b><p>None of the combo lines the engine knows has all its pieces in this list.</p></div>';
    if (outright.length) html += `<div class="sg"><b>${outright.length} card${outright.length === 1 ? '' : 's'} that win${outright.length === 1 ? 's' : ''} outright</b><p>${list(outright.map(c => c.name))}</p></div>`;
    if (finishers.length) html += `<div class="sg"><b>${finishers.length} finisher${finishers.length === 1 ? '' : 's'}</b><p>${list(finishers.map(c => c.name))}</p></div>`;
    if (!wins.length) html += '<div class="sg warn"><b>No clear win condition</b><p>No card says you win, and no big finisher was found. Rules-text matching can miss unusual wordings.</p></div>';
    $('#comboList').innerHTML = html + '<div id="comboBook"></div>';
    tidy($('#comboList'));
    box.hidden = false;
    renderComboBook(combos);
  }
  // the combos Commander Spellbook knows in this list (a snapshot kept with the app: data/combos.json), beyond the ones the autopilot plays
  let comboDb = null;
  const loadComboDb = () => (comboDb = comboDb || fetch('data/combos.json').then(r => r.ok ? r.json() : null).catch(() => null));
  function renderComboBook(engine) {
    if (typeof Combos === 'undefined') return;
    const deck = S.deck;
    loadComboDb().then(db => {
      const el = $('#comboBook'); if (!db || !el || S.deck !== deck) return;
      const cmd = deck.commanders.map(i => i.card), id = cmd.length ? [...new Set(cmd.flatMap(c => c.color_identity || []))] : null;
      const r = Combos.find(db, deck.unique.map(c => c.name), id), more = r.included.filter(c => !Combos.played(c, engine));
      S.bookCombos = Combos.goldfished(r, engine);
      const li = c => `<li><b>${c.cards.map(n => n === c.missing ? `add ${esc(n)}` : esc(n)).join(' + ')}</b>: ${esc(c.does.join('; '))}.${c.needs.length ? ` Also needs: ${esc(c.needs.join(', '))}.` : ''}${!c.missing && c.goldfish && c.kind ? ' The goldfish counts it.' : !c.missing && c.goldfish && c.loops ? ' The goldfish counts it once a card that turns the loop into damage is out.' : ''} <a href="${esc(c.url)}" target="_blank" rel="noopener">Steps on Commander Spellbook</a></li>`;
      const group = (title, xs, cls, max) => xs.length ? `<div class="sg ${cls}"><b>${title}</b><ul>${xs.slice(0, max).map(li).join('')}</ul>${xs.length > max ? `<p>The ${max} most popular are shown.</p>` : ''}</div>` : '';
      el.innerHTML = group(`${more.length} more in Commander Spellbook`, more, '', 40) + group(`${r.almost.length} one card away`, r.almost, '', 15)
        + `<p class="hint" data-fold>Commander Spellbook snapshot of ${esc(db.fetched)}: its ${db.combos.length.toLocaleString()} most popular combos. The goldfish counts ${S.bookCombos.length} of the ones in this list: those that win, make infinite mana, or loop beside a card that turns the loop into damage, and need nothing it cannot check. It does not play out their steps; once every card is where the combo starts and the mana is there, the combo counts. The rest are listed for you to read.</p>`;
      tidy(el);
    });
  }

  // ---- how the simulated games were won (winBy and winLines in the Monte Carlo result) ----
  function renderWins(r) {
    const box = $('#simWins');
    if (!r || !r.winBy) { box.hidden = true; return; }
    const LBL = { combo: 'Combo', effect: 'A card that wins', commander: 'Commander damage', poison: 'Poison', mill: 'Empty library', damage: 'Damage and life loss' };
    const kinds = Object.keys(r.winBy).filter(k => r.winBy[k] > 0).sort((a, b) => r.winBy[b] - r.winBy[a]);
    const won = kinds.reduce((s, k) => s + r.winBy[k], 0);
    const head = kinds.map(k => `${LBL[k] || k} ${pct(r.winBy[k])}`).concat(won < 0.9995 ? [`not won by turn ${r.turns}: ${pct(1 - won)}`] : []).join(' · ');
    const lines = (r.winLines || []).map(l => `<li>${pct(l.share)} of games, on average on turn ${l.avgTurn.toFixed(1)}: ${esc(l.text)}</li>`).join('');
    $('#winList').innerHTML = `<div class="sg"><b>${esc(head || `No game won by turn ${r.turns}`)}</b>${lines ? `<ul>${lines}</ul>` : `<p>${won ? 'No combo and no card that says you win ended a game: every win came from damage.' : 'Play more turns or lower the opponent\'s life to see how this deck closes.'}</p>`}</div>`;
    tidy($('#winList'));
    box.hidden = false;
  }

  function deckCounts() {
    const lib = S.deck.library;
    const count = f => lib.filter(i => f(i.card.a)).length;
    const nonland = lib.filter(i => !i.card.a.isLand);
    return {
      total: lib.length + S.deck.commanders.length, lib: lib.length,
      lands: count(a => a.isLand), mdfc: count(a => a.mdfcLand), ramp: count(a => a.role === 'ramp'), draw: count(a => a.role === 'draw' || a.draw),
      creatures: count(a => a.isCreature && !a.isLand),
      avgMv: nonland.reduce((s, i) => s + i.card.a.mv, 0) / Math.max(1, nonland.length),
    };
  }

  function tile(lbl, val, sub) { return `<div class="tile"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`; }

  function renderDeck() {
    const k = deckCounts();
    $('#deckTiles').innerHTML = tile('Cards', k.total, S.deck.commanders.length ? 'incl. commander' : '') +
      tile('Lands', k.lands, k.mdfc ? `+${k.mdfc} MDFC land backs` : `${(k.lands / k.lib * 100).toFixed(0)}% of library`) +
      tile('Ramp pieces', k.ramp, 'rocks, dorks, land fetch') + tile('Card draw', k.draw, 'simple "draw N" effects') +
      tile('Creatures', k.creatures, '') + tile('Avg mana value', k.avgMv.toFixed(2), 'non-land cards');
    // curve wall
    const wall = $('#curveWall'); wall.innerHTML = ''; wall.classList.remove('empty-note');
    const cols = {};
    S.deck.library.concat(S.deck.commanders).forEach(i => {
      if (i.card.a.isLand) return;
      const mv = Math.min(8, Math.floor(i.card.a.mv)); (cols[mv] = cols[mv] || []).push(i);
    });
    for (let mv = 0; mv <= 8; mv++) {
      const list = (cols[mv] || []).sort((a, b) => a.card.a.role.localeCompare(b.card.a.role));
      const col = h('div', 'curve-col');
      col.appendChild(h('div', 'mv', `${mv === 8 ? '8+' : mv} <small>(${list.length})</small>`));
      const st = h('div', 'stack');
      const step = list.length > 12 ? 22 : 30, ch = 92 * 680 / 488;
      st.style.height = (list.length ? ch + (list.length - 1) * step : 0) + 'px';
      list.forEach((i, j) => { const e = cardEl(i.card); e.style.zIndex = j + 1; e.style.top = j * step + 'px'; e.style.animation = `fadein .3s ease ${j * 25 + mv * 40}ms both`; st.appendChild(e); });
      col.appendChild(st);
      wall.appendChild(col);
    }
    // lands
    const lw = $('#landWall'); lw.innerHTML = '';
    S.deck.unique.filter(c => c.a.isLand && !c.commander).sort((a, b) => b.qty - a.qty).forEach(c => {
      const g = h('div', 'group'); const p = h('div', 'pile');
      for (let j = 0; j < Math.min(c.qty, 5); j++) { const e = cardEl(c); e.style.left = j * 4 + 'px'; e.style.top = j * 4 + 'px'; p.appendChild(e); }
      const n = Math.min(c.qty, 5); p.style.width = `calc(var(--land-card, 82px) + ${(n - 1) * 4}px)`; p.style.height = `calc(var(--land-card, 82px) * 680 / 488 + ${(n - 1) * 4}px)`;   // the box covers the whole fanned stack, so it centres
      g.appendChild(p);
      const colors = [...((c.a.produce && c.a.produce.colors) || [])].map(x => `<span class="pip ${x}">${x}</span>`).join('');          // a land with no mana of its own (Maze of Ith, Glacial Chasm) has no colors
      g.appendChild(h('div', 'cnt', `${c.qty}× ${colors}${c.a.entersTapped ? ' <span title="enters tapped">⤵</span>' : ''}`));
      lw.appendChild(g);
    });
  }

  // ---- Teach these cards: cards whose rules text the engine does not fully read become a pre-filled GitHub request (one click in
  // the app, then Create on GitHub). Only the card names, the unread lines and the app version are sent, never the decklist.
  const TEACH_REPO = 'https://github.com/skyweezydeezy/ICEYfish';
  const unreadLines = c => (c.a.coverage || []).filter(r => r.status === 'ignored' || r.status === 'partial' || r.status === 'guessed').map(r => r.text);          // T-131: a guessed line is not a lesson
  function teachUrl(cards) {
    const list = cards.slice(0, 8);
    const block = c => `${c.name}\nhttps://scryfall.com/search?q=${encodeURIComponent('!"' + c.name + '"')}\n` + unreadLines(c).slice(0, 4).map(t => '- ' + t.slice(0, 240)).join('\n');
    const title = 'Teach: ' + list.map(c => c.name).join(', ').slice(0, 120) + (cards.length > list.length ? ` and ${cards.length - list.length} more` : '');
    const q = new URLSearchParams({ template: 'teach-card.yml', title, labels: 'unlearned', cards: list.map(block).join('\n\n'), version: 'v' + (self.ISF_VERSION || '?') });
    return `${TEACH_REPO}/issues/new?${q.toString()}`;
  }
  // Tickets (T-120): with a public endpoint set in ticket-config.js, the Teach button POSTs the request there (no GitHub or Google sign-in);
  // with none, or after a failed send, it stays the GitHub link above. ticket.js and ticket-config.js load on demand (not in the SHELL).
  const teachSets = [];
  let ticketReady = null, ticketRendered = false;
  const ticketEndpoint = () => { const c = self.ISF_TICKET, T = self.__isfTicket; return c && T && T.isUrl(c.endpoint) ? c.endpoint : ''; };
  function ticketLoad() {
    if (!ticketReady) ticketReady = Promise.all(['ticket.js', 'ticket-config.js'].map(f => driveLoad(f + '?v=' + (self.ISF_VERSION || 0)))).catch(() => {}).then(() => { if (ticketEndpoint() && !ticketRendered) { ticketRendered = true; renderTeach(); } });
    return ticketReady;
  }
  const ticketCid = (() => { const id = 'c' + Math.random().toString(36).slice(2, 12); return () => id; })();          // per page load, never stored
  const teachLines = cards => cards.map(c => ({ name: c.name, lines: unreadLines(c) }));
  async function sendTicket(kind, o, btn, labels) {
    const T = self.__isfTicket, url = ticketEndpoint();
    if (!url) return 'unconfigured';
    const was = btn.textContent; btn.textContent = 'Sending…'; btn.setAttribute('aria-busy', 'true');
    const r = await T.send(url, T.build(kind, Object.assign({ version: 'v' + (self.ISF_VERSION || '?'), cid: ticketCid() }, o)));
    btn.removeAttribute('aria-busy');
    if (r.state === 'sent') { btn.textContent = labels.sent; btn.dataset.ticket = 'sent'; toast(labels.toast); }
    else { btn.textContent = labels.failed; btn.dataset.ticket = 'failed'; toast('Could not send (' + (r.error || 'error') + '). ' + labels.fallback); if (labels.restore) btn.textContent = was; }
    return r.state;
  }
  function teachButton(cards, label) { teachSets.push(cards); return `<a class="teach-btn" data-tk="${teachSets.length - 1}" href="${esc(teachUrl(cards))}" target="_blank" rel="noopener">${esc(label || 'Teach these cards')}</a>`; }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.teach-btn[data-tk]');
    if (!a || !ticketEndpoint() || a.dataset.ticket === 'failed') return;          // not set up, or the send failed once: the GitHub link works as before
    e.preventDefault();
    if (a.dataset.ticket === 'sent' || a.getAttribute('aria-busy')) return;
    sendTicket('teach', { cards: teachLines(teachSets[+a.dataset.tk] || []), source: a.closest('#teachBanner') ? 'banner' : 'newcards' }, a,
      { sent: 'Sent ✓ thank you', toast: 'Sent to ICEYfish. Thank you!', failed: 'Send failed: open GitHub instead', fallback: 'Tap again to open GitHub.' });
  });
  // ---- Save to Drive for teaching (T-109): a deck that is not built in, with unread lines, becomes a .txt in the built-in deck format. A phone's
  // share sheet (Web Share, files) lets the person pick Google Drive and the ManaBox folder; elsewhere the file downloads. Nothing is sent by the app.
  const isBuiltinLoaded = () => /^builtin:/.test(selLoaded || '');
  function driveDeck() {
    const cards = (S.cards || []).filter(c => c && c.name), cmd = cards.filter(c => c.commander), rest = cards.filter(c => !c.commander);
    const cname = cmd.map(c => c.name).join(' + '), bm = /^\s*\/\/\s*bracket\s*([1-5])/im.exec(S.deckText || ''), br = bm ? bm[1] : '?';
    const saved = selLoaded && !isBuiltinLoaded() ? selLoaded : '';
    const clean = t => String(t).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    const name = clean(saved || (cmd[0] ? cmd[0].name.split(',')[0] : 'Imported deck')) || 'Imported deck';
    const file = `${name} [B${br}]${cname ? ' (' + clean(cname) + ')' : ''}.txt`;
    const text = [`// ${name}${cname ? ' (' + cname + ')' : ''}`, br === '?' ? '// Bracket ?' : '// Bracket ' + br, '// COMMANDER', ...cmd.map(c => `${c.qty || 1} ${c.name}`), '// MAINBOARD', ...rest.map(c => `${c.qty || 1} ${c.name}`)].join('\n') + '\n';
    return { file, text };
  }
  async function saveToDrive(why) {          // why: the short reason the direct upload fell back to this
    const pre = why ? why + ' ' : '';
    const d = driveDeck(), f = new File([d.text], d.file, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [f] }) && navigator.share) {
      try { await navigator.share({ files: [f], title: d.file }); return toast(pre + 'Shared. Pick Google Drive and your ManaBox folder.'); }
      catch (e) { if (e && e.name === 'AbortError') return; }          // closed the sheet: nothing happens; any other failure falls back to the download
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = d.file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(pre + 'Saved ' + d.file + '. Put it in your ManaBox folder in Google Drive.');
  }
  // ---- Save to my Drive (T-109 phase 2): Google Identity Services (a drive.file token from the tap, kept in memory only) and the Picker (the
  // person picks the ManaBox folder once; only its id is remembered). The scripts and drive-config.js load on the first tap, not at startup.
  // No config, a blocked popup, offline or any error falls back to the share sheet / download of phase 1, with a short reason.
  const DRIVE_FOLDER = 'isf_drive_folder';
  let driveTok = null, driveTokEnd = 0;
  const driveScripts = {};
  const driveLoad = src => driveScripts[src] || (driveScripts[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => { delete driveScripts[src]; rej(new Error('load')); }; document.head.appendChild(s); }));
  const driveFolder = () => { try { return localStorage.getItem(DRIVE_FOLDER) || ''; } catch (e) { return ''; } };
  const driveToken = cfg => driveTok && Date.now() < driveTokEnd ? Promise.resolve(driveTok) : new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: 'https://www.googleapis.com/auth/drive.file',
      callback: r => { if (r && r.access_token) { driveTok = r.access_token; driveTokEnd = Date.now() + ((+r.expires_in || 3600) - 60) * 1000; res(driveTok); } else rej(new Error(r && r.error === 'access_denied' ? 'denied' : 'token')); },
      error_callback: e => rej(new Error(e && e.type === 'popup_failed_to_open' ? 'popup' : e && e.type === 'popup_closed' ? 'closed' : 'token')) });
    tc.requestAccessToken({ prompt: '' });
  });
  const drivePick = (cfg, tok) => new Promise(res => {
    const v = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes('application/vnd.google-apps.folder');
    new google.picker.PickerBuilder().addView(v).setTitle('Pick your ManaBox folder').setOAuthToken(tok).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId)
      .setCallback(d => { const A = google.picker.Action; if (d.action === A.PICKED) res(d.docs && d.docs[0] && d.docs[0].id || ''); else if (d.action === A.CANCEL) res(''); }).build().setVisible(true);
  });
  async function driveUpload(tok, folder, d) {
    const b = 'isf' + Math.random().toString(36).slice(2), meta = { name: d.file, parents: [folder], mimeType: 'text/plain' };
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${d.text}\r\n--${b}--`;
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + b }, body });
  }
  let driveBusy = false;
  async function saveDirect() {
    if (driveBusy) return; driveBusy = true;
    try {
      if (ticketEndpoint()) {          // a public endpoint is set: no Google sign-in, the deck goes straight to the owner
        const b = $('#driveDirect'), d = driveDeck(), st = await sendTicket('deck', { deck: d, cards: teachLines(S.deck ? S.deck.unique.filter(c => c.a && c.a.coverageLevel && c.a.coverageLevel !== 'ok' && !(c.a.isLand && /Basic/.test(c.type_line))) : []), source: 'deck' }, b,
          { sent: 'Sent ✓', toast: 'Deck sent to ICEYfish for teaching. Thank you!', failed: 'Send failed', fallback: 'Saving it to your device instead.', restore: true });
        if (st === 'failed') await saveToDrive('Could not send it.');
        return;
      }
      if (navigator.onLine === false) return await saveToDrive('Offline.');
      let cfg;
      try { await driveLoad('drive-config.js?v=' + (self.ISF_VERSION || 0)); cfg = self.ISF_DRIVE; } catch (e) { return await saveToDrive('Could not reach Google.'); }
      if (!cfg || !cfg.clientId || !cfg.apiKey) return await saveToDrive('Drive upload is not set up.');
      let tok;
      try { await driveLoad('https://accounts.google.com/gsi/client'); tok = await driveToken(cfg); }
      catch (e) { const m = e.message; if (m === 'closed') return toast('Cancelled.'); return await saveToDrive(m === 'popup' ? 'The sign-in popup was blocked.' : m === 'denied' ? 'Drive access was not allowed.' : 'Could not sign in to Google.'); }
      let folder = driveFolder();
      if (!folder) {
        try { await driveLoad('https://apis.google.com/js/api.js'); await new Promise(r => gapi.load('picker', r)); folder = await drivePick(cfg, tok); }
        catch (e) { return await saveToDrive('Could not open the folder picker.'); }
        if (!folder) return toast('No folder picked: nothing was saved.');
        try { localStorage.setItem(DRIVE_FOLDER, folder); } catch (e) { /* remembered only for this visit */ }
        renderTeach();
      }
      let r;
      try { r = await driveUpload(tok, folder, driveDeck()); } catch (e) { return await saveToDrive('Could not reach Drive.'); }
      if (r.ok) return toast('Saved to your ManaBox folder. ICEYfish checks it within the hour.');
      if (r.status === 401) { driveTok = null; return await saveToDrive('Google sign-in expired: tap again.'); }
      if (r.status === 404) { try { localStorage.removeItem(DRIVE_FOLDER); } catch (e) { /* ignore */ } renderTeach(); return await saveToDrive('The folder was not found: you will pick it again.'); }
      return await saveToDrive('Drive refused the file (' + r.status + ').');
    } finally { driveBusy = false; }
  }
  function renderTeach() {
    const box = $('#teachBanner'); if (!box) return;
    ticketLoad();
    const cards = S.deck ? S.deck.unique.filter(c => c.a && c.a.coverageLevel && c.a.coverageLevel !== 'ok' && !(c.a.isLand && /Basic/.test(c.type_line))) : [];
    if (!cards.length) { box.hidden = true; box.innerHTML = ''; return; }
    const names = cards.slice(0, 4).map(c => esc(c.name)).join(', ') + (cards.length > 4 ? ` and ${cards.length - 4} more` : '');
    box.innerHTML = `<span class="teach-icon">🧠</span><span class="teach-text"><b>${cards.length} card${cards.length > 1 ? 's' : ''} ${cards.length > 1 ? "aren't" : "isn't"} fully understood yet:</b> ${names}. Their results are rough until the simulator learns them.</span>${teachButton(cards)}${isBuiltinLoaded() ? '' : '<button type="button" class="teach-btn teach-drive" id="driveSave">Save to Drive for teaching</button><button type="button" class="teach-btn teach-drive" id="driveDirect">' + (ticketEndpoint() ? 'Send deck for teaching' : 'Save to my Drive') + '</button>' + (!ticketEndpoint() && driveFolder() ? '<a href="#" class="teach-folder" id="driveFolder">Change folder</a>' : '')}${isBuiltinLoaded() ? '' : '<span class="hint teach-how teach-drive-how">Save it in your ManaBox folder in Google Drive; ICEYfish checks it within the hour and teaches its cards.</span>'}<span class="hint teach-how">${ticketEndpoint() ? 'Sends the request straight to ICEYfish: no account needed. Only the card names and their unread lines are sent, never your list.' : 'Opens GitHub with the request filled in: just press Create. Only the card names are sent, never your list.'}</span>`;
    const ds = $('#driveSave'); if (ds) ds.addEventListener('click', () => saveToDrive());
    const dd = $('#driveDirect'); if (dd) dd.addEventListener('click', saveDirect);
    const df = $('#driveFolder'); if (df) df.addEventListener('click', e => { e.preventDefault(); try { localStorage.removeItem(DRIVE_FOLDER); } catch (x) { /* ignore */ } renderTeach(); toast('Folder forgotten: you will pick it on your next save.'); });
    box.hidden = false;
  }
  function renderCoverage() {
    if (!S.deck) return;
    renderTeach();
    const only = $('#covOnlyGaps').checked;
    const box = $('#coverage'); box.innerHTML = '';
    const list = S.deck.unique.filter(c => !(c.a.isLand && /Basic/.test(c.type_line)));
    let ok = 0, part = 0, none = 0;
    list.forEach(c => { const l = c.a.coverageLevel; if (l === 'ok') ok++; else if (l === 'partial') part++; else none++; });
    $('#covSummary').textContent = `${ok} fully understood · ${part} partly in development · ${none} in development (of ${list.length} non-basic cards)`;
    list.sort((a, b) => ({ none: 0, partial: 1, ok: 2 }[a.a.coverageLevel] - { none: 0, partial: 1, ok: 2 }[b.a.coverageLevel]) || a.name.localeCompare(b.name))
      .filter(c => !only || c.a.coverageLevel !== 'ok')
      .forEach(c => {
        const d = h('div', 'cov-card');
        d.appendChild(cardEl(c));
        const lines = h('div', 'lines');
        lines.appendChild(h('b', '', esc(c.name)));
        if (!c.a.coverage.length) lines.appendChild(h('div', 'ok', 'No rules text (vanilla).'));
        c.a.coverage.filter(x => x.status !== 'neutral').forEach(x => lines.appendChild(h('div', x.status, pillHtml(x) + esc(x.text))));
        // T-100 slice 4: the lines that do nothing on their own (neutral) fold under one header, grouped by why: "Matters only against opponents" (simulated in a Mirror match), "Not simulated", "Does nothing alone"
        const neu = c.a.coverage.filter(x => x.status === 'neutral');
        if (neu.length) {
          const groups = [['Matters only against opponents', neu.filter(x => x.mirror || x.tag === 'opp')], ['Not simulated', neu.filter(x => !x.mirror && x.tag === 'unsim')], ['Does nothing alone', neu.filter(x => !x.mirror && x.tag !== 'opp' && x.tag !== 'unsim')]].filter(gp => gp[1].length);
          const det = h('details', 'fold cov-neutral'), sm = h('summary', '', `Neutral lines <span class="fold-n">${neu.length}</span>`), body = h('div', 'fold-body');
          groups.forEach(([title, rows]) => { body.appendChild(h('div', 'cov-neutral-head', esc(title))); rows.forEach(x => body.appendChild(h('div', 'neutral', pillHtml(x) + esc(x.text)))); });
          det.appendChild(sm); det.appendChild(body); lines.appendChild(det);
        }
        d.appendChild(lines);
        box.appendChild(d);
      });
    if (!box.children.length) box.innerHTML = '<div class="empty-note">Every card in this deck is fully understood by the engine.</div>';
    const tw = $('#tokenWall'); tw.innerHTML = '';
    if ((S.deck.tokens || []).length) {
      tw.appendChild(h('div', 'hint', 'Tokens this deck makes (Scryfall data):'));
      S.deck.tokens.forEach(t => {
        const fake = Object.assign({}, t, { uid: 'preview:' + t.name });
        previewCards.set(fake.uid, fake);           // so the card viewer can open token pictures too
        const el = h('div', 'tok'); const c = cardEl(fake); el.appendChild(c); el.appendChild(h('span', 'tok-name', `${esc(t.name)}${t.power != null ? ` ${t.power}/${t.toughness}` : ''}`)); if (t.made_by) el.appendChild(h('span', 'tok-from', esc(t.made_by))); tw.appendChild(el);
      });
    }
  }
  $('#covOnlyGaps').addEventListener('change', renderCoverage);

  // ---- saved decks (kept in this browser: gf_decks = name -> decklist text, gf_decks_meta = name -> {saved: time}) ----
  const getDecks = () => { try { return JSON.parse(localStorage.getItem('gf_decks') || '{}') || {}; } catch (e) { return {}; } };
  const getMeta = () => { try { return JSON.parse(localStorage.getItem('gf_decks_meta') || '{}') || {}; } catch (e) { return {}; } };
  function putDecks(all, meta) {
    try {
      localStorage.setItem('gf_decks', JSON.stringify(all));
      localStorage.setItem('gf_decks_meta', JSON.stringify(meta || getMeta()));
      return true;
    } catch (e) { toast('Could not save: this browser is out of storage space'); return false; }
  }
  // ---- built-in decks (goldfish/static/decks, listed in decks/index.json by tools/build-deck-index.js), grouped by number of colors ----
  let BUILTIN = [];
  const COLOR_ORDER = 'WUBRG';
  // Every built-in deck menu (Build, the mirror opponent, 1v1, Pod, the lab's opponents) follows the "Deck order" setting (Display):
  //   bracket (default): groups "Bracket 5 … 1", then "No bracket"; inside a group by name
  //   color-bracket:     groups by color (below), inside a color by bracket (highest first), then name
  //   color:             groups by color, inside a color by name
  // The bracket is the one filed on each deck (Wizards of the Coast's Commander Brackets, checked by ICEYfish: the card rules first). There is no
  // internal strength ranking for now (the user, 2026-11-26): no win %, no kill turn, no rank in the menus until that system is rebuilt.
  // Color order (WUBRG): one color (W U B R G), two colors, three, four, five, colorless last. Inside a count the identities sort by
  // their letters in W U B R G order: WU WB WR WG UB UR UG BR BG RG; WUB WUR WUG WBR WBG WRG UBR UBG URG BRG; four colors by the color left out.
  const BRACKET_NAME = { 1: 'Exhibition', 2: 'Core', 3: 'Upgraded', 4: 'Optimized', 5: 'cEDH' };
  const COLOR_NAME = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', WU: 'Azorius', WB: 'Orzhov', WR: 'Boros', WG: 'Selesnya', UB: 'Dimir', UR: 'Izzet', UG: 'Simic',
    BR: 'Rakdos', BG: 'Golgari', RG: 'Gruul', WUB: 'Esper', WUR: 'Jeskai', WUG: 'Bant', WBR: 'Mardu', WBG: 'Abzan', WRG: 'Naya', UBR: 'Grixis', UBG: 'Sultai', URG: 'Temur', BRG: 'Jund',
    UBRG: 'Four colors (no White)', WBRG: 'Four colors (no Blue)', WURG: 'Four colors (no Black)', WUBG: 'Four colors (no Red)', WUBR: 'Four colors (no Green)', WUBRG: 'Five colors', '': 'Colorless' };
  const colorKey = c => c.split('').map(k => COLOR_ORDER.indexOf(k)).join('');
  const colorRank = c => { const n = (c || '').length; return (n ? n : 9) + '.' + (n === 4 ? colorKey('WUBRG'.split('').filter(k => !c.includes(k)).join('')) : colorKey(c || '')); };
  const byName = (a, b) => a.name.localeCompare(b.name);
  const byBracket = (a, b) => (b.bracket || 0) - (a.bracket || 0);
  const opt = (d, noColors) => {
    const bits = [d.name]; if (!noColors) bits.push(d.colors || 'C');
    if (d.bracket) bits.push('B' + d.bracket + (d.bracketEst ? '?' : ''));
    return `<option value="builtin:${esc(d.file)}">${esc(bits.join(' · '))}</option>`;
  };
  function builtinOptions() {
    const group = (label, ds, noColors) => ds.length ? `<optgroup label="${esc(label)}">` + ds.map(d => opt(d, noColors)).join('') + '</optgroup>' : '';
    const byColor = cmp => { const keys = [...new Set(BUILTIN.map(d => d.colors || ''))].sort((x, y) => colorRank(x).localeCompare(colorRank(y)));
      return keys.map(k => group(COLOR_NAME[k] || k, BUILTIN.filter(d => (d.colors || '') === k).sort(cmp), true)).join(''); };
    if (deckOrder === 'color') return byColor(byName);
    if (deckOrder === 'color-bracket') return byColor((a, b) => byBracket(a, b) || byName(a, b));
    let html = '';
    for (let b = 5; b >= 1; b--) html += group(`Bracket ${b} · ${BRACKET_NAME[b]}`, BUILTIN.filter(d => d.bracket === b).sort(byName));
    return html + group('No bracket', BUILTIN.filter(d => !d.bracket).sort(byName));
  }
  const builtinByValue = v => BUILTIN.find(d => 'builtin:' + d.file === v);
  async function builtinText(d) {
    const r = await fetch('decks/' + encodeURIComponent(d.file));
    if (!r.ok) throw new Error(`could not load "${d.name}" (${r.status})`);
    return r.text();
  }
  // A built-in deck can come with choices the Policy lab learned for it (decks/index.json "policy"). They are used unless you have saved your own.
  function applyBuiltinPolicy(b) {
    if (!b || !b.policy || !S.cards || !S.cards.length || Object.keys(currentPolicy()).length) return;
    const keys = Object.keys(b.policy); if (!keys.length) return;
    keys.forEach(k => savePolicy(k, b.policy[k], 'learned in the lab (built in)'));
    if (b.policy.tribe) { S.deck = G.buildDeck(S.cards, S.tokens, b.policy.tribe); S.byUid = S.deck.unique; buildTags(); renderTags(); }
    fillLabChoices();
    toast(`Using ${keys.length} choice${keys.length === 1 ? '' : 's'} the lab learned for this deck`);
  }
  async function loadBuiltinIndex() {
    try {
      const r = await fetch('decks/index.json');
      if (!r.ok) return;
      BUILTIN = ((await r.json()).decks || []).filter(d => d && d.file && d.name);
      decksListed = true; refreshSaved(); fillMirror();
      fetch('decks/fastest.json').then(r => r.ok ? r.json() : null).then(j => { if (j && j.decks) { FASTEST = j.decks; showWatch(selLoaded && builtinByValue(selLoaded)); } }).catch(() => {});          // the Build line (T-137); no file or offline: no line
    } catch (e) { /* offline and never loaded: only saved decks are listed */ }
  }
  function refillDeckMenus() {            // the Deck order setting changed: every built-in deck menu is rebuilt, keeping what each one has selected
    refreshSaved(); fillMirror();
    const lab = $('#plOppList'); if (lab && lab.options.length) { const on = new Set([...lab.selectedOptions].map(o => o.value)); fillLabOpponents(); [...lab.options].forEach(o => { o.selected = on.has(o.value); }); }
    if (window.__isfVersus && window.__isfVersus.fill) ['duel', 'pod'].forEach(m => window.__isfVersus.fill(m));
  }
  function refreshSaved() {
    const all = getDecks(), sel = $('#savedDecks'), cur = sel.value;
    const mine = Object.keys(all).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">Choose a deck…</option>' + builtinOptions() +
      (mine.length ? `<optgroup label="Saved in this browser">${mine.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
  function uniqueName(base, all) {
    if (!all[base]) return base;
    for (let i = 2; i < 500; i++) { const n = `${base} (${i})`; if (!all[n]) return n; }
    return base + ' ' + Date.now();
  }
  $('#saveDeck').addEventListener('click', () => {
    if (!$('#deckText').value.trim()) return toast('Paste a decklist first, then Save');
    const name = (prompt('Save deck as:', (S.deck && S.deck.commanders[0] && S.deck.commanders[0].card.name) || 'My deck') || '').trim();
    if (!name) return;
    const all = getDecks(), meta = getMeta();
    if (all[name] != null && all[name] !== $('#deckText').value && !confirm(`"${name}" is already saved. Replace it with what is in the box now?`)) return;
    all[name] = $('#deckText').value; meta[name] = { saved: Date.now() };
    if (putDecks(all, meta)) { refreshSaved(); $('#savedDecks').value = name; toast('Saved "' + name + '"'); keepData(); }
  });
  $('#savedDecks').addEventListener('change', async e => {
    const v = e.target.value, b = builtinByValue(v);
    if (b) {
      try { $('#deckText').value = await builtinText(b); } catch (err) { return toast('Could not open the deck: ' + err.message); }
      localStorage.setItem('gf_last', $('#deckText').value);
      let ok = false; loadingBuiltin = true; try { ok = await loadDeck(); } finally { loadingBuiltin = false; }
      if (ok) applyBuiltinPolicy(b);          // a refused deck: the lab's choices stay with the deck that is still loaded
      return;
    }
    const all = getDecks();
    if (all[v] != null) { $('#deckText').value = all[v]; localStorage.setItem('gf_last', $('#deckText').value); loadDeck(); }
  });


  // ---- deck links: a whole decklist packed into an ICEYfish web address (#deck=…&name=…) ----
  // Opening the link, or pasting it into the decklist box, adds the deck to your saved decks. Nothing goes through a server:
  // the list travels inside the link itself (squeezed with the browser's own deflate when it has it, "z." links; plain otherwise, "p.").
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const pipe = async (bytes, Stream, mode) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream(mode))).arrayBuffer());
  async function packDeck(text) {
    const raw = new TextEncoder().encode(text);
    if (typeof CompressionStream !== 'undefined') { try { return 'z.' + b64u(await pipe(raw, CompressionStream, 'deflate-raw')); } catch (e) { /* fall through to a plain link */ } }
    return 'p.' + b64u(raw);
  }
  async function unpackDeck(code) {
    const kind = code.slice(0, 2), bytes = unb64u(code.slice(2));
    if (kind === 'z.') { if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot open squeezed deck links; update it and try again'); return new TextDecoder().decode(await pipe(bytes, DecompressionStream, 'deflate-raw')); }
    if (kind === 'p.') return new TextDecoder().decode(bytes);
    throw new Error('this is not an ICEYfish deck link');
  }
  async function deckLink(name, text) {
    const u = new URL(location.href); u.search = ''; u.hash = 'deck=' + (await packDeck(text)) + '&name=' + encodeURIComponent(name);
    return u.toString();
  }
  // the deck in a link (a full address or just "#deck=…"), or null
  function readLink(s) {
    const m = String(s || '').trim().match(/(?:^|[#&])deck=([A-Za-z0-9._-]+)(?:&name=([^&\s]*))?/);
    return m ? { code: m[1], name: m[2] ? decodeURIComponent(m[2]) : '' } : null;
  }
  async function addFromLink(link, how) {
    let text;
    try { text = await unpackDeck(link.code); } catch (e) { toast('Could not open the deck link: ' + e.message); return false; }
    if (!text.trim()) { toast('That deck link is empty'); return false; }
    const d = getDecks(), m = getMeta(), base = (link.name || summarize(text) || 'Linked deck').trim();
    const same = Object.keys(d).find(n => lf(d[n]) === lf(text));
    const name = same || uniqueName(base, d);
    if (!same) { d[name] = text; m[name] = { saved: Date.now(), from: 'link' }; if (!putDecks(d, m)) return false; }
    refreshSaved(); $('#deckText').value = text; localStorage.setItem('gf_last', text); $('#savedDecks').value = name;
    toast(same ? `"${name}" is already in your saved decks` : `Added "${name}" to your saved decks${how ? ' ' + how : ''}`);
    keepData(); loadDeck();
    return true;
  }
  async function shareDeck(name, text) {
    const url = await deckLink(name, text);
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ title: name + ' · ICEYfish deck', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Deck link copied. Anyone who opens it gets this deck in their saved decks.'); }
    catch (e) { prompt('Copy this deck link:', url); }
  }
  // a deck link opened from outside: add it, then tidy the address bar so a reload does not add it again
  async function openLinkInAddress() {
    const link = readLink(location.hash); if (!link) return;
    history.replaceState(null, '', location.pathname + location.search);
    await addFromLink(link, 'from the link');
  }
  window.addEventListener('hashchange', openLinkInAddress);
  // links from deck sites cannot be read here (they do not let other web pages fetch their decks), so say what to do instead
  const deckSite = s => (String(s).trim().match(/^https?:\/\/(?:www\.)?(moxfield|archidekt|tappedout|mtggoldfish|deckstats|scryfall)\.(?:com|net)\//i) || [])[1];

  // ---- keeping your data: ask the browser to keep this site's storage, and remember when you last made a backup ----
  function keepData() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* older browser */ } }
  const BACKUP_KEYS = ['gf_policy', 'gf_tags', 'isf_look', 'isf_matfit', 'isf_sound', 'isf_speed10', 'isf_autosave'];          // besides the decks: lab choices, your tags, playmat and sleeves, playmat positions, sound, speed
  function backupInfo() {
    const t = +localStorage.getItem('isf_last_backup') || 0, el = $('#dmBackup'); if (!el) return;
    const n = Object.keys(getDecks()).length;
    el.textContent = t ? `Last backup: ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : (n ? 'No backup yet' : '');
    el.classList.toggle('warn', !!n && (!t || Date.now() - t > 14 * 864e5));
  }

  // ---- the manager panel ----
  const dm = $('#deckManager');
  const fileSafe = s => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'deck';
  function download(filename, text, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function summarize(text) {
    const es = Source.parseDecklist(text);
    const total = es.reduce((s, e) => s + e.qty, 0);
    const cmdrs = es.filter(e => e.commander).map(e => e.name.split(',')[0]);
    return `${total} cards${cmdrs.length ? ' · ' + cmdrs.join(' + ') : ''}`;
  }
  function renderManager() {
    const all = getDecks(), meta = getMeta(), list = $('#dmList');
    list.innerHTML = '';
    const names = Object.keys(all).sort((a, b) => a.localeCompare(b));
    $('#dmCount').textContent = names.length ? `${names.length} saved deck${names.length === 1 ? '' : 's'}` : '';
    if (!names.length) { list.appendChild(h('div', 'empty-note', 'No saved decks yet. Paste a decklist, tap <b>Save</b>, and it will show up here.')); return; }
    names.forEach(name => {
      const when = meta[name] && meta[name].saved ? ' · saved ' + new Date(meta[name].saved).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const row = h('div', 'dm-row');
      row.appendChild(h('div', 'dm-info', `<b>${esc(name)}</b><span class="hint">${esc(summarize(all[name]))}${when}</span>`));
      const acts = h('div', 'dm-acts');
      const btn = (label, cls, fn, title) => { const b = h('button', cls || 'ghost', label); if (title) b.title = title; b.addEventListener('click', fn); acts.appendChild(b); return b; };
      btn('Load', 'primary', () => { $('#deckText').value = all[name]; localStorage.setItem('gf_last', all[name]); $('#savedDecks').value = name; closeManager(); loadDeck(); });
      btn('Rename', 'ghost', () => {
        const to = (prompt('Rename deck to:', name) || '').trim();
        if (!to || to === name) return;
        const d = getDecks(), m = getMeta();
        if (d[to] != null) return toast(`There is already a deck called "${to}"`);
        d[to] = d[name]; delete d[name]; m[to] = m[name] || { saved: Date.now() }; delete m[name];
        if (putDecks(d, m)) { refreshSaved(); renderManager(); }
      });
      btn('Duplicate', 'ghost', () => {
        const d = getDecks(), m = getMeta(), to = uniqueName(name + ' copy', d);
        d[to] = d[name]; m[to] = { saved: Date.now() };
        if (putDecks(d, m)) { refreshSaved(); renderManager(); toast('Duplicated as "' + to + '"'); }
      });
      btn('Copy', 'ghost', async () => {
        try { await navigator.clipboard.writeText(all[name]); toast('Decklist copied'); }
        catch (e) { $('#deckText').value = all[name]; toast('Could not use the clipboard, so the list was put in the box instead'); closeManager(); }
      }, 'Copy the decklist text');
      btn('Share link', 'ghost', () => shareDeck(name, all[name]), 'A link that adds this deck to anyone\'s saved decks when they open it');
      btn('Export', 'ghost', () => download(fileSafe(name) + '.txt', all[name]), 'Download as a .txt file');
      btn('Delete', 'ghost danger', () => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        const d = getDecks(), m = getMeta(); delete d[name]; delete m[name];
        if (putDecks(d, m)) { refreshSaved(); renderManager(); toast('Deleted'); }
      });
      row.appendChild(acts);
      list.appendChild(row);
    });
  }
  $('#dmAutoSave').checked = autoSaveOn();
  $('#dmAutoSave').addEventListener('change', e => { localStorage.setItem('isf_autosave', e.target.checked ? '1' : '0'); toast(e.target.checked ? 'Every deck you load is saved here from now on' : 'Only decks you save yourself are kept'); });
  function openManager() { renderManager(); backupInfo(); dm.classList.add('show'); document.body.classList.add('modal-open'); }
  function closeManager() { dm.classList.remove('show'); document.body.classList.remove('modal-open'); }
  $('#manageDecks').addEventListener('click', openManager);
  $('#dmClose').addEventListener('click', closeManager);
  dm.addEventListener('click', e => { if (e.target === dm) closeManager(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dm.classList.contains('show')) closeManager(); });
  $('#dmSaveCurrent').addEventListener('click', () => { $('#saveDeck').click(); setTimeout(renderManager, 50); });
  $('#dmExportAll').addEventListener('click', () => {
    const all = getDecks();
    if (!Object.keys(all).length) return toast('Nothing to export yet');
    const extra = {}; BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v != null) extra[k] = v; });
    download('iceyfish-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ app: 'ICEYfish', version: 2, exported: new Date().toISOString(), decks: all, meta: getMeta(), settings: extra }, null, 2), 'application/json');
    localStorage.setItem('isf_last_backup', String(Date.now())); backupInfo(); toast('Backup saved to your downloads. Keep it somewhere safe (Files, iCloud Drive, Google Drive).');
  });
  $('#dmImport').addEventListener('click', () => $('#dmFile').click());
  $('#dmFile').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const d = getDecks(), m = getMeta();
    let added = 0;
    try {
      const j = JSON.parse(text);
      const incoming = j && j.decks && typeof j.decks === 'object' ? j.decks : null;
      if (!incoming) throw new Error('not a backup');
      for (const [n, t] of Object.entries(incoming)) { if (typeof t !== 'string') continue; if (d[n] === t) continue; const to = uniqueName(n, d); d[to] = t; m[to] = (j.meta && j.meta[n]) || { saved: Date.now() }; added++; }          // the same deck twice is skipped
      if (j.settings && typeof j.settings === 'object') for (const [k, v] of Object.entries(j.settings)) {
        if (!BACKUP_KEYS.includes(k) || typeof v !== 'string') continue;
        try { if (k === 'gf_policy' || k === 'gf_tags') { const cur = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify(Object.assign(JSON.parse(v), cur))); } else localStorage.setItem(k, v); } catch (e2) { /* skip a damaged entry */ }
      }
    } catch (err) {
      // not a backup file: treat it as one decklist
      if (!text.trim()) return toast('That file is empty');
      const base = (prompt('Name for this deck:', file.name.replace(/\.[^.]+$/, '')) || '').trim();
      if (!base) return;
      const to = uniqueName(base, d); d[to] = text; m[to] = { saved: Date.now() }; added = 1;
    }
    if (putDecks(d, m)) { refreshSaved(); renderManager(); toast(`Imported ${added} deck${added === 1 ? '' : 's'}`); }
  });
  refreshSaved();
  const startedWithLink = !!readLink(location.hash);          // remember.js: a deck link opened at startup wins over the remembered deck (the address is tidied before it looks)
  const builtinsListed = loadBuiltinIndex();
  // a deck link opened at startup is checked against the format you had (remember.js restores the other settings later)
  (async () => {
    try {
      const ui = JSON.parse(localStorage.getItem('isf_state') || 'null') || {}, f = (ui.ctl || {}).optFormat, running = await runningVersion;
      if (!(ui.v && running && ui.v !== running) && (f === '60' || f === 'commander') && f !== $('#optFormat').value) { $('#optFormat').value = f; $('#optFormat').dispatchEvent(new Event('change')); }          // saved by an older version: remember.js resets it all, so the format is not kept either
    } catch (e) { /* no saved settings */ }
    openLinkInAddress();
  })();
  const last = localStorage.getItem('gf_last'); if (last) $('#deckText').value = last;
  $('#deckText').addEventListener('input', () => localStorage.setItem('gf_last', $('#deckText').value));

  // ======================= opening hands =======================
  let H = null, fanLayout = null;
  const rseed = () => { const t = window.ISFTutorial && window.ISFTutorial.takeSeed && window.ISFTutorial.takeSeed(); return t != null ? t >>> 0 : (Math.random() * 2 ** 32) >>> 0; };          // the tutorial's sample game asks for a fixed seed once
  $('#drawHand').addEventListener('click', () => { if (!need()) return; H = { g: G.newGame(S.deck, opts(), rseed()), mulls: 0 }; dealHand(); });
  $('#mullHand').addEventListener('click', () => {
    if (!H) return $('#drawHand').click();
    H.g.library.push(...H.g.hand); H.g.hand = []; G.shuffle(H.g.library, H.g.rnd); H.mulls++; sfx('shuffle');
    clearSampleSelection();
    dealHand();
  });
  $('#keepHand').addEventListener('click', () => {
    if (!H) return toast('Draw a hand first');
    const g = H.g;
    (H.bottom || []).forEach(c => { g.hand.splice(g.hand.indexOf(c), 1); g.library.push(c); });
    g.mulligans = H.mulls; g.openingHand = g.hand.slice();
    g.drawTurn = {}; g.hand.forEach(c => g.drawTurn[c.card.uid] = 0);
    startTableGame(g); H = null; showTab('table');
  });
  function need() { if (!S.deck) { toast('Load a deck first'); showTab('deck'); return false; } return true; }

  function bottomCount(mulls, o) { return Math.max(0, mulls - (o.freeMulligan && mulls >= 1 ? 1 : 0)); }

  function dealHand(alreadyDrawn) {
    const g = H.g, o = opts();
    if (!alreadyDrawn) G.draw(g, 7);
    sfx('deal', H.mulls ? 0.35 : 0);
    const k = bottomCount(H.mulls, o);
    H.bottom = k ? chooseBottom(g.hand, k, o) : [];
    const stage = $('#handStage'); stage.innerHTML = '';
    const fan = h('div', 'fan'); stage.appendChild(fan);
    const n = g.hand.length;
    const els = g.hand.map(inst => {
      const e = cardEl(inst.card, { tag: H.bottom.includes(inst) ? 'bottom' : null, eager: true });
      if (H.bottom.includes(inst)) e.style.filter = 'grayscale(.8) brightness(.55)';
      fan.appendChild(e);
      return e;
    });
    // spread the cards so the whole hand always fits the screen
    fanLayout = () => {
      const W = stage.clientWidth, cw = els[0] ? els[0].offsetWidth : 150, ch = els[0] ? els[0].offsetHeight : 210;
      const mid = (n - 1) / 2, rad = Math.PI / 180;
      // widest the fan gets for a given spacing: card centre + the sideways swing of the tilt (pivot sits below the card) + half the tilted card
      const extent = (step, tilt) => { const th = mid * tilt * rad; return mid * step + 0.9 * ch * Math.sin(th) + (cw * Math.cos(th) + ch * Math.sin(th)) / 2; };
      let step = 108, tilt = 6;
      for (; step > 12; step -= 2) { tilt = 6 * Math.max(0.35, step / 108); if (n < 2 || extent(step, tilt) <= W / 2 - 6) break; }
      if (n < 2) step = 0;
      els.forEach((e, i) => { e.style.transform = `translateX(calc(-50% + ${(i - mid) * step}px)) rotate(${(i - mid) * tilt}deg)`; });
    };
    fanLayout();
    els.forEach((e, i) => e.animate([{ transform: 'translateX(-50%) translateY(260px) rotate(0) scale(.6)', opacity: 0 }, { transform: e.style.transform, opacity: 1 }],
      { duration: 450, delay: i * 70, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards' }));
    const kept = g.hand.filter(c => !H.bottom.includes(c));
    const lands = G.landCount(kept);
    const ok = G.keepable(g.hand, o);
    const v = $('#handVerdict');
    v.className = 'verdict ' + (ok || kept.length <= o.minHandSize ? 'keep' : 'mull');
    v.textContent = `${H.mulls ? `Mulligan ${H.mulls}${k ? ` (bottom ${k})` : ' (free)'} · ` : ''}${lands} land${lands === 1 ? '' : 's'} · ${ok ? 'Keep' : (kept.length <= o.minHandSize ? 'Keep (at minimum size)' : 'Autopilot would mulligan')}`;
    dirty();
  }

  function chooseBottom(hand, k, o) {
    const hh = hand.slice(), out = [];
    for (let i = 0; i < k; i++) {
      const lands = hh.filter(c => c.card.a.isLand), spells = hh.filter(c => !c.card.a.isLand);
      const target = Math.round(hh.length * o.idealLandRatio);
      let pick = lands.length > target && lands.length > 2 ? lands[lands.length - 1] : spells.length ? spells.slice().sort((x, y) => y.card.a.mv - x.card.a.mv)[0] : hh[hh.length - 1];
      hh.splice(hh.indexOf(pick), 1); out.push(pick);
    }
    return out;
  }

  // Pick one of the sample hands: it replaces the big hand above (still free to mulligan, keep, or goldfish).
  function clearSampleSelection() {
    $$('.mini-hand').forEach(x => {
      x.classList.toggle('selected', false);
      const b = x.querySelector('.pick'); if (b) b.textContent = 'Use this hand';
    });
  }
  function selectSample(box, scroll) {
    clearSampleSelection();
    box.classList.add('selected');
    const pb = box.querySelector('.pick'); if (pb) pb.textContent = '✓ In use';
    H = { g: box._g, mulls: 0 };
    dealHand(true);
    if (scroll) {
      const st = $('#handStage'); const y = st.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    toast('Hand swapped in. Keep it, mulligan, or goldfish it.');
  }
  $('#dealMany').addEventListener('click', () => {
    if (!need()) return;
    const grid = $('#handGrid'); grid.innerHTML = '';
    const o = opts();
    grid.appendChild(h('div', 'grid-hint', 'Tap a hand to swap it in above, or press <b>Goldfish ▶</b> to play it right away. (Long-press a card to see it large.)'));
    for (let i = 0; i < 12; i++) {
      const g = G.newGame(S.deck, o, rseed()); G.draw(g, 7);
      const lands = G.landCount(g.hand), ok = G.keepable(g.hand, o);
      // can it make a T2/T3 play with just these cards + lands?
      const cheap = g.hand.filter(c => !c.card.a.isLand && c.card.a.castMv <= Math.max(1, Math.min(lands + 1, 3))).length;
      const box = h('div', 'mini-hand'); box._g = g;
      const cards = h('div', 'cards');
      g.hand.slice().sort((a, b) => (b.card.a.isLand - a.card.a.isLand) || a.card.a.mv - b.card.a.mv).forEach(c => cards.appendChild(cardEl(c.card, { eager: true })));
      box.appendChild(cards);
      box.appendChild(h('div', 'meta', `<span>${lands} land${lands === 1 ? '' : 's'} · ${cheap} early play${cheap === 1 ? '' : 's'}</span><span class="verdict ${ok ? 'keep' : 'mull'}">${ok ? 'Keep' : 'Mulligan'}</span>`));
      const acts = h('div', 'acts');
      acts.appendChild(h('button', 'pick ghost', 'Use this hand'));
      acts.appendChild(h('button', 'go primary', 'Goldfish ▶'));
      box.appendChild(acts);
      box.addEventListener('click', e => {
        if (e.target.closest('.go')) { selectSample(box, false); $('#keepHand').click(); return; }
        selectSample(box, true);
      });
      box.style.animation = `fadein .3s ease ${i * 50}ms both`;
      grid.appendChild(box);
    }
    grid.querySelectorAll('.cards').forEach(c => fitRow(c, 0.28));
  });

  function renderOpenLandsChart() {
    const N = S.deck.library.length, K = S.deck.library.filter(i => i.card.a.isLand).length, o = opts();
    const data = [];
    for (let k = 0; k <= 7; k++) {
      const p = G.hyperPmf(N, K, 7, k), keep = k >= o.minLands && k <= o.maxLands;
      data.push({ label: k + (k === 1 ? ' land' : ''), v: p, color: keep ? '#3987e5' : '#383835',
        tip: `<b>${k} land${k === 1 ? '' : 's'} in 7</b><div class="tt-row"><span>Probability</span><span>${pct(p)}</span></div><div class="tt-row"><span>Autopilot</span><span>${keep ? 'keeps' : 'mulligans'}</span></div>` });
    }
    C.bars($('#chartOpenLands'), data, { labelAll: true, name: 'Probability' });
    const pKeep = data.reduce((s, d, k) => s + (k >= o.minLands && k <= o.maxLands ? d.v : 0), 0);
    const ramp = S.deck.library.filter(i => i.card.a.role === 'ramp').length;
    const drawc = S.deck.library.filter(i => i.card.a.role === 'draw').length;
    const kv = [
      ['Lands in library', `${K} of ${N}`],
      ['Expected lands in 7', (7 * K / N).toFixed(2)],
      ['P(keepable 7 by your rules)', pct(pKeep)],
      ['P(keep by 2nd look)', pct(1 - (1 - pKeep) ** 2)],
      ['P(≥1 ramp piece in 7)', pct(G.hyperAtLeast(N, ramp, 7, 1))],
      ['P(≥1 draw spell in 7)', pct(G.hyperAtLeast(N, drawc, 7, 1))],
      ['P(≥3 lands by turn 3, on the draw)', pct(G.hyperAtLeast(N, K, 9, 3))],
      ['P(≥4 lands by turn 4, on the draw)', pct(G.hyperAtLeast(N, K, 10, 4))],
    ];
    $('#keepStats').innerHTML = kv.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  }


  // ---------- how much damage an attack sends (T-084) ----------
  // From the engine's own numbers (powerOf with anthems and pumps, hasKw, toughnessOf): double strike counts twice, infect and toxic are
  // poison, a commander's damage is counted toward 21. g: the attacking game; list: the attackers; def: the defending game (null at the
  // goldfish table); blocks (optional): { attackerIid: [the blockers' permanents] }, for the damage that gets through: an unblocked
  // attacker's damage plus a trampler's excess over its blockers' toughness. first strike, double strike and deathtouch between blockers
  // and attackers make it an estimate (estimate: true). Spells and triggers during combat are not counted.
  function attackSum(g, list, def, blocks) {
    const r = { dmg: 0, poison: 0, trample: 0, cmdr: [], estimate: false, lethal: { life: false, poison: false, cmdr: false } };
    const kw = (gg, p, k) => G.hasKw(gg, p, k);
    for (const p of list) {
      const pw = Math.max(0, G.powerOf(g, p)), mult = kw(g, p, 'double strike') ? 2 : 1, infect = kw(g, p, 'infect');
      let amount = pw * mult, steps = mult;
      const bl = blocks ? (blocks[p.iid] || []) : null;
      if (bl && bl.length) {
        const need = kw(g, p, 'deathtouch') ? bl.length : bl.reduce((s, b) => s + Math.max(0, G.toughnessOf(def, b)), 0);
        if (kw(g, p, 'trample')) { const first = Math.max(0, pw - need); amount = mult === 2 ? first + pw : first; r.trample += amount; } else amount = 0;
        if (mult === 2 || kw(g, p, 'first strike') || kw(g, p, 'deathtouch') || bl.some(b => kw(def, b, 'first strike') || kw(def, b, 'double strike') || kw(def, b, 'deathtouch'))) r.estimate = true;
        if (!amount) steps = 0;
      }
      if (infect) r.poison += amount; else r.dmg += amount;
      if (!infect && amount > 0) {
        const tx = p.card.a && p.card.a.toxic ? p.card.a.toxic : 0;
        r.poison += (tx > 0 ? tx * steps : 0) + (p.eotToxic || 0) * steps + (tx === -1 ? amount : 0);          // toxic N once for each damage step; Etali: as many as the damage
      }
      if (p.card.commander && amount > 0 && !infect) {
        const key = def ? p.iid + '>' + def.pid : String(p.iid), now = (g.cmdrDamage || {})[key] || 0;
        r.cmdr.push({ name: p.card.name.split(',')[0], now, after: now + amount });
      }
    }
    const life = def ? def.life : Math.max(0, g.opts.oppLife - g.damage);
    r.lethal.life = r.dmg > 0 && r.dmg >= life;
    r.lethal.poison = r.poison > 0 && (g.poisonDealt || 0) + r.poison >= 10;
    r.lethal.cmdr = g.opts.cmdrDamage !== false && r.cmdr.some(c => c.after >= 21);
    r.isLethal = r.lethal.life || r.lethal.poison || r.lethal.cmdr;
    return r;
  }
  // ======================= goldfish table =======================
  // autopilot speed: the 🐢…🐇 slider slows everything down up to 5× (🐇 = the original speed); ⚡ Fast still applies on top
  // One setting for the whole app: every 🐢…🐇 slider (Goldfish Table, 1v1, Pod) shows and changes the same speed.
  // slider 1 (turtle) … 10 (rabbit) → 10× … 1× slower. A speed saved on the old 1…5 scale (isf_speed) keeps its pace: old v is new v + 5.
  const oldSpeed = +localStorage.getItem('isf_speed');
  let speedVal = Math.max(1, Math.min(10, +localStorage.getItem('isf_speed10') || (oldSpeed ? oldSpeed + 5 : 10)));
  const slow = () => 11 - speedVal;
  const speedBars = [];
  function paintSpeed() {
    const txt = slow() === 1 ? 'Full speed' : slow() === 10 ? '10× slower (slowest)' : slow() + '× slower';
    speedBars.forEach(([box, lbl]) => { box.value = speedVal; box.title = 'Autopilot speed: ' + txt; if (lbl) lbl.textContent = txt; });
  }
  function bindSpeed(box, lbl) {
    speedBars.push([box, lbl]);
    box.addEventListener('input', () => { speedVal = Math.max(1, Math.min(10, +box.value || 10)); localStorage.setItem('isf_speed10', speedVal); paintSpeed(); });
  }
  function speedBar() {                                   // a new speed bar for another tab, already wired to the shared setting
    const bar = h('div', 'speed-bar', '<span class="speed-name">Autopilot speed</span><label class="speed" title="Autopilot speed"><span aria-hidden="true">🐢</span>' +
      '<input type="range" min="1" max="10" step="0.5" value="10" aria-label="Autopilot speed, turtle to rabbit"><span aria-hidden="true">🐇</span></label><span class="speed-txt"></span>');
    bindSpeed(bar.querySelector('input'), bar.querySelector('.speed-txt')); paintSpeed();
    return bar;
  }
  bindSpeed($('#tSpeed'), $('#tSpeedTxt')); paintSpeed();
  const delay = () => ($('#tFast').checked ? 140 : 520) * slow();
  $('#tNew').addEventListener('click', () => newTableGame());
  $('#tNext').addEventListener('click', () => guard(nextTurn));
  $('#tAuto').addEventListener('click', () => guard(autoTurn));
  $('#tAutoTo').addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; guard(async () => { const n = +$('#tAutoToN').value; while (S.game && S.game.turn < n || (S.game.turn === n && !S.game.turnDone)) await autoTurn(); }); });
  $('#tUndo').addEventListener('click', undo);
  $('#zLibrary .card-back').addEventListener('click', () => { const g = S.game; if (!g || S.busy) return; snap(); const d = G.draw(g, 1); d.forEach(c => log(`Drew ${esc(c.card.name)}`)); if (d.length) sfx('draw'); render(); });
  $('#hLife').addEventListener('click', () => {
    const g = S.game; if (!g || S.busy) return;
    const v = prompt('Deal how much damage to the goldfish? (negative to undo)', '1');
    const n = parseInt(v, 10); if (!n) return;
    snap(); const ev = []; if (n > 0) G.damageOpp(g, n, ev, null); else g.damage = Math.max(0, g.damage + n);
    describe(ev); sfxEv(ev); render();
  });
  $('#tToken').addEventListener('click', () => {
    const g = S.game; if (!g || S.busy) return;
    const known = (S.deck.tokens || []).map((t, i) => `${i + 1}) ${t.name}${t.power != null ? ` ${t.power}/${t.toughness}` : ''}`).join('\n');
    const v = prompt(`Create a token.\n${known ? 'Tokens your deck makes:\n' + known + '\n\nType a number, or ' : 'Type '}a custom one like "2/2 Zombie", "Treasure", "1/1 Soldier flying". Add "x3" for three.`, known ? '1' : '1/1 Soldier');
    if (!v) return;
    let n = 1; const mm = v.match(/x\s*(\d+)\s*$/i); let txt = v.replace(/x\s*\d+\s*$/i, '').trim(); if (mm) n = +mm[1];
    let spec;
    if (/^\d+$/.test(txt) && S.deck.tokens[+txt - 1]) {
      const t = S.deck.tokens[+txt - 1];
      spec = { name: t.name, creature: /Creature/.test(t.type_line), p: +t.power || 0, t: +t.toughness || 0, colors: t.colors || [], keywords: (t.keywords || []).map(k => k.toLowerCase()) };
    } else {
      const pm = txt.match(/^(\d+)\/(\d+)\s+(.*)$/);
      const words = (pm ? pm[3] : txt).split(/\s+/);
      const kws = words.filter(w => /^(flying|haste|trample|vigilance|lifelink|deathtouch|menace|reach)$/i.test(w)).map(w => w.toLowerCase());
      const name = words.filter(w => !kws.includes(w.toLowerCase())).join(' ') || 'Token';
      spec = pm ? { name, creature: true, p: +pm[1], t: +pm[2], subtypes: [name], colors: [], keywords: kws } : { name: name[0].toUpperCase() + name.slice(1), creature: false, artifact: true };
    }
    snap(); const ev = []; G.createTokens(g, spec, n, ev, null); describe(ev); sfxEv(ev); render();
  });

  async function guard(fn) { if (S.busy || !S.game) return; S.busy = true; try { await fn(); } finally { S.busy = false; render(); } }
  // Your own actions on the Goldfish Table ask you what the card asks for (a library search, a target, a mode, a discard...), the same
  // way the 1v1 and Pod tables do: the engine call is tried on a copy of the game, each choice is asked in the sheet (choices.js), then
  // the call is made for real with your answers (decide.js). The autopilot's own turn never asks.
  async function yours(run, combo) {
    const g = S.game, D = window.Decide, C = window.__isfChoices;
    if (!D || !C || !g.ask) return run(g);
    const was = S.busy; S.busy = true;
    try {
      let r = await D.resolve([g], 0, gs => run(gs[0]), q => C.ask(q)); if (S.game !== g) throw C.CANCELLED;
      // T-061: after a card you cast or an ability you used, a combo that is now assembled is acknowledged and asked about (a banner, then what to do with it)
      if (combo && Array.isArray(r) && g.killTurn == null && !G.matchOver(g)) {
        const cev = await D.resolve([g], 0, gs => { const e = []; G.comboLines(gs[0], e); return e; }, q => C.ask(q)); if (S.game !== g) throw C.CANCELLED;
        if (cev.length) r = r.concat(cev);
      }
      return r;
    }
    finally { S.busy = was; }
  }
  const yoursC = run => yours(run, true);
  const sameInst = (x, inst) => x.hand.concat(x.command, x.graveyard, x.exile).find(i => i.iid === inst.iid) || (x.library[0] && x.library[0].iid === inst.iid ? x.library[0] : null);
  const quiet = p => p.catch(e => { if (e && e.cancelled) return; console.error(e); toast('Something went wrong: ' + (e && e.message || e)); });

  function newTableGame(auto) {
    if (!need()) return null;
    const g = G.newGame(S.deck, opts(), rseed());
    G.mulligan(g);
    return startTableGame(g, auto);
  }
  // Loop: game after game by itself, with the settings already on screen. Each game: a new game, the autopilot plays until the goldfish is
  // dead (or turn LOOP_CAP, for a deck that cannot win), a short pause that follows the speed slider, then the next. Press again to stop.
  let tableLoop = null; const LOOP_CAP = 30;
  const loopBtn = on => { const b = $('#tLoop'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  $('#tLoop').addEventListener('click', () => {
    if (tableLoop) { tableLoop.stop = true; loopBtn(false); toast('Loop stops after this game'); return; }
    if (!need()) return;
    tableLoop = { stop: false, games: 0, kills: [] }; loopBtn(true); runTableLoop(tableLoop);
  });
  async function runTableLoop(L) {
    try {
      while (!L.stop) {
        while (S.busy && !L.stop) await sleep(150);
        if (L.stop) break;
        await newTableGame(true);
        const n = LOOP_CAP;                                              // play until the goldfish is dead (a deck that cannot win stops at this turn)
        await guard(async () => { while (!L.stop && S.game && S.game.killTurn == null && (S.game.turn < n || (S.game.turn === n && !S.game.turnDone))) await autoTurn(); });
        if (L.stop || !S.game) break;
        const g = S.game; L.games++; if (g.killTurn != null) L.kills.push(g.killTurn);
        const avg = L.kills.length ? L.kills.reduce((a, b) => a + b, 0) / L.kills.length : 0;
        const line = `Loop · game ${L.games}: ${g.killTurn != null ? 'goldfish dead on turn ' + g.killTurn : 'no kill by turn ' + g.turn} · killed in ${L.kills.length} of ${L.games}${L.kills.length ? ', average turn ' + avg.toFixed(1) : ''}`;
        log(`<b>${esc(line)}</b>`); toast(line);
        await sleep(2500 * slow());
      }
    } finally { if (tableLoop === L) tableLoop = null; loopBtn(false); }
  }
  // a game remember.js read back (a reload in the middle of a game): it goes on where it was, with its log; the undo steps start again
  function resumeTableGame(g, logHtml) {
    if (window.__isfChoices) window.__isfChoices.close();
    if (window.Decide) window.Decide.seat(g);
    S.game = g; S.undo = []; elCache.clear();
    $('#gameLog').innerHTML = logHtml || '';
    render(true);
  }
  function startTableGame(g, auto) {
    if (window.__isfChoices) window.__isfChoices.close();                // a question of the game before this one
    if (window.Decide && !auto) window.Decide.seat(g);                    // your choices are asked; the autopilot's turn still decides by itself (a looped game asks nothing)
    S.game = g; S.undo = []; g.turnDone = false; elCache.clear();
    $('#gameLog').innerHTML = '';
    sfx('shuffle');
    log(`Kept ${g.hand.length} cards${g.mulligans ? ` after ${g.mulligans} mulligan${g.mulligans > 1 ? 's' : ''}` : ''}: ${g.hand.map(c => esc(c.card.name)).join(', ')}`);
    render(true);
    return quiet(beginTurnUI(!auto).then(() => render(true)));
  }
  // person: your turn starting (upkeep choices are asked); otherwise the autopilot's
  // The step strip in the Practice bar: the step is kept by this page alone (the engine plays the same turn either way)
  function stepP(k) { S.step = k; const C = window.__isfChoices; if (C) C.lightStep($('#tSteps'), window.Decide, k); }
  function beginTurnUI(person) {
    const g = S.game;
    stepP('untap');
    const done = ev => { stepP('main1'); g.turnDone = false; logTurn(g.turn); describe(ev); if (g.turn > 1) sfx('turn'); };
    if (person) return yours(x => G.beginTurn(x)).then(done);
    done(G.beginTurn(g));
    return Promise.resolve();
  }
  async function nextTurn() {
    const g = S.game;
    { const fl = G.floatingLoss(g); if (fl.n && window.__isfPayChoose !== false && !confirm(`${fl.n} floating mana will be lost at ${fl.when}. End the turn anyway?`)) return; }          // T-099
    snap();
    if (!g.turnDone) { await doCombat(true); await doPostCombat(true); stepP('end'); describe(await yours(x => G.endTurn(x))); }          // the cleanup step asks what to discard
    await beginTurnUI(true); render();
  }
  // T-102: an action that showed you new information (a draw, a search, a look at cards, a random result) cannot be taken back
  const REVEALS = /draw|scry|surveil|tutor|search|shuffle|look|reveal|mill|discover|peer|explore|manifest|random|dice|coin|impulse|wheel|dig|plunder|cascade/i;
  async function play(ev) {
    if (S.undo.length && (ev || []).some(e => e && REVEALS.test(e.type || ''))) S.undo[S.undo.length - 1].revealed = true;
    // animate a batch of events: highlight sources, float damage, then re-render
    describe(ev);
    sfxEv(ev);
    render();
    for (const e of ev) {
      if (e.type === 'damage' || e.type === 'attack') floatDamage(e.n || e.dmg);
      if (e.type === 'trigger' && e.source) flash(e.source.iid);
      if (e.type === 'kill') killBanner(S.game.turn, e.cmdr);
      if (e.type === 'tempt') ringBanner(e);
    }
    const tempt = ev.filter(e => e.type === 'tempt').pop();
    if (tempt && tempt.bearer) flash(tempt.bearer.iid);                  // the new Ring-bearer lights up
    await sleep(delay());
  }
  function flash(iid) {
    const el = document.querySelector(`.table [data-iid="${iid}"]`);
    if (el) { el.classList.remove('glow'); void el.offsetWidth; el.classList.add('glow'); setTimeout(() => el.classList.remove('glow'), 700); }
  }
  // mine: your own turn (Next turn). The beginning of combat is its own step first: its triggers resolve before attackers, with their
  // choices asked (Hakbal's Merfolk explore, even while Hakbal is summoning sick), then the attack, whose triggers ask too.
  async function doCombat(mine) {
    const g = S.game; stepP('combat');
    if (mine) {
      const pre = await yours(x => (G.matchOver(x) ? { ev: [] } : G.previewAttack(x)).ev);
      if (pre.length) { log('<i>Beginning of combat</i>'); await play(pre); }
    }
    const ev = mine ? await yours(x => G.combat(x)) : G.combat(g);
    // split at declare / attack boundaries for a two-beat animation
    let batch = [];
    for (const e of ev) {
      batch.push(e);
      if (e.type === 'declare') {
        describe(batch); sfxEv(batch); batch = [];
        render();
        e.attackers.forEach(p => { const el = document.querySelector(`.bf-row [data-iid="${p.iid}"]`); if (el) { el.classList.remove('attacking'); void el.offsetWidth; el.classList.add('attacking'); } });
        await sleep(delay() * 0.7);
      }
    }
    if (batch.length) await play(batch);
  }
  // postcombat main phase (Sorin of House Markov transforms here)
  // mine: your own turn (Next turn): the second main phase only resolves what happens by itself (its triggers); the autopilot's turn
  // also casts and uses what it would
  async function doPostCombat(mine) {
    stepP('main2');
    const ev = mine ? await yours(x => G.postCombatTriggers(x)) : G.postCombat(S.game);
    if (ev.length) await play(ev);
  }
  async function autoTurn() {
    const g = S.game; snap();
    if (g.turnDone) { stepP('end'); describe(G.endTurn(g)); beginTurnUI(); render(); await sleep(delay()); }
    if (!g.landThisTurn) {
      const le = G.landStep(g);
      if (le) await play([le, ...le.ev]);
      else log('<i>No land drop</i>');
    }
    const combos = async () => { if (g.killTurn != null || G.matchOver(g)) return; const ev = []; G.comboLines(g, ev); if (ev.length) await play(ev); };          // T-061: an assembled combo is played out (the autopilot's answer is always the win)
    await combos();
    for (let k = 0; k < 80; k++) {
      let ev = G.castOne(g);
      if (!ev) ev = G.useAbilities(g);
      if (!ev || !ev.length) break;
      await play(ev);
      await combos();
    }
    await doCombat();
    await doPostCombat();
    g.turnDone = true;
  }

  const nm = p => esc(p && p.card ? p.card.name : 'Spell');
  function describe(ev) {
    noteImprints(S.game, ev);                               // remember which card a Chrome Mox exiled
    // With token doublers one effect can make dozens of tokens and fire the same trigger dozens of times:
    // group those into one log line ("created 8 × Soldier", "⚡ Belladonna Took ×8") instead of one line each.
    const items = [], seen = new Map();
    for (const e of ev) {
      let key = null;
      if (e.type === 'token') key = 't:' + e.inst.card.uid;
      else if (e.type === 'trigger') key = 'g:' + (e.source ? e.source.iid : '') + '|' + e.text;
      else if (e.type === 'damage') key = 'd:' + (e.source ? e.source.iid : '');
      else if (e.type === 'counters') key = 'c:' + (e.kind || '+1/+1') + ':' + e.n + ':' + (e.source ? e.source.iid : '');       // "+1 counters on 12 creatures" is one line
      if (key && seen.has(key)) {
        const first = seen.get(key);
        first.count++;
        if (e.type === 'damage') { first.n += e.n; first.total = e.total; }
        if (e.type === 'counters') first.perms = first.perms.concat(e.perms);
        if (e.type === 'token') first.perm = e.perm;
        continue;
      }
      const item = key ? Object.assign({}, e, { count: 1, perms: e.perms ? e.perms.slice() : e.perms }) : e;
      if (key) seen.set(key, item);
      items.push(item);
    }
    if (window.Dice) window.Dice.fromEvents(items);                    // a die rolled or a coin flipped: show it in 3D
    const times = c => (c > 1 ? ` × ${c}` : '');
    for (const e of items) {
      switch (e.type) {
        case 'cast': log(`Cast <b>${esc(e.inst.card.name)}</b>`); break;
        case 'land': log(`${e.extra ? '↳ put' : 'Played'} ${esc(e.inst.card.name)}${e.mdfc ? ' (land side)' : ''}${e.perm && e.perm.tapped ? ' tapped' : ''}`); break;
        case 'rampLand': log(`↳ ${esc(e.inst.card.name)} onto the battlefield${e.perm.tapped ? ' tapped' : ''}`); break;
        case 'tutor': log(`↳ ${esc(e.inst.card.name)} into hand`); break;
        case 'draw': log(`${S.game && S.game.turnDrawLogged ? '↳ drew' : 'Drew'} ${esc(e.inst.card.name)}`); break;
        case 'trigger': log(`<span class="trig">⚡ ${nm(e.source)}${times(e.count)}</span>: <i>${esc(e.text.length > 90 ? e.text.slice(0, 88) + '…' : e.text)}</i>`); break;
        case 'token': log(`↳ created ${e.count > 1 ? e.count + ' × ' : ''}${esc(e.inst.card.name)}${e.perm.card.a.isCreature ? ` ${G.powerOf(S.game, e.perm)}/${G.toughnessOf(S.game, e.perm)}` : ''} token${e.count > 1 ? 's' : ''}`); break;
        case 'damage': log(`↳ <b>${e.n}</b> damage to the goldfish (${e.total} total)`); break;
        case 'life': log(`↳ you gain <b>${e.n}</b> life (${e.total})`); break;
        case 'counters': log(`↳ +${e.n} ${esc(e.kind || '+1/+1')} counter${e.n > 1 ? 's' : ''} on ${e.perms.length > 3 ? e.perms.length + ' permanents' : e.perms.map(nm).join(', ')}`); break;
        case 'tempt': log(`<b>💍 The Ring tempts you</b> (${e.n > 4 ? e.n + 'th' : ORD[e.n]} time): ${e.bearer ? '<b>' + nm(e.bearer) + '</b> is your Ring-bearer.' : 'you have no creature to carry it.'} <i>${esc(e.ability)}</i>`); break;
        case 'pump': log(`↳ ${e.all ? 'creatures get' : nm(e.perms[0]) + ' gets'} +${e.p}/+${e.t}${e.keywords && e.keywords.length ? ' and ' + e.keywords.join(', ') : ''} this turn`); break;
        case 'mana': log(`↳ added ${e.n} mana`); break;
        case 'pw': log(`<b>${nm(e.perm)}</b> ${e.cost > 0 ? '+' : ''}${e.x ? 'X' : e.cost}: <i>${esc(String(e.text || '').replace(/^[+−-]?(?:\d+|x|X):\s*/, ''))}</i> (loyalty ${e.perm.loyalty})`); break;          // the ability's text without its cost (the cost is written first)
        case 'equip': log(`Equipped ${nm(e.perm)} to ${nm(e.target)}`); break;
        case 'activate': log(`Activated ${nm(e.perm)}: <i>${esc(e.text)}</i>`); break;
        case 'note': log(`↳ ${esc(e.text)}`); break;
        case 'combo': log(`★ Combo assembled: ${esc(e.name)}${e.cards && e.cards.length ? ' (' + esc(e.cards.join(' + ')) + ')' : ''}`); break;
        case 'transform': log(`<b>🔄 ${esc(e.from.name.split(' // ')[0])} transforms into ${esc(e.to.name)}</b>`); break;
        case 'declare': log(`Attack with ${e.attackers.length > 6 ? e.attackers.length + ' creatures' : e.attackers.map(nm).join(', ')}`); break;
        case 'attack': log(`⚔ <b>${e.dmg}</b> combat damage (${e.total} total)`); break;
        case 'kill': log(`<b>☠ Goldfish dead on turn ${S.game.turn}${e.cmdr ? ' (21 commander damage)' : ''}</b>`); break;
      }
    }
    for (const e of ev) if (e.type === 'cast' && e.inst && /\b(Instant|Sorcery)\b/.test(e.inst.card.type_line || '')) { const ch = G.chosenFor(S.game, e.inst.card); if (ch) log(`<b>${esc(e.inst.card.name)}</b>: the chosen ${ch.what} is <b>${esc(ch.name)}</b>`); }          // Kindred Dominance
    sayChosen();
  }
  // "As ~ enters, choose a creature type" (Metallic Mimic, Cavern of Souls...): the type is announced once, when the permanent arrives,
  // and stays on its card as a tag (permEl)
  const CHOSEN_SAID = new WeakMap();                          // per game, kept off the game itself (copies and undo snapshots stay clean)
  function sayChosen() {
    const g = S.game; if (!g) return;
    let seen = CHOSEN_SAID.get(g); if (!seen) CHOSEN_SAID.set(g, seen = new Set());
    for (const p of g.battlefield) {
      if (seen.has(p.iid)) continue; seen.add(p.iid);
      const ch = G.chosenOf(g, p); if (ch) log(`<b>${esc(p.card.name.split(' // ')[0])}</b>: the chosen ${ch.what} is <b>${esc(ch.name)}</b>`);
    }
  }

  function floatDamage(n) {
    if (!n) return;
    const life = $('#hLife'); const r = life.getBoundingClientRect();
    const d = h('div', 'dmg-float', '−' + n); d.style.left = r.left + 'px'; d.style.top = r.top + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
    life.classList.remove('hit'); void life.offsetWidth; life.classList.add('hit');
  }
  const ORD = ['', '1st', '2nd', '3rd', '4th'];
  function ringBanner(e) {
    const b = h('div', 'ring-banner', `💍 The Ring tempts you<br><small>${e.n > 4 ? e.n + 'th' : ORD[e.n]} time${e.bearer ? ' · ' + esc(e.bearer.card.name.split(',')[0]) + ' is your Ring-bearer' : ''}</small>`);
    document.body.appendChild(b); setTimeout(() => b.remove(), 2200);
  }
  function killBanner(t, cmdr) { const b = h('div', 'kill-banner', `🐟 Goldfish defeated · turn ${t}${cmdr ? '<br><small>21 commander damage</small>' : ''}`); document.body.appendChild(b); setTimeout(() => b.remove(), 2100); }

  function log(html) { const ol = $('#gameLog'); ol.appendChild(h('li', '', html)); const box = ol.parentElement; box.scrollTop = box.scrollHeight; }
  function logTurn(t) { $('#gameLog').appendChild(h('li', 'turn', `Turn ${t}`)); }

  // ---- undo via snapshots ----
  const SCALARS = ['turn', 'seq', 'damage', 'manaSpent', 'spentThisTurn', 'landThisTurn', 'turnDone', 'killTurn', 'commanderCast', 'landsPlayedThisTurn', 'extraLandsThisTurn', 'extraCombats', 'nextIid', 'landPlayed', 'spellsCast', 'nontokenCreatureEnters', 'life', 'lifeGainedThisTurn', 'extortOwed', 'combatNames', 'combatDone'];
  function snap() {
    const g = S.game;
    const scal = {}; SCALARS.forEach(k => { scal[k] = g[k]; });
    S.undo.push({
      library: g.library.slice(), hand: g.hand.slice(), graveyard: g.graveyard.slice(), exile: g.exile.slice(), command: g.command.slice(),
      battlefield: g.battlefield.map(p => Object.assign({}, p)), scal, floating: (g.floating || []).slice(), turns: g.turns.slice(),
      cmdrDamage: Object.assign({}, g.cmdrDamage), cmdrCasts: Object.assign({}, g.cmdrCasts), eot: { p: g.eot.p, t: g.eot.t, kw: new Set(g.eot.kw) }, emblems: (g.emblems || []).slice(), ring: Object.assign({}, g.ring),
      log: $('#gameLog').innerHTML,
    });
    if (S.undo.length > 80) S.undo.shift();
  }
  function undo() {
    if (S.busy) return;                                                  // the table is busy (a question is open): keep the undo step for later
    const top = S.undo[S.undo.length - 1]; if (!top) return;
    const lib = S.game.library;
    if (top.revealed || top.library.length !== lib.length || top.library.some((c, i) => c !== lib[i])) { sfx('error'); return toast("Can't undo: it showed you new cards"); }          // a draw, search or shuffle changed the library
    const s = S.undo.pop();
    const g = S.game;
    Object.assign(g, { library: s.library, hand: s.hand, graveyard: s.graveyard, exile: s.exile, command: s.command, battlefield: s.battlefield,
      floating: s.floating, turns: s.turns, cmdrDamage: s.cmdrDamage, cmdrCasts: s.cmdrCasts, eot: s.eot, emblems: s.emblems, ring: s.ring }, s.scal);
    G.touch(g);
    $('#gameLog').innerHTML = s.log; sfx('undo'); render();
  }

  // ---- interactions ----
  $('.table').addEventListener('click', e => {
    const m = e.target.closest('.mtg');
    if (m && m.classList.contains('imprinted-card')) { e.stopPropagation(); return showLightbox(cardOf(m), m); }   // the card imprinted on a permanent: just read it
    if (!m || S.busy || !S.game || m.dataset.iid == null) return;
    // touch screens: a tap opens the card's menu (play / tap first), so nothing happens by accident
    // a click or tap opens the card's menu (play / tap first, View card for prices and shops), the same on PC and phone.
    // On a PC, Ctrl/⌘-click plays or taps at once, and Shift-click casts ignoring mana, as before.
    const quick = canHover && (e.ctrlKey || e.metaKey || e.shiftKey);
    if (!quick) {
      e.stopPropagation();
      if (canHover) openCtx(m, e.clientX, e.clientY); else { const r = m.getBoundingClientRect(); openCtx(m, r.left, r.top); }
      return;
    }
    const g = S.game, iid = +m.dataset.iid;
    const inHand = g.hand.find(i => i.iid === iid), inCmd = g.command.find(i => i.iid === iid), perm = g.battlefield.find(p => p.iid === iid);
    if (inHand || inCmd) playFromHand(inHand || inCmd, e.shiftKey, m);
    else if (perm) { snap(); perm.tapped = !perm.tapped; sfx('tap'); render(); }
  });
  function playFromHand(inst, force, el, asLand) {
    const g = S.game, a = inst.card.a;
    if (a.isLand || asLand) {
      snap();
      if (!G.canPlayLand(g)) { sfx('error'); toast("You've already played your land this turn"); return; }          // one land a turn, unless something lets you play more (Exploration, Azusa)
      quiet(yoursC(x => { const le = G.playLandCard(x, sameInst(x, inst), !!asLand); return [le, ...le.ev]; }).then(play));          // a fetch land asks which land
      return;
    }
    // a two-faced card (Esika // The Prismatic Bridge): choose the face as it is cast (the sheet from choices.js)
    const fq = !force && window.Decide && window.Decide.faceQuestion(g, inst);
    if (fq && !fq.only && window.__isfChoices) {
      window.__isfChoices.ask(fq).then(pick => castFace(inst, (pick === 'auto' || pick == null ? fq.options[fq.def[0]] : fq.options[pick]).face, el)).catch(() => {});
      return;
    }
    if (fq && fq.only && fq.options[0].face === 1) return castFace(inst, 1, el);
    snap();
    quiet(yoursC(x => G.castCard(x, sameInst(x, inst), force)).then(ev => castDone(ev, inst, el, a)));
  }
  function castDone(ev, inst, el, a) {
    if (!ev) { S.undo.pop(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); sfx('error'); return toast(a.isAura ? 'You need a creature to enchant. Shift-click to cast anyway.' : 'Not enough mana. Shift-click to cast it anyway.'); }
    play(ev);
  }

  // Practice: a planeswalker's loyalty abilities, chosen in the same menu as on the Duel table (decide.js loyaltyQuestion)
  function openLoyalty(obj) {
    const g = S.game, D = window.Decide, C = window.__isfChoices;
    if (!g || S.busy || !D || !C) return;
    const q = D.loyaltyQuestion(g, obj); if (!q) return;
    S.busy = true;
    C.ask(q).then(pick => {
      S.busy = false;
      const k = pick === 'auto' ? q.def[0] : pick;
      if (k == null || k === 'none' || !q.options[k] || q.options[k].disabled) return render();
      const idx = q.options[k].i; snap();
      quiet(yoursC(x => G.useLoyalty(x, x.battlefield.find(y => y.iid === obj.iid), idx)).then(ev => { if (!ev) { S.undo.pop(); sfx('error'); return toast('That ability cannot be used now'); } play(ev); }));
    }).catch(() => { S.busy = false; });
  }
  // one of a permanent's activated abilities (or a graveyard card's, Cauldron Familiar), any time you have priority
  function useAbilityUI(obj, zone, i, ab) {
    if (!ab.ok) { sfx('error'); return toast(`${obj.card.name}: not now (${ab.why})`); }
    snap();
    quiet(yoursC(x => G.useAbility(x, x[zone].find(y => y.iid === obj.iid), i)).then(ev => { if (!ev) { S.undo.pop(); sfx('error'); return toast('That ability cannot be used now'); } play(ev); }));
  }
  function castFace(inst, face, el) { snap(); quiet(yoursC(x => face === 1 ? G.castBackFace(x, sameInst(x, inst)) : G.castCard(x, sameInst(x, inst))).then(ev => faceDone(ev, inst, face, el))); }
  function faceDone(ev, inst, face, el) {
    if (!ev) { S.undo.pop(); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } sfx('error'); return toast(`Not enough mana for ${face === 1 ? 'the back face' : 'the front face'} of ${inst.card.name.split(' // ')[0]}`); }
    play(ev);
  }

  // ---- fit a row of cards inside its container (overlap only as much as needed) ----
  function fitRow(row, baseOverlap) {
    if (!row) return;
    const kids = Array.from(row.children).filter(k => k.classList && k.classList.contains('mtg'));
    if (!kids.length) return;
    const cs = getComputedStyle(row);
    const avail = row.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const w = kids[0].offsetWidth; if (!w || avail <= 0) return;
    const n = kids.length;
    let overlap = w * baseOverlap;
    if (n > 1 && w * n - overlap * (n - 1) > avail) overlap = Math.min(w * 0.84, (w * n - avail) / (n - 1));
    kids.forEach((k, i) => { k.style.marginLeft = i ? (-overlap) + 'px' : '0px'; k.style.marginRight = '0px'; });
  }
  function refit() {
    if (fanLayout) fanLayout();
    fitRow($('#zHand'), 0.14);
    $$('.mini-hand .cards').forEach(c => fitRow(c, 0.28));
  }
  window.addEventListener('resize', () => { clearTimeout(window._rz2); window._rz2 = setTimeout(refit, 120); });
  // the one-screen table on phones and tablets is sized from what is left under the top bar
  const topbar = $('.topbar');
  const setTopbarH = () => document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
  setTopbarH();
  if (window.ResizeObserver) new ResizeObserver(() => { setTopbarH(); refit(); }).observe(topbar);
  // ---- table focus (T-069): while a table is open (Practice, or a Duel/Pod game) the top bar, tabs and page chrome get out of the way
  // so the table covers the whole screen. A small "menu" button in the table's own toolbar brings the bar back (over the table); the
  // bar's Fullscreen button uses the Fullscreen API where the browser has it (not iPhone Safari pages; a Home Screen app is standalone).
  // localStorage isf_focus = "off" turns it off, "on" forces it on; scripted browsers (navigator.webdriver) keep the bar unless it is "on".
  const lsFocus = () => { try { return localStorage.getItem('isf_focus'); } catch (e) { return null; } };
  const tableOpen = () => {
    const v = document.body.dataset.view;
    if (v === 'table') return true;
    const g = (v === 'duel' || v === 'pod') && document.querySelector('#tab-' + v + ' .vs-game');
    return !!g && !g.hidden;
  };
  function applyFocus() {
    const f = lsFocus(), on = (f ? f === 'on' : !navigator.webdriver) && tableOpen() && !document.body.classList.contains('tleft');
    document.body.classList.toggle('tfocus', on);
    if (on) window.scrollTo(0, 0);
    if (!on) document.body.classList.remove('tbar-open');
    setTopbarH(); requestAnimationFrame(refit);
  }
  new MutationObserver(applyFocus).observe(document.querySelector('main'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  const fsOk = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const fsWanted = () => { try { return localStorage.getItem('isf_fs') === '1'; } catch (x) { return false; } };
  function fsToggle() {
    try {
      if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); try { localStorage.setItem('isf_fs', '0'); } catch (e) {} }
      else { const r = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen; const pr = r.call(document.documentElement); if (pr && pr.catch) pr.catch(() => {}); try { localStorage.setItem('isf_fs', '1'); } catch (e) {} }
    } catch (e) { /* the browser said no */ }
  }
  document.addEventListener('click', e => {
    const t = e.target.closest ? e.target : e.target.parentElement; if (!t) return;
    if (t.closest('.focus-menu')) { e.stopPropagation(); document.body.classList.toggle('tbar-open'); return; }
    if (t.closest('.focus-leave')) { document.body.classList.add('tleft'); applyFocus(); return; }               // back to the tab's settings
    if (t.closest('.fs-btn')) { fsToggle(); return; }
    { const lt = t.closest('.vs-logtog'); if (lt) { e.stopPropagation(); lt.closest('.vs-game').classList.toggle('log-open'); return; } }
    { const g = document.querySelector('.vs-game.log-open'); if (g && !t.closest('.vs-game > .card-box')) g.classList.remove('log-open'); }
    if (t.closest('.vs-new') || t.closest('#tNew')) { document.body.classList.remove('tleft'); setTimeout(applyFocus); }
    if (fsOk && !fsOn() && fsWanted() && t.closest('.tab[data-tab=table], .tab[data-tab=duel], .tab[data-tab=pod]')) fsToggle();   // chose Fullscreen once: a table opens in it again (a tap, so the browser allows it)
    if (document.body.classList.contains('tbar-open') && !t.closest('.topbar, #tutorial')) document.body.classList.remove('tbar-open');
  }, true);
  document.querySelectorAll('.fs-btn').forEach(b => { b.hidden = !fsOk; });
  document.addEventListener('fullscreenchange', () => document.querySelectorAll('.fs-btn').forEach(b => b.classList.toggle('on', fsOn())));
  window.__isfFocus = { apply: applyFocus };
  applyFocus();
  // game log: a drawer on phones and tablets
  const logBox = $('.table-log');
  const setLog = open => { logBox.classList.toggle('open', open); $('#tLog').setAttribute('aria-expanded', open); };
  $('#tLog').addEventListener('click', e => { e.stopPropagation(); setLog(!logBox.classList.contains('open')); });
  $('#tLogClose').addEventListener('click', e => { e.stopPropagation(); setLog(false); });
  document.addEventListener('click', e => { if (logBox.classList.contains('open') && !e.target.closest('.table-log')) setLog(false); });

  // ---- touch: long-press and card viewer ----
  const lightbox = $('#lightbox');
  // Card viewer: move between the cards around the one you opened, change printing, and shop for it.
  // Shop links are plain links for now; to earn from them later, add each store's affiliate parameters in AFFILIATE below.
  const enc = encodeURIComponent;
  const AFFILIATE = { tcgplayer: u => u, cardkingdom: u => u, manapool: u => u };
  const slugOf = n => n.toLowerCase().replace(/\s*\/\/.*$/, '').replace(/['’,.:!?"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const SHOPS = [
    ['tcgplayer', 'TCGplayer', (c, p) => p && p.tcg ? `https://www.tcgplayer.com/product/${p.tcg}` : `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${enc(c.name)}`],
    ['cardkingdom', 'Card Kingdom', (c) => `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${enc(c.name)}`],
    ['manapool', 'ManaPool', (c, p) => (p || c.set) && (p ? p.cn : c.cn) ? `https://manapool.com/card/${enc((p ? p.set : c.set))}/${enc(p ? p.cn : c.cn)}/${slugOf(c.name)}` : `https://manapool.com/cards?q=${enc(c.name)}`],
  ];
  const LB_SCOPE = '.table, .vs-seat, .tags-results, .curve-wall, .land-wall, .coverage, .token-wall, .odds-picker, .replay, .hand-grid, .hand-stage';
  const lb = { list: [], i: 0, sel: null, els: [], at: 0 };
  // Choices for the card on show, supplied by whichever table it was opened from: fn(card, element) -> [[label, run, style, stay], ...] or null.
  const lbProviders = [];
  const viewerActions = (card, el) => { for (const f of lbProviders) { const a = el && f(card, el); if (a && a.length) return a; } return null; };
  const printCache = new Map();
  async function fetchPrints(card) {
    if (printCache.has(card.name)) return printCache.get(card.name);
    const get = async q => {
      const r = await fetch(`https://api.scryfall.com/cards/search?q=${enc(q)}&unique=prints&order=released&dir=desc`, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } });
      return r.ok ? r.json() : null;
    };
    let d = null;
    try { d = await get(`!"${card.name}" game:paper`) || await get(`!"${card.name}"`); } catch (e) { d = null; }
    const out = ((d && d.data) || []).map(x => {
      const faces = x.card_faces || [];
      const pick = k => x.image_uris ? [x.image_uris[k]] : faces.map(f => f.image_uris && f.image_uris[k]);
      return { id: x.id, set: x.set, setName: x.set_name, cn: x.collector_number, date: x.released_at, tcg: x.tcgplayer_id, usd: (x.prices && (x.prices.usd || x.prices.usd_foil)) || null, foilOnly: !!(x.prices && !x.prices.usd && x.prices.usd_foil),
        imgs: pick('normal').filter(Boolean), thumb: (pick('small')[0]) || null };
    }).filter(p => p.imgs.length);
    printCache.set(card.name, out);
    return out;
  }
  const isRealCard = c => c && c.id && !String(c.uid).startsWith('t:') && !String(c.uid).startsWith('b:') && !String(c.uid).startsWith('preview:');
  const isToken = c => c && String(c.uid).startsWith('t:') && !!c.name && !c.isFaceDown;
  // T-112: a printing is the user's choice for THEIR deck, wherever its card is shown. Who owns a card on screen: a table (Duel, Pod) says
  // true for the seat played on this device and false for the others; the loaded deck's own cards are the user's; anything else is view-only.
  const printOwners = [], printHooks = [];
  const ownsCard = card => {
    for (const f of printOwners) { const r = f(card); if (r === true || r === false) return r; }
    return isDeckCard(card);
  };
  const LINE_RE = /^\s*(?:(?<qty>\d+)\s*[xX]?\s+)?(?<name>.+?)(?:\s+\((?<set>[A-Za-z0-9]{2,6})\)(?:\s+(?<cn>[A-Za-z0-9\-★]+))?)?(?<tags>(?:\s+\*[^*]+\*|\s+\[[^\]]*\]|\s+#\S+)*)\s*$/;
  // the decklist with the printing written on the card's main-deck and commander lines: "1 Sol Ring (C21) 263"
  function pinInText(text, names, p) {
    const lines = text.split(/\r?\n/); let changed = false;
    const inMain = i => { const a = Source.parseDecklist(lines.slice(0, i + 1).join('\n')), b = Source.parseDecklist(lines.slice(0, i).join('\n')); return a.length > b.length; };
    lines.forEach((ln, i) => {
      const e = Source.parseDecklist(ln)[0]; if (!e || !names.has(nameKey(e.name)) || !inMain(i)) return;
      const m = LINE_RE.exec(ln); if (!m) return;
      const lead = ln.match(/^\s*(?:\d+\s*[xX]?\s+)?/)[0], out = `${lead}${m.groups.name} (${p.set.toUpperCase()}) ${p.cn}${m.groups.tags || ''}`;
      if (out !== ln) { lines[i] = out; changed = true; }
    });
    return changed ? lines.join('\n') : text;
  }
  // The saved deck, the box and the remembered list all take the printing, so a reload (or loading the deck again) brings it back.
  function savePrinting(card, p) {
    const text = S.deckText || $('#deckText').value; if (!text) return;
    const names = new Set([card.name].concat(S.cards.filter(x => x.name === card.name).map(x => x.input_name)).filter(Boolean).map(nameKey));
    const out = pinInText(text, names, p); if (out === text) return;
    const lfn = t => String(t || '').replace(/\r\n/g, '\n'), sel = $('#savedDecks').value, all = getDecks();
    if (sel && all[sel] != null && lfn(all[sel]) === lfn(text)) { const meta = getMeta(); all[sel] = out; meta[sel] = Object.assign({}, meta[sel], { saved: Date.now() }); putDecks(all, meta); }
    S.deckText = out; $('#deckText').value = out; localStorage.setItem('gf_last', out);
  }
  // Every copy of the card the user owns takes the printing's art: the loaded list, the game on the table, the opening hand, and (through
  // printHooks) the games of Duel and Pod. Only pictures and the printing's name change; nothing the engine reads off the card does.
  function retarget(c, p) {
    c.id = p.id; c.set = p.set; c.cn = p.cn; c.images = []; c.remote_images = p.imgs;
    const b = c.a && c.a.backCard; if (b) { b.images = []; b.remote_images = p.imgs.slice(1, 2); }
  }
  // redraw the pictures already on the page, in place (the elements stay, so nothing about the tables moves)
  function refreshArt(p) {
    document.querySelectorAll('.mtg').forEach(e => {
      const c = cardOf(e); if (!c || c.id !== p.id || !isRealCard(c)) return;
      const o = e._o || {}, face = e._face != null ? e._face : (e.classList.contains('flip-back') ? 1 : (o.face || 0)), src = imgFor(c, face), img = e.querySelector(':scope > img');
      if (!src) return;
      if (img) { img.dataset.tried = ''; img.src = src; } else { const fresh = cardEl(c, Object.assign({}, o, { face })); e.replaceChildren(...fresh.childNodes); }
    });
  }
  function applyPrinting(card, p) {
    const same = x => x && x.name === card.name, seen = new Set();
    [card].concat(S.cards || [], S.deck ? S.deck.unique : [], S.game && S.game.deck ? S.game.deck.unique : [], H && H.g && H.g.deck ? H.g.deck.unique : [],
      printHooks.flatMap(f => f(card.name) || [])).filter(same).forEach(c => { if (!seen.has(c)) { seen.add(c); retarget(c, p); } });
    savePrinting(card, p);
    refreshArt(p);
    toast(`Now using the ${p.setName} printing`);
  }
  lbProviders.push((card, el) => { const m = el.closest && el.closest('.table') && el.dataset.iid != null ? ctxModel(el, true) : null; return m ? m.items : null; });
  function lbClose() { lightbox.classList.remove('show'); document.body.classList.remove('modal-open'); }
  function lbGo(d) { if (lb.list.length < 2) return; lb.i = (lb.i + d + lb.list.length) % lb.list.length; lb.sel = null; lb.at = Date.now(); paintLb(); lightbox.scrollTop = 0; }
  function paintLb() {
    const card = lb.list[lb.i]; if (!card) return;
    const sel = lb.sel;
    lightbox.innerHTML = '';
    const wrap = h('div', 'lb-inner');
    const bar = h('div', 'lb-bar');
    bar.appendChild(h('span', 'lb-count', lb.list.length > 1 ? `${lb.i + 1} / ${lb.list.length}` : ''));
    const x = h('button', 'lb-x', '✕ Close'); x.addEventListener('click', lbClose); bar.appendChild(x);
    wrap.appendChild(bar);
    const row = h('div', 'lb-row');
    const nav = (cls, label, d) => { const b = h('button', 'lb-nav ' + cls, label); b.setAttribute('aria-label', d < 0 ? 'Previous card' : 'Next card'); b.disabled = lb.list.length < 2; b.addEventListener('click', () => lbGo(d)); return b; };
    row.appendChild(nav('prev', '‹', -1));
    const faces = h('div', 'lb-faces');
    const shown = sel ? Object.assign({}, card, { images: [], remote_images: sel.imgs }) : card;
    const n = Math.max(1, Math.min(2, (shown.images || []).length || (shown.remote_images || []).length));
    if (lb.faceOf !== card) { lb.faceOf = card; lb.face = 0; }          // another card: start on its front
    if (n === 2) { lb.flip = flipCardEl(shown, { face: lb.face || 0, onFlip: f => { lb.face = f; } }); faces.appendChild(lb.flip); }          // a two-faced card: one face at a time, ⟲ (or F) turns it over
    else { lb.flip = null; faces.appendChild(cardEl(shown, { face: 0 })); }
    let sx = null, sy = null;
    faces.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    faces.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 55 && Math.abs(dy) < 60) lbGo(dx < 0 ? 1 : -1); });
    row.appendChild(faces);
    row.appendChild(nav('next', '›', 1));
    wrap.appendChild(row);
    wrap.appendChild(h('div', 'lb-name', esc(card.name)));
    { const acts = viewerActions(card, lb.els[lb.i]);          // what you can do with it in the game you are playing
      if (acts) {
        const box = h('div', 'lb-acts'); box.appendChild(h('div', 'lb-sec', 'In this game'));
        const btns = h('div', 'lb-acts-row'); box.appendChild(btns);
        acts.forEach(([label, run, style, stay, off]) => {          // off: why it cannot be done now (greyed, with the reason) - T-134
          const b = h('button', (style === 'primary' ? 'primary ' : 'ghost ') + 'lb-act', esc(label) + (off ? `<small class="lb-off">${esc(off)}</small>` : ''));
          if (off) { b.disabled = true; b.title = off; }
          b.addEventListener('click', () => {
            if (Date.now() - lb.at < 350) return;          // T-102/T-134 ghost-tap guard: the tap that opened the viewer cannot press a button in it
            if (stay) { const sc = lightbox.scrollTop; run(); paintLb(); lightbox.scrollTop = sc; }          // tap, counters: the viewer stays and updates
            else { lbClose(); run(); }                                                                         // anything else: close it so the table shows the result
          });
          btns.appendChild(b);
        });
        wrap.appendChild(box); wrap.classList.add('has-acts');
      } }
    { const tg = cardTagChips(card); if (tg) wrap.appendChild(tg); }
    if (lb.list.length > 1) wrap.appendChild(h('div', 'hint lb-tip', 'Swipe the card, or use ‹ › (or the arrow keys), to move between cards'));

    // printings
    const pr = h('div', 'lb-prints'); wrap.appendChild(pr);
    const shop = h('div', 'lb-shop'); wrap.appendChild(shop);
    const paintShop = p => {
      shop.innerHTML = '';
      shop.appendChild(h('div', 'lb-sec', p ? `Buy ${esc(p.setName)} #${esc(p.cn)}` : 'Buy this card'));
      if (p) shop.appendChild(h('div', 'lb-price', p.usd ? `$${esc(p.usd)} <small>TCGplayer market price${p.foilOnly ? ' (foil)' : ''}, via Scryfall</small>` : '<small>No price listed for this printing</small>'));
      const links = h('div', 'lb-links');
      SHOPS.forEach(([key, label, url]) => {
        const a = h('a', 'lb-buy', esc(label) + ' ↗'); a.href = AFFILIATE[key](url(card, p)); a.target = '_blank'; a.rel = 'noopener sponsored'; links.appendChild(a);
      });
      shop.appendChild(links);
    };
    const cur = sel || null;
    paintShop(cur);
    if (isRealCard(card) || isToken(card)) {
      const mine = isRealCard(card) && ownsCard(card);          // yours: one tap switches it everywhere. An opponent's card or a token: a read-only look
      pr.classList.add(mine ? 'mine' : 'view');
      pr.appendChild(h('div', 'lb-sec', mine ? 'Printings <small>tap one to use it in your deck</small>' : 'Printings <small>view only</small>'));
      const strip = h('div', 'lb-strip', '<span class="hint">Loading printings…</span>'); pr.appendChild(strip);
      fetchPrints(card).then(list => {
        if (lb.list[lb.i] !== card) return;
        if (!list.length) { strip.innerHTML = '<span class="hint">Printings are not available right now.</span>'; return; }
        const have = list.findIndex(p => p.set === card.set && String(p.cn) === String(card.cn));
        strip.innerHTML = '';
        list.forEach((p, idx) => {
          const on = sel ? sel.id === p.id : idx === have;
          const b = h('button', 'lb-print' + (on ? ' on' : ''), `<img alt="" loading="lazy" src="${esc(p.thumb || p.imgs[0])}"><span>${esc(p.set.toUpperCase())} · ${esc(p.cn)}</span><small>${p.usd ? '$' + esc(p.usd) : '—'}</small>`);
          b.title = `${p.setName} (${p.date})`;
          b.addEventListener('click', () => {
            if (mine) { if (!on || sel) { applyPrinting(card, p); lb.sel = null; } }          // yours: switch at once (the viewer, the deck and every table follow)
            else lb.sel = idx === have && !sel ? null : p;                                    // not yours: only look
            const sc = lightbox.scrollTop, st = strip.scrollLeft; paintLb(); lightbox.scrollTop = sc; const s2 = lightbox.querySelector('.lb-strip'); if (s2) s2.scrollLeft = st; });
          strip.appendChild(b);
          if (on && sel) paintShop(p);
        });
        if (!sel) paintShop(have >= 0 ? list[have] : null);
        const t = strip.querySelector('.on');          // bring the chosen printing to the middle of the strip, and only the strip: the viewer behind it must not scroll off the card
        if (t) { const sr = strip.getBoundingClientRect(), tr = t.getBoundingClientRect(); strip.scrollLeft += (tr.left + tr.width / 2) - (sr.left + sr.width / 2); strip.scrollTop += (tr.top + tr.height / 2) - (sr.top + sr.height / 2); }
      });
    }
    if (card.a && card.a.coverage && card.a.coverage.length) {
      const cov = h('div', 'lb-cov');
      cov.appendChild(h('div', 'hint', 'How the engine reads this card'));
      card.a.coverage.forEach(x => cov.appendChild(h('div', 'cl ' + x.status, pillHtml(x) + esc(x.text))));
      wrap.appendChild(cov);
    }
    lightbox.appendChild(wrap);
  }
  function showLightbox(card, scopeEl) {
    if (!card) return;
    let list = [card];
    const sc = scopeEl && scopeEl.closest ? scopeEl.closest(LB_SCOPE) : null;
    if (Array.isArray(scopeEl)) { if (scopeEl.indexOf(card) >= 0) list = scopeEl.filter((c, i) => scopeEl.indexOf(c) === i); }   // an explicit list, e.g. a whole graveyard
    else if (sc) {
      const seen = new Set(), l = [];
      sc.querySelectorAll('.mtg').forEach(e => {
        const c = cardOf(e);
        if (!c || e.closest('#lightbox') || seen.has(c)) return;
        seen.add(c); l.push(c);
      });
      if (l.indexOf(card) >= 0) list = l;
    }
    zoom.classList.remove('show');   // the hover preview would sit on top of the viewer
    lb.list = list; lb.i = list.indexOf(card); lb.sel = null; lb.at = Date.now();
    lb.els = list.map(() => null);                                       // the card on the table behind each entry, so its choices can be offered
    if (sc && !Array.isArray(scopeEl)) { const seen = new Set(); sc.querySelectorAll('.mtg').forEach(e => { const c = cardOf(e); if (c && !e.closest('#lightbox') && !seen.has(c)) { seen.add(c); const k = list.indexOf(c); if (k >= 0) lb.els[k] = e; } }); }
    if (scopeEl && scopeEl.nodeType === 1 && lb.i >= 0) lb.els[lb.i] = scopeEl;          // the very one you opened (not the first of a stack)
    paintLb(); lightbox.scrollTop = 0;
    lightbox.classList.add('show'); document.body.classList.add('modal-open');
  }
  lightbox.addEventListener('click', e => { if (e.target === lightbox || e.target.classList.contains('lb-inner')) lbClose(); });
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('show')) return;
    if (e.key === 'Escape') lbClose();
    else if (e.key === 'ArrowRight') lbGo(1);
    else if (e.key === 'ArrowLeft') lbGo(-1);
    else if ((e.key === 'f' || e.key === 'F') && lb.flip) lb.flip.turn();
  });

  let lp = null, suppressClick = false;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const m = e.target.closest('.mtg');
    if (!m || m.closest('#lightbox') || !cardOf(m)) return;
    const me = lp = { m, x: e.clientX, y: e.clientY, fired: false };
    me.t = setTimeout(() => {
      me.fired = true;
      if (navigator.vibrate) navigator.vibrate(15);
      if (m.closest('.table') && m.dataset.iid != null) openCtx(m, me.x, me.y); else showLightbox(cardOf(m), m);
    }, 480);
  });
  document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } });
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => {
    if (!lp) return;
    clearTimeout(lp.t);
    if (lp.fired) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 450); }
    lp = null;
  }));
  document.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest('.mtg') && !canHover) e.preventDefault(); });
  // where a click already means something else (picking cards for the odds, picking a sample hand), the 🔍 in the card's
  // top-right corner opens the viewer instead; runs before the card's own click handler
  const ZOOM_CORNER = '#oddsPicker .mtg, .mini-hand .mtg, .vs-hand .mtg';
  document.addEventListener('click', e => {
    const m = e.target.closest(ZOOM_CORNER); if (!m) return;
    const r = m.getBoundingClientRect(), c = cardOf(m);
    const left = !!m.closest('.mini-hand, .vs-hand');       // these cards overlap from the right, so their 🔍 sits top-left
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;     // a real click on the card, not a scripted one
    const inX = left ? e.clientX <= r.left + 34 : e.clientX >= r.right - 34;
    if (c && inside && inX && e.clientY <= r.top + 34) { e.stopPropagation(); e.preventDefault(); showLightbox(c, m); }
  }, true);
  // right-click any card off the table (PC) opens the viewer
  document.addEventListener('contextmenu', e => {
    const m = e.target.closest('.mtg'); if (!m || m.closest('.table, #lightbox')) return;
    const c = cardOf(m); if (!c) return;
    e.preventDefault(); showLightbox(c, m);
  });
  // clicking or tapping a card anywhere except the table / odds picker opens the viewer (PC and touch alike)
  document.addEventListener('click', e => {
    const m = e.target.closest('.mtg');
    if (!m || m.closest('.table, #oddsPicker, #lightbox, .mini-hand')) return;
    showLightbox(cardOf(m), m);
  });

  // context menu
  const ctx = $('#ctxMenu');
  const ctxBack = h('div', 'ctx-backdrop'); document.body.appendChild(ctxBack);
  // T-102: on a touch device (phone or iPad) a tap only SELECTS a card: it is lifted and glows, an enlarged copy shows above the
  // options sheet, and nothing happens until an option is tapped. iPad and PC keep their own flow.
  const phoneQ = matchMedia('(pointer: coarse)');          // every touch device (phone and iPad); a mouse keeps its own flow
  const isPhoneTouch = () => phoneQ.matches;
  let selEl = null, selPrev = null, selAt = 0;
  function clearSel() { if (selEl) selEl.classList.remove('sel-card'); selEl = null; if (selPrev) { selPrev.remove(); selPrev = null; } ctx.classList.remove('with-sel'); }
  function showSel(m, card) {
    clearSel(); if (!isPhoneTouch() || !card) return;
    selEl = m; m.classList.add('sel-card'); selAt = Date.now();
    selPrev = h('div', 'sel-preview'); selPrev.appendChild(cardEl(card, { face: 0 })); document.body.appendChild(selPrev);
    ctx.classList.add('with-sel');
    const sheet = ctx.offsetHeight, boxH = Math.max(120, innerHeight - sheet - 20);          // the card gets the room above the options, never behind them
    selPrev.style.height = boxH + 'px'; selPrev.style.setProperty('--selw', Math.floor(Math.min(innerWidth * .8, 440, boxH * .7176)) + 'px');
  }
  // select a card and offer options: items are [label, run, style]; used by Duel and Pod
  function selectCard(m, card, items) {
    ctx.innerHTML = ''; ctx.appendChild(h('div', 'ctx-title', esc(card.name)));
    items.forEach(([label, fn, cls]) => { const b = h('button', cls || '', esc(label)); b.addEventListener('click', ev => { ev.stopPropagation(); if (Date.now() - selAt < 350) return; closeCtx(); fn(); }); ctx.appendChild(b); });
    const cancel = h('button', 'ctx-cancel', 'Cancel'); cancel.addEventListener('click', ev => { ev.stopPropagation(); closeCtx(); }); ctx.appendChild(cancel);
    ctxBack.classList.add('show'); ctx.style.display = 'block'; ctx.scrollTop = 0;
    showSel(m, card);
  }
  function closeCtx() { ctx.style.display = 'none'; ctxBack.classList.remove('show'); clearSel(); }
  // tapping anywhere off the menu closes it, and only closes it (the tap does not reach the card underneath)
  ctxBack.addEventListener('click', e => { e.stopPropagation(); closeCtx(); });
  ctxBack.addEventListener('contextmenu', e => { e.preventDefault(); closeCtx(); });
  document.addEventListener('click', closeCtx);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtx(); });
  $('.table').addEventListener('contextmenu', e => {
    const m = e.target.closest('.mtg'); if (!m || !S.game || m.dataset.iid == null) return;
    e.preventDefault();
    openCtx(m, e.clientX, e.clientY);
  });
  // the choices for one card on the Goldfish table (what the menu lists). The card viewer shows the same ones (forViewer leaves out "View card").
  // An item is [label, run, style, stay]: stay = the viewer stays open after it (tap, counters), otherwise it closes so you see what happened.
  function ctxModel(m, forViewer) {
    if (!S.game || m.dataset.iid == null) return null;
    const g = S.game, iid = +m.dataset.iid;
    const zones = { hand: g.hand, battlefield: g.battlefield, graveyard: g.graveyard, exile: g.exile, command: g.command };
    let zone = null, obj = null;
    for (const [z, arr] of Object.entries(zones)) { const f = arr.find(x => x.iid === iid); if (f) { zone = z; obj = f; } }
    if (!obj) return null;
    const inst = zone === 'battlefield' ? obj.inst : obj;
    const items = [];
    const act = fn => () => { snap(); fn(); G.touch(g); render(); };
    const move = (to, top) => act(() => {
      if (zone === 'battlefield') G.removePerm(g, obj); else zones[zone].splice(zones[zone].indexOf(obj), 1);
      if (inst.card.isToken && to !== 'battlefield') { log(`${esc(inst.card.name)} token ceases to exist`); return; }
      if (to === 'library') top ? g.library.unshift(inst) : g.library.push(inst);
      else if (to === 'battlefield') { quiet(yours(x => { const ev = []; G.enterWithTriggers(x, sameInst(x, inst) || (x === g ? inst : { iid: inst.iid, card: inst.card }), {}, ev); return ev; }).then(ev => { describe(ev); sfxEv(ev); render(); })); return; }          // its enter triggers ask (a search, a target)
      else if (inst.card.commander && (to === 'graveyard' || to === 'exile')) { g.command.push(inst); log(`${esc(inst.card.name)} → command zone (tax now +${2 * (g.cmdrCasts[inst.iid] || 0)})`); return; }
      else zones[to].push(inst);
      log(`${esc(inst.card.name)} → ${to}${to === 'library' ? (top ? ' (top)' : ' (bottom)') : ''}`);
    });
    if (zone === 'hand' || zone === 'command') items.push([inst.card.a.isLand ? '▶ Play land' : '▶ Cast', () => playFromHand(inst, false, m), 'primary']);
    if (zone === 'graveyard' && G.yardCastable(g, inst)) items.push(['▶ Cast from your graveyard', () => playFromHand(inst, false, m), 'primary']);          // Zul Ashur let you cast it this turn
    if (zone === 'hand' && inst.card.a.typecycle) items.push([`🔎 ${inst.card.a.typecycle.basic ? 'Basic land' : inst.card.a.typecycle.type === 'land' ? 'Land' : inst.card.a.typecycle.type[0].toUpperCase() + inst.card.a.typecycle.type.slice(1)}cycle (search for a land)`, () => { snap(); quiet(yours(x => G.landcycleCard(x, sameInst(x, inst), [])).then(ev => { if (!ev) { S.undo.pop(); sfx('error'); return toast('Not enough mana to cycle it'); } play(ev); })); }]);
    if (zone === 'hand' && inst.card.a.transmute) items.push([`🔎 Transmute (search for a card with mana value ${inst.card.a.mv || 0})`, () => { snap(); quiet(yours(x => G.transmuteCard(x, sameInst(x, inst), [])).then(ev => { if (!ev) { S.undo.pop(); sfx('error'); return toast('Not enough mana to transmute it'); } play(ev); })); }]);
    if ((zone === 'hand' || zone === 'command') && inst.card.layout === 'modal_dfc' && inst.card.a.backCard && !inst.card.a.isLand && !inst.card.a.backCard.a.isLand && inst.card.a.backCard.mana_cost) {          // a two-faced card: either face, named
      items.push([`▶ Cast the front: ${inst.card.name.split(' // ')[0]}`, () => castFace(inst, 0, m)]);
      items.push([`▶ Cast the back: ${inst.card.a.backCard.name}`, () => castFace(inst, 1, m)]);
    }
    if (zone === 'battlefield' && obj.card.a.isPlaneswalker && !forViewer) items.push(['◆ Loyalty abilities…', () => openLoyalty(obj), 'primary']);          // the planeswalker menu: choose which ability
    if (zone === 'battlefield' && obj.card.a.chainVeil && !forViewer) {          // The Chain Veil: {4}, {T}: each planeswalker may activate one more loyalty ability this turn
      const why = G.chainVeilState(S.game, obj);
      items.push([why ? `◆ The Chain Veil (${why})` : '◆ Activate: {4}, tap: one more loyalty ability for each planeswalker', () => { if (G.chainVeilState(S.game, obj)) { sfx('error'); return toast('The Chain Veil: ' + G.chainVeilState(S.game, obj)); } snap(); quiet(yours(x => G.useChainVeil(x, x.battlefield.find(y => y.iid === obj.iid))).then(ev => { if (!ev) { S.undo.pop(); sfx('error'); return toast('Not enough mana for The Chain Veil'); } play(ev); })); }, why ? '' : 'primary']);
    }
    if (zone === 'battlefield' || zone === 'graveyard' || zone === 'hand' || zone === 'command') G.abilityMenu(g, obj).forEach((ab, i) => items.push([`⚡ ${ab.label}${ab.cost ? ` (${ab.cost})` : ''}${ab.ok ? '' : ` — not now: ${ab.why}`}`, () => useAbilityUI(obj, zone, i, ab), ab.ok ? 'primary' : '']));          // activated abilities: Food, sacrifice outlets, {cost}: effect
    if (zone === 'battlefield') items.push([obj.tapped ? '↺ Untap' : '↻ Tap', act(() => { obj.tapped = !obj.tapped; sfx('tap'); }), 'primary', true]);
    if (!forViewer) items.push(['🔍 View card', () => showLightbox(inst.card, m)]);
    if (zone === 'hand') {
      if (inst.card.a.mdfcLand) items.push(['Play as land (back face)', () => playFromHand(inst, true, m, true)]);
      items.push(['Cast (ignore mana)', () => playFromHand(inst, true, m)]);
      items.push(['Put onto battlefield', move('battlefield')]);
    }
    if (zone === 'battlefield') {
      if (G.isCreaturePerm(obj)) {
        items.push(['💍 The Ring tempts you: make this the Ring-bearer', act(() => {
          const ring = g.ring = Object.assign({ tempts: 0, bearer: null }, g.ring);
          ring.tempts++; ring.bearer = obj.iid;
          const e = { type: 'tempt', n: ring.tempts, level: Math.min(4, ring.tempts), bearer: obj, ability: G.RING_TEXT[Math.min(4, ring.tempts) - 1] };
          describe([e]); sfxEv([e]); ringBanner(e);
        })]);
        items.push(['+1/+1 counter', act(() => { G.addCounters(g, obj, '+1/+1', 1, [], null); }), '', true]);
        items.push(['−1/−1 counter', act(() => { G.addCounters(g, obj, '-1/-1', 1, [], null); }), '', true]);
        items.push([obj.sick ? 'Remove summoning sickness' : 'Give summoning sickness', act(() => { obj.sick = !obj.sick; }), '', true]);
      }
      if (obj.card.a.isPlaneswalker) { items.push(['Loyalty +1', act(() => { obj.loyalty++; }), '', true], ['Loyalty −1', act(() => { obj.loyalty--; }), '', true]); }
      if (obj.card.a.isEquipment || obj.card.a.isAura) items.push(['Attach to best creature', act(() => { const b = g.battlefield.filter(G.isCreaturePerm).sort((x, y) => G.powerOf(g, y) - G.powerOf(g, x))[0]; obj.attachedTo = b ? b.iid : null; })]);
      items.push(['Sacrifice / destroy', move('graveyard')]);
    }
    ['hand', 'graveyard', 'exile'].filter(z => z !== zone && !(zone === 'battlefield' && z === 'graveyard')).forEach(z => items.push(['Move to ' + z, move(z)]));
    if (zone !== 'battlefield' && zone !== 'hand') items.push(['Move to battlefield', move('battlefield')]);
    if (!inst.card.isToken) items.push(['Put on top of library', move('library', true)], ['Put on bottom of library', move('library', false)]);
    return { inst, items };
  }
  function openCtx(m, cx, cy) {
    const model = ctxModel(m, false); if (!model) return;
    const { inst, items } = model;
    ctx.innerHTML = '';
    ctx.appendChild(h('div', 'ctx-title', esc(inst.card.name)));
    items.forEach(([label, fn, cls]) => { const b = h('button', cls || '', label); b.addEventListener('click', ev => { ev.stopPropagation(); if (selEl && Date.now() - selAt < 350) return; closeCtx(); fn(); }); ctx.appendChild(b); });
    const cancel = h('button', 'ctx-cancel', 'Back'); cancel.addEventListener('click', ev => { ev.stopPropagation(); closeCtx(); }); ctx.appendChild(cancel);
    ctxBack.classList.add('show');
    ctx.style.display = 'block'; ctx.scrollTop = 0;
    showSel(m, inst.card);
    ctx.style.left = Math.max(8, Math.min(cx, innerWidth - ctx.offsetWidth - 8)) + 'px'; ctx.style.top = Math.max(8, Math.min(cy, innerHeight - ctx.offsetHeight - 10)) + 'px';
  }

  // ---- rendering: card elements are kept and moved, never rebuilt (rebuilding re-decodes images = flicker) ----
  const elCache = new Map();
  function tableEl(card, iid, face, used) {
    const key = iid + ':' + (face || 0) + ':' + card.uid;                  // card.uid: a transformed permanent gets a new element (its back-face art)
    used.add(key);
    let e = elCache.get(key);
    if (!e) { e = cardEl(card, { iid, face, eager: true }); elCache.set(key, e); }
    return e;
  }
  // The card exiled with a permanent by imprint. Isochron Scepter and Ugin's Labyrinth: the engine keeps it on the permanent.
  // Chrome Mox: the engine only says so in a note, so the note is read here (noteImprints) and remembered per permanent.
  const moxImprint = new WeakMap();
  function noteImprints(g, ev) {
    (ev || []).forEach(e => {
      const m = e && e.type === 'note' && e.source && /^Imprint: exiled (.+) \(Chrome Mox/.exec(e.text || ''); if (!m || !g) return;
      const inst = (g.exile || []).slice().reverse().find(i => i.card.name === m[1]);
      if (inst) moxImprint.set(e.source, inst);
    });
  }
  const imprintOf = p => (p && (p.imprinted || moxImprint.get(p))) || null;
  // its picture on the Goldfish Table: tucked behind the permanent, labelled; a click opens it in the card viewer
  function imprintEl(p, used) {
    const im = imprintOf(p), key = 'imp:' + im.iid + ':' + im.card.uid;
    used.add(key);
    let e = elCache.get(key);
    if (!e) { e = cardEl(im.card, { eager: true }); elCache.set(key, e); }
    clearState(e);
    e.classList.add('imprinted-card'); e.appendChild(h('span', 'tag', 'Imprint')); e.title = `${im.card.name}: imprinted on ${p.card.name}`;
    return e;
  }
  function clearState(e) {
    e.style.marginLeft = ''; e.style.marginRight = '';
    e.querySelectorAll('.pt,.ctr,.tag').forEach(x => x.remove());
    e.classList.remove('tapped', 'token', 'sick', 'castable', 'ringbearer'); e.removeAttribute('title');
  }

  function render(first) {
    const g = S.game; if (!g) return;
    dirty();
    sayChosen();                                               // a permanent that chose a creature type as it entered, however it got there
    const before = new Map();
    $$('.table [data-iid]').forEach(e => before.set(e.dataset.iid, e.getBoundingClientRect()));
    const libRect = $('#zLibrary .card-back').getBoundingClientRect();
    const used = new Set();

    const rows = { zCreatures: [], zOther: [], zLands: [] };
    const walker = p => p.card.a.isPlaneswalker && !G.isCreaturePerm(p) && !p.asLand;          // planeswalkers sit in the creature row, at its far end
    g.battlefield.forEach(p => { rows[p.asLand ? 'zLands' : G.isCreaturePerm(p) || walker(p) ? 'zCreatures' : 'zOther'].push(p); });
    rows.zCreatures.sort((x, y) => (walker(x) ? 1 : 0) - (walker(y) ? 1 : 0));
    for (const [id, list] of Object.entries(rows)) {
      const row = document.getElementById(id);
      const label = row.querySelector('.row-label');
      // stack identical permanents (lands, and tokens in the same state) so big boards stay readable
      const groups = new Map();
      list.forEach(p => {
        const stackable = (id === 'zLands' || p.token) && !imprintOf(p);
        const k = stackable ?p.card.uid + '|' + (p.tapped ? 't' : 'u') + (p.mdfc ? 'm' : '') + '|' + (p.sick ? 's' : '') + '|' + (p.counters || 0) : 'solo' + p.iid;
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
      });
      const nodes = [label];
      let spaced = false;
      for (const ps of groups.values()) {
        const sg = h('div', 'stackgroup');
        if (id === 'zCreatures' && walker(ps[0])) { sg.classList.add('walker'); if (!spaced) { nodes.push(h('span', 'row-spacer')); spaced = true; } }
        if (ps.length === 1 && imprintOf(ps[0])) { sg.classList.add('imprint'); sg.appendChild(imprintEl(ps[0], used)); }
        (ps.length > 4 ? ps.slice(0, 4) : ps).forEach(p => sg.appendChild(permEl(p, used)));   // a big stack shows 4 cards and a count, not 100 images
        if (ps.length > 1) { const sc = h('span', 'stack-count', '×' + ps.length); sc.title = ps.length + ' × ' + ps[0].card.name; sg.appendChild(sc); }          // the pile's size, on the pile: a big stack shows only 4 cards
        nodes.push(sg);
      }
      row.replaceChildren(...nodes);
    }
    const hand = $('#zHand');
    const units = G.allUnits(g);
    hand.replaceChildren(...g.hand.map(i => {
      const e = tableEl(i.card, i.iid, 0, used);
      clearState(e);
      if (!i.card.a.isLand && (G.canPay(G.effectiveCost(g, i), units) || G.canCastBack(g, i))) e.classList.add('castable');          // a two-faced card: either face
      if (i.card.a.isLand && G.canPlayLand(g)) e.classList.add('castable');
      return e;
    }));
    fitRow(hand, 0.14);
    const pile = (sel, arr, cnt) => {
      const c = document.querySelector(sel + ' .pile-cards');
      c.replaceChildren(...arr.map(i => { const e = tableEl(i.card, i.iid, 0, used); clearState(e); return e; }));
      if (cnt) $(cnt).textContent = arr.length;
    };
    pile('#zGrave', g.graveyard, '#cGrave'); pile('#zExile', g.exile, '#cExile'); pile('#zCommand', g.command);
    { const lt = document.querySelector('#zLibrary .lib-top'), view = G.topCardView(g), top = g.library[0];          // Mystic Forge and the like: the top card is shown face up, kept up to date
      if (lt) { if (view && top) { const e = tableEl(top.card, top.iid, 0, used); clearState(e); lt.replaceChildren(h('div', 'pile-label', view === 'all' ? 'Top card (revealed)' : 'Top card'), e); lt.hidden = false; } else { lt.hidden = true; lt.replaceChildren(); } } }
    for (const k of Array.from(elCache.keys())) if (!used.has(k)) elCache.delete(k);

    $('#cLibrary').textContent = g.library.length;
    stepP(S.step || null);
    $('#hTurn').textContent = g.turn;
    $('#hLife').textContent = Math.max(0, g.opts.oppLife - g.damage);
    $('#hMyLife').textContent = g.life;
    renderRing(g);
    $('#hSpent').textContent = g.manaSpent + (g.spentThisTurn || 0);
    const cd = Object.values(g.cmdrDamage || {});
    $('#hCmdr').textContent = cd.length ? Math.max(...cd) + ' / 21' : '0 / 21';
    { const ps = $('#hPoison'); if (ps) { ps.textContent = (g.poisonDealt || 0) + ' / 10'; ps.classList.toggle('hot', (g.poisonDealt || 0) >= 8); ps.title = 'Poison counters on the opponent (10 loses the game)'; } }          // the engine counts them on the opponent: the goldfish table has no attacker of its own
    $('#hPower').textContent = g.battlefield.reduce((s, p) => s + Math.max(0, G.powerOf(g, p)), 0);
    { const chip = $('#tDmg');                                       // what "Next turn" attacks for: the autopilot's attackers, from the engine's numbers
      const sum = chip && attackSum(g, G.chooseAttackers(g, g.battlefield.filter(p => G.canAttack(g, p))), null);
      if (chip) { chip.hidden = !sum || (!sum.dmg && !sum.poison); if (!chip.hidden) { chip.classList.toggle('lethal', sum.isLethal); chip.innerHTML = '⚔ ' + sum.dmg + (sum.poison ? ' +' + sum.poison + ' poison' : '') + (sum.cmdr.length ? ' · ' + esc(sum.cmdr[0].name) + ' ' + sum.cmdr[0].after + '/21' : '') + (sum.isLethal ? ' <b class="vs-lethal">LETHAL</b>' : ''); chip.title = 'Next turn attacks for ' + sum.dmg + (sum.poison ? ' and ' + sum.poison + ' poison' : '') + ' (the engine\'s own numbers: power with anthems and pumps, double strike twice)'; } } }
    const mp = $('#hMana'); mp.innerHTML = '';
    // one pip per kind of mana with how many: "4× W 1× U". A source of several colors is its own kind (shown as a gold pip, its colors on hover)
    const kinds = new Map();
    const inf = g.infMana && g.infMana.turn === g.turn ? g.infMana : null;          // T-061: an infinite-mana combo was taken: ∞ in place of the numbers, for the colours it makes
    if (inf) inf.colors.slice().sort((x, y) => 'WUBRGC'.indexOf(x) - 'WUBRGC'.indexOf(y)).forEach(c => { const g2 = h('span', 'mana-kind inf', '<b class="inf-sym">∞</b>'); g2.title = 'infinite mana' + (inf.how ? ': ' + inf.how : ''); const pip = h('span', 'pip ' + c, c); g2.appendChild(pip); mp.appendChild(g2); });
    (inf ? [] : units).forEach(u => { const cs = [...u.colors].sort((x, y) => 'WUBRGC'.indexOf(x) - 'WUBRGC'.indexOf(y)), key = cs.join('') + (u.floating ? '*' : ''); const k = kinds.get(key) || { cs, floating: !!u.floating, n: 0 }; k.n++; kinds.set(key, k); });
    [...kinds.values()].sort((x, y) => 'WUBRGC'.indexOf(x.cs[0]) - 'WUBRGC'.indexOf(y.cs[0]) || x.cs.length - y.cs.length).forEach(k => {
      const multi = k.cs.length > 1, cls = multi ? 'M' : k.cs[0];
      const g2 = h('span', 'mana-kind', `<b>${k.n}×</b>`); const pip = h('span', 'pip ' + cls + (k.floating ? ' floating' : ''), multi ? '' : cls);
      if (multi) pip.title = k.cs.join(' or '); if (k.floating) g2.title = 'floating (made this step)';
      g2.appendChild(pip); mp.appendChild(g2);
    });
    if (!units.length && !inf) mp.innerHTML = '<span class="hint">none</span>';
    { const fl = G.floatingLoss(g);          // T-099: floating mana is shown, and the warning says what the end of the turn empties
      if (fl.n && !inf) { const w = h('span', 'mana-warn', `⚠ ${fl.n} floating`); w.title = `${fl.n} mana ${fl.n === 1 ? 'is' : 'are'} floating and will be lost at ${fl.when}. Spend ${fl.n === 1 ? 'it' : 'them'} on a spell or ability first.`; w.setAttribute('role', 'status'); mp.appendChild(w); } }

    if (first) return;
    const dur = ($('#tFast').checked ? 200 : 420) * slow();
    $$('.table [data-iid]').forEach(e => {
      const r = e.getBoundingClientRect();
      const old = before.get(e.dataset.iid);
      const from = old || libRect;
      const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const sc = from.width / Math.max(1, r.width);
      if (!old && S.game.battlefield.some(p => String(p.iid) === e.dataset.iid && p.token)) {
        e.animate([{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: dur, easing: 'ease-out' }); return;
      }
      e.animate([{ translate: `${dx}px ${dy}px`, scale: String(old ? sc : 0.85), opacity: old ? 1 : 0.5 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  // The Ring panel: how many times it has tempted you, who carries it, and which of its four abilities you have unlocked
  function renderRing(g) {
    const ring = g.ring || { tempts: 0, bearer: null }, rb = G.ringBearer(g);
    const hr = $('#hRing'), panel = $('#ringPanel');
    hr.textContent = ring.tempts ? `💍 ${ring.tempts}×${rb ? ' · ' + rb.card.name.split(',')[0] : ''}` : '—';
    if (!ring.tempts) { panel.hidden = true; return; }
    panel.hidden = false;
    const level = Math.min(4, ring.tempts);
    panel.innerHTML = `<div class="rp-head"><b>💍 The Ring</b> tempted you ${ring.tempts} time${ring.tempts === 1 ? '' : 's'}<br>` +
      `<span class="hint">Ring-bearer: <b>${rb ? esc(rb.card.name) : 'none (no creature)'}</b></span></div>` +
      '<ol>' + G.RING_TEXT.map((t, i) => `<li class="${i < level ? 'on' : 'off'}">${esc(t)}</li>`).join('') + '</ol>';
  }
  function permEl(p, used) {
    const g = S.game;
    const e = tableEl(p.card, p.iid, p.mdfc ? 1 : 0, used);
    clearState(e);
    e.classList.toggle('tapped', !!p.tapped);
    e.classList.toggle('token', !!p.token);
    if (G.isCreaturePerm(p)) {
      if (p.sick && !G.hasKw(g, p, 'haste')) e.classList.add('sick');
      const pw = G.powerOf(g, p), tg = G.toughnessOf(g, p);
      const buffed = pw !== p.card.a.power || tg !== p.card.a.toughness;
      e.appendChild(h('span', 'pt' + (buffed ? ' buffed' : ''), `${pw}/${tg}`));
      if (p.counters) e.appendChild(h('span', 'ctr' + (p.counters < 0 ? ' neg' : ''), (p.counters > 0 ? '+' : '') + p.counters));
      if (g.ring && g.ring.bearer === p.iid && g.ring.tempts > 0) { e.classList.add('ringbearer'); e.title = 'Ring-bearer'; }
    }
    // other kinds of counters (indestructible, shield...) as small labelled badges
    Object.keys(p.other || {}).forEach((k, i) => e.appendChild(h('span', 'ctr kind', `${esc(k)} ×${p.other[k]}`)).style.top = (44 + i * 18) + 'px');
    if (p.card.a.isPlaneswalker) e.appendChild(h('span', 'pt loyalty', '◆ ' + p.loyalty));
    if (p.card.a.isPlaneswalker && !S.busy && G.loyaltyState(g, p).list.some(it => it.ok)) { e.classList.add('castable'); e.title = 'Loyalty abilities: click for the menu'; }          // one of its loyalty abilities can be used now
    if (p.attachedTo != null) { const t = g.battlefield.find(q => q.iid === p.attachedTo); if (t) e.appendChild(h('span', 'tag', '→ ' + esc(t.card.name.split(',')[0]))); }
    { const ch = G.chosenOf(g, p); if (ch) { const tg = e.appendChild(h('span', 'tag chosen', esc(ch.name))); tg.title = `The chosen ${ch.what}: ${ch.name}`; } }          // Metallic Mimic, Cavern of Souls: the type it chose, on the card
    return e;
  }

  // ======================= several workers for one run (T-064) =======================
  // ParWorker looks like a Worker (postMessage, onmessage, addEventListener, terminate) but plays a goldfish run, a mirror match or a pod run as many
  // small slices ({ part: { from, to } }) on several workers, then has one worker merge them in game order: the same seeds and the same merge as one
  // worker, so the numbers are identical, in a fraction of the time. Anything else (the lab, tune, A/B) goes to one plain worker.
  // Finished workers are kept for the next run (their scripts are parsed and their code is warm, and a Tune worker keeps its own sub-workers); a worker that
  // failed, or is still busy when a run is stopped, is terminated instead. Kept workers are let go after 5 minutes.
  const parIdle = [];
  const getWorker = () => { const w = parIdle.pop(); if (w) { clearTimeout(w.free); return w; } return new Worker('worker.js'); };
  function keepWorkers(list) {
    for (const w of list) {
      w.onmessage = w.onerror = w.onmessageerror = null; w.cur = null; w.idle = false; w.merging = false; clearTimeout(w.dog);
      if (parIdle.length >= 8) { w.terminate(); continue; }
      parIdle.push(w); w.free = setTimeout(() => { const i = parIdle.indexOf(w); if (i >= 0) parIdle.splice(i, 1); w.terminate(); }, 300000);
    }
  }
  function ParWorker() {
    const L = { message: [], error: [] }, ws = [], me = { onmessage: null, onerror: null };
    const emit = (t, data) => { const ev = t === 'message' ? { data } : data; for (const f of L[t].slice()) f(ev); const h = me['on' + t]; if (h) h(ev); };
    me.addEventListener = (t, f) => { if (L[t]) L[t].push(f); };
    me.removeEventListener = (t, f) => { if (L[t]) L[t] = L[t].filter(x => x !== f); };
    me.terminate = () => { ws.forEach(w => w.terminate()); ws.length = 0; };
    const plain = msg => {
      const w = getWorker(); ws.push(w);
      w.onmessage = e => { if (e.data && e.data.result) { ws.splice(ws.indexOf(w), 1); keepWorkers([w]); } emit('message', e.data); };
      w.onerror = err => { const i = ws.indexOf(w); if (i >= 0) ws.splice(i, 1); w.terminate(); emit('error', err); };
      w.postMessage(msg);
    };
    me.postMessage = msg => {
      const kind = msg.pod ? 'pod' : msg.match ? 'match' : msg.learn ? 'learn' : (msg.cards && !msg.learn && !msg.tune && !msg.nextBracket && !msg.diagnose && !msg.ab) ? 'sim' : null;
      const o = msg.opts || {}, tribe = (o.policy && o.policy.tribe) || (o.policyB && o.policyB.tribe);
      const K = Math.min(8, Math.max(1, navigator.hardwareConcurrency || 2));
      if (!kind || K < 2 || msg.n < 120 || (kind === 'match' && tribe) || (kind === 'learn' && msg.n < 200) || window.__noPar) return plain(msg);
      const unit = 12, size = Math.max(unit, Math.ceil(msg.n / (K * 6) / unit) * unit);          // slices start on a multiple of 12, so seats and who plays first match a single run
      const queue = []; for (let f = 0; f < msg.n; f += size) queue.push({ from: f, to: Math.min(msg.n, f + size) });
      const done = [], fr = new Map(), live = new Set(); let dead = false, spare = 3, merging = false, mergeTries = 0;
      const report = () => { let g = done.reduce((t, x) => t + (x.to - x.from), 0); for (const [c, p] of fr) g += (c.to - c.from) * p; emit('message', { progress: Math.min(0.99, g / msg.n) }); };
      // A worker that errors, dies or goes quiet (no message for window.__parWatchdogMs, 2 minutes) does not stall the run: its slice goes back in the queue, an idle worker
      // or a replacement (up to 3 per run) plays it, and the numbers are the same whoever plays a slice. If nothing is left to play it, the run ends with an error.
      const dogMs = () => window.__parWatchdogMs || 120000;
      const arm = w => { clearTimeout(w.dog); w.dog = setTimeout(() => lose(w), dogMs()); };
      const fail = text => { if (dead) return; dead = true; me.terminate(); emit('error', { message: text }); };
      const maybeMerge = () => { if (!merging && !dead && !queue.length && [...live].every(w => w.idle)) merge(); };
      const next = w => {
        if (dead) return;
        const c = queue.shift();
        if (!c) { w.idle = true; clearTimeout(w.dog); maybeMerge(); return; }
        w.idle = false; w.cur = c; fr.set(c, 0); arm(w); w.postMessage(Object.assign({}, msg, { part: c }));
      };
      const merge = () => {
        const m = [...live][0]; if (!m) return fail('The workers stopped answering');
        merging = true; m.merging = true; m.idle = false; arm(m);
        m.postMessage({ merge: { kind, parts: done, cardsA: msg.match && msg.match.cardsA, tokensA: msg.match && msg.match.tokensA, candidates: msg.learn && msg.learn.candidates, mode: msg.learn && msg.learn.mode }, opts: o });
      };
      const lose = w => {
        if (!live.delete(w)) return;
        clearTimeout(w.dog); w.terminate(); const at = ws.indexOf(w); if (at >= 0) ws.splice(at, 1);
        if (dead) return;
        if (w.merging) { merging = false; if (++mergeTries > 1) return fail('The workers stopped answering'); if (spare-- > 0) { const nw = start(); nw.idle = true; merge(); } else fail('The workers stopped answering'); return; }
        const c = w.cur; w.cur = null;
        if (c) { fr.delete(c); queue.unshift(c); }
        const iw = c && [...live].find(x => x.idle);
        if (iw) next(iw);
        else if (spare-- > 0) next(start());
        else if (!live.size) fail('The workers stopped answering');
        else maybeMerge();
      };
      function start() {
        const w = getWorker(); ws.push(w); live.add(w);
        w.onmessage = e => {
          if (dead || !live.has(w)) return;
          if (e.data.part) { fr.delete(w.cur); w.cur = null; done.push(e.data.part); report(); next(w); }
          else if (e.data.progress != null && w.cur) { fr.set(w.cur, e.data.progress); report(); arm(w); }
          else if (e.data.result && w.merging) { clearTimeout(w.dog); const all = [...live]; live.clear(); ws.length = 0; keepWorkers(all); emit('message', e.data); }
        };
        w.onerror = () => lose(w); w.onmessageerror = () => lose(w);
        return w;
      }
      for (let k = 0; k < K; k++) next(start());
    };
    return me;
  }
  window.ParWorker = ParWorker;

  // ======================= simulation =======================
  $('#runSim').addEventListener('click', runSim);
  let worker = null;
  function runSim() {
    if (!need()) return;
    if (worker) worker.terminate();
    const o = opts();
    worker = ParWorker();
    if (window.Battle) Battle.watch(worker, '#simProgress', 'dummy');
    const bar = $('#simProgress div'); bar.style.width = '0';
    $('#runSim').disabled = true; $('#simInfo').textContent = `Goldfishing ${o.n.toLocaleString()} games…`;
    const t0 = performance.now();
    worker.onmessage = e => {
      if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(1) + '%';
      if (e.data.result) {
        bar.style.width = '100%'; $('#runSim').disabled = false;
        S.sim = e.data.result; S.simOpts = o; fillTune();
        $('#simInfo').textContent = `${o.n.toLocaleString()} games × ${o.turns} turns in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
        renderSim();
        renderComboRaise({ simDone: true });          // a cut you did not choose yourself now comes from this run
      }
    };
    worker.onerror = err => { $('#runSim').disabled = false; $('#simInfo').textContent = 'Simulation error: ' + err.message; };
    worker.postMessage({ cards: S.cards, tokens: S.tokens, opts: o, n: o.n, seed: rseed() });
  }


  // ======================= mirror match =======================
  const mmCache = new Map();
  function fillMirror() {
    const sel = $('#mmOpp'), cur = sel.value, names = Object.keys(getDecks()).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">This deck (mirror)</option>' + builtinOptions() +
      (names.length ? `<optgroup label="Saved in this browser">${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  }
  function markCommander(cards) {
    const total = cards.reduce((s, c) => s + c.qty, 0);
    if (!cards.some(c => c.commander) && total === 100) { const cand = cards.find(c => /Legendary/.test(c.type_line) && /Creature/.test(c.type_line) && c.qty === 1); if (cand) cand.commander = true; }
    return cards;
  }
  async function mirrorOpponent() { return loadOpponent($('#mmOpp').value, $('#mmInfo')); }
  // a built-in ("builtin:file") or saved deck as an opponent, with its learned choices; '' is your own deck (the mirror)
  async function loadOpponent(value, info) {
    const b = builtinByValue(value), name = b ? b.name : value;
    if (!value) return { cards: S.cards, tokens: S.tokens, name: 'Your deck (mirror)', policy: currentPolicy() };
    if (!mmCache.has(value)) {
      info.textContent = `Loading "${name}"…`;
      await Source.init();
      const text = b ? await builtinText(b) : (getDecks()[value] || '');
      const r = await Source.loadDeck(text, m => { info.textContent = m; });
      mmCache.set(value, { cards: markCommander(r.cards), tokens: r.tokens || [] });
    }
    return Object.assign({ name, policy: (b && b.policy) || {} }, mmCache.get(value));
  }
  let mmWorker = null, mmState = null;
  async function runMirror() {
    if (!need()) return;
    const btn = $('#mmRun'); btn.disabled = true;
    let opp;
    try { opp = await mirrorOpponent(); } catch (err) { $('#mmInfo').textContent = 'Could not load the opponent deck: ' + (err.message || err); btn.disabled = false; return; }
    if (!opp.cards.length) { $('#mmInfo').textContent = 'That deck has no cards.'; btn.disabled = false; return; }
    const o = Object.assign(opts(), { turns: Math.max(5, Math.min(40, +$('#mmT').value || 20)) });
    o.policyB = opp.policy || {};                                                          // the opponent plays with its own learned choices
    const n = Math.max(20, Math.min(20000, +$('#mmN').value || 2000));          // 2,000: any percentage within about ±2 points (95%)
    if (mmWorker) mmWorker.terminate();
    mmWorker = ParWorker();
    if (window.Battle) Battle.watch(mmWorker, '#mmProgress', 'rival');
    const bar = $('#mmProgress div'); bar.style.width = '0';
    const t0 = performance.now();
    $('#mmInfo').textContent = `Playing ${n.toLocaleString()} matches…`;
    mmWorker.onmessage = e => {
      if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(1) + '%';
      if (e.data.result) {
        bar.style.width = '100%'; btn.disabled = false;
        mmState = { res: e.data.result, opp, o };
        $('#mmInfo').textContent = `${n.toLocaleString()} matches in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
        renderMirror();
      }
    };
    mmWorker.onerror = err => { btn.disabled = false; $('#mmInfo').textContent = 'Mirror match error: ' + err.message; };
    mmWorker.postMessage({ match: { cardsA: S.cards, tokensA: S.tokens, cardsB: opp.cards, tokensB: opp.tokens }, opts: o, n, seed: rseed() });
  }
  function renderMirror() {
    const { res, opp, o } = mmState;
    const decided = res.winA + res.winB, N = Math.max(1, res.n - res.errors);
    const pa = res.winA / N, pb = res.winB / N, ci = 1.96 * Math.sqrt(Math.max(0.0001, pa * (1 - pa)) / N) * 100;
    const nameA = res.nameA ? res.nameA.split(',')[0] : 'Your deck', nameB = opp.name === 'Your deck (mirror)' ? (res.nameB ? res.nameB.split(',')[0] + ' (copy)' : 'Copy of your deck') : opp.name;
    $('#mmTiles').innerHTML = [
      tile(`${esc(nameA)} wins`, (pa * 100).toFixed(1) + '%', `±${ci.toFixed(1)} points (95% range)`),
      tile(`${esc(nameB)} wins`, (pb * 100).toFixed(1) + '%', ''),
      tile('Average length', res.avgTurn.toFixed(1), 'rounds (one turn each)'),
      tile('Won on the play', decided ? (res.playWins / decided * 100).toFixed(0) + '%' : '—', `${decided ? (res.drawWins / decided * 100).toFixed(0) : '—'}% on the draw`),
      tile('Won by', decided ? ((res.reasons.life / decided) * 100).toFixed(0) + '% life' : '—', `${decided ? ((res.reasons.commander / decided) * 100).toFixed(0) : 0}% commander damage`),
      tile('No winner', (res.none / N * 100).toFixed(1) + '%', `in ${res.turns} rounds`),
    ].join('');
    const T = res.turns, maxv = Math.max(1, ...res.histA.slice(1, T + 1), ...res.histB.slice(1, T + 1));
    let rows = `<div class="legend"><span style="color:var(--ice)">■</span> ${esc(nameA)} &nbsp; <span style="color:#f7cf6f">■</span> ${esc(nameB)} &nbsp; · turn on which the winner finished the game</div>`;
    for (let t = 1; t <= T; t++) rows += `<div class="t">T${t}</div><div class="b"><i class="a" style="width:${(res.histA[t] / maxv * 100).toFixed(1)}%"></i><i class="b" style="width:${(res.histB[t] / maxv * 100).toFixed(1)}%"></i></div>`;
    $('#mmBars').innerHTML = rows;
    const sb = $('#mmSamples'); sb.innerHTML = '';
    [['quick', '⚡ A quick game'], ['median', '🎲 A typical game'], ['long', '🐌 A long game']].forEach(([k, label]) => {
      const smp = res.samples[k]; if (!smp) return;
      const b = h('button', 'ghost', label); b.addEventListener('click', () => showMirrorLog(smp)); sb.appendChild(b);
    });
    renderImpact(res.impact, nameB);
    renderOutliers(res.impact && res.impact.outliers, nameB);
    renderPairs(res.impact && res.impact.pairs, nameB, res.impact && res.impact.n);
    renderTagImpact(res.impact && res.impact.tags, nameB, res.impact && res.impact.n);
    $('#mmLog').innerHTML = '';
    if (res.errors) $('#mmInfo').textContent += ` · ${res.errors} games hit an error`;
  }
  // which of your cards are linked to winning this matchup (Suggest.matchImpact, run in the worker)
  function renderImpact(imp, oppName) {
    const box = $('#mmImpact');
    if (!imp || typeof Suggest === 'undefined') { box.hidden = true; return; }
    const hl = Suggest.impactHighlights(imp);
    const pts = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + ' points';
    const row = r => `<li><b>${esc(r.name)}</b>: ${pts(r.gap)} <span class="hint">(won ${pct(r.wrDrawn)} of the ${r.games} games it was drawn, ${pct(r.wrNot)} of the rest)</span></li>`;
    let html = `<h3>Cards linked to winning against ${esc(oppName)}</h3><p class="hint">For each card, your win rate when you drew it compared with when you didn't. Drawing an average card goes with winning ${Math.abs((imp.avgGap || 0) * 100).toFixed(1)} points ${(imp.avgGap || 0) >= 0 ? 'more' : 'less'} often (games where you see more cards play out differently), so each card is measured against that. Only gaps clearly bigger than chance are listed. "Linked to" is not proof: a card can also look weak because the autopilot plays it badly.</p>`;
    if (hl.best.length) html += `<div class="sg good"><b>Linked to winning</b><ul>${hl.best.map(row).join('')}</ul></div>`;
    if (hl.worst.length) html += `<div class="sg warn"><b>Linked to losing</b><p>Worth a closer look: try the deck without them, or check how the autopilot plays them.</p><ul>${hl.worst.map(row).join('')}</ul></div>`;
    if (!hl.best.length && !hl.worst.length) html += `<div class="sg"><b>No card stands out yet</b><p>After ${imp.n.toLocaleString()} matches no card's gap is clearly bigger than chance. More matches (1,000–3,000) can show smaller effects.</p></div>`;
    box.innerHTML = html; box.hidden = false; tidy(box);
  }
  // what your fastest wins and fastest losses have in common (Suggest.matchOutliers, run in the worker)
  function renderOutliers(out, oppName) {
    const box = $('#mmOutliers');
    if (!out || (!out.quickWins && !out.quickLosses)) { box.hidden = true; return; }
    const early = `in your opening hand or drawn by turn ${out.early}`;
    const cardLi = x => `<li><b>${esc(x.name)}</b>: ${pct(x.group)} of these games, ${pct(x.rest)} of the others</li>`;
    const group = (g, title, moreLbl, lessLbl, cls) => {
      if (!g) return '';
      const notes = [];
      if (Math.abs(g.lands.z) >= 2) notes.push(`<li>Opening hands had <b>${g.lands.group.toFixed(1)} lands</b> on average, ${g.lands.rest.toFixed(1)} in the others</li>`);
      if (Math.abs(g.mulls.z) >= 2) notes.push(`<li>You mulliganed in <b>${pct(g.mulls.group)}</b> of these games, ${pct(g.mulls.rest)} of the others</li>`);
      let body = '';
      if (g.more.length) body += `<p>${moreLbl}</p><ul>${g.more.map(cardLi).join('')}</ul>`;
      if (g.less.length) body += `<p>${lessLbl}</p><ul>${g.less.map(cardLi).join('')}</ul>`;
      if (notes.length) body += `<p>Opening hands</p><ul>${notes.join('')}</ul>`;
      if (!body) body = '<p>Nothing stands out clearly from the other games yet. More matches can show smaller patterns.</p>';
      return `<div class="sg ${cls}"><b>${title} (${g.games} games, over by turn ${g.maxTurn})</b>${body}</div>`;
    };
    box.innerHTML = `<h3>Outlier games against ${esc(oppName)}</h3><p class="hint">Your fastest 20% of wins and fastest 20% of losses, compared with every other game. "Had early" means ${early}. Only clear differences are listed; with this many cards a single surprising line can still be chance.</p>` +
      group(out.quickWins, 'Your fastest wins', 'Cards you had early much more often:', 'Cards you rarely had early:', 'good') +
      group(out.quickLosses, 'Your fastest losses', 'Cards you had early more often (they may not help here):', 'Cards you were missing early:', 'warn');
    box.hidden = false; tidy(box);
  }
  // pairs of your cards that do much better, or much worse, together than apart (Suggest.matchPairs, run in the worker)
  function renderPairs(pr, oppName, n) {
    const box = $('#mmPairs');
    if (!pr) { box.hidden = true; return; }
    const pts = v => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + ' points';
    const li = x => `<li><b>${esc(x.a)}</b> + <b>${esc(x.b)}</b>: ${pts(x.synergy)} <span class="hint">(won ${pct(x.wrBoth)} of the ${x.games} games with both, ${pct(x.wrA)} with only the first, ${pct(x.wrB)} with only the second, ${pct(x.wrNeither)} with neither)</span></li>`;
    let html = `<h3>Pairs against ${esc(oppName)}</h3><p class="hint">For every pair of your cards (${pr.tested.toLocaleString()} pairs), how much better or worse you do when you draw both than the two cards would do on their own, compared within games of similar length. So many pairs are tested that only very clear results are listed, and the list can change from run to run: a pair that shows up again when you rerun is the one to trust.</p>`;
    if (pr.best.length) html += `<div class="sg good"><b>Better together</b><ul>${pr.best.map(li).join('')}</ul></div>`;
    if (pr.worst.length) html += `<div class="sg warn"><b>Worse together</b><p>These may compete for the same job, or one may get in the other's way.</p><ul>${pr.worst.map(li).join('')}</ul></div>`;
    if (!pr.best.length && !pr.worst.length) html += `<div class="sg"><b>No pair stands out yet</b><p>After ${(n || 0).toLocaleString()} matches no pair is clearly better or worse together. Pairs need many games: try 3,000 matches.</p></div>`;
    else if ((n || 0) < 2000) html += `<p class="hint">With ${(n || 0).toLocaleString()} matches only the strongest pairs show up; 3,000 matches find more.</p>`;
    box.innerHTML = html; box.hidden = false; tidy(box);
  }
  // tags linked to winning or losing this matchup (Suggest.matchTags, run in the worker)
  function renderTagImpact(tr, oppName, n) {
    const box = $('#mmTags');
    if (!tr) { box.hidden = true; return; }
    const pts = v => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + ' points';
    const li = x => `<li><b>${esc(x.tag)}</b>: ${pts(x.gap)} <span class="hint">(${x.cards} card${x.cards === 1 ? '' : 's'}; won ${pct(x.wrHad)} of the ${x.games} games where you had one by turn ${tr.early}, ${pct(x.wrNot)} of the rest)</span></li>`;
    let html = `<h3>Tags against ${esc(oppName)}</h3><p class="hint">For each of the ${tr.tested} tags that have enough games, your win rate when you had a card with that tag early (in your opening hand or drawn by turn ${tr.early}) compared with when you didn't. Tags overlap, so related ones move together: look at the top few. "Goes with" is not "causes": a card type can look weak because the autopilot plays it badly, or because holding it early means a slower start.</p>`;
    if (tr.best.length) html += `<div class="sg good"><b>Having these early goes with winning</b><ul>${tr.best.map(li).join('')}</ul></div>`;
    if (tr.worst.length) html += `<div class="sg warn"><b>Having these early goes with losing</b><ul>${tr.worst.map(li).join('')}</ul></div>`;
    if (!tr.best.length && !tr.worst.length) html += `<div class="sg"><b>No tag stands out yet</b><p>After ${(n || 0).toLocaleString()} matches no tag is clearly better or worse to have early. More matches can show smaller effects.</p></div>`;
    box.innerHTML = html; box.hidden = false; tidy(box);
  }
  function showMirrorLog(smp) {
    const { opp, o } = mmState;
    const L = G.matchLog(S.cards, S.tokens, opp.cards, opp.tokens, o, smp.seed, smp.aOnPlay);
    const box = $('#mmLog'); box.innerHTML = '';
    box.appendChild(h('div', 'hint', `Seed ${smp.seed}: ${smp.aOnPlay ? 'you' : 'the opponent'} went first. ` + (L.winner == null ? 'No winner.' : `${L.winner === 0 ? 'You win' : 'The opponent wins'} on turn ${L.turn} (${L.reason === 'commander' ? '21 commander damage' : 'life'}). Final life ${L.lifeA} – ${L.lifeB}.`)));
    L.lines.forEach(l => {
      const row = h('div', 'mmlog ' + (l.who === 'A' ? 'a' : 'b'));
      row.innerHTML = `<div><b>${l.who === 'A' ? 'You' : 'Opp'}</b> T${l.turn}</div><div>${l.life[0]} – ${l.life[1]}<small>life</small></div><div>${esc(l.board)}<small>${esc(l.text.join('; ')) || '—'}</small></div>`;
      box.appendChild(row);
    });
  }
  $('#mmRun').addEventListener('click', runMirror);

  // ======================= policy lab (learning by trial and error) =======================
  // The creature type that "choose a creature type" cards name (Kindred Discovery, Cavern of Souls, banners, Herald's Horn...). The options are
  // the deck's detected tribe first (the baseline), then the next best types, so the lab can show whether another type plays better.
  function tribeOptions() {
    const info = S.deck && S.deck.tribeInfo, ranked = (info && info.ranked) || [];
    const detected = info && info.chosen;
    const opts = [{ name: detected ? `Detected: ${detected}` : 'None detected (no type chosen)', value: 'auto' }];
    ranked.filter(r => r.type !== detected).slice(0, 4).forEach(r => opts.push({ name: r.type, value: r.type }));
    return opts;
  }
  // The lab's choices come from the engine (LAB_CHOICES in sim.js). They describe what cards do, not card names, and only the ones
  // this deck can use are offered: each needs at least one card that works that way (a sacrifice outlet, a counterspell...).
  const DECISIONS = {};
  G.LAB_CHOICES.forEach(c => { DECISIONS[c.id] = Object.assign({}, c, { options: c.options.slice() }); });
  let labApplies = [];
  // Two-faced cards (Simulation tab): the face each one is goldfished for, saved with the deck's other choices (policy.faces)
  function renderFaces() {
    const box = $('#faceBox'), list = $('#faceList'); if (!box || !list) return;
    const cards = S.deck && G.faceCards ? G.faceCards(S.deck) : [];
    box.hidden = !cards.length; if (!cards.length) { list.innerHTML = ''; return; }
    const set = currentPolicy().faces || {}, half = (s, i) => String(s || '').split(' // ')[i] || '';
    list.innerHTML = '';
    cards.forEach(c => {
      const row = h('div', 'face-row'), pics = h('div', 'face-pics');
      const v = set[c.name] || (c.commander && currentPolicy().mdfcFace === 'back' ? 'back' : 'auto');
      const fl = flipCardEl(c, { face: v === 'back' ? 1 : 0 }); pics.appendChild(fl); row.flip = fl;          // one card; ⟲ turns it over, and picking a face turns it to that face
      row.append(pics, h('label', 'face-pick', `<b>${esc(half(c.name, 0))}</b> <span class="hint">// ${esc(c.a.backCard.name || half(c.name, 1))}</span>
        <select data-card="${esc(c.name)}"><option value="auto"${v === 'auto' ? ' selected' : ''}>Autopilot chooses each time (the better play)</option><option value="front"${v === 'front' ? ' selected' : ''}>Front face: ${esc(half(c.name, 0))} (${esc(half(c.mana_cost, 0))})</option><option value="back"${v === 'back' ? ' selected' : ''}>Back face: ${esc(c.a.backCard.name || half(c.name, 1))} (${esc(c.a.backCard.mana_cost || '')})</option></select>`));
      list.appendChild(row);
    });
    list.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
      const row = sel.closest('.face-row'); if (row && row.flip && sel.value !== 'auto') row.flip.setFace(sel.value === 'back' ? 1 : 0);
      const f = Object.assign({}, currentPolicy().faces || {}); if (sel.value === 'auto') delete f[sel.dataset.card]; else f[sel.dataset.card] = sel.value;
      savePolicy('faces', Object.keys(f).length ? f : null, 'chosen on the Simulation tab');
      toast(sel.value === 'auto' ? 'The autopilot chooses the face' : `Goldfishing the ${sel.value} face of ${sel.dataset.card.split(' // ')[0]}`);
    }));
  }
  function fillLabChoices() {
    renderFaces();
    const sel = $('#plDecision'), cur = sel.value;
    labApplies = S.deck ? G.labChoices(S.deck) : G.LAB_CHOICES.map(c => Object.assign({}, c, { applies: !!c.always, because: [], missing: [] }));
    const ok = labApplies.filter(c => c.applies), off = labApplies.filter(c => !c.applies);
    sel.innerHTML = ok.map(c => `<option value="${c.id}">${esc(c.label)}${c.mirrorOnly ? ' (mirror match)' : ''}</option>`).join('');
    if (ok.some(c => c.id === cur)) sel.value = cur;
    fillTune();
    $('#plSkipped').innerHTML = off.length && S.deck ? `<details><summary>${off.length} other choice${off.length === 1 ? '' : 's'} hidden: no card in this deck uses ${off.length === 1 ? 'it' : 'them'}</summary><ul>${off.map(c => `<li>${esc(c.label)}: needs ${esc(c.missing.join(' and '))}</li>`).join('')}</ul></details>` : '';
    showLabWhy();
  }
  function showLabWhy() {
    const c = labApplies.find(x => x.id === $('#plDecision').value);
    if (!c) { $('#plWhy').textContent = ''; return; }
    const list = (names, max) => names.slice(0, max).map(esc).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
    $('#plWhy').innerHTML = c.always ? 'Applies to every deck.' : 'Applies because this deck has ' + c.because.map(b => `${esc(b.what)} (${list(b.cards, 4)})`).join(', ') + '.';
  }
  $('#plDecision').addEventListener('change', showLabWhy);
  fillLabChoices();
  const deckSig = () => S.cards.map(c => c.name + ':' + (c.commander ? 'c' : '')).sort().join('|');
  const sigHash = str => { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) >>> 0; return x.toString(36); };
  const getPolicies = () => { try { return JSON.parse(localStorage.getItem('gf_policy') || '{}') || {}; } catch (e) { return {}; } };
  function currentPolicy() { if (!S.cards || !S.cards.length) return {}; const e = getPolicies()[sigHash(deckSig())]; return e && e.policy ? e.policy : {}; }
  function savePolicy(key, value, note) {
    const all = getPolicies(), id = sigHash(deckSig()), cur = all[id] || { policy: {}, notes: {} };
    if (value == null) { cur.policy[key] = undefined; cur.notes[key] = undefined; } else { cur.policy[key] = value; cur.notes[key] = note; }
    cur.policy = JSON.parse(JSON.stringify(cur.policy)); cur.notes = JSON.parse(JSON.stringify(cur.notes));
    cur.when = Date.now();
    if (Object.keys(cur.policy).length) all[id] = cur; else all[id] = undefined;
    try { localStorage.setItem('gf_policy', JSON.stringify(all)); } catch (e) { toast('Could not save in this browser'); }
    renderLabSaved();
  }
  function renderLabSaved() {
    const box = $('#plSaved'); if (!S.cards || !S.cards.length) { box.textContent = ''; return; }
    const pol = currentPolicy(), keys = Object.keys(pol);
    if (!keys.length) { box.textContent = 'Nothing learned for this deck yet: the autopilot uses its default choices.'; return; }
    const names = keys.map(k => { if (k === 'faces') return 'Two-faced cards = ' + Object.keys(pol.faces).map(n => `${n.split(' // ')[0]}: ${pol.faces[n]} face`).join(', ');
      const d = Object.values(DECISIONS).find(x => x.key === k); const o = d && d.options.find(x => x.value === pol[k]); return `${d ? d.label : k} = ${o ? o.name : pol[k]}`; });
    box.innerHTML = `Saved for this deck: <b>${esc(names.join('; '))}</b> (used by the autopilot, the simulation and mirror matches). <button class="ghost" id="plReset">Reset</button>`;
    $('#plReset').addEventListener('click', () => { keys.forEach(k => savePolicy(k, null)); renderFaces(); toast('Back to the default choices'); });
  }
  let plWorker = null, plState = null;
  async function runLab() {
    if (!need()) return;
    const btn = $('#plRun'); btn.disabled = true;
    const dec = DECISIONS[$('#plDecision').value];
    if (!dec) { $('#plInfo').textContent = 'Load a deck first.'; btn.disabled = false; return; }
    let mode = $('#plMode').value;
    if (dec.mirrorOnly && mode === 'goldfish') mode = 'field';                                       // a choice that needs an opponent is tested against other decks
    if (dec.dynamic) dec.options = tribeOptions();
    if (dec.options.length < 2) { $('#plInfo').textContent = 'This deck has no other creature type worth testing.'; btn.disabled = false; return; }
    const n = Math.max(50, Math.min(20000, +$('#plN').value || 2000));
    let opp = null;
    let field = null;
    if (mode === 'mirror') { try { opp = await mirrorOpponent(); } catch (err) { $('#plInfo').textContent = 'Could not load the opponent deck: ' + (err.message || err); btn.disabled = false; return; } }
    if (mode === 'field') {
      const picks = labOpponents();
      if (!picks.length) { $('#plInfo').textContent = $('#plOpp').value === 'selected' ? 'Select at least one deck to play against.' : 'No other deck of this format to play against.'; btn.disabled = false; return; }
      try { field = []; for (const v of picks) { const x = await loadOpponent(v, $('#plInfo')); if (x.cards.length) field.push(x); } }
      catch (err) { $('#plInfo').textContent = 'Could not load an opponent deck: ' + (err.message || err); btn.disabled = false; return; }
    }
    const o = Object.assign(opts(), { turns: mode === 'goldfish' ? (+$('#optTurns').value || 10) : Math.max(5, Math.min(40, +$('#mmT').value || 20)) });
    o.policy = Object.assign({}, o.policy, { [dec.key]: undefined });
    o.policy = JSON.parse(JSON.stringify(o.policy));
    const candidates = dec.options.map(op => ({ name: op.name, policy: { [dec.key]: op.value } }));
    if (plWorker) plWorker.terminate();
    plWorker = ParWorker();
    if (window.Battle) Battle.watch(plWorker, '#plProgress', mode === 'goldfish' ? 'dummy' : 'rival');
    const bar = $('#plProgress div'); bar.style.width = '0';
    const vs = field ? ` against ${field.map(x => x.name).join(', ')}` : '';
    $('#plInfo').textContent = `Playing ${n.toLocaleString()} games with each of the ${candidates.length} options${vs}…`;
    const t0 = performance.now();
    plWorker.onmessage = e => {
      if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(1) + '%';
      if (e.data.result) {
        bar.style.width = '100%'; btn.disabled = false;
        plState = { res: e.data.result, dec, mode, n };
        $('#plInfo').textContent = `${n.toLocaleString()} games per option in ${((performance.now() - t0) / 1000).toFixed(1)}s${vs}`;
        renderLab();
      }
    };
    plWorker.onerror = err => { btn.disabled = false; $('#plInfo').textContent = 'Policy lab error: ' + err.message; };
    if (opp) o.policyB = opp.policy || {};
    const cardsB = field ? field.map(x => ({ cards: x.cards, tokens: x.tokens, policy: x.policy })) : opp ? opp.cards : null;
    plWorker.postMessage({ learn: { cards: S.cards, tokens: S.tokens, candidates, mode, cardsB, tokensB: opp ? opp.tokens : null }, opts: o, n, seed: rseed() });
  }
  function renderLab() {
    const { res, dec, mode, n } = plState;
    const unit = mode === 'goldfish' ? 'win-earliness score' : 'win rate';
    const rows = res.rows.map((r, i) => {
      const verdict = i === 0 ? 'baseline' : r.z > 1.64 ? '✓ better' : r.z < -1.64 ? '✗ worse' : '≈ no clear difference';
      const extra = mode !== 'goldfish' ? `${(r.mean * 100).toFixed(1)}% wins` : (r.kills ? `${(r.kills / n * 100).toFixed(0)}% win by turn ${res.turns}, on average turn ${r.avgKillTurn.toFixed(1)}` : 'never won');
      return `<tr class="${res.best === i ? 'best' : ''}"><td><b>${esc(r.name)}</b></td><td>${r.mean.toFixed(3)} ± ${r.se.toFixed(3)}</td><td>${extra}</td><td>${i === 0 ? '—' : (r.diff >= 0 ? '+' : '') + r.diff.toFixed(3) + ' (z ' + r.z.toFixed(1) + ')'}</td><td>${verdict}</td><td><button class="ghost" data-use="${i}">Use this</button></td></tr>`;
    }).join('');
    const best = res.rows[res.best];
    const msg = res.best === 0 ? `No option clearly beat “${esc(res.rows[0].name)}”. That is a real answer: for this deck the choice is too small to measure with ${n.toLocaleString()} games. More games can reveal a small difference.` : `<b>${esc(best.name)}</b> did better than the baseline by more than chance explains.`;
    $('#plOut').innerHTML = `<p class="hint">${msg} Scores are ${unit} (higher is better) ± one standard error; the same shuffles are used for every option.</p><table class="labtable"><thead><tr><th>Option</th><th>Score</th><th>Result</th><th>Versus baseline</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>${res.errors ? `<p class="hint">${res.errors} games hit an error.</p>` : ''}`;
    $$('#plOut [data-use]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.use, r = res.rows[i], op = dec.options[i];
      savePolicy(dec.key, i === 0 ? null : op.value, `${mode} ${n} games, score ${r.mean.toFixed(3)}`);
      if (dec.key === 'tribe') { S.deck = G.buildDeck(S.cards, S.tokens, i === 0 ? null : op.value); S.byUid = S.deck.unique; buildTags(); renderTags(); }          // the next game on the table and in the hands uses the new type
      toast(i === 0 ? 'Default choice restored' : `Saved: ${op.name}`);
    }));
  }
  $('#plRun').addEventListener('click', runLab);
  // Opponents for "against other decks": random built-in decks of the same format (the default), or the decks picked in the list
  function labOpponents() {
    const mine = S.deck && S.deck.commanders.length > 0, me = S.deck && S.deck.commanders.map(i => i.card.name).join('+');
    if ($('#plOpp').value === 'selected') return [...$('#plOppList').selectedOptions].map(o => o.value);
    const pool = BUILTIN.filter(d => (d.commanders.length > 0) === mine && d.commanders.join('+') !== me).map(d => 'builtin:' + d.file);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, Math.max(1, Math.min(12, +$('#plOppN').value || 5)));
  }
  function fillLabOpponents() {
    const saved = Object.keys(getDecks()).sort();
    $('#plOppList').innerHTML = builtinOptions() + (saved.length ? `<optgroup label="Saved in this browser">${saved.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
  }
  function showLabOpponents() {
    const field = $('#plMode').value === 'field', sel = $('#plOpp').value === 'selected';
    const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };                              // labels are styled with display, so the hidden attribute alone is not enough
    show('#plOppWrap', field); show('#plOppNWrap', field && !sel); show('#plOppListWrap', field && sel);
    if (field && sel && !$('#plOppList').options.length) fillLabOpponents();
  }
  $('#plMode').addEventListener('change', showLabOpponents);

  // ---------- Policy lab: tune toward a goal (tune.js): kill the goldfish earlier, or hit land drops more often ----------
  const TN_N = 400;                                                                                  // games per change; the Tune button's data-n overrides it (tests)
  function simNow() {                                                                                // the deck now, from the last simulation of it (Simulate, above)
    const r = S.sim; if (!S.deck || !r || !r.kill || !r.onCurveLands) return null;
    const byTurn = []; let c = 0; for (let t = 0; t < r.turns; t++) { c += r.kill[t]; byTurn.push(c); }
    const mi = byTurn.findIndex(v => v >= 0.5);
    return { median: mi < 0 ? null : mi + 1, byTurn, onCurve: r.onCurveLands, bracket: Tune.bracketOf(byTurn), atMost: Tune.bracketAtMost(byTurn), turns: r.turns };
  }
  function fillTune() {
    const sel = $('#tnTarget'); if (!sel) return;
    const now = simNow(), cur = sel.value, k = now && now.median;
    const list = $('#tnGoal').value === 'lands' ? Tune.LAND_GOALS.map((x, i) => [`l${i}`, `Land drop ${x.turn} on turn ${x.turn} in ${Math.round(100 * x.share)}% of games`])
      : [1, 2, 3].map(e => [`e${e}`, `${e} turn${e > 1 ? 's' : ''} earlier${k ? ` (median turn ${Math.max(3, k - e)})` : ''}`])
        .concat(Tune.BRACKET_SPEED.slice().reverse().map(b => [`b${b.bracket}`, `Bracket ${b.bracket} speed: median kill by turn ${b.turn}`]));
    sel.innerHTML = list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    if (list.some(o => o[0] === cur)) sel.value = cur;
    const on = t => now.onCurve[t - 1] != null ? pct(now.onCurve[t - 1]) : '?';
    fillNext();
    $('#tnNow').textContent = !S.deck ? '' : now ? `Now: ${k ? 'median kill turn ' + k : 'no kill in half the games by turn ' + now.turns} (bracket speed ${now.bracket ? 'B' + now.bracket : `at most B${now.atMost}: needs more turns to tell`}) · land drop 3 on turn 3 in ${on(3)}, 4 on turn 4 in ${on(4)}.`
      : 'Now: measured when you press Tune (or run the simulation above).';
  }
  $('#tnGoal').addEventListener('change', fillTune);
  fillTune();
  let tnWorker = null;
  async function runTune() {
    if (!need()) return;
    const btn = $('#tnRun'), v = $('#tnTarget').value, kind = $('#tnGoal').value;
    const goal = kind === 'lands' ? Object.assign({ kind: 'lands' }, Tune.LAND_GOALS[+v.slice(1)] || Tune.LAND_GOALS[1]) : v[0] === 'b' ? { kind: 'kill', bracket: +v.slice(1) } : { kind: 'kill', earlier: +v.slice(1) || 1 };
    btn.disabled = true; $('#tnOut').innerHTML = '';
    const ident = [...new Set((S.deck.commanders.length ? S.deck.commanders.map(i => i.card) : S.cards).flatMap(c => c.color_identity || []))];
    // the cheap ramp and card draw to try: the A/B test's role searches (most played first), mana value 2 or less; none when Scryfall can't be reached
    $('#tnInfo').textContent = 'Finding cheap ramp and card draw in your colors…';
    let pool = [];
    for (const role of ['ramp', 'draw']) { const q = Compare.roleQuery(role, ident); if (q) { try { pool = pool.concat(await Source.searchCards(q + ' cmc<=2', 12)); } catch (e) { /* no suggestions */ } } }
    const n = Math.max(40, Math.min(4000, +btn.dataset.n || TN_N));
    if (tnWorker) tnWorker.terminate();
    tnWorker = ParWorker();
    if (window.Battle) Battle.watch(tnWorker, '#tnProgress', 'dummy');
    const bar = $('#tnProgress div'); bar.style.width = '0';
    $('#tnInfo').textContent = `Tuning: ${n.toLocaleString()} games for each change${pool.length ? '' : ' (no ramp or card draw found to try: lands and choices only)'}…`;
    const t0 = performance.now();
    tnWorker.onmessage = e => {
      if (e.data.progress != null) { bar.style.width = (e.data.progress * 100).toFixed(1) + '%'; return; }
      if (!e.data.result) return;
      bar.style.width = '100%'; btn.disabled = false;
      $('#tnInfo').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(0)}s: ${e.data.result.steps.length} change${e.data.result.steps.length === 1 ? '' : 's'} kept; ${n.toLocaleString()} fresh games for the before → after.`;
      renderTune(e.data.result);
    };
    tnWorker.onerror = err => { btn.disabled = false; $('#tnInfo').textContent = 'Tune error: ' + err.message; };
    tnWorker.postMessage({ tune: { cards: S.cards, tokens: S.tokens, pool, identity: ident, goal, rounds: 3 }, opts: opts(), n, seed: rseed() });
  }
  $('#tnRun').addEventListener('click', runTune);
  function renderTune(r) {
    const bk = m => m.bracket ? 'B' + m.bracket : '?';          // the report's games run 10+ turns, so the bracket is always known; guarded all the same
    const g = r.goal, b = r.before, a = r.after, P = x => (100 * (x || 0)).toFixed(0) + '%';
    const share = m => g.kind === 'lands' ? m.onCurve[g.turn - 1] : m.byTurn[g.turn - 1];
    const med = m => m.median ? 'turn ' + m.median : `after turn ${r.fullTurns}`;
    const what = g.kind === 'lands' ? `Land drop ${g.turn} on turn ${g.turn}: ${P(share(b))} → ${P(share(a))} of games`
      : `Median kill ${med(b)} → ${med(a)} (average ${b.meanKill.toFixed(1)} → ${a.meanKill.toFixed(1)}); kills by turn ${g.turn}: ${P(share(b))} → ${P(share(a))}`;
    const sure = r.confirm ? ` (fresh shuffles, z ${r.confirm.z.toFixed(1)})` : '';
    const goalTxt = g.kind === 'lands' ? `land drop ${g.turn} on turn ${g.turn} in ${P(g.share)} of games` : `${P(g.share)} of games killed by turn ${g.turn}`;
    const head = !r.steps.length ? `No change moved the goal by more than chance explains with ${r.n.toLocaleString()} games each. That is a real answer: the choices and swaps tried are not what holds this deck back; more games can reveal a small difference.`
      : (r.verdict === 'confirmed' ? '✓ ' : r.verdict === 'likely' ? '≈ Probably: ' : '✗ It did not hold up on fresh shuffles: ') + what + sure + `. Bracket speed ${bk(b)} → ${bk(a)}.`;
    const reached = share(a) >= g.share ? ` The goal, ${goalTxt}, is reached.` : ` The goal, ${goalTxt}, is not reached yet.`;
    const steps = r.steps.map(s => `<li><b>${esc(s.label)}</b> ${g.kind === 'lands' ? `${P(s.before)} → ${P(s.after)} of games` : `${pts(s.after - s.before)} points`} on the search's shuffles (z ${s.z.toFixed(1)})</li>`).join('');
    const row = (l, x, y) => `<tr><td>${l}</td><td>${x}</td><td>${y}</td></tr>`;
    const kills = [...new Set([g.kind === 'kill' ? g.turn : null, 6, 8].filter(Boolean))].sort((x, y) => x - y);
    const table = row('Median kill turn', b.median || '—', a.median || '—') + row('Average kill turn', b.meanKill.toFixed(1), a.meanKill.toFixed(1))
      + kills.map(t => row(`Kills by turn ${t}`, P(b.byTurn[t - 1]), P(a.byTurn[t - 1]))).join('')
      + [3, 4, 5].map(t => row(`Land drop ${t} on turn ${t}`, P(b.onCurve[t - 1]), P(a.onCurve[t - 1]))).join('')
      + row('Bracket speed', bk(b), bk(a));
    const pol = Object.keys(r.policy || {});
    $('#tnOut').innerHTML = `<p><b>${head}</b>${r.steps.length ? esc(reached) : ''}</p><div class="suggest">`
      + (r.steps.length ? `<div class="sg good"><b>The changes (${r.steps.length})</b><ul>${steps}</ul></div>` : '')
      + `<div class="sg"><b>Before → after: ${r.n.toLocaleString()} fresh games each, ${r.fullTurns} turns</b><table class="labtable"><thead><tr><th></th><th>Before</th><th>After</th></tr></thead><tbody>${table}</tbody></table></div></div>`
      + (r.steps.length ? `<div class="row wrap">${r.lines.length ? `<button id="tnSend" class="primary">Send to the A/B test</button>` : ''}${pol.length ? `<button id="tnUse">Use the choices</button>` : ''}</div>` : '');
    tidy($('#tnOut'));
    const send = $('#tnSend');
    if (send) send.addEventListener('click', () => {
      $('#abChanges').value = r.lines.join('\n') + '\n';
      $('#abBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(`Sent to the A/B test as version 2${pol.length ? ' (the choices are kept with "Use the choices")' : ''}: press "2. Test version 2"`);
    });
    const use = $('#tnUse');
    if (use) use.addEventListener('click', () => {
      pol.forEach(k => savePolicy(k, r.policy[k], `tuned: ${goalTxt}`));
      fillLabChoices(); toast(`Saved ${pol.length} choice${pol.length === 1 ? '' : 's'} for this deck`);
    });
  }

  // ---------- Simulate: "Tune to the next bracket" (tune.js nextBracket, T-055): card swaps and lab choices that move the median kill turn up a bracket ----------
  const NB_N = 400;                                                                                  // games per change; the Run button's data-n overrides it (tests); the final check is always 2,000+
  let nbWorker = null, nbResult = null, nbRunId = 0, nbApplying = false;
  function nbReset(force) {
    if (nbApplying && !force) return;
    nbRunId++; if (nbWorker) { nbWorker.terminate(); nbWorker = null; }
    nbResult = null; const o = $('#nbOut'); if (o) { o.innerHTML = ''; $('#nbInfo').textContent = ''; nbDone(); fillNext(); }
  }
  function fillNext() {
    const sel = $('#nbTarget'); if (!sel) return;
    const now = simNow(), cur = sel.value;
    const b = now && now.bracket;
    const opts = [['next', b ? (b >= 5 ? 'Already the fastest bracket' : `Next faster bracket (B${b + 1})`) : 'Next faster bracket']]
      .concat(Tune.SPEED.slice().reverse().map(([t, bk]) => [String(bk), `B${bk}: median kill by turn ${t - 1}`]).filter(([v]) => !b || +v > b));
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    if (opts.some(o => o[0] === cur)) sel.value = cur;
    $('#nbNow').textContent = !S.deck ? '' : now ? `Now: ${now.median ? 'median kill turn ' + now.median : 'no kill in half the games by turn ' + now.turns} (bracket speed ${now.bracket ? 'B' + now.bracket : `at most B${now.atMost}: needs more turns to tell`}).` : 'Now: measured when you press the button (or run the simulation above).';
  }
  fillNext();
  // text edits: the cut lines lose a copy (a line of one copy goes), the added card takes a copy on its own line (or joins its line), the list is loaded again
  function swapInText(text, pairs, names) {
    const lines = text.split(/\r?\n/), GONE = '\u0001gone';
    const inMain = i => { const a = Source.parseDecklist(lines.slice(0, i + 1).join('\n')), b = Source.parseDecklist(lines.slice(0, i).join('\n')); return a.length > b.length && !a[a.length - 1].commander; };
    const find = want => { for (let i = 0; i < lines.length; i++) { if (lines[i] === GONE) continue; const e = Source.parseDecklist(lines[i])[0]; if (e && want.has(nameKey(e.name)) && inMain(i)) return i; } return -1; };
    const QTY = /^(\s*)(\d+)(x?)(\s+)/i;          // a line with no number ("Sol Ring") is one copy
    const qtyAt = i => { const m = lines[i].match(QTY); return m ? +m[2] : 1; };
    const setQty = (i, q) => { lines[i] = QTY.test(lines[i]) ? lines[i].replace(QTY, (m, a, n, x, z) => a + q + x + z) : lines[i].match(/^\s*/)[0] + q + ' ' + lines[i].trimStart(); };
    const missing = [];
    for (const { cut, add } of pairs) {
      const want = new Set([cut].concat(names(cut)).filter(Boolean).map(nameKey)), i = find(want);
      if (i < 0) { missing.push(cut); continue; }
      const q = qtyAt(i);
      if (q > 1) setQty(i, q - 1); else lines[i] = GONE;
      const j = find(new Set([nameKey(add)]));
      if (j >= 0) setQty(j, qtyAt(j) + 1); else lines.splice(i + 1, 0, '1 ' + add);
    }
    return { text: lines.filter(l => l !== GONE).join('\n'), missing };
  }
  async function applyNext(idxs) {
    const r = nbResult; if (!r || !S.deck) return;
    if (r.deck !== S.deck) { nbReset(true); return toast('The deck has changed since it was tuned: run it again'); }          // never apply one deck's result to another
    r.applied = r.applied || new Set();
    idxs = idxs.filter(i => !r.applied.has(i));
    if (!idxs.length) return toast('Those changes are already applied');
    const steps = idxs.map(i => r.steps[i]).filter(Boolean);
    const pairs = steps.filter(x => x.kind === 'cards').flatMap(x => x.cut.map((c, k) => ({ cut: c, add: x.add[k] }))).filter(p => p.add);
    const pols = steps.filter(x => x.kind === 'policy');
    if (pairs.length) {
      const text = S.deckText || $('#deckText').value;
      if (!text.trim()) return toast('Load the deck from a list first');
      const out = swapInText(text, pairs, c => S.cards.filter(x => x.name === c).map(x => x.input_name));
      if (out.missing.length) return toast(`${out.missing.join(', ')} not found in the loaded list: nothing was changed`);
      $('#deckText').value = out.text;
      nbApplying = true; let ok = false;
      try { ok = await loadDeck({ quiet: true, text: out.text }); } finally { nbApplying = false; }
      if (!ok) { $('#deckText').value = text; return; }
      r.deck = S.deck;          // the deck we just changed is the one this result is about
      localStorage.setItem('gf_last', out.text);          // a reload brings back the tuned list
    }
    pols.forEach(x => savePolicy(x.key, x.value, 'tuned: next bracket'));
    if (pols.length) fillLabChoices();
    toast(`Applied ${steps.length} change${steps.length === 1 ? '' : 's'}${pairs.length ? ' to the loaded deck' : ''}`);
    idxs.forEach(i => { r.applied.add(i); const bt = $('#nbOut').querySelector(`.nb-apply[data-i="${i}"]`); if (bt) { bt.disabled = true; bt.textContent = 'Applied ✓'; } });
    if (r.applied.size >= r.steps.length) { const all = $('#nbAll'); if (all) all.disabled = true; }
    $('#nbInfo').textContent = 'Applied to the loaded deck. The numbers above are from the deck before the change: run the simulation again to see the new deck.';
    fillNext();
  }
  const nbDone = () => { $('#nbRun').disabled = false; $('#nbStop').hidden = true; };
  $('#nbStop').addEventListener('click', () => {
    nbRunId++; if (nbWorker) { nbWorker.terminate(); nbWorker = null; }          // a run still searching for cards ends too (its token is out of date)
    nbDone(); $('#nbInfo').textContent = 'Stopped. Nothing was changed in your deck.';
  });
  async function runNext() {
    if (!need()) return;
    const btn = $('#nbRun'), v = $('#nbTarget').value, deck = S.deck, run = ++nbRunId;
    if (nbWorker) { nbWorker.terminate(); nbWorker = null; }
    let nbBook = null;
    btn.disabled = true; $('#nbStop').hidden = false; $('#nbOut').innerHTML = ''; nbResult = null;
    const ident = [...new Set((deck.commanders.length ? deck.commanders.map(i => i.card) : S.cards).flatMap(c => c.color_identity || []))];
    const say = t => { $('#nbInfo').textContent = t; };
    say('Finding ramp, card draw, finishers and combo pieces in your colors…');
    let pool = [], extra = [];
    const queries = [Compare.roleQuery('ramp', ident), Compare.roleQuery('draw', ident)].filter(Boolean).map(q => q + ' cmc<=3')
      .concat([`legal:commander id<=${(ident.join('') || 'C').toLowerCase()} -is:digital -t:land cmc<=5 (o:"each opponent loses" or o:"damage to each opponent" or o:"you win the game" or o:"extra turn")`]);
    for (const q of queries) { try { pool = pool.concat(await Source.searchCards(q, 12)); } catch (e) { /* no suggestions */ } if (run !== nbRunId) return; }
    try {
      const db = typeof Combos !== 'undefined' && Combos.additions ? await loadComboDb() : null;
      if (db) for (const a of Combos.additions(db, deck, deckIdentity(deck), '', 5)) {
        try { const got = await Source.loadDeck('1 ' + a.card, () => {}); if (got.cards[0]) extra.push(got.cards[0]); } catch (e) { /* one card missing */ }
        if (run !== nbRunId) return;
      }
      if (db && extra.length) {          // the Spellbook combos any candidate completes count for the goldfish, once every piece of one is in the deck
        const o = opts(), all = S.cards.concat(extra.map(c => Object.assign({}, c, { qty: 1, commander: false }))), names = all.map(c => c.name), id = deckIdentity(deck);
        try { nbBook = Combos.goldfished(Combos.find(db, names, id), G.deckCombos(G.buildDeck(all, S.tokens, currentPolicy().tribe))); } catch (e) { nbBook = null; }
      } else nbBook = null;
    } catch (e) { nbBook = null; }
    if (run !== nbRunId || S.deck !== deck) { if (run === nbRunId) nbDone(); return; }
    const n = Math.max(40, Math.min(4000, +btn.dataset.n || NB_N));
    nbWorker = ParWorker();
    const bar = $('#nbProgress div'); bar.style.width = '0';
    let note = '';
    const t0 = performance.now();
    say(`Tuning: ${n.toLocaleString()} games for each change, then 2,000 fresh games to check${pool.length + extra.length ? '' : ' (no cards found to add: lands and choices only)'}…`);
    nbWorker.onmessage = e => {
      if (run !== nbRunId) return;
      if (e.data.progress != null) { bar.style.width = (e.data.progress * 100).toFixed(1) + '%'; if (e.data.note) note = e.data.note; say(`Tuning: ${note || 'measuring'} (${Math.round(e.data.progress * 100)}%)…`); return; }
      if (!e.data.result) return;
      bar.style.width = '100%'; nbDone(); nbWorker = null;
      if (S.deck !== deck) { say('The deck changed while tuning: run it again.'); return; }
      say(`Done in ${((performance.now() - t0) / 1000).toFixed(0)}s.`);
      e.data.result.deck = deck; renderNext(e.data.result);
    };
    nbWorker.onerror = err => { if (run !== nbRunId) return; nbDone(); nbWorker = null; say('Tune error: ' + err.message); };
    const o = Object.assign(opts(), nbBook ? { bookCombos: nbBook } : {});
    nbWorker.postMessage({ nextBracket: { cards: S.cards, tokens: S.tokens, pool, extra, identity: ident, bracket: v === 'next' ? undefined : +v, rounds: 5, minFinal: +btn.dataset.minFinal || undefined }, opts: o, n, seed: rseed() });
  }
  $('#nbRun').addEventListener('click', runNext);
  S.nbTest = { swapInText: (t, p) => swapInText(t, p, () => []), show: r => renderNext(r), apply: idxs => applyNext(idxs) };          // for the UI tests
  function renderNext(r) {
    const out = $('#nbOut'), P = x => (100 * (x || 0)).toFixed(0) + '%', b = r.before, a = r.after;
    if (r.status === 'top' || r.status === 'already') { out.innerHTML = `<p><b>${esc(r.text)}</b></p>`; return; }
    nbResult = r; r.deck = r.deck || S.deck;
    const T = r.targetTurn, med = m => m.median ? 'turn ' + m.median : `after turn ${r.fullTurns}`, row = (l, x, y) => `<tr><td>${l}</td><td>${x}</td><td>${y}</td></tr>`;
    const li = r.applicable.map((s, i) => `<li><b>${esc(s.label)}</b> <span class="hint">z ${s.z.toFixed(1)} on the search's shuffles</span> <button class="ghost nb-apply" data-i="${i}">Apply</button></li>`).join('');
    const table = row('Median kill turn', b.median || '—', a.median || '—') + row('Average kill turn', b.meanKill.toFixed(1), a.meanKill.toFixed(1))
      + [...new Set([T, 6, 8])].sort((x, y) => x - y).map(t => row(`Kills by turn ${t}`, P(b.byTurn[t - 1]), P(a.byTurn[t - 1]))).join('') + row('Bracket speed', b.bracket ? 'B' + b.bracket : '?', a.bracket ? 'B' + a.bracket : '?');
    out.innerHTML = `<p class="nb-answer"><b>${r.reached ? '✓ ' : ''}${esc(r.text)}</b></p><div class="suggest">`
      + (r.applicable.length ? `<div class="sg good"><b>The changes (${r.applicable.length})</b><p class="hint">The changes were checked together on fresh games; one change alone is not checked.</p><ul>${li}</ul></div>` : '')
      + `<div class="sg"><b>Before → after: ${r.finalN.toLocaleString()} fresh games each${r.confirm ? `, z ${r.confirm.z.toFixed(1)}` : ''}</b><table class="labtable"><thead><tr><th></th><th>Before</th><th>After</th></tr></thead><tbody>${table}</tbody></table></div></div>`
      + (r.applicable.length ? `<div class="row wrap"><button id="nbAll" class="primary">Apply all</button></div>` : '');
    tidy(out);
    out.querySelectorAll('.nb-apply').forEach(bt => bt.addEventListener('click', () => applyNext([+bt.dataset.i])));
    const all = $('#nbAll'); if (all) all.addEventListener('click', () => applyNext(r.applicable.map((s, i) => i)));
  }

  // ---------- Policy lab: swaps by role (the diagnosis grouped by what cards do: "more ramp", then 2 cards to add and 2 to remove) ----------
  let plRolesWorker = null;
  $('#plRoles').addEventListener('click', async () => {
    if (!need()) return;
    const btn = $('#plRoles'); btn.disabled = true; $('#plRolesOut').innerHTML = '';
    let opps = [];
    try { for (const v of labOpponents()) { const x = await loadOpponent(v, $('#plInfo')); if (x.cards.length) opps.push({ name: x.name, cards: x.cards, tokens: x.tokens, policy: x.policy || {} }); } }
    catch (err) { $('#plInfo').textContent = 'Could not load an opponent deck: ' + (err.message || err); btn.disabled = false; return; }
    if (!opps.length) { $('#plInfo').textContent = 'Pick at least one opponent (Opponents, above).'; btn.disabled = false; return; }
    const n = Math.max(500, Math.min(20000, +$('#abN').value || 2000));
    $('#plInfo').textContent = `Swaps by role: ${n.toLocaleString()} matches against ${opps.map(o => o.name).join(', ')}…`;
    if (plRolesWorker) plRolesWorker.terminate();
    plRolesWorker = ParWorker();
    if (window.Battle) Battle.watch(plRolesWorker, '#plRolesProgress', 'rival');
    const bar = $('#plRolesProgress div'); bar.style.width = '0';
    const o = Object.assign(opts(), { turns: Math.max(5, Math.min(40, +$('#mmT').value || 20)) });
    plRolesWorker.onerror = err => { btn.disabled = false; $('#plInfo').textContent = 'Swaps by role: ' + err.message; };
    plRolesWorker.onmessage = async e => {
      if (e.data.progress != null) { bar.style.width = (e.data.progress * 100).toFixed(1) + '%'; return; }
      if (!e.data.result) return;
      bar.style.width = '100%'; btn.disabled = false;
      const d = e.data.result, byName = new Map(S.deck.unique.map(c => [c.name, c]));
      const roles = Compare.roleSummary(d.rows, nm => { const c = byName.get(nm); return c && typeof Profile !== 'undefined' ? [...Profile.roles(c)] : []; });
      // what to add: 1. a kind of card clearly linked to winning; 2. else what the deck profile says it is short on ("Little ramp"...);
      // 3. else the kind most linked to winning, flagged as a guess
      const PROFILE_ROLE = { 'ramp-low': 'ramp', 'draw-low': 'draw', 'removal-low': 'removal', 'wipes-none': 'wipe' };
      let short = null; try { const ids = (Profile.analyze(S.deck) || {}).ids || []; const w = ids.find(x => PROFILE_ROLE[x.id]); if (w) short = { role: PROFILE_ROLE[w.id], label: w.label }; } catch (er) { /* no profile */ }
      let overruled = null;
      if (short) { const r = roles.find(x => x.role === short.role); if (r && r.z < -2) { overruled = { label: short.label, r }; short = null; } }          // the games say otherwise: that kind of card is clearly linked to losing in this deck
      const clear = roles.find(r => r.diff > 0 && r.z > 2 && Compare.roleQuery(r.role, []));
      const why = clear ? 'clear' : short ? 'profile' : 'guess';
      const want = clear || (short && (roles.find(r => r.role === short.role) || { role: short.role, name: { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipe: 'board wipes' }[short.role], diff: 0, z: 0, n: 0, cards: [] })) || roles.find(r => r.diff > 0 && Compare.roleQuery(r.role, []));
      const removes = d.rows.filter(r => r.z < 0 && r.verdict === 'card' && !r.commander && !r.land && !(want && want.cards.includes(r))).slice(0, 2);
      $('#plInfo').textContent = `${n.toLocaleString()} matches: this deck wins ${(100 * d.winRate).toFixed(1)}% against ${opps.length} decks.`;
      const stat = r => r.n ? ` (your ${esc(r.name)} cards: ${pts(r.diff)} pts each, z ${r.z.toFixed(1)})` : ' (the deck has none yet)';
      const head = !want ? (overruled ? `No kind of card stands out as linked to winning. The deck profile says "${esc(overruled.label)}", but in these games your ${esc(overruled.r.name)} cards are linked to losing (${pts(overruled.r.diff)} pts each, z ${overruled.r.z.toFixed(1)}), so no add is suggested; the removals below still apply.` : 'No kind of card stands out as linked to winning, and the deck profile finds nothing short.')
        : why === 'clear' ? `More <b>${esc(want.name)}</b>: your ${esc(want.name)} cards are clearly linked to winning${stat(want).replace(/^ \(your [^:]+: /, ' (')}.`
        : why === 'profile' ? `More <b>${esc(want.name)}</b>: the deck profile says "${esc(short.label)}"${stat(want)}. No kind of card is clearly linked to winning yet, so test it.`
        : `Maybe more <b>${esc(want.name)}</b>: the kind of card most linked to winning, but not clearly${stat(want)}; test it.`;
      const table = roles.map(r => `<li>${esc(r.name)}: ${pts(r.diff)} pts per card (z ${r.z.toFixed(1)}, ${r.n} card${r.n === 1 ? '' : 's'})</li>`).join('');
      $('#plRolesOut').innerHTML = `<p>${head}</p><div class="suggest">${want ? `<div class="sg"><h3>Add (2)</h3><div class="ab-repls" id="plRolesAdd"><span class="hint">Finding cards…</span></div></div>` : ''}<div class="sg"><h3>Remove: the 2 cards most linked to losing (${removes.length})</h3><div class="ab-repls">${removes.map(r => `<figure class="ab-cut">${abImg(byName.get(r.name))}<figcaption><b>${esc(r.name)}</b><br>${pts(r.diff)} pts · z ${r.z.toFixed(1)}</figcaption></figure>`).join('') || '<span class="hint">No card is clearly linked to losing.</span>'}</div></div><div class="sg"><h3>Every kind of card (${roles.length})</h3><ul>${table}</ul></div></div><div class="row wrap"><button id="plRolesSend" class="primary" disabled>Send to the A/B test</button></div>`;
      if (typeof tidy === 'function') tidy($('#plRolesOut'));
      let adds = [];
      if (want) {
        const ident = [...new Set(S.deck.commanders.flatMap(i => i.card.color_identity || []))], inDeck = new Set(S.deck.unique.map(c => c.name));
        const found = (await Source.searchCards(Compare.roleQuery(want.role, ident), 24)).filter(c => !inDeck.has(c.name))
          .map(c => { let lvl = 'none'; try { lvl = G.buildDeck([Object.assign({ qty: 1 }, c)], []).unique[0].a.coverageLevel; } catch (er) { /* unreadable */ } return { c, lvl }; })
          .sort((x, y) => (x.lvl === 'ok' ? 0 : 1) - (y.lvl === 'ok' ? 0 : 1));
        adds = found.slice(0, 2);
        const box = $('#plRolesAdd');
        if (box) box.innerHTML = adds.length ? adds.map(({ c, lvl }) => `<figure class="ab-cut">${abImg(c)}<figcaption><b>${esc(c.name)}</b><br>${lvl === 'ok' ? '✓ fully simulated' : lvl === 'partial' ? '◐ partly simulated' : '✗ not simulated'}</figcaption></figure>`).join('') : '<span class="hint">No card found (or Scryfall could not be reached).</span>';
      }
      const send = $('#plRolesSend');
      if (send && (adds.length || removes.length)) {
        send.disabled = false;
        send.addEventListener('click', () => {
          const lines = removes.map(r => '- ' + r.name).concat(adds.map(x => '+ ' + x.c.name));
          $('#abChanges').value = lines.join('\n') + '\n';
          $('#abBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
          toast('Sent to the A/B test: press "2. Test version 2"');
        });
      }
    };
    plRolesWorker.postMessage({ diagnose: { cards: S.cards, tokens: S.tokens, opps }, opts: o, n, seed: rseed() });
  });

  // ---------- A/B test (compare.js): diagnose, change one or two cards, test version 2 against version 1 ----------
  let abWorker = null, abOpps = null, abV2 = null;
  const abGames = () => Math.max(100, Math.min(20000, +$('#abN').value || 2000));
  const abKey = () => S.deck ? S.deck.commanders.map(i => i.card.name).join(' + ') || 'deck' : 'deck';
  function abShow() {
    const sel = $('#abOpp').value === 'selected', show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
    show('#abOppNWrap', !sel); show('#abOppListWrap', sel);
    if (sel && !$('#abOppList').options.length) $('#abOppList').innerHTML = $('#plOppList').innerHTML || BUILTIN.map(d => `<option value="builtin:${esc(d.file)}">${esc(d.name)}</option>`).join('');
  }
  $('#abOpp').addEventListener('change', abShow); abShow();
  // the opponents are picked once per deck and kept for version 2, so both versions meet the same decks
  async function abOpponents(fresh) {
    if (abOpps && !fresh) return abOpps;
    let picks;
    if ($('#abOpp').value === 'selected') picks = [...$('#abOppList').selectedOptions].map(o => o.value);
    else {
      const mine = S.deck.commanders.length > 0, me = S.deck.commanders.map(i => i.card.name).join('+');
      picks = BUILTIN.filter(d => (d.commanders.length > 0) === mine && d.commanders.join('+') !== me).map(d => 'builtin:' + d.file);
      for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
      picks = picks.slice(0, Math.max(1, Math.min(20, +$('#abOppN').value || 8)));
    }
    const out = [];
    for (const v of picks) { const x = await loadOpponent(v, $('#abInfo')); if (x.cards.length) out.push({ name: x.name, cards: x.cards, tokens: x.tokens, policy: x.policy || {} }); }
    return (abOpps = out);
  }
  function abRun(msg, onDone) {
    if (abWorker) abWorker.terminate();
    abWorker = ParWorker();
    if (window.Battle) Battle.watch(abWorker, '#abProgress', 'rival');
    const bar = $('#abProgress div'); bar.style.width = '0';
    const t0 = performance.now();
    abWorker.onmessage = e => {
      if (e.data.progress != null) bar.style.width = (e.data.progress * 100).toFixed(1) + '%';
      if (e.data.result) { bar.style.width = '100%'; $('#abDiag').disabled = $('#abRun').disabled = false; onDone(e.data.result, ((performance.now() - t0) / 1000).toFixed(0)); }
    };
    abWorker.onerror = err => { $('#abDiag').disabled = $('#abRun').disabled = false; $('#abInfo').textContent = 'A/B test error: ' + err.message; };
    abWorker.postMessage(msg);
  }
  const abOpts = () => Object.assign(opts(), { turns: Math.max(5, Math.min(40, +$('#mmT').value || 20)) });
  const pts = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
  const VERDICT = { card: ['card', 'fully simulated and cast: the number is about the card'], play: ['played', 'drawn but rarely cast: mana, curve or the autopilot\'s timing, not necessarily the card'], engine: ['engine', 'some of its text is not simulated: test it by hand'] };
  function abCardList(title, rows, cut) {
    if (!rows.length) return '';
    const li = rows.map(r => `<li><b>${esc(r.name)}</b> ${pts(r.diff)} pts (z ${r.z.toFixed(1)}) · <span class="pill" title="${esc(VERDICT[r.verdict][1])}">${VERDICT[r.verdict][0]}</span> · ${r.castRate == null ? 'not drawn' : 'cast in ' + (100 * r.castRate).toFixed(0) + '% of games drawn'}${r.notSim.length ? ' · <i>not simulated: ' + esc(r.notSim[0].slice(0, 70)) + '</i>' : ''}${cut ? ` <button class="ghost" data-abcut="${esc(r.name)}">Cut</button>` : ''}</li>`).join('');
    return `<div class="sg"><h3>${title} (${rows.length})</h3><ul>${li}</ul></div>`;
  }
  // ---- replacements for a card you cut: the most played Commander cards that do the same job, in the deck's colors, for at most one
  // more mana, and not in the deck already (Scryfall, sorted by EDHREC rank). A list to pick from; the A/B test says whether a pick is better.
  const abLines = () => $('#abChanges').value.split('\n').map(l => l.trim()).filter(l => l && l !== '+' && l !== '-');
  const abSetLines = ls => { $('#abChanges').value = ls.join('\n') + (ls.length ? '\n' : ''); };
  // Cut on any card list: writes "- Card", then shows the same replacements as the ranked swap suggestions under the card
  async function abCut(btn) {
    const name = btn.dataset.abcut, li = btn.closest('li'), card = S.deck.unique.find(c => c.name === name);
    let ls = abLines(); if (!ls.includes('- ' + name)) { ls.push('- ' + name); abSetLines(ls); }
    btn.classList.add('on'); btn.textContent = 'Cut ✓';
    if (!card || !li || li.querySelector('.ab-repls')) return;
    const box = h('div', 'ab-repls ab-under', '<span class="hint">Finding replacements…</span>'); li.appendChild(box);
    abShowRepls(box, name, await abFind(card, new Set()));
  }
  $('#abDiag').addEventListener('click', async () => {
    if (!need()) return;
    $('#abDiag').disabled = true; $('#abDiagOut').innerHTML = '';
    let opps; try { opps = await abOpponents(true); } catch (err) { $('#abInfo').textContent = 'Could not load the opponents: ' + (err.message || err); $('#abDiag').disabled = false; return; }
    if (!opps.length) { $('#abInfo').textContent = 'Pick at least one opponent.'; $('#abDiag').disabled = false; return; }
    const n = abGames();
    $('#abInfo').textContent = `Diagnosing: ${n.toLocaleString()} matches against ${opps.map(o => o.name).join(', ')}…`;
    abRun({ diagnose: { cards: S.cards, tokens: S.tokens, opps }, opts: abOpts(), n, seed: rseed() }, (d, sec) => {
      $('#abInfo').textContent = `${n.toLocaleString()} matches in ${sec}s: this deck wins ${(100 * d.winRate).toFixed(1)}% against ${opps.length} decks.`;
      const lose = d.losing, win = d.winning;
      const ranked = d.rows.filter(r => r.z < 0 && r.verdict !== 'engine' && !r.commander).slice(0, 10);
      $('#abDiagOut').innerHTML = `<div class="suggest"><div class="sg"><h3>Swap suggestions: the 10 cards most linked to losing, with replacements (${ranked.length})</h3><p class="hint" data-fold>Click a replacement to choose it; click it again to undo. Replacements do the same job (ramp, draw, removal…), are the same kind of card at a similar mana value, fit the commander's colors and are the most played first (EDHREC). ✓ = the engine reads all of its text, so its result will mean something.</p><div id="abSwaps">${ranked.map((r, i) => abSwapRow(r, i)).join('')}</div></div>${abCardList('Cut candidates: fully simulated, cast, and linked to losing', lose.filter(r => r.verdict === 'card' && !r.commander), true)}${abCardList('Linked to losing, but it may be how it is played', lose.filter(r => r.verdict === 'play'), true)}${abCardList('Linked to losing, but the engine cannot judge it', lose.filter(r => r.verdict === 'engine'), false)}${abCardList('Linked to winning: keep', win, false)}</div><p class="hint">"Linked to", not "caused by": about ${Math.max(1, Math.round(d.rows.length * 0.045))} of ${d.rows.length} cards pass z 2 by chance alone. Testing the change is what tells.</p>`;
      $$('#abDiagOut [data-abcut]').forEach(b => b.addEventListener('click', () => abCut(b)));
      if (typeof tidy === 'function') tidy($('#abDiagOut'));
      abFillReplacements(ranked);
    });
  });
  // ---- swap suggestions: card images ranked 1-10, replacements in the same order, click to choose ----
  const abImg = (card, cls) => { const u = card && imgFor(card); return u ? `<img class="${cls || ''}" src="${esc(u)}" alt="${esc(card.name)}" loading="lazy">` : `<span class="ab-noimg">${esc(card ? card.name : '?')}</span>`; };
  function abSwapRow(r, i) {
    const card = S.deck.unique.find(c => c.name === r.name);
    return `<div class="ab-swap" data-row="${i}"><span class="ab-rank">#${i + 1}</span><figure class="ab-cut">${abImg(card)}${card ? `<span class="ab-zoom" role="button" tabindex="0" aria-label="View ${esc(r.name)}" data-abview="deck:${esc(r.name)}">🔍</span>` : ''}<figcaption><b>${esc(r.name)}</b><br>${pts(r.diff)} pts · z ${r.z.toFixed(1)} · ${VERDICT[r.verdict][0]}</figcaption></figure><span class="ab-arrow">→</span><div class="ab-repls" id="abRepl${i}"><span class="hint">Finding replacements…</span></div></div>`;
  }
  // Replacements for one card: the same job (by its roles), the same kind of card, a similar mana value, inside the deck's colors, the most
  // played first; the ones the engine reads fully come first. taken: names already suggested elsewhere on the page.
  async function abFind(card, taken) {
    const ident = [...new Set(S.deck.commanders.flatMap(i => i.card.color_identity || []))];
    const inDeck = new Set(S.deck.unique.map(c => c.name));
    const roles = typeof Profile !== 'undefined' && Profile.roles ? [...Profile.roles(card)] : [];
    let found = [];
    for (const q of Compare.replacementQueries(card, ident, roles)) {
      const res = await Source.searchCards(q, 24);
      for (const c of res) if (!inDeck.has(c.name) && !(taken && taken.has(c.name)) && !found.some(x => x.name === c.name)) found.push(c);
      if (found.length >= 8) break;
    }
    return found.slice(0, 8).map(c => { let lvl = 'none'; try { lvl = G.buildDeck([Object.assign({ qty: 1 }, c)], []).unique[0].a.coverageLevel; } catch (e) { /* unreadable */ } return { c, lvl }; })
      .sort((x, y) => (x.lvl === 'ok' ? 0 : 1) - (y.lvl === 'ok' ? 0 : 1)).slice(0, 5);
  }
  // Choosing a replacement: "- Cut" and "+ Pick" go into the change box together (one pick per cut card). A second click takes the pick
  // back, and the cut too unless you pressed Cut on that card yourself.
  // Every place that offers replacements for the same card (ranked rows, Cut rows) shows the same choice.
  function abToggle(cut, add) {
    let ls = abLines();
    const all = $$('#abDiagOut .ab-repl').filter(o => o.dataset.cut === cut), was = all.some(o => o.dataset.add === add && o.classList.contains('on'));
    all.forEach(o => { if (o.classList.contains('on')) ls = ls.filter(x => x !== '+ ' + o.dataset.add); o.classList.remove('on'); });
    const cutByHand = $$('#abDiagOut [data-abcut]').some(x => x.dataset.abcut === cut && x.classList.contains('on'));          // you pressed Cut yourself: the cut stays
    if (was) { if (!cutByHand) ls = ls.filter(x => x !== '- ' + cut); }
    else {
      if (!ls.includes('- ' + cut)) ls.push('- ' + cut);
      ls.splice(ls.indexOf('- ' + cut) + 1, 0, '+ ' + add);
      all.forEach(o => { if (o.dataset.add === add) o.classList.add('on'); });
    }
    abSetLines(ls);
    const n = ls.filter(x => x.startsWith('+ ')).length;
    $('#abInfo').textContent = n ? `${n} swap${n > 1 ? 's' : ''} chosen.${n > 2 ? ' More than two at once makes it hard to tell which one mattered.' : ''} Click "2. Test version 2".` : '';
  }
  // the cards on show in the A/B test, by name, so the 🔍 on any of them opens the card viewer (prices, printings, the full text)
  const abSeen = new Map();
  function abShowRepls(box, cut, found) {
    found.forEach(({ c }) => abSeen.set(c.name, c));
    box.innerHTML = found.length ? found.map(({ c, lvl }) => `<button class="ab-repl" data-cut="${esc(cut)}" data-add="${esc(c.name)}" title="${esc(c.name)}">${abImg(c)}<span class="ab-zoom" role="button" tabindex="0" aria-label="View ${esc(c.name)}" data-abview="${esc(c.name)}">🔍</span><small>${lvl === 'ok' ? '✓ ' : lvl === 'partial' ? '◐ ' : '✗ '}${esc(c.name)}</small></button>`).join('')
      : '<span class="hint">No replacement found (or Scryfall could not be reached): write your own as "+ Card" below.</span>';
    box.querySelectorAll('.ab-repl').forEach(b => b.addEventListener('click', () => abToggle(b.dataset.cut, b.dataset.add)));
  }
  // 🔍 on an A/B card: open it in the card viewer; the tap does not choose the card. Left and right in the viewer move through the cards
  // of the same row.
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-abview]'); if (!z) return;
    e.stopPropagation(); e.preventDefault();
    const key = z.dataset.abview, deckName = key.startsWith('deck:') ? key.slice(5) : null;
    const card = deckName ? S.deck && S.deck.unique.find(c => c.name === deckName) : abSeen.get(key);
    if (!card) return;
    const row = z.closest('.ab-repls');
    const list = row ? [...row.querySelectorAll('[data-abview]')].map(x => abSeen.get(x.dataset.abview)).filter(Boolean) : null;
    showLightbox(card, list && list.includes(card) ? list : undefined);
  }, true);
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-abview]')) { e.preventDefault(); e.target.click(); } });
  async function abFillReplacements(ranked) {
    const taken = new Set();
    for (let i = 0; i < ranked.length; i++) {
      const box = $('#abRepl' + i); if (!box) return;                                                    // a new diagnosis replaced the list
      const card = S.deck.unique.find(c => c.name === ranked[i].name);
      const found = await abFind(card, taken);
      found.forEach(x => taken.add(x.c.name));
      abShowRepls(box, ranked[i].name, found);
    }
  }
  $('#abRun').addEventListener('click', async () => {
    if (!need()) return;
    const ch = Compare.applyChanges($('#deckText').value, $('#abChanges').value);
    if (ch.missing.length) { $('#abInfo').textContent = `Not in the list: ${ch.missing.join(', ')}`; return; }
    if (!ch.cuts.length && !ch.adds.length) { $('#abInfo').textContent = 'Write the changes first: "- Card" to cut, "+ Card" to add, one per line.'; return; }
    $('#abRun').disabled = true; $('#abOut').innerHTML = '';
    let opps, v2;
    try {
      opps = await abOpponents(false);
      $('#abInfo').textContent = 'Loading version 2…'; await Source.init();
      const r = await Source.loadDeck(ch.text, m => { $('#abInfo').textContent = m; });
      v2 = { cards: markCommander(r.cards), tokens: r.tokens || [], text: ch.text };
    } catch (err) { $('#abInfo').textContent = 'Could not load: ' + (err.message || err); $('#abRun').disabled = false; return; }
    const unknown = ch.adds.filter(a => !v2.cards.some(c => c.name.toLowerCase() === a.toLowerCase() || c.name.split(' // ')[0].toLowerCase() === a.toLowerCase()));
    if (unknown.length) { $('#abInfo').textContent = `Card not found: ${unknown.join(', ')}`; $('#abRun').disabled = false; return; }
    const n = abGames();
    $('#abInfo').textContent = `Testing version 2 (${[...ch.cuts.map(x => '−' + x), ...ch.adds.map(x => '+' + x)].join(', ')}): ${n.toLocaleString()} matches per version, twice, then head to head…` + (ch.cuts.length + ch.adds.length > 4 ? ' More than two swaps at once makes it hard to tell which one mattered.' : '');
    abRun({ ab: { v1: { cards: S.cards, tokens: S.tokens }, v2: { cards: v2.cards, tokens: v2.tokens }, opps }, opts: abOpts(), n, seed: rseed() }, (r, sec) => {
      abV2 = v2;
      const head = { better: `✓ Version 2 is better: ${pts(r.both.diff)} points (z ${r.both.z.toFixed(1)})`, worse: `✗ Version 2 is worse: ${pts(r.both.diff)} points (z ${r.both.z.toFixed(1)})`, unclear: `≈ No clear difference: ${pts(r.both.diff)} points (z ${r.both.z.toFixed(1)}). More games, or a bigger change, may tell.` }[r.verdict];
      const row = (l, x) => `<tr><td>${l}</td><td>${(100 * x.v1).toFixed(1)}%</td><td>${(100 * x.v2).toFixed(1)}%</td><td>${pts(x.diff)} (z ${x.z.toFixed(1)})</td></tr>`;
      const opp = r.perOpp.map(p => `<li>${esc(p.name)}: ${(100 * p.v1).toFixed(0)}% → ${(100 * p.v2).toFixed(0)}%</li>`).join('');
      const unread = v2.cards.map(c => G.buildDeck([Object.assign({}, c, { qty: 1 })], []).unique[0]).filter(c => ch.adds.some(a => a.toLowerCase() === c.name.toLowerCase()) && c.a.coverageLevel !== 'ok');
      const nc = r.newCards.map(c => `<li><b>${esc(c.name)}</b> ${pts(c.diff)} pts (z ${c.z.toFixed(1)}) · ${VERDICT[c.verdict][0]}</li>`).join('') + (unread.length ? `<li>🧠 ${unread.map(c => esc(c.name)).join(', ')}: not fully understood yet, so ${unread.length > 1 ? 'their' : 'its'} result is rough. ${teachButton(unread, 'Teach ' + (unread.length > 1 ? 'these cards' : 'this card'))}</li>` : '');
      $('#abOut').innerHTML = `<p><b>${head}</b></p><div class="suggest"><div class="sg"><h3>The runs (3)</h3><table class="labtable"><thead><tr><th>Run</th><th>Version 1</th><th>Version 2</th><th>Change</th></tr></thead><tbody>${row('Test', r.test)}${row('Fresh shuffles', r.confirm)}${row('Both', r.both)}</tbody></table>${r.h2h ? `<p>Head to head: version 2 wins ${(100 * r.h2h.v2).toFixed(1)}% of ${r.h2h.n} matches against version 1 (z ${r.h2h.z.toFixed(1)}).</p>` : ''}</div><div class="sg"><h3>By opponent (${r.perOpp.length})</h3><ul>${opp}</ul></div>${nc ? `<div class="sg"><h3>The cards you added</h3><ul>${nc}</ul></div>` : ''}</div><div class="row wrap"><button id="abUse" class="primary">Use version 2</button><button id="abSave">Save as a new deck</button></div>`;
      if (typeof tidy === 'function') tidy($('#abOut'));
      $('#abUse').addEventListener('click', () => { $('#deckText').value = abV2.text; $('#loadDeck').click(); abOpps = null; toast('Version 2 is now the deck'); });
      $('#abSave').addEventListener('click', () => {                                                  // keep version 1 as it is, and save version 2 under a new name
        const all = getDecks(), meta = getMeta(), sel = $('#savedDecks'), cur = sel.selectedOptions[0];
        const base = (cur && cur.value ? cur.textContent.split(' · ')[0] : abKey()).trim();
        const name = (prompt('Save version 2 as a new deck:', uniqueName(base + ' v2', all)) || '').trim();
        if (!name) return;
        if (all[name] != null && !confirm(`"${name}" is already saved. Replace it?`)) return;
        all[name] = abV2.text; meta[name] = { saved: Date.now(), from: 'ab-test' };
        if (putDecks(all, meta)) { refreshSaved(); toast(`Saved "${name}"`); keepData(); }
      });
      const log = JSON.parse(localStorage.getItem('gf_ab') || '{}'), k = abKey();
      (log[k] = log[k] || []).unshift({ at: new Date().toISOString().slice(0, 10), changes: $('#abChanges').value.trim(), diff: r.both.diff, z: r.both.z, verdict: r.verdict, n });
      log[k] = log[k].slice(0, 20); localStorage.setItem('gf_ab', JSON.stringify(log)); abRenderLog();
      $('#abInfo').textContent = `${n.toLocaleString()} matches per version, twice, in ${sec}s.`;
    });
  });
  function abRenderLog() {
    const log = (JSON.parse(localStorage.getItem('gf_ab') || '{}'))[abKey()] || [];
    $('#abLog').innerHTML = log.length ? `<div class="suggest"><div class="sg"><h3>Tests for this deck (${log.length})</h3><ul>${log.map(e => `<li>${e.at} · ${esc(e.changes.replace(/\n/g, ', '))} · ${e.verdict === 'better' ? '✓' : e.verdict === 'worse' ? '✗' : '≈'} ${pts(e.diff)} pts (z ${e.z.toFixed(1)}, ${e.n.toLocaleString()} games)</li>`).join('')}</ul></div></div>` : '';
    if (log.length && typeof tidy === 'function') tidy($('#abLog'));
  }
  abRenderLog();
  $('#plOpp').addEventListener('change', showLabOpponents);
  showLabOpponents();

  function medianTurn(hist) { let c = 0; for (let i = 0; i < hist.length - 1; i++) { c += hist[i]; if (c >= 0.5) return i + 1; } return null; }
  function cumBy(hist, t) { let c = 0; for (let i = 0; i < Math.min(t, hist.length - 1); i++) c += hist[i]; return c; }

  function renderSuggestions(r, o) {
    const box = $('#simSuggest');
    if (typeof Suggest === 'undefined') { box.hidden = true; return; }
    const list = Suggest.fromSim(r, S.deck, o);
    box.hidden = !list.length;
    $('#suggestList').innerHTML = list.map(s => `<div class="sg ${s.level}"><b>${esc(s.title)}</b><p>${esc(s.detail)}</p>${s.cards ? `<ul>${s.cards.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>`).join('');
    tidy($('#suggestList'));
  }

  function renderSim() {
    const r = S.sim, o = S.simOpts, T = r.turns;
    const keep7 = r.mulligans[0];
    const avgM = r.mulligans.reduce((s, v, i) => s + v * i, 0);
    const kt = medianTurn(r.kill), ct = medianTurn(r.cmdr);
    $('#simTiles').innerHTML =
      tile('Mana on turn 4', r.agg.manaAvail[3] ? r.agg.manaAvail[3].mean.toFixed(1) : '–', `median ${r.agg.manaAvail[3] ? r.agg.manaAvail[3].p50 : '–'}, a land per turn would be 4`) +
      (r.hasCommander ? tile('Commander on curve', pct(cumBy(r.cmdr, Math.max(1, Math.round(S.deck.commanders[0].card.a.mv)))), `cast by turn ${Math.round(S.deck.commanders[0].card.a.mv)}; median turn ${ct || '>' + T}`) : '') +
      tile('Goldfish kill', kt ? 'Turn ' + kt : '>' + T, `median; ${pct(cumBy(r.kill, T))} dead by turn ${T}${r.cmdrKillShare > 0.005 ? `; ${pct(r.cmdrKillShare)} via commander damage` : ''}`) +
      tile('Missed a land drop by T3', pct(1 - r.onCurveLands[2]), `T4: ${pct(1 - r.onCurveLands[3])}`) +
      tile('Kept 7', pct(keep7), `avg ${avgM.toFixed(2)} mulligans`) +
      tile('Mana spent by T' + Math.min(6, T), r.agg.cumSpent[Math.min(6, T) - 1].mean.toFixed(1), 'avg total mana used');
    renderSuggestions(r, o);
    renderProfile(r);
    renderWins(r);

    const tl = i => 'T' + (i + 1);
    C.band($('#chartMana'), r.agg.manaAvail.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a, s: r.agg.cumSpent[i], l: r.agg.lands[i] })), {
      ref: i => i + 1, lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median mana</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(2)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div><div class="tt-row"><span>Lands (avg)</span><span>${d.l.mean.toFixed(2)}</span></div><div class="tt-row"><span>Total spent (avg)</span><span>${d.s.mean.toFixed(1)}</span></div><div class="tt-row"><span>Dashed line</span><span>one land per turn</span></div>`,
    });
    C.bars($('#chartLands'), r.onCurveLands.map((v, i) => ({ label: tl(i), v, tip: `<b>Turn ${i + 1}</b><div class="tt-row"><span>P(≥${i + 1} lands)</span><span>${pct(v)}</span></div><div class="tt-row"><span>Missed drop this turn</span><span>${pct(r.missed[i])}</span></div>` })), { labelAll: true, max: 1 });
    if (r.hasCommander) {
      $('#cmdrTitle').textContent = `${S.deck.commanders[0].card.name}: cast on turn…`;
      C.bars($('#chartCmdr'), r.cmdr.map((v, i) => ({ label: i < T ? tl(i) : 'never', v, color: i < T ? '#3987e5' : '#383835', tip: `<b>${i < T ? 'Turn ' + (i + 1) : 'Not cast by turn ' + T}</b><div class="tt-row"><span>This turn</span><span>${pct(v)}</span></div><div class="tt-row"><span>By this turn</span><span>${pct(cumBy(r.cmdr, i + 1))}</span></div>` })), { highlightMax: true });
    } else { $('#cmdrTitle').textContent = 'No commander in this list'; $('#chartCmdr').innerHTML = '<div class="empty-note">Mark a commander with *CMDR* or a Commander section.</div>'; }
    C.bars($('#chartKill'), r.kill.map((v, i) => ({ label: i < T ? tl(i) : 'later', v, color: i < T ? '#d95926' : '#383835', tip: `<b>${i < T ? 'Turn ' + (i + 1) : 'Alive after turn ' + T}</b><div class="tt-row"><span>Dies this turn</span><span>${pct(v)}</span></div><div class="tt-row"><span>Dead by this turn</span><span>${pct(cumBy(r.kill, i + 1))}</span></div>` })), { highlightMax: true });

    C.band($('#chartDamage'), r.agg.damage.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a })), {
      ref: () => o.oppLife, lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median damage</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(1)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div><div class="tt-row"><span>Dashed line</span><span>opponent life (${o.oppLife})</span></div>`,
    });
    C.band($('#chartPower'), r.agg.power.map((a, i) => ({ label: tl(i), mid: a.p50, lo: a.p10, hi: a.p90, a })), {
      lastLabel: 'median ', yfmt: v => v,
      tip: (d, i) => `<b>Turn ${i + 1}</b><div class="tt-row"><span>Median power</span><span>${d.a.p50}</span></div><div class="tt-row"><span>Average</span><span>${d.a.mean.toFixed(1)}</span></div><div class="tt-row"><span>10th–90th pct</span><span>${d.a.p10}–${d.a.p90}</span></div>`,
    });
    if (r.errors) $('#simInfo').textContent += ` · ${r.errors} games hit an engine error and were skipped`;
    // sample buttons
    const sb = $('#sampleButtons'); sb.innerHTML = '';
    [['worst', 'Rough game (5th pct)'], ['low', 'Below average (25th)'], ['median', 'Typical game (median)'], ['high', 'Good game (75th)'], ['best', 'Nut draw (95th)']].forEach(([k, label]) => {
      const b = h('button', 'sample-btn', label);
      b.addEventListener('click', () => { $$('.sample-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); replay(r.samples[k].seed, o); });
      sb.appendChild(b);
    });
    const rb = h('button', 'ghost', '🎲 Random game'); rb.addEventListener('click', () => { $$('.sample-btn').forEach(x => x.classList.remove('active')); replay(rseed(), o); }); sb.appendChild(rb);
     if (!S.lastReplaySeed) { sb.children[2].classList.add('active'); replay(r.samples.median.seed, o); }
    renderHeatmap();
  }

  // T-123: a sample game opens on the real Practice table. The same seed, deck and mulligans, and the same engine turns the simulation played
  // (G.playTurn), so the table holds exactly the simulation's own state after turn N; you take over from there with Next turn.
  function gameAtTurn(seed, o, turns) {
    const g = G.newGame(S.deck, o, seed); G.mulligan(g);
    for (let t = 0; t < turns && g.killTurn == null && !G.matchOver(g); t++) G.playTurn(g);
    return g;
  }
  function replayOnTable(seed, o, turns) {
    const g = gameAtTurn(seed, o, turns);
    if (!turns) startTableGame(g);
    else {
      g.turnDone = true;                                              // the turn is over (playTurn ended it): Next turn begins the next one
      resumeTableGame(g, `<li class="turn">Sample game</li><li>Replayed from its seed to the end of turn ${g.turn}${g.killTurn != null ? ' (goldfish dead)' : ''}: play on from here.</li>`);
      stepP('end');
    }
    showTab('table');
    return g;
  }
  function replay(seed, o) {
    S.lastReplaySeed = seed;
    const g0 = gameAtTurn(seed, o, 0), end = gameAtTurn(seed, o, o.turns);
    const last = end.killTurn != null ? end.killTurn : o.turns;
    let n = last;
    const box = $('#replay'); box.innerHTML = '';
    const row0 = h('div', 'turnrow');
    row0.innerHTML = `<div class="tlabel">Opening<small>${g0.mulligans ? g0.mulligans + ' mulligan' + (g0.mulligans > 1 ? 's' : '') : 'kept 7'}</small></div>`;
    const c0 = h('div', 'tcards'); g0.hand.forEach(i => c0.appendChild(cardEl(i.card))); row0.appendChild(c0);
    row0.appendChild(h('div', 'tstats', end.killTurn != null ? `☠ <b>Goldfish dead on turn ${end.killTurn}</b>` : `No kill in ${o.turns} turns`));
    box.appendChild(row0);
    const ctl = h('div', 'row wrap replay-ctl'), lbl = h('span', 'replay-turn');
    const show = () => { lbl.textContent = n ? 'Turn ' + n : 'Opening hand'; };
    const step = d => { n = Math.max(0, Math.min(last, n + d)); show(); };
    const prev = h('button', 'ghost', '‹'), next = h('button', 'ghost', '›'), go = h('button', 'primary', 'Replay on the table →');
    prev.title = 'One turn earlier'; next.title = 'One turn later'; prev.id = 'replayPrev'; next.id = 'replayNext'; go.id = 'replayGo';
    prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
    go.addEventListener('click', () => replayOnTable(seed, o, n));
    ctl.append(prev, lbl, next, go); box.appendChild(ctl); show();
  }

  let heatSort = { col: 'avg', dir: 1 };
  function renderHeatmap() {
    const r = S.sim, T = r.turns;
    const rows = S.deck.unique.map((c, u) => {
      const cb = r.castBy[u];
      const cum = []; let acc = 0;
      for (let t = 0; t <= T; t++) { acc += cb[t]; cum.push(acc); }
      let avg = 0, w = 0; for (let t = 1; t <= T; t++) { avg += t * cb[t]; w += cb[t]; }
      return { c, cum, avg: w ? avg / w : 99, never: cb[T + 1], dead: r.drawnNotCast[u] };
    }).filter(x => !x.c.a.isLand || x.c.qty === 1 || true);
    const key = heatSort.col;
    rows.sort((a, b) => {
      let va, vb;
      if (key === 'name') { va = a.c.name; vb = b.c.name; return heatSort.dir * va.localeCompare(vb); }
      if (key === 'avg') { va = a.avg; vb = b.avg; }
      else if (key === 'dead') { va = -a.dead; vb = -b.dead; }
      else { va = -a.cum[key]; vb = -b.cum[key]; }
      return heatSort.dir * (va - vb);
    });
    const th = (k, label, title) => `<th data-k="${k}" class="${heatSort.col == k ? 'sorted' : ''}" title="${title || ''}">${label}</th>`;
    let html = '<table><thead><tr>' + th('name', 'Card') + th('avg', 'Avg turn', 'average turn played, when played');
    for (let t = 1; t <= T; t++) html += th(t, 'T' + t, `P(played by turn ${t})`);
    html += th('dead', 'Stuck in hand', 'drawn but never played within the simulated turns') + '</tr></thead><tbody>';
    rows.forEach(x => {
      const img = imgFor(x.c);
      html += `<tr><td class="name"><span class="mtg-ref" data-uid="${x.c.uid}"><span class="thumb" style="background-image:url('${img || ''}')"></span>${esc(x.c.name)}${x.c.qty > 1 ? ` ×${x.c.qty}` : ''}</span></td><td class="num">${x.avg < 99 ? x.avg.toFixed(1) : '–'}</td>`;
      for (let t = 1; t <= T; t++) {
        const v = x.cum[t];
        html += `<td style="background:${C.rampColor(v)};color:${v > 0.6 ? '#0b0b0b' : '#f0efec'}" data-tip="${esc(x.c.name)}|${t}|${v}">${v >= 0.995 ? '✓' : Math.round(v * 100)}</td>`;
      }
      html += `<td class="num">${pct(x.dead)}</td></tr>`;
    });
    html += '</tbody></table>';
    const hm = $('#heatmap'); hm.innerHTML = html;
    hm.querySelectorAll('th').forEach(t => t.addEventListener('click', () => {
      const k = isNaN(+t.dataset.k) ? t.dataset.k : +t.dataset.k;
      heatSort = { col: k, dir: heatSort.col === k ? -heatSort.dir : 1 }; renderHeatmap();
    }));
    hm.querySelectorAll('td[data-tip]').forEach(td => {
      td.addEventListener('mousemove', e => { const [n, t, v] = td.dataset.tip.split('|'); C.showTip(`<b>${n}</b><div class="tt-row"><span>Played by turn ${t}</span><span>${pct(+v)}</span></div>`, e.clientX, e.clientY); });
      td.addEventListener('mouseleave', C.hideTip);
    });
    // hover name -> zoom (reuse .mtg zoom by a proxy element)
    hm.querySelectorAll('.mtg-ref').forEach(s => {
      s.addEventListener('click', () => showLightbox(getCard(s.dataset.uid), s));
      s.addEventListener('mouseenter', e => { const fake = cardEl(getCard(s.dataset.uid)); zoom.innerHTML = ''; const f = h('div', 'faces'); f.appendChild(fake); zoom.appendChild(f); zoom.classList.remove('two'); zoom.classList.add('show'); placeZoom(e); });
      s.addEventListener('mouseleave', () => zoom.classList.remove('show'));
    });
  }

  // ======================= tags (tags.js) =======================
  // Every card gets namespaced tags (role:ramp, trigger:etb, tribe:merfolk...). You can search them, send a result to Draw Odds,
  // or save the result as your own tag (my:combo). Your tags are kept in this browser by card name, so they follow a card into any deck.
  const getUserTags = () => { try { return JSON.parse(localStorage.getItem('gf_tags') || '{}') || {}; } catch (e) { return {}; } };
  function putUserTags(all) { try { localStorage.setItem('gf_tags', JSON.stringify(all)); return true; } catch (e) { toast('Could not save: this browser is out of storage space'); return false; } }
  function buildTags() {
    if (!S.deck || typeof Tags === 'undefined') { S.tags = null; return; }
    S.tags = Tags.index(S.deck, getUserTags());
    $('#tagList').innerHTML = S.tags.tags.map(t => `<option value="${esc(t)}">`).join('');
  }
  const tagTerms = () => $('#tagQuery').value.trim().split(/\s+/).filter(Boolean);
  function toggleTagTerm(tag, not) {
    const terms = tagTerms(), pos = tag, neg = '-' + tag;
    const i = terms.findIndex(t => t === pos || t === neg);
    if (i >= 0) { const was = terms[i]; terms.splice(i, 1); if (not && was === pos) terms.push(neg); else if (!not && was === neg) terms.push(pos); }
    else terms.push(not ? neg : pos);
    $('#tagQuery').value = terms.join(' '); renderTags();
  }
  const tagOpen = new Set(), tagAll = new Set();          // which tag groups are open / fully shown (kept while you search; none to start: the whole box is folded until you open it)
  // T-074: a deck that is loaded starts the Tags box folded to its header, every group inside it folded, and no search left over (a box you opened for the last deck is shut again)
  function foldTags() {
    tagOpen.clear(); tagAll.clear();
    const q = $('#tagQuery'); if (q) q.value = '';
    const box = $('#deckTags'); if (box && foldDefault()) box.classList.add('box-closed');
  }
  function renderTags() {
    const box = $('#deckTags');
    if (!S.tags) { box.hidden = true; return; }
    box.hidden = false;
    const ix = S.tags, terms = tagTerms();
    // chips, grouped by namespace
    // calmer layout: each group folds open and shut (Role open to start), tags sit in an even grid of same-width tiles,
    // and a group shows its 8 most common tags until you ask for all of them
    const chips = h('div', '');
    const TOP = 8;
    Tags.ORDER.filter(ns => ix.groups[ns]).forEach(ns => {
      const list = ix.groups[ns].slice().sort((a, b) => ns === 'mv' ? a.localeCompare(b, undefined, { numeric: true }) : (ix.copies.get(b) - ix.copies.get(a)) || a.localeCompare(b));
      const active = list.some(t => terms.includes(t) || terms.includes('-' + t));
      const g = h('details', 'tag-group');
      g.open = tagOpen.has(ns) || active;
      g.addEventListener('toggle', () => { g.open ? tagOpen.add(ns) : tagOpen.delete(ns); });
      g.appendChild(h('summary', '', `<span class="tag-ns">${esc(Tags.NAMESPACES[ns] || ns)}</span><span class="tag-ns-n">${list.length}</span>`));
      const grid = h('div', 'tag-grid');
      const showAll = tagAll.has(ns) || list.length <= TOP + 2;
      (showAll ? list : list.slice(0, TOP)).forEach(t => {
        const on = terms.includes(t), not = terms.includes('-' + t);
        const b = h('button', 'tag-chip' + (on ? ' on' : '') + (not ? ' not' : ''), `<span>${esc(t.slice(ns.length + 1).replace(/-/g, ' '))}</span><small>${ix.copies.get(t)}</small>`);
        b.title = `${t}: ${ix.copies.get(t)} card${ix.copies.get(t) === 1 ? '' : 's'}. Click to add to the search, Shift-click to exclude.`;
        b.addEventListener('click', e => toggleTagTerm(t, e.shiftKey));
        grid.appendChild(b);
      });
      g.appendChild(grid);
      if (list.length > TOP + 2) {
        const more = h('button', 'ghost tag-more', tagAll.has(ns) ? 'Show fewer' : `Show all ${list.length}`);
        more.addEventListener('click', () => { tagAll.has(ns) ? tagAll.delete(ns) : tagAll.add(ns); renderTags(); });
        g.appendChild(more);
      }
      chips.appendChild(g);
    });
    if (!ix.groups.my) chips.appendChild(h('div', 'hint', 'No tags of your own yet: search for some cards, then press <b>Tag these…</b> to save them as <code>my:name</code>.'));
    $('#tagChips').innerHTML = ''; $('#tagChips').appendChild(chips);
    // results
    const res = $('#tagResults'); res.innerHTML = '';
    const q = Tags.query(ix, terms.join(' '));
    S.tagResult = q.cards;
    const total = Tags.copiesOf(q.cards);
    $('#tagToOdds').disabled = $('#tagMake').disabled = !q.cards.length;
    $('#tagHelp').innerHTML = !terms.length ? `${ix.tags.length} tags across ${ix.cards.length} cards. Tap a tag to find its cards. <details class="tag-how"><summary>How to search</summary>A space means AND, a comma means OR, <code>-tag</code> excludes (or Shift-click a tag), <code>trigger:</code> means any trigger, and a bare word like <code>ramp</code> matches any tag of that name.</details>`
      : `${q.cards.length} different card${q.cards.length === 1 ? '' : 's'} (${total} in the deck)${q.cards.length ? '' : ': nothing has all of those tags'}`;
    q.cards.forEach(c => res.appendChild(cardEl(c, { badge: c.qty > 1 ? '×' + c.qty : null })));
  }
  $('#tagQuery').addEventListener('input', renderTags);
  $('#tagClear').addEventListener('click', () => { $('#tagQuery').value = ''; renderTags(); });
  $('#tagToOdds').addEventListener('click', () => { (S.tagResult || []).forEach(c => { if (!c.commander) S.oddsSel.add(c.uid); }); renderOdds(); showTab('odds'); toast('Sent to Draw Odds'); });
  $('#tagMake').addEventListener('click', () => {
    const cards = (S.tagResult || []).filter(c => !c.commander); if (!cards.length) return;
    const raw = window.prompt(`Name for your new tag (it will be saved as my:name on these ${cards.length} card${cards.length === 1 ? '' : 's'}). Use the same name again to add to an existing tag; type - first to remove these cards from it.`, '');
    if (!raw) return;
    const remove = raw.trim().startsWith('-'), name = Tags.kebab(raw.replace(/^\s*-/, '').replace(/^my:/i, ''));
    if (!name) return;
    const all = getUserTags(), cur = new Set(all[name] || []);
    cards.forEach(c => remove ? cur.delete(c.name) : cur.add(c.name));
    if (cur.size) all[name] = [...cur]; else delete all[name];
    if (!putUserTags(all)) return;
    buildTags();
    $('#tagQuery').value = cur.size ? 'my:' + name : ''; renderTags();
    toast(remove ? `Removed from my:${name}` : `Saved my:${name} (${cur.size} card${cur.size === 1 ? '' : 's'})`);
  });
  $('#oddsTagGo').addEventListener('click', applyOddsTag);
  $('#oddsTag').addEventListener('keydown', e => { if (e.key === 'Enter') applyOddsTag(); });
  function applyOddsTag() {
    if (!S.tags) return;
    const q = Tags.query(S.tags, $('#oddsTag').value);
    if (!q.cards.length) return toast('No cards have all of those tags');
    q.cards.forEach(c => { if (!c.commander) S.oddsSel.add(c.uid); });
    renderOdds(); toast(`Selected ${q.cards.length} card${q.cards.length === 1 ? '' : 's'}`);
  }
  // tag chips for one card (used in the lightbox): click one to search for it on the Deck tab
  function cardTagChips(card) {
    const set = S.tags && isDeckCard(card) && S.tags.ofCard.get(card.uid); if (!set) return null;
    const wrap = h('div', 'lb-tags');
    [...set].filter(t => !/^(mv|color|engine):/.test(t)).sort((a, b) => Tags.ORDER.indexOf(a.split(':')[0]) - Tags.ORDER.indexOf(b.split(':')[0]) || a.localeCompare(b)).forEach(t => {
      const b = h('button', 'tag-chip', esc(t)); b.title = 'Search the deck for this tag';
      b.addEventListener('click', () => { lbClose(); $('#tagQuery').value = t; showTab('deck'); renderTags(); $('#deckTags').classList.remove('box-closed'); $('#deckTags').scrollIntoView({ block: 'start' }); });          // you asked for those cards: the box opens
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ======================= odds =======================
  $('#oddsGroup').addEventListener('change', e => {
    const role = e.target.value; if (!role || !S.deck) return;
    S.deck.unique.forEach(c => { if (c.commander) return; const a = c.a; if ((role === 'land' && a.isLand) || (role === 'ramp' && a.role === 'ramp') || (role === 'draw' && a.draw) || (role === 'creature' && a.isCreature && !a.isLand)) S.oddsSel.add(c.uid); });
    e.target.value = ''; renderOdds();
  });
  $('#oddsClear').addEventListener('click', () => { S.oddsSel.clear(); catActive = null; $('#oddsK').value = 1; renderOdds(); });          // back to the default group, at least 1
  $('#oddsK').addEventListener('input', () => renderOdds(true));

  // ---- odds by category: every role tag (ramp, draw, removal...) plus lands, at least one seen after N cards ----
  const CAT_NAME = { ramp: 'Ramp', 'fast-mana': 'Fast mana', draw: 'Card draw', removal: 'Removal', wipe: 'Board wipes', counter: 'Counterspells',
    protection: 'Protection', tutor: 'Tutors', recursion: 'Recursion', 'graveyard-hate': 'Graveyard hate', 'grave-hate': 'Graveyard hate', graveyard: 'Graveyard synergy',
    finisher: 'Finishers', wincon: 'Win conditions', anthem: 'Anthems', tokens: 'Token makers', 'sac-outlet': 'Sacrifice outlets', superfriends: 'Planeswalker support',
    lifegain: 'Lifegain', stax: 'Stax', discard: 'Discard', theft: 'Theft' };
  const CAT_SKIP = new Set(['instant-speed']);              // a speed, not a kind of card
  const catName = r => CAT_NAME[r] || (r.charAt(0).toUpperCase() + r.slice(1)).replace(/-/g, ' ');
  let catActive = null;
  function categories() {
    const lib = c => !c.commander;
    const out = [{ key: 'land', name: 'Lands', cards: S.deck.unique.filter(c => lib(c) && c.a.isLand) }];
    if (S.tags) S.tags.tags.filter(t => t.startsWith('role:') && !CAT_SKIP.has(t.slice(5))).forEach(t => {
      const cards = (S.tags.cardsOf.get(t) || []).filter(lib);
      if (cards.length) out.push({ key: t, name: catName(t.slice(5)), cards });
    });
    else [['ramp', c => c.a.role === 'ramp'], ['draw', c => c.a.draw]].forEach(([k, f]) => out.push({ key: 'role:' + k, name: catName(k), cards: S.deck.unique.filter(c => lib(c) && f(c)) }));
    return out.map(c => Object.assign(c, { qty: c.cards.reduce((s, x) => s + (x.qty || 1), 0) })).filter(c => c.qty)
      .sort((a, b) => (a.key === 'land' ? -1 : b.key === 'land' ? 1 : a.name.localeCompare(b.name)));
  }
  function renderCatOdds() {
    if (!S.deck) return;
    const N = S.deck.library.length, box = $('#catN');
    const n = Math.max(1, Math.min(N, Math.round(+box.value || 7)));
    if (+box.value !== n) box.value = n;
    const onPlay = opts().onPlay, extra = n - 7, turn = extra + (onPlay ? 1 : 0);
    $('#catWhen').textContent = n === 7 ? '= your opening hand' : n < 7 ? '(fewer than an opening hand)' : `≈ by turn ${turn}, ${onPlay ? 'on the play' : 'on the draw'} (natural draws only)`;
    const body = $('#catBody'); body.innerHTML = '';
    categories().forEach(cat => {
      const p = G.hyperAtLeast(N, cat.qty, Math.min(N, n), 1);
      const tr = h('tr', 'cat-row' + (catActive === cat.key ? ' on' : ''), `<td>${esc(cat.name)}</td><td class="num">${cat.qty}</td><td class="num"><span class="cat-bar" style="--p:${(p * 100).toFixed(1)}%"></span><b>${Math.round(p * 100)}%</b></td>`);
      tr.title = `${cat.qty} card${cat.qty === 1 ? '' : 's'} in ${N}: at least one in ${n} cards drawn is ${pct(p)}. Tap to pick them below.`;
      tr.addEventListener('click', () => {
        catActive = cat.key; S.oddsSel = new Set(cat.cards.map(c => c.uid)); renderOdds();
        const t = $('#oddsTitle'); if (t && t.scrollIntoView && !canHover) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      body.appendChild(tr);
    });
  }
  $('#catN').addEventListener('input', renderCatOdds);
  $('#catMinus').addEventListener('click', () => { $('#catN').value = Math.max(1, (+$('#catN').value || 7) - 1); renderCatOdds(); });
  $('#catPlus').addEventListener('click', () => { $('#catN').value = (+$('#catN').value || 7) + 1; renderCatOdds(); });

  // ---- combo odds (combos.js comboOdds): every piece of at least one Commander Spellbook combo drawn, by turn ----
  const deckIdentity = deck => { const cmd = deck.commanders.map(i => i.card); return cmd.length ? [...new Set(cmd.flatMap(c => c.color_identity || []))] : null; };
  const comboTurns = max => [...new Set([0, 2, 4, 6, 8, 10].filter(t => t <= max).concat(max > 0 ? [max] : []))];
  const comboPct = (p, e) => (p >= 0.9995 ? '100%' : p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%') + (e ? ` <span class="hint">±${(e * 100).toFixed(1)}</span>` : '');
  const comboCards = c => c.cards.map(esc).join(' + ');
  function renderComboOdds() {
    const box = $('#comboOdds'); if (!box || typeof Combos === 'undefined' || !Combos.comboOdds) return;
    const deck = S.deck; if (!deck) { box.hidden = true; return; }
    loadComboDb().then(db => {
      if (!db || S.deck !== deck) return;
      const o = opts(), found = Combos.find(db, deck.unique.map(c => c.name), deckIdentity(deck)), turns = comboTurns(o.turns || 10);
      const r = Combos.comboOdds(deck, found.included, turns, o.onPlay);
      const head = '<tr><th></th>' + turns.map(t => `<th>${t ? 'T' + t : 'Hand'}</th>`).join('') + '</tr>';
      const line = (name, x, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${name}</td>` + x.p.map((p, i) => `<td class="num">${comboPct(p, x.err && x.err[i])}</td>`).join('') + '</tr>';
      let html;
      if (!r.rows.length) html = `<p>No Commander Spellbook combo has every piece in this deck.${found.almost.length ? ` ${found.almost.length} are one card away: the Simulate tab's "Raise your combo odds" shows what adding one would do.` : ''}</p>`;
      else {
        const last = turns.length - 1;
        html = `<table class="cat-table combo-odds"><thead>${head}</thead><tbody>` + line(`<b>Any combo</b> <span class="hint">${r.rows.length}</span>`, r.any, 'any') +
          r.groups.map(g => line(`${esc(g.name)} <span class="hint">${g.rows.length}</span>`, g)).join('') + '</tbody></table>' +
          `<p class="hint">${o.onPlay ? 'On the play' : 'On the draw'}. ${r.any.exact ? 'Exact.' : `Estimated from ${r.any.samples.toLocaleString()} shuffles.`}</p>` +
          r.groups.map(g => `<div class="sg"><b>${esc(g.name)}</b><ul>${g.rows.slice().sort((a, b) => b.p[last] - a.p[last]).slice(0, 25).map(x =>
            `<li><a href="${esc(x.combo.url)}" target="_blank" rel="noopener">${comboCards(x.combo)}</a>: ${turns.map((t, i) => `${t ? 'T' + t : 'hand'} ${comboPct(x.p[i])}`).join(' · ')}${x.combo.does && x.combo.does.length ? `<br><span class="hint">${esc(x.combo.does.slice(0, 3).join('; '))}</span>` : ''}</li>`).join('')}</ul>${g.rows.length > 25 ? '<p>The 25 likeliest are shown.</p>' : ''}</div>`).join('');
      }
      $('#comboOddsBody').innerHTML = html; S.comboOdds = r;
      box.hidden = false; tidy(box);
    });
  }

  // ---- Simulate: "Raise your combo odds" (combos.js additions / swapOdds): one card in, one out, and the any-combo odds by turn 6, 8, 10 ----
  const RAISE_TURNS = [6, 8, 10];
  let raiseRun = 0, raiseFor = null, raiseUserCut = false, raiseKey = '';
  const RAISE_POOL = 30; let raiseRemoved = new Set();            // the candidates ranked, and the suggestions the user removed for this deck
  const gainTxt = g => (g >= 0 ? '+' : '−') + Math.abs(g * 100).toFixed(1);
  function raiseCells(r, base) { return r.any.p.map((p, i) => `<td class="num">${comboPct(p, r.any.err[i])}${base ? ` <span class="${r.any.p[i] - base.any.p[i] > 0.0005 ? 'gain' : 'hint'}">${gainTxt(r.any.p[i] - base.any.p[i])}</span>` : ''}</td>`).join(''); }
  // the default cut: drawn but often not cast in the last run (Suggest.deadCards), else the costliest card in no combo
  function raiseDefaultCut(db, id) {
    const pieces = Combos.comboPieces(db, S.deck, id), free = c => !c.commander && !pieces.has(c.name);
    if (S.sim && typeof Suggest !== 'undefined') { const d = Suggest.deadCards(S.sim, S.deck).find(x => free(S.deck.unique.find(c => c.name === x.name) || {})); if (d) return { name: d.name, why: `drawn but not cast in ${Math.round(d.rate * 100)}% of the games it was drawn, in your last simulation` }; }
    const c = S.deck.unique.filter(c => free(c) && !c.a.isLand).sort((a, b) => b.a.mv - a.a.mv || a.name.localeCompare(b.name))[0];
    return c ? { name: c.name, why: 'the costliest card in no combo (run a simulation to rate your cards)' } : { name: '', why: '' };
  }
  // o.simDone: a run just finished (a cut you did not pick yourself follows it). Nothing is recomputed while the deck, play/draw and cut are the same.
  function renderComboRaise(ro) {
    ro = ro || {};
    const box = $('#comboRaise'); if (!box || typeof Combos === 'undefined' || !Combos.additions) return;
    const deck = S.deck; if (!deck) { box.hidden = true; return; }
    loadComboDb().then(async db => {
      if (!db || S.deck !== deck) return;
      const o = opts(), id = deckIdentity(deck), sel = $('#raiseCut');
      const fresh = raiseFor !== deck;
      if (fresh) {                                   // another deck: its own cut list, and the last deck's results go
        sel.innerHTML = deck.unique.filter(c => !c.commander).map(c => c.name).filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a.localeCompare(b)).map(n => `<option>${esc(n)}</option>`).join('');
        raiseFor = deck; raiseUserCut = false; raiseKey = ''; raiseRemoved = new Set(); $('#raiseOwn').innerHTML = ''; $('#raiseSim').innerHTML = '';
      }
      if (fresh || (ro.simDone && !raiseUserCut)) {
        const def = raiseDefaultCut(db, id);
        if (def.name) sel.value = def.name;
        $('#raiseWhy').textContent = def.why ? `Default: ${def.name}, ${def.why}.` : '';
      }
      const cut = sel.value, key = cut + '|' + o.onPlay;
      if (key === raiseKey && S.comboRaise && (S.comboRaise.done || raiseRun)) return;          // same deck, cut and play/draw: keep what is shown
      raiseKey = key;
      if (!fresh) { $('#raiseOwn').innerHTML = ''; $('#raiseSim').innerHTML = ''; S.comboRaiseOwn = null; S.comboRaiseSim = null; if (raiseUserCut) { const def = raiseDefaultCut(db, id); $('#raiseWhy').textContent = def.why && def.name === cut ? `Default: ${def.name}, ${def.why}.` : ''; } }          // another cut or play/draw: the old swap and check rows no longer match
      const run = ++raiseRun, tok = raiseClaim();
      try {
      const found = Combos.find(db, deck.unique.map(c => c.name), id);
      const base = Combos.comboOdds(deck, found.included, RAISE_TURNS, o.onPlay, { anyOnly: true });
      S.comboRaise = { base, rows: [], cut, done: false };
      const head = '<tr><th></th>' + RAISE_TURNS.map(t => `<th>T${t}</th>`).join('') + '</tr>';
      const body = $('#raiseBody');
      body.innerHTML = `<table class="cat-table combo-odds raise"><thead>${head}</thead><tbody><tr class="any"><td>Now <span class="hint">${found.included.length} combo${found.included.length === 1 ? '' : 's'}</span></td>${raiseCells(base)}</tr></tbody></table>`;
      box.hidden = false; tidy(box);
      // 1. the candidates, then their colours and legality from Scryfall (a card outside the commander's colours or not legal is never offered)
      raiseProgress(0, tok, 'Looking up the cards…');
      const wanted = Combos.additions(db, deck, id, cut, 60).map(a => a.card);
      const verified = await raiseLookup(wanted);
      if (run !== raiseRun || S.deck !== deck) return;
      const cands = Combos.additions(db, deck, id, cut, RAISE_POOL, { info: raiseInfoOf(deck), requireInfo: verified });
      $('#raiseAddList').innerHTML = cands.map(a => `<option value="${esc(a.card)}">`).join('');
      // 2. the odds with each one in, one step at a time
      const rows = [], total = cands.length + 1;
      raiseProgress(1 / total, tok, cands.length ? `Checking 0 of ${cands.length}…` : '');
      for (const a of cands) {
        await new Promise(r => setTimeout(r, 0)); if (run !== raiseRun || S.deck !== deck) return;
        const r = Combos.swapOdds(db, deck, id, a.card, cut, RAISE_TURNS, o.onPlay);
        rows.push(Object.assign({}, a, { r, gain: r.any.p.map((p, i) => p - base.any.p[i]) }));
        raiseProgress((rows.length + 1) / total, tok, `Checking ${rows.length} of ${cands.length}…`);
      }
      const score = x => x.gain.reduce((s, g) => s + g, 0);
      rows.sort((a, b) => score(b) - score(a) || b.combos[0].popularity - a.combos[0].popularity);
      S.comboRaise = { base, rows, cut, done: true, verified, head };
      raiseShow();
      } catch (e) { console.error(e); } finally { raiseProgress(null, tok); }
    });
  }
  // the list: the best 5 that are not removed (the next best takes the place of a removed one), and the best 10 folded
  function raiseShow() {
    const cr = S.comboRaise, body = $('#raiseBody'); if (!cr || !cr.done) return;
    const left = cr.rows.filter(x => !raiseRemoved.has(x.card)), removed = cr.rows.length - left.length, head = cr.head;
    cr.shown = left.slice(0, 5).map(x => x.card);
    const note = (cr.verified ? '' : '<p class="hint">Could not check the cards on Scryfall (offline?): the colours come from the Commander Spellbook snapshot and legality was not checked.</p>') +
      (removed ? `<p class="hint">${removed} removed. <button class="ghost raise-reset">Show removed</button></p>` : '');
    if (!cr.rows.length) { body.innerHTML = body.querySelector('table').outerHTML + '<p>Commander Spellbook knows no card that completes a combo with this deck in its colours.</p>' + note; raiseButtons(body); return; }
    const top = left.slice(0, 5), more = left.slice(0, 10);
    body.innerHTML = `<table class="cat-table combo-odds raise"><thead>${head.replace('<th></th>', `<th>Add (cut ${esc(cr.cut)})</th>`).replace('</tr>', '<th></th></tr>')}</thead><tbody><tr class="any"><td>Now</td>${raiseCells(cr.base)}<td></td></tr>` +
      top.map(x => `<tr data-add="${esc(x.card)}"><td><a href="${esc(x.combos[0].url)}" target="_blank" rel="noopener">+ ${esc(x.card)}</a></td>${raiseCells(x.r, cr.base)}<td><button class="ghost raise-sim" data-add="${esc(x.card)}">Simulate</button> <button class="ghost raise-apply" data-add="${esc(x.card)}">Apply</button> <button class="ghost raise-rm" data-add="${esc(x.card)}" title="Remove this suggestion; the next best fills in" aria-label="Remove ${esc(x.card)} from the suggestions">✕</button></td></tr>`).join('') + '</tbody></table>' +
      (more.length ? `<div class="sg"><b>What each addition completes</b><ul>${more.map(x => `<li><b>+ ${esc(x.card)}</b> ${x.gain.map((g, i) => `T${RAISE_TURNS[i]} ${gainTxt(g)}`).join(' · ')}: ${x.combos.slice(0, 4).map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${comboCards(c)}</a> (${esc((c.does || []).slice(0, 2).join('; '))})`).join('; ')}${x.combos.length > 4 ? ` and ${x.combos.length - 4} more` : ''}</li>`).join('')}</ul>${left.length > 10 ? `<p>The 10 best of ${left.length} are listed; try any other with "Try your own".</p>` : ''}</div>` : '') +
      (top.length ? '' : '<p>Every suggestion was removed.</p>') + note;
    tidy(body);
    raiseButtons(body);
  }
  // the progress bar: frac 0..1 and a label; null hides it. Every step is logged in S.comboRaiseProg (the test reads it).
  let raiseBar = 0;                                        // the newest run owns the bar: only its token moves or hides it
  const raiseClaim = () => ++raiseBar;
  function raiseProgress(frac, tok, label) {
    const el = $('#raiseProg'); if (!el || tok !== raiseBar) return;
    if (frac == null) { el.hidden = true; return; }
    const pc = Math.round(Math.min(1, frac) * 100);
    el.hidden = false; el.querySelector('.progress div').style.width = pc + '%'; el.querySelector('.progress').setAttribute('aria-valuenow', pc);
    $('#raiseProgTxt').textContent = label || '';
    const lg = (S.comboRaiseProg = S.comboRaiseProg || []); lg.push({ pc, label }); if (lg.length > 200) lg.splice(0, lg.length - 200);
  }
  // colours and legality of the candidate cards: asked of Scryfall once, kept for the session. false when Scryfall could not be reached.
  const raiseInfo = new Map();
  async function raiseLookup(names) {
    const need = names.filter(n => !raiseInfo.has(n));
    if (!need.length) return true;
    try {
      const got = await Source.loadDeck(need.map(n => '1 ' + n).join('\n'), () => {});
      for (const c of got.cards) { raiseInfo.set(c.name, c); raiseInfo.set(c.name.split(' // ')[0], c); }
      for (const n of need) if (!raiseInfo.has(n)) raiseInfo.set(n, null);          // Scryfall does not know it: not offered
      return true;
    } catch (e) { return false; }
  }
  const raiseInfoOf = deck => n => raiseInfo.get(n) || raiseInfo.get(String(n).split(' // ')[0]) || deck.unique.find(c => c.name === n || c.name.split(' // ')[0] === String(n).split(' // ')[0]);
  function raiseButtons(el) {
    el.querySelectorAll('.raise-sim').forEach(b => b.addEventListener('click', () => raiseSimulate(b.dataset.add, $('#raiseCut').value)));
    el.querySelectorAll('.raise-apply').forEach(b => b.addEventListener('click', () => raiseApply(b.dataset.add, $('#raiseCut').value)));
    el.querySelectorAll('.raise-rm').forEach(b => b.addEventListener('click', () => { raiseRemoved.add(b.dataset.add); raiseShow(); }));
    el.querySelectorAll('.raise-reset').forEach(b => b.addEventListener('click', () => { raiseRemoved = new Set(); raiseShow(); }));
  }
  // your own swap: the same numbers for any card name
  async function raiseOwn() {
    const add = $('#raiseAdd').value.trim(), cut = $('#raiseCut').value, out = $('#raiseOwn'); if (!add || !S.deck) return;
    out.innerHTML = ''; S.comboRaiseOwn = null;          // the last swap's row goes while this one is looked up
    const db = await loadComboDb(); if (!db) return;
    const o = opts(), id = deckIdentity(S.deck);
    if (id) {          // the commander's colour identity: a card outside it cannot be in the deck (the suggestions already keep to it)
      await raiseLookup([add]);
      const info = raiseInfoOf(S.deck)(add), bad = info && (info.color_identity || []).filter(l => !id.includes(l));
      if (bad && bad.length) { out.innerHTML = `<p class="hint">${esc(add)} is outside your commander's colour identity (${esc(bad.join(''))}), so it cannot go in this deck.</p>`; S.comboRaiseOwn = null; return; }
    }
    const found = Combos.find(db, S.deck.unique.map(c => c.name), id), base = Combos.comboOdds(S.deck, found.included, RAISE_TURNS, o.onPlay, { anyOnly: true });
    const r = Combos.swapOdds(db, S.deck, id, add, cut, RAISE_TURNS, o.onPlay);
    const known = Combos.find(db, [add], null).included.length || db._where.has(add) || db._where.has(add.split(' // ')[0]);
    const extra = r.included.length - found.included.length;
    out.innerHTML = `<table class="cat-table combo-odds raise"><tbody><tr class="any"><td>Now</td>${raiseCells(base)}<td></td></tr><tr data-add="${esc(add)}"><td>+ ${esc(add)} <span class="hint">− ${esc(cut)}</span></td>${raiseCells(r, base)}<td><button class="ghost raise-sim" data-add="${esc(add)}">Simulate</button> <button class="ghost raise-apply" data-add="${esc(add)}">Apply</button></td></tr></tbody></table>` +
      `<p class="hint">${!known ? 'This card is in no combo of the Commander Spellbook snapshot, so the odds only change through the cut.' : `${r.included.length} combo${r.included.length === 1 ? '' : 's'} after the swap (${extra >= 0 ? '+' : ''}${extra}).`}</p>`;
    S.comboRaiseOwn = { add, cut, base, r };
    raiseButtons(out);
  }
  $('#raiseGo').addEventListener('click', raiseOwn);
  $('#raiseAdd').addEventListener('keydown', e => { if (e.key === 'Enter') raiseOwn(); });
  $('#raiseCut').addEventListener('change', () => { raiseUserCut = true; renderComboRaise(); });
  // the swap in the deck: the cut card's line loses a copy and the added card goes right after it, then the list is loaded again
  const nameKey = n => String(n || '').split(' // ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');
  async function raiseApply(add, cut) {
    const text = S.deckText; if (!text) return toast('Load the deck from a list first');
    const out = swapInText(text, [{ cut, add }], c => S.cards.filter(x => !x.commander && x.name === c).map(x => x.input_name));          // main-deck lines only: a Sideboard or Maybeboard copy is left alone
    if (out.missing.length) return toast(`${cut} was not found in the loaded list`);
    $('#deckText').value = out.text;          // the box shows the list that is now loaded
    const ok = await loadDeck({ quiet: true, text: out.text });          // quiet: no extra saved copy; the loaded deck is the one that changed
    if (!ok) { $('#deckText').value = text; return; }
    localStorage.setItem('gf_last', out.text);          // a reload brings back the swapped list
    toast(`Swapped ${cut} for ${add}`); showTab('sim');
  }
  // the swap checked by simulation: 2,000 goldfish games of each deck, the same shuffles
  let raiseWorker = null;
  function simOnce(cards, tokens, o, n, seed, bar) {
    return new Promise((res, rej) => {
      if (raiseWorker) raiseWorker.terminate();
      raiseWorker = ParWorker();
      raiseWorker.onmessage = e => { if (e.data.progress != null && bar) bar(e.data.progress); if (e.data.result) res(e.data.result); };
      raiseWorker.onerror = err => rej(err);
      raiseWorker.postMessage({ cards, tokens, opts: o, n, seed });
    });
  }
  async function raiseSimulate(add, cut) {
    const out = $('#raiseSim'), deck = S.deck; if (!deck) return;
    const tok = raiseClaim(); out.innerHTML = ''; raiseProgress(0, tok, `Simulating + ${add} − ${cut}: finding the card…`);
    try {
      const got = await Source.loadDeck('1 ' + add, () => {}), card = got.cards[0];
      if (!card) { out.innerHTML = `<p class="hint">${esc(add)} was not found on Scryfall.</p>`; return; }
      const db = await loadComboDb(), id = deckIdentity(deck);
      const cards = S.cards.map(c => Object.assign({}, c)), ci = cards.findIndex(c => !c.commander && c.name === cut);
      if (ci >= 0) { if (cards[ci].qty > 1) cards[ci].qty--; else cards.splice(ci, 1); }
      const ai = cards.findIndex(c => !c.commander && c.name === card.name);
      if (ai >= 0) cards[ai].qty++; else cards.push(Object.assign({}, card, { qty: 1, commander: false }));
      const tokens = (S.tokens || []).concat((got.tokens || []).filter(t => !(S.tokens || []).some(x => x.id === t.id)));
      const o = opts(), n = 2000, seed = 20261124;
      const o2 = Object.assign({}, o, { bookCombos: db ? Combos.goldfished(Combos.find(db, cards.map(c => c.name), id), G.deckCombos(G.buildDeck(cards, tokens, currentPolicy().tribe))) : o.bookCombos });
      out.innerHTML = '';
      const a = await simOnce(S.cards, S.tokens, o, n, seed, p => raiseProgress(p / 2, tok, `Simulating your deck: ${Math.round(p * 100)}%`));
      const b = await simOnce(cards, tokens, o2, n, seed, p => raiseProgress(0.5 + p / 2, tok, `Simulating + ${add} − ${cut}: ${Math.round(p * 100)}%`));
      if (S.deck !== deck) return;
      const wonBy = (r, t) => r.kill.slice(0, Math.min(t, r.turns)).reduce((s, v) => s + v, 0);
      const median = r => { let s = 0; for (let t = 0; t < r.turns; t++) { s += r.kill[t]; if (s >= 0.5) return 'turn ' + (t + 1); } return `after turn ${r.turns}`; };
      const turns = RAISE_TURNS.filter(t => t <= o.turns);
      const row = (name, r) => `<tr><td>${name}</td>${turns.map(t => `<td class="num">${pct(wonBy(r, t))}</td>`).join('')}<td class="num">${pct(r.winBy && r.winBy.combo || 0)}</td><td class="num">${median(r)}</td></tr>`;
      S.comboRaiseSim = { add, cut, a, b };
      out.innerHTML = `<h3>Simulated <span class="pill approx">2,000 games</span></h3><table class="cat-table combo-odds raise"><thead><tr><th>Goldfish won by</th>${turns.map(t => `<th>T${t}</th>`).join('')}<th>By combo</th><th>Median kill</th></tr></thead><tbody>${row('Now', a)}${row(`+ ${esc(add)} − ${esc(cut)}`, b)}</tbody></table>` +
        `<p class="hint" data-fold>Simulated, not exact: ${n.toLocaleString()} autopiloted games of each deck against a goldfish, the same shuffles for both, with tutors and card draw. "By combo" counts the games a combo won. The odds above are exact math on natural draws.</p>`;
      tidy(out);
    } catch (e) { out.innerHTML = `<p class="hint">Could not simulate: ${esc(e.message || e)}</p>`; } finally { raiseProgress(null, tok); }
  }

  // the group the Draw odds graph shows when nothing is picked: all ramp, else all card draw, else all lands
  function defaultOddsGroup() {
    const cats = categories(), by = k => cats.find(c => c.key === k);
    const g = by('role:ramp') || by('role:draw') || by('land'); if (!g) return null;
    return { cards: g.cards, label: { 'role:ramp': 'ramp cards', 'role:draw': 'card-draw cards', land: 'lands' }[g.key] };
  }
  function renderOdds(skipPicker) {
    if (!S.deck) return;
    renderCatOdds();
    if (!skipPicker) renderComboOdds();
    if (!skipPicker) {
      const pk = $('#oddsPicker'); pk.innerHTML = '';
      S.deck.unique.filter(c => !c.commander).sort((a, b) => (a.a.isLand - b.a.isLand) || a.a.mv - b.a.mv || a.name.localeCompare(b.name)).forEach(c => {
        const e = cardEl(c, { badge: c.qty > 1 ? '×' + c.qty : null });
        if (S.oddsSel.has(c.uid)) e.classList.add('sel');
        e.addEventListener('click', () => { S.oddsSel.has(c.uid) ? S.oddsSel.delete(c.uid) : S.oddsSel.add(c.uid); e.classList.toggle('sel'); renderOdds(true); });
        pk.appendChild(e);
      });
    }
    // T-076: nothing picked graphs a default group (all ramp, else card draw, else lands) so the chart is there as soon as the tab opens
    const dflt = S.oddsSel.size ? null : defaultOddsGroup();
    const sel = dflt ? dflt.cards : S.deck.unique.filter(c => S.oddsSel.has(c.uid));
    const K = sel.reduce((s, c) => s + c.qty, 0), N = S.deck.library.length, k = Math.max(1, +$('#oddsK').value || 1);
    const ss = $('#oddsSelected'); ss.innerHTML = '';
    if (!dflt) sel.slice(0, 40).forEach(c => ss.appendChild(cardEl(c)));
    if (!K) { $('#oddsTitle').textContent = 'No cards to graph yet: choose some below'; $('#chartOdds').innerHTML = ''; $('#oddsTable').innerHTML = ''; return; }
    const o = opts();
    $('#oddsTitle').textContent = `At least ${k} of ${K} ${dflt ? dflt.label : 'card' + (K > 1 ? 's' : '')} (library ${N}), ${o.onPlay ? 'on the play' : 'on the draw'}`;
    const rows = [];
    for (let t = 0; t <= o.turns; t++) {
      const n = 7 + Math.max(0, t - (o.onPlay ? 1 : 0)) + (t === 0 ? 0 : 0);
      const seen = t === 0 ? 7 : n;
      rows.push({ t, seen, p: G.hyperAtLeast(N, K, Math.min(N, seen), k), p0: G.hyperPmf(N, K, Math.min(N, seen), 0), e: seen * K / N });
    }
    C.bars($('#chartOdds'), rows.map(x => ({ label: x.t ? 'T' + x.t : '7', v: x.p, tip: `<b>${x.t ? 'By turn ' + x.t : 'Opening 7'}</b><div class="tt-row"><span>Cards seen</span><span>${x.seen}</span></div><div class="tt-row"><span>P(≥${k})</span><span>${pct(x.p)}</span></div><div class="tt-row"><span>Expected copies</span><span>${x.e.toFixed(2)}</span></div>` })), { labelAll: true, max: 1 });
    $('#oddsTable').innerHTML = '<table><thead><tr><th>Turn</th><th>Cards seen</th><th>P(at least ' + k + ')</th><th>P(none)</th><th>Expected copies</th></tr></thead><tbody>' +
      rows.map(x => `<tr><td>${x.t ? 'Turn ' + x.t : 'Opening 7'}</td><td>${x.seen}</td><td>${pct(x.p)}</td><td>${pct(x.p0)}</td><td>${x.e.toFixed(2)}</td></tr>`).join('') + '</tbody></table>' +
      '<p class="hint">Natural draws only: no mulligans, tutors or extra card draw. The Simulation tab includes those.</p>';
  }

  window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { if (S.sim && $('#tab-sim').classList.contains('active')) renderSim(); }, 200); });
  // handle for versus.js (the 1v1 and Pod tabs): the loaded deck and the deck-list helpers
  window.__isfApi = { attackSum, noteLoadedSel, startedWithLink, runningVersion, ready: builtinsListed, loadDeck, showTab, toast, resumeTable: resumeTableGame, replayOnTable, gameAtTurn, hand: { get: () => H, set: x => { H = x; dealHand(true); } }, S, h, esc, tile, opts, imgFor, cardEl, flipCardEl, hasTwoFaces, viewCard: showLightbox, isPhoneTouch, selectCard, cardOf, addViewerActions: f => lbProviders.push(f), addPrintOwner: f => printOwners.push(f), addPrintHook: f => printHooks.push(f), refreshArt, applyPrinting, abCut, slow, speedBar, imprintOf, noteImprints, getDecks, markCommander, currentPolicy, builtinOptions, builtinByValue, builtinText, builtins: () => BUILTIN ,
    // the tutorial's sample game: load a decklist without touching the decklist box, the saved decks or "Save every deck I load"; setDeck(r) puts a deck back
    useDeck: async text => { await Source.init(); const r = await Source.loadDeck(text); r.specialty = SPECIALTY_RE.test(text); if (r.cards.length) setDeck(r); return r; }, setDeck };
})();
