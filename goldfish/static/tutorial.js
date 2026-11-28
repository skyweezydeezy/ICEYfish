/* ICEYfish - tutorial: coach marks (dim the page, spotlight one element, a short bubble) and a short tour for each tab.
   A tab's tour shows the first time it is opened, once. The "?" button in the top bar opens the help menu: replay this tab's tour,
   or restart the whole tutorial. Progress lives in localStorage "isf_tutorial". Tours never fire on their own under a test driver
   (navigator.webdriver) or with localStorage "isf_tutorial_off" = "1"; "isf_tutorial_force" = "1" turns them back on (tests/ui/tutorial.ui.js). */
(function () {
  'use strict';
  const KEY = 'isf_tutorial';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- progress ----
  function load() { try { return Object.assign({ seen: {} }, JSON.parse(lsGet(KEY) || '{}')); } catch (e) { return { seen: {} }; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode: tours just show again */ } }
  function markSeen(id) { const p = load(); p.seen[id] = 1; save(p); }
  // tours fire by themselves only for a person: not in automated tests, unless a test asks for them
  function autoOn() { if (lsGet('isf_tutorial_off') === '1') return false; if (navigator.webdriver && lsGet('isf_tutorial_force') !== '1') return false; return true; }

  // ---- the coach mark engine ----
  // A step: { el: selector | [selectors or functions, first visible wins] | () => Element, title, text,
  //   tap: true      the person taps the spotlit element to go on (the tap reaches the app)
  //   through: true  the spotlit element can be used freely (a question sheet, a slider); Next or `until` goes on
  //   until: () => bool   goes on by itself once true;  hold: () => bool   Next waits while true (the autopilot playing)
  //   lost: -1       back that many steps when the element goes away (a card menu closed without a choice)
  //   dock: 'top' | 'bottom'   the bubble sits at the top or bottom of the screen (over a big sheet, clear of its buttons);  esc: false   Esc is left to the app (the card viewer)
  //   back: false    no Back (a game step cannot be undone);  optional: true   left out when its element is not on screen
  //   before: () => (promise)   runs first; Next shows "…" meanwhile;  uses: 'id'   showing the step counts as using that feature (no tip) }
  let run = null;          // the tour on screen: { id, steps, i, root, spot, bubble, blockers, raf, last, prevFocus, done }
  const visible = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  // a step may point into a folded section or at the top bar while a table has put it away (T-069): open it first
  let opened = [];          // what a step unfolded (T-074): folded again when the tour moves on or ends, so a tip never leaves the Tags box open
  const unreveal = () => { for (const o of opened.reverse()) if (o.el.isConnected) { if (o.box) o.el.classList.add('box-closed'); else o.el.open = false; } opened = []; };
  const reveal = e => { let b; while ((b = e.closest('.box-closed'))) { b.classList.remove('box-closed'); opened.push({ el: b, box: true }); } while ((b = e.closest('details:not([open])'))) { b.open = true; opened.push({ el: b }); } if (document.body.classList.contains('tfocus') && e.closest('.topbar')) document.body.classList.add('tbar-open'); };
  function findEl(step) {
    if (step.sheets) { const sh = document.querySelector('.ch-sheet'); if (sh && visible(sh)) return sh; }          // a question the game asks takes the spotlight while it is open
    if (!step.el) return null;
    for (const s of [].concat(step.el)) {
      if (typeof s === 'function') { const e = s(); if (e && e.closest) reveal(e); if (visible(e)) return e; continue; }
      for (const e of document.querySelectorAll(s)) { reveal(e); if (visible(e)) return e; }
    }
    return null;
  }

  function build() {
    const root = document.createElement('div'); root.className = 'tut tut-pre'; root.id = 'tutorial';          // tut-pre: the bubble stays out of sight until its first step is filled in
    root.innerHTML = '<div class="tut-block" data-b="t"></div><div class="tut-block" data-b="b"></div><div class="tut-block" data-b="l"></div><div class="tut-block" data-b="r"></div><div class="tut-block" data-b="c"></div>' +
      '<div class="tut-spot"></div>' +
      '<div class="tut-bubble" role="dialog" aria-modal="true" aria-labelledby="tutTitle" aria-describedby="tutText" tabindex="-1">' +
      '<div class="tut-head"><span class="tut-count"></span><span class="tut-head-btns"><button type="button" class="tut-skip tut-jump" hidden>Next tab ›</button><button type="button" class="tut-skip tut-close" aria-label="Skip the tour">Skip</button></span></div>' +
      '<h3 id="tutTitle" class="tut-title"></h3><div id="tutText" class="tut-text"></div>' +
      '<div class="tut-foot"><button type="button" class="ghost tut-back">Back</button><button type="button" class="primary tut-next">Next</button></div></div>';
    document.body.appendChild(root);
    const blockers = {}; root.querySelectorAll('.tut-block').forEach(b => { blockers[b.dataset.b] = b; b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); nudge(); }); });
    root.querySelector('.tut-close').addEventListener('click', () => stop('skip'));
    root.querySelector('.tut-jump').addEventListener('click', () => { if (!run) return; const c = run.steps[run.i].chapter, n = run.steps.findIndex((x, k) => k > run.i && x.chapter !== c); if (n > 0) go(n - run.i); });          // the long tour of every tab: on to the next tab
    root.querySelector('.tut-back').addEventListener('click', () => go(-1));
    root.querySelector('.tut-next').addEventListener('click', () => go(1));
    return { root, blockers, spot: root.querySelector('.tut-spot'), bubble: root.querySelector('.tut-bubble') };
  }
  function nudge() { if (!run || reduced()) return; const b = run.bubble; b.classList.remove('tut-nudge'); void b.offsetWidth; b.classList.add('tut-nudge'); }

  function start(id, steps, opts) {
    stop();
    steps = (steps || []).filter(Boolean); if (!steps.length) return Promise.resolve('empty');
    const ui = build();
    return new Promise(resolve => {
      run = Object.assign(ui, { id, steps, i: -1, last: '', prevFocus: document.activeElement, done: resolve, opts: opts || {} });
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('click', onTapThrough, true);
      document.body.classList.add('tut-on');
      go(1);
      const loop = () => { if (!run || run.root !== ui.root) return; place(); watch(); run.raf = requestAnimationFrame(loop); };          // follows the element through scrolling, resizing, rotating and layout changes
      ui.raf = requestAnimationFrame(loop);
    });
  }
  function stop(how) {
    if (!run) return;
    const r = run; run = null; unreveal();
    cancelAnimationFrame(r.raf);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onTapThrough, true);
    document.body.classList.remove('tut-on');
    r.root.remove();
    if (r.id) markSeen(r.id);          // skipped or finished: either way it does not come back by itself
    try { if (r.prevFocus && r.prevFocus.focus && r.prevFocus.isConnected) r.prevFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    r.done(how || 'stopped');
    setTimeout(() => { maybeAuto(); tipLater(); }, 600);          // a tab first opened during this tour gets its own tour now; a waiting tip may show
  }
  async function go(d) {
    if (!run) return;
    const r = run;
    let i = r.i + d;
    while (i >= 0 && i < r.steps.length) {          // steps whose element is not on screen are left out when marked optional
      const s = r.steps[i];
      if (s.before) {
        const nx = r.bubble.querySelector('.tut-next'); nx.disabled = true; nx.textContent = '…'; r.root.classList.add('tut-busy');
        try { await s.before(); } catch (e) { console.warn('tutorial step', e); /* the step shows anyway */ }
        nx.disabled = false; r.root.classList.remove('tut-busy');
        if (run !== r) return;
      }
      if (!s.optional || findEl(s)) break;
      i += d;
    }
    if (i >= r.steps.length) return stop('done');
    if (i < 0) return;
    r.i = i; const s = r.steps[i]; unreveal();          // the last step's unfolded boxes shut; this step opens what it needs
    if (s.uses) markUsed(s.uses);          // the tour showed it: its first-time tip is not needed
    const el = findEl(s);
    if (el && s.scroll !== false) { const rc = el.getBoundingClientRect(); if (rc.top < 60 || rc.bottom > innerHeight - 40 || rc.left < 0 || rc.right > innerWidth) el.scrollIntoView({ block: rc.top < 60 || rc.bottom > innerHeight - 40 ? 'center' : 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }          // also sideways: a phone's toolbar scrolls
    const total = r.steps.length;
    r.bubble.querySelector('.tut-count').textContent = (s.chapter ? s.chapter + ' · ' : '') + (total > 1 ? `${i + 1} of ${total}` : '');
    r.bubble.querySelector('.tut-title').textContent = (typeof s.title === 'function' ? s.title() : s.title) || '';
    r.bubble.querySelector('.tut-text').innerHTML = s.html || esc((typeof s.text === 'function' ? s.text() : s.text) || '');
    const bk = r.bubble.querySelector('.tut-back');
    bk.hidden = r.opts.cards ? false : (i === 0 || s.back === false); bk.disabled = !!r.opts.cards && i === 0;          // what's new cards: Back stays, greyed on the first
    const next = r.bubble.querySelector('.tut-next');
    next.hidden = (!!s.tap || !!s.until) && !!el;
    r.lostAt = 0;
    next.textContent = s.nextLabel || (i === total - 1 ? 'Done' : 'Next');
    r.bubble.querySelector('.tut-close').textContent = s.skipLabel || (i === total - 1 ? 'Close' : 'Skip');
    r.bubble.querySelector('.tut-jump').hidden = !s.chapter || !r.steps.some((x, k) => k > i && x.chapter !== s.chapter);
    r.root.classList.toggle('tut-tap', (!!s.tap || !!s.through) && !!el);
    r.root.dataset.step = s.id || String(i); r.root.classList.remove('tut-pre');
    r.last = '';
    if (i > 0 || d < 0) { r.root.classList.add('tut-moving'); clearTimeout(r.moveT); r.moveT = setTimeout(() => r.root.classList.remove('tut-moving'), 260); }
    place();
    r.bubble.focus({ preventScroll: true });
    if (s.wait) { const my = i; Promise.resolve(s.wait()).then(() => { if (run === r && r.i === my) go(1); }); }
  }
  // every frame: `until` and `hold` are checked, and a step whose element went away (`lost`) steps back
  function watch() {
    const r = run, s = r.steps[r.i]; if (!s || r.root.classList.contains('tut-busy')) return;
    if (s.live) {          // the words follow what is on screen (a block, then an instant, then its target)
      const t = typeof s.title === 'function' ? s.title() : s.title, x = typeof s.text === 'function' ? s.text() : s.text;
      const te = r.bubble.querySelector('.tut-title'), xe = r.bubble.querySelector('.tut-text');
      if (t && te.textContent !== t) te.textContent = t; if (x && xe.textContent !== x) xe.textContent = x;
    }
    if (s.until) { let ok = false; try { ok = s.until(); } catch (e) { /* not yet */ }
      if (ok) { const my = r.i; r.root.classList.add('tut-busy'); setTimeout(() => { if (run !== r || r.i !== my) return; r.root.classList.remove('tut-busy'); let still = false; try { still = s.until(); } catch (e) { /* no */ } if (still) go(1); }, s.untilDelay || 250); return; } }
    if (s.hold) { let h = false; try { h = s.hold(); } catch (e) { /* free */ } const nx = r.bubble.querySelector('.tut-next'); if (nx.disabled !== h) nx.disabled = h; }
    if ((s.tap || s.until) && !s.lost) { const nx = r.bubble.querySelector('.tut-next'), h = !!findEl(s); if (nx.hidden !== h) nx.hidden = h; }          // its element went away: Next, so the tour never gets stuck
    if (s.lost) { if (findEl(s)) r.lostAt = 0; else if (!r.lostAt) r.lostAt = performance.now(); else if (performance.now() - r.lostAt > 450) { r.lostAt = 0; go(s.lost); } }
  }
  function onKey(e) {
    if (!run) return;
    const st = run.steps[run.i];
    if (e.key === 'Escape' && st && st.esc === false) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return stop('skip'); }
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && !run.root.contains(t);
    if (typing) return;
    const s = run.steps[run.i];
    if (e.key === 'ArrowRight' && run.opts.cards && run.i === run.steps.length - 1) { e.preventDefault(); return; }          // cards stop at the ends: only "Got it" closes
    if (e.key === 'ArrowRight' && !(s && (s.tap || s.until) && findEl(s)) && !run.bubble.querySelector('.tut-next').disabled) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' && s && s.back !== false && run.i > 0) { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {          // focus stays in the bubble (or on the spotlit element of a tap step)
      const f = [...run.bubble.querySelectorAll('button:not([hidden])')]; if (!f.length) return;
      const k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  // a tap step: the tap reaches the app (nothing covers the element), and the tour goes on just after
  function onTapThrough(e) {
    if (!run) return;
    const s = run.steps[run.i]; if (!s || !s.tap) return;
    const el = findEl(s); if (!el || !el.contains(e.target)) return;
    if (s.sheets && e.target.closest && e.target.closest('.ch-sheet')) return;          // answering a question is not the tap the step asks for
    const r = run, my = r.i;
    setTimeout(() => { if (run === r && r.i === my) { if (s.after) s.after(); go(1); } }, s.tapDelay != null ? s.tapDelay : 60);
  }

  // where the spotlight and the bubble go: under the element if there is room, else above, else beside the bottom of the screen
  function place() {
    if (!run) return;
    const r = run, s = r.steps[r.i]; if (!s) return;
    const el = findEl(s), W = innerWidth, H = innerHeight, pad = 6, m = 8;
    let x = 0, y = 0, w = 0, ht = 0;
    if (el) {
      const rc = el.getBoundingClientRect();
      x = Math.max(rc.left - pad, 2); y = Math.max(rc.top - pad, 2); w = Math.min(rc.right + pad, W - 2) - x; ht = Math.min(rc.bottom + pad, H - 2) - y;
      if (w < 0) w = 0; if (ht < 0) ht = 0;
    }
    const bw = Math.min(320, W - 2 * m), bb = r.bubble;
    const key = [x, y, w, ht, W, H, bb.offsetHeight].map(Math.round).join(',');
    if (key === r.last) return; r.last = key;
    const B = r.blockers;
    if (el) {
      r.spot.style.display = '';
      Object.assign(r.spot.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px' });
      Object.assign(B.t.style, { left: 0, top: 0, width: W + 'px', height: y + 'px' });
      Object.assign(B.b.style, { left: 0, top: (y + ht) + 'px', width: W + 'px', height: Math.max(0, H - y - ht) + 'px' });
      Object.assign(B.l.style, { left: 0, top: y + 'px', width: x + 'px', height: ht + 'px' });
      Object.assign(B.r.style, { left: (x + w) + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: ht + 'px' });
      Object.assign(B.c.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px', display: s.tap || s.through || (s.sheets && el.classList.contains('ch-sheet')) ? 'none' : '' });          // over the element too, unless the step asks for a tap
    } else {          // nothing to point at: the whole page dims, the bubble sits in the middle
      r.spot.style.display = 'none';
      Object.assign(B.t.style, { left: 0, top: 0, width: W + 'px', height: H + 'px' });
      for (const k of ['b', 'l', 'r', 'c']) B[k].style.width = '0px';
    }
    r.root.classList.toggle('tut-nospot', !el);
    bb.style.width = bw + 'px';
    const bh = bb.offsetHeight;
    let bx, by, side;
    if (!el) { bx = (W - bw) / 2; by = (H - bh) / 2; side = 'mid'; }
    else if (s.dock === 'bottom') { bx = (W - bw) / 2; by = H - bh - m; side = 'bottom'; }
    else if ((s.dock === 'top') || (s.sheets && el.classList.contains('ch-sheet'))) { bx = (W - bw) / 2; by = m; side = 'top'; }
    else {
      const below = H - (y + ht) - m, above = y - m;
      if (below >= bh + 10) { by = y + ht + 10; side = 'below'; }
      else if (above >= bh + 10) { by = y - bh - 10; side = 'above'; }
      else { by = H - bh - m; side = 'over'; }          // a big element: the bubble sits over its bottom edge
      bx = x + w / 2 - bw / 2;
    }
    bx = Math.max(m, Math.min(bx, W - bw - m)); by = Math.max(m, Math.min(by, H - bh - m));
    Object.assign(bb.style, { left: Math.round(bx) + 'px', top: Math.round(by) + 'px' });
    bb.dataset.side = side;
  }


  // ---- the sample game: a built-in deck, simple on purpose, and a fixed seed, so the cards are always the same ----
  const SAMPLE_FILE = 'counter-culture.txt';          // a built-in deck (Counter Culture, mono-green): Forests, mana elves, Worldly Tutor, instants
  const SAMPLE_SEED = 165;          // Practice: an opening 7 of Forest ×3, Fyndhorn Elves, Worldly Tutor, Three Visits, Renata
  let queued = null;
  function takeSeed() { const s = queued; queued = null; return s; }          // app.js and versus.js take a queued seed for their next game
  const A = () => window.__isfApi, S = () => window.__isf;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(cond, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (cond()) return true; } catch (e) { /* not yet */ } await sleep(100); } return false; }
  const idle = () => { const st = S(); return st && !st.busy && !document.querySelector('.ch-sheet'); };
  const inHand = name => () => { const g = S().game; const c = g && g.hand.find(x => x.card.name === name); return c ? document.querySelector(`#zHand .mtg[data-iid="${c.iid}"]`) : null; };
  const menuBtn = re => () => [...document.querySelectorAll('#lightbox.show .lb-act')].find(b => re.test(b.textContent) && b.offsetParent) || null;          // T-134: a tapped card opens in the viewer; its actions are the buttons there
  const onBoard = () => document.querySelector('#zCreatures .mtg[data-iid]');
  let sample = null;          // { prev: the person's own deck (put back afterwards), view }
  async function useSampleDeck(file) {
    const st = S(); file = file || SAMPLE_FILE;
    if (st.loaded && st.loaded.tutorial && (st.loaded.tutorialFile || SAMPLE_FILE) === file) return;
    if (!(st.loaded && st.loaded.tutorial)) sample.prev = st.deck && st.loaded ? st.loaded : null;          // a sample deck already loaded is never "the person's own"
    const res = await fetch('decks/' + file); if (!res.ok) throw new Error('the sample deck could not be opened');
    const r = await A().useDeck(await res.text());
    if (!r.cards.length) throw new Error('the sample deck could not be loaded');
    r.tutorial = true; r.tutorialFile = file;
  }
  function endSample(how) {
    const sm = sample; sample = null; queued = null; stopCaps();
    if (!sm) return;
    if (sm.kind === 'practice' && window.__isfChoices) window.__isfChoices.close();          // a Duel goes on as a normal game, questions and all
    if (sm.ctl) for (const sel in sm.ctl) { const e = document.querySelector('#tab-duel ' + sel); if (e) { e.value = sm.ctl[sel][0]; if (sm.ctl[sel][1]) e.dataset.touched = sm.ctl[sel][1]; else delete e.dataset.touched; } }          // your own Duel settings come back for the next game
    if (sm.prev) {          // the person had a deck: it comes back, and the sample game is thrown away
      A().setDeck(sm.prev, true);          // true: their own deck comes back as it was, past the Commander deck rule
      if (document.body.dataset.view === 'table') A().showTab('table');          // a new game with their own deck
    }          // no deck of their own: the sample deck stays, and the game is a normal game from here
    const p = load(); p.seen['sample:' + sm.kind] = 1; for (const t of sm.kind === 'duel' ? ['duel'] : sm.kind === 'fastest' ? ['deck', 'hands', 'table'] : ['hands', 'table']) p.seen['tab:' + t] = 1; save(p);          // the sample game showed what those tabs' tours would
    return how;
  }
  // Duel: Counter Culture against a copy of itself. The opponent goes first; in round 4 it attacks into your creature, you block and
  // are asked about Beast Within. Your own turns are yours: the tour points at each new moment when it comes.
  const DUEL_SEED = 4380;          // your opening 7: Forest ×4, Llanowar Elves, Loyal Guardian, Beast Within; the opponent wins the d20
  const VS = () => window.__isfVersus && window.__isfVersus.duel;
  const gm = () => { const v = VS(); return v && v.game; };
  const dq = sel => document.querySelector('#tab-duel ' + sel);
  const myTurn = () => { const m = gm(); return !!m && m.human != null && m.phase === 'main' && m.match.order[m.idx].pid === m.human && !m.busy && !m.acting && !m.choice; };
  const canAttack = () => { const b = dq('.vs-attack'); return myTurn() && b && !b.disabled && !gm().attacked && window.Goldfish.podAlive && gm().games[gm().human].battlefield.some(p => window.Goldfish.canAttack(gm().games[gm().human], p)); };
  // the moment the duel asks something of you: a question sheet (an instant, a target), or the block chooser
  const moment = () => { const sh = document.querySelector('.ch-sheet'); if (sh) { const t = (sh.querySelector('.ch-title') || {}).textContent || ''; return /cast an instant/.test(t) ? 'instant' : /does it resolve/.test(t) ? 'stack' : 'question'; } const m = gm(); if (m && m.phase === 'block' && m.block) return 'block'; return null; };
  const momentEl = () => { const k = moment(); return k === 'block' ? dq('.vs-me') : k ? document.querySelector('.ch-sheet') : null; };
  const MOMENT_TEXT = {
    block: ['Blocking', 'They attack you. Choose a blocker for each attacker, or No blocks. The menus start on the autopilot\'s choice.'],
    instant: ['Respond with an instant', 'Beast Within destroys an attacker. Cast it, or tap Not now.'],
    question: ['Choose a target', 'Pick what your spell hits. ★ is the autopilot\'s pick.'],
    stack: ['The stack', 'A spell waits on the stack. Let it resolve, or answer it with an instant.'],
  };
  const momentStep = () => ({ el: momentEl, through: true, back: false, dock: 'top', live: true, until: () => !moment(), untilDelay: 900,
    title: () => { const k = moment(); return k ? MOMENT_TEXT[k][0] : null; }, text: () => { const k = moment(); return k ? MOMENT_TEXT[k][1] : null; } });
  const DUEL_STEPS = [
    { title: 'A sample Duel', text: 'The same green deck against a copy of itself. You decide; the opponent is the autopilot.' },
    { before: async () => {
        await useSampleDeck(); A().showTab('duel'); await sleep(200);
        const set = (sel, v) => { const e = dq(sel); if (!e) return; sample.ctl = sample.ctl || {}; sample.ctl[sel] = [e.value, e.dataset.touched]; e.value = v; e.dataset.touched = '1'; };
        set('.vs-opp', ''); set('.vs-you', 'human'); set('.vs-ask', 'ask');
        queued = DUEL_SEED;
      }, el: '#tab-duel .vs-new', tap: true, back: false, title: 'New game', text: 'Tap New game.' },
    { before: () => waitFor(() => document.querySelector('.vs-dice[data-mode=duel]') || (gm() && gm().phase === 'mull'), 6000), el: '.vs-dice[data-mode=duel]', optional: true, back: false, until: () => !document.querySelector('.vs-dice[data-mode=duel]'), untilDelay: 100,
      title: 'Who goes first', text: 'Each player rolls a d20. The highest goes first.' },
    { before: () => waitFor(() => dq('.vs-keep')), el: '#tab-duel .vs-keep', tap: true, back: false, title: 'Keep or mulligan',
      text: 'Four lands, a mana elf and an answer: keep it.' },
    { el: '#tab-duel .vs-arena', hold: () => !myTurn(), back: false, title: 'The opponent\'s turn',
      text: 'The autopilot plays the other seat at the speed of the slider. When it casts a spell, you are asked whether it resolves.' },
    { before: () => waitFor(myTurn, 60000), el: '#tab-duel .vs-hand', through: true, back: false, until: () => { const m = gm(); return m && m.games[m.human].battlefield.some(p => p.card.name === 'Llanowar Elves'); },
      title: 'Your turn', text: 'Glowing cards can be played: tap a Forest, then Llanowar Elves.' },
    { before: () => waitFor(myTurn), el: '#tab-duel .vs-end', tap: true, back: false, title: 'End turn', text: 'Nothing can attack yet: end your turn.' },
    { el: '#tab-duel .vs-screen', through: true, back: false, until: canAttack, title: 'Play on',
      text: 'Play a land and your glowing cards each turn, then End turn. Keep Beast Within in hand.' },
    { el: () => { const b = dq('.vs-attack'); return b && !b.disabled ? b : null; }, tap: true, lost: -1, back: false, title: 'Attack', text: 'Tap Attack… to choose attackers.' },
    { before: () => waitFor(() => gm() && gm().picking), el: '#tab-duel .vs-screen', through: true, back: false, until: () => gm() && !gm().picking,
      title: 'Choose attackers', text: 'Tap your creatures to send them or hold them back, then Attack.' },
    { el: '#tab-duel .vs-screen', through: true, back: false, until: () => !!moment() && moment() !== 'stack', untilDelay: 100, title: 'Play on',
      text: 'End your turn when you are done. I will point at blocks and instants when they come.' },
    momentStep(),
    { before: () => waitFor(() => !moment() || moment() === 'stack', 4000), el: '#tab-duel .speed-bar', through: true, back: false, title: 'Speed',
      text: 'The slider sets how fast the autopilot plays the other seats.' },
    { back: false, title: 'That is Duel', text: () => 'Play the game out, or start a new one. Pod is the same with four players.' + (sample && sample.prev ? ' Your own deck is back for the next game.' : '') },
  ];
  const DUEL = DUEL_STEPS.map((st, i) => i >= 2 ? Object.assign({ sheets: true }, st) : st);          // from the dice on, a question sheet can open at any moment
  let autoTo = 0;          // the turn "Autopilot to turn" plays to
  const PRACTICE = [
    { title: 'A sample game', text: 'A built-in green deck, the same cards every time. Leave any time with Skip.' },
    { before: async () => { await useSampleDeck(); A().showTab('hands'); queued = SAMPLE_SEED; await sleep(300); },
      el: '#drawHand', tap: true, back: false, title: 'Draw a 7', text: 'Tap Draw a 7.' },
    { before: () => waitFor(() => document.querySelector('#handStage .fan .mtg')), el: '#handStage .fan', back: false, title: 'Keep or mulligan?',
      text: 'Three lands and cheap spells: keep it. A hand with too few lands is worth a mulligan: a fresh 7.' },
    { el: '#keepHand', tap: true, title: 'Keep', text: 'Tap Keep. The hand goes to the Practice table.' },
    { before: () => waitFor(() => document.body.dataset.view === 'table' && S().game && idle() && inHand('Forest')()),
      el: inHand('Forest'), tap: true, back: false, title: 'Play a land', text: 'Turn 1. Tap a Forest.' },
    { el: menuBtn(/Play land/), tap: true, lost: -1, back: false, title: 'Its actions', text: 'Every card opens large, with its actions. Tap Play land.' },
    { before: () => waitFor(idle), el: inHand('Fyndhorn Elves'), tap: true, back: false, title: 'Cast a spell', text: 'Tap Fyndhorn Elves. Your Forest pays for it.' },
    { el: menuBtn(/^▶ Cast/), tap: true, lost: -1, back: false, title: 'Cast', text: 'Tap Cast.' },
    { before: () => waitFor(idle), el: '#tNext', tap: true, back: false, title: 'Next turn', text: 'Attack, then untap and draw.' },
    { before: () => waitFor(() => idle() && S().game.turn === 2 && inHand('Forest')()), el: inHand('Forest'), tap: true, back: false, title: 'Turn 2', text: 'Another land: tap a Forest.' },
    { el: menuBtn(/Play land/), tap: true, lost: -1, back: false, title: 'Play land', text: 'Tap Play land.' },
    { before: () => waitFor(idle), el: inHand('Worldly Tutor'), tap: true, back: false, title: 'A spell that asks', text: 'Tap Worldly Tutor. It searches your library.' },
    { el: menuBtn(/^▶ Cast/), tap: true, lost: -1, back: false, title: 'Cast', text: 'Tap Cast.' },
    { before: () => waitFor(() => document.querySelector('.ch-sheet'), 8000), el: '.ch-sheet', through: true, dock: 'top', until: () => !document.querySelector('.ch-sheet'), back: false,
      title: 'A question', text: '★ marks the autopilot\'s pick. Choose any creature, or let the autopilot decide.' },
    { before: () => waitFor(idle), el: '.speed-bar', through: true, back: false, title: 'Autopilot speed', text: 'Slide toward the turtle to watch each play.' },
    { el: '#tAuto', tap: true, back: false, title: 'Autopilot', text: 'Let it play the rest of this turn.' },
    { el: ['.table-main'], hold: () => !idle(), back: false, title: 'How it decides',
      text: 'It plays a land, casts what uses its mana best, then attacks. The game log lists each play.' },
    { before: () => { const n = document.querySelector('#tAutoToN'); if (n && S().game) { autoTo = S().game.turn + 2; n.value = String(autoTo); } }, el: '#tAutoTo', tap: true, back: false, title: 'Autopilot to turn',
      text: () => `Tap it: the game then plays itself to the end of turn ${autoTo || 'in the box'}.` },
    { el: ['.table-main'], back: false, title: () => `Playing to turn ${autoTo}`,          // the user: say that it plays on, and let them go on at once
      text: () => `The game now plays itself to the end of turn ${autoTo}. Watch, or tap Next.` },
    { el: '#tLoop', back: false, title: 'Loop', text: 'Game after game by itself, until you tap it again. Try it after the tour.' },
    { el: () => idle() ? null : document.querySelector('.table-main'), optional: true, until: idle, back: false, title: 'Almost there',          // only while the autopilot is still playing
      text: () => `The autopilot is finishing turn ${autoTo}. The tour goes on when it stops.` },
    { before: () => waitFor(idle), el: onBoard, tap: true, back: false, title: 'A closer look', text: 'Tap a creature.' },
    { before: () => waitFor(() => document.querySelector('#lightbox.show'), 4000), el: '#lightbox.show', through: true, esc: false, dock: 'bottom', until: () => !document.querySelector('#lightbox.show'), back: false,
      title: 'Card viewer', text: 'A large view, prices and printings. Close it to go on.' },
    { back: false, title: 'That is Practice', text: () => (sample && sample.prev ? 'Your own deck is back. ' : 'The sample deck stays loaded: play on. ') + 'Duel has attacks, blocks and instants: find it under ?.' },
  ];
  function sampleGame(kind) {
    const steps = kind === 'duel' ? DUEL : PRACTICE;
    stop(); sample = { kind, prev: null };
    return start('', steps).then(endSample);
  }

  // "The fastest deck" (T-093): the built-in deck with the best CEILING: the most wins by turn 2, then by turn 3, then by turn 4, then the
  // median kill turn. Read from decks/index.json at run time (by2/by3/by4/earliestKill/medianKill/by7 are copied by tools/build-deck-index.js
  // from each list's "Checked by ICEYfish" line), so a fresh check of the decks changes the tutorial by itself. Until a deck has the turn 2-4
  // numbers, decks without them are ranked by the older speed numbers (median, then by T7, then by T5).
  const killN = k => k == null ? Infinity : +String(k).replace('>', '') + (String(k)[0] === '>' ? 0.5 : 0);
  const medOf = d => killN(d.medianKill != null ? d.medianKill : d.checkedMedian);          // medianKill is the measured one; checkedMedian is read from the list's check line
  const fastestOf = decks => {
    const ceil = decks.filter(d => d.by2 != null && d.by3 != null && d.by4 != null);
    if (ceil.length) return ceil.sort((a, b) => b.by2 - a.by2 || b.by3 - a.by3 || b.by4 - a.by4 || medOf(a) - medOf(b) || (b.by7 || 0) - (a.by7 || 0))[0];
    return decks.filter(d => d.by5 != null && medOf(d) !== Infinity).sort((a, b) => medOf(a) - medOf(b) || b.by7 - a.by7 || b.by5 - a.by5)[0] || null;
  };
  async function fastestDeck() { const r = await fetch('decks/index.json'); return r.ok ? fastestOf((await r.json()).decks || []) : null; }
  let fast = null;          // { deck: the index row, seed, kill: the turn the picked game kills on }
  const deckName = d => d.name.replace(/\s*\(.*\)\s*$/, '');
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '';
  const pc = x => (x > 0 && x < 1 ? x.toFixed(1) : Math.round(x * 10) / 10) + '%';
  function fastMana() {
    const d = S().deck; let mana = [];
    try { const T = window.Tags, ix = S().tags || T.index(d, {}); mana = [0, 1, 2].flatMap(v => T.query(ix, 'role:ramp -type:land mv:' + v).cards.map(c => c.name)); } catch (e) { /* no tags: no mana line */ }
    return mana.filter((n, i) => mana.indexOf(n) === i);
  }
  // short captions on the key plays, read from the game log as the autopilot writes it (the lines the engine writes: "Played X", "Cast X",
  // "⚡ … search …" for a tutor, "★ Combo assembled: …", "☠ Goldfish dead …"); the Watch step shows the latest one
  let cap = '', capObs = null, capQ = [], capTimer = 0;          // each caption stays at least a moment: later ones wait in the queue
  const trim = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  function captionFor(t, mana, cmd) {
    let m;
    if ((m = /^★ Combo assembled: ([^(]+)/.exec(t))) return `The combo is assembled: ${trim(m[1].trim(), 60)}`;
    if (/^☠/.test(t)) return `The kill: ${trim(t.replace(/^☠\s*/, ''), 60)}`;
    if (/^⚡.*\bsearch/i.test(t)) return 'A tutor finds the missing pieces';
    if ((m = /^(?:Played|Cast) (.+)$/.exec(t))) { const n = m[1].trim(); if (cmd.includes(n)) return `The commander comes down: ${n}`; if (mana.includes(n)) return `Fast mana: ${n}`; }
    return null;
  }
  function startCaps() {
    stopCaps(); cap = 'Key plays show up here as they happen.';
    const ol = document.querySelector('#gameLog'); if (!ol) return;
    const mana = fastMana(), cmd = S().deck ? S().deck.commanders.map(c => c.card.name) : [];
    capObs = new MutationObserver(ms => { for (const mu of ms) for (const n of mu.addedNodes) { const c = n.textContent && captionFor(n.textContent.trim(), mana, cmd); if (c) capQ.push(c); } });
    capObs.observe(ol, { childList: true });
    capTimer = setInterval(() => { if (capQ.length) cap = capQ.shift(); }, 1500);
  }
  function stopCaps() { if (capObs) capObs.disconnect(); capObs = null; clearInterval(capTimer); capQ = []; }
  // the plan, from the loaded deck: its commander, its cheap mana, the combos the engine plays
  function planText() {
    const d = S().deck, G = window.Goldfish; if (!d) return '';
    const cm = d.commanders.map(c => c.card.name), out = [];
    const mana = fastMana();
    let combos = []; try { combos = G.deckCombos(d).filter(c => !c.open); } catch (e) { /* no combo data */ }
    if (cm.length) out.push(`Its commander, ${list(cm)}, leads the plan.`);
    if (mana.length) out.push(`Cheap mana (${list(mana.slice(0, 4))}) pays for it early.`);
    if (combos.length) out.push(`The engine plays ${combos.length === 1 ? 'a combo' : combos.length + ' combos'}: ${list(combos.slice(0, 2).map(c => c.name))}.`);
    return out.join(' ') || 'A cheap curve and a lot of mana.';
  }
  // a seed whose game, played like the Practice table plays it, kills as early as this deck ever does (or the earliest found in a few seconds)
  function pickSeed(target) {
    const G = window.Goldfish, o = A().opts(), t0 = Date.now(); let best = null;
    for (let sd = 1; sd <= 5000 && Date.now() - t0 < 5000; sd++) {
      try {
        const g = G.newGame(S().deck, o, sd); G.draw(g, 7);
        const lands = g.hand.filter(c => c.card.a && c.card.a.isLand).length; if (lands < 2 || lands > 5) continue;          // a hand you would keep
        for (let t = 0; t < 4 && g.killTurn == null; t++) G.playTurn(g);
        if (g.killTurn == null) continue;
        if (!best || g.killTurn < best.kill) best = { seed: sd, kill: g.killTurn };
        if (best.kill <= target) break;
      } catch (e) { /* that seed does not play: try the next */ }
    }
    return best || { seed: 1, kill: null };
  }
  const killTurnNow = () => { const g = S() && S().game; return g && g.killTurn != null ? g.killTurn : null; };
  const speedLine = d => d.by2 != null ? `${pc(d.by2)} of its games are won by turn 2, ${pc(d.by3)} by turn 3, ${pc(d.by4)} by turn 4.` : `Median turn ${d.medianKill != null ? d.medianKill : d.checkedMedian}, ${pc(d.by5)} by turn 5, ${pc(d.by7)} by turn 7.`;
  const FASTEST = [
    { title: 'The fastest deck', text: () => fast ? `${deckName(fast.deck)}${fast.deck.earliestKill ? ` can win on turn ${fast.deck.earliestKill}` : ' is the fastest built-in deck'}. ${speedLine(fast.deck)}` : '' },
    { before: async () => { await useSampleDeck(fast.deck.file); A().showTab('deck'); await sleep(350); },
      el: ['#deckTiles:not(:empty)', '.deck-view', '#tab-deck'], title: 'The plan', text: () => planText() },
    { before: async () => {
        await waitFor(() => S().deck); await sleep(1500); A().showTab('hands');
        const h = fast.hand;
        if (h) {          // a real hand from data/turn2-hands.json: dealt (and mulliganed) with the app's own options, then handed to the Mulligan tab
          const G = window.Goldfish, g = G.newGame(S().deck, Object.assign({}, A().opts(), { onPlay: false }), h.seed); G.mulligan(g);
          g.killTurn = null; A().hand.set({ g, mulls: g.mulligans || h.mull || 0 }); fast.kill = null;
          const w = G.newGame(S().deck, Object.assign({}, A().opts(), { onPlay: false }), h.seed); G.mulligan(w);          // the same game, played out once to know the kill turn
          for (let t = 0; t < 10 && w.killTurn == null; t++) G.playTurn(w);
          fast.kill = w.killTurn;
        } else { const p = pickSeed(fast.deck.earliestKill || 2); fast.seed = p.seed; fast.kill = p.kill; queued = fast.seed; }
        await sleep(300); },
      get el() { return fast.hand ? '#handStage .fan' : '#drawHand'; }, get tap() { return !fast.hand; }, back: false, title: () => fast.hand ? 'A real winning hand' : 'Draw a 7',
      text: () => fast.hand ? `A real hand from the games, kept${fast.hand.mull ? ' after ' + fast.hand.mull + ' mulligan' + (fast.hand.mull > 1 ? 's' : '') : ''}: it wins on turn ${fast.kill || 2}. ${fast.hand.how}.` : `Tap Draw a 7. This opening hand wins${fast.kill ? ' on turn ' + fast.kill : ' early'}.` },
    { before: () => waitFor(() => document.querySelector('#handStage .fan .mtg')), el: '#keepHand', tap: true, back: false, title: 'Keep', text: 'Keep it. The autopilot plays the rest.' },
    { before: async () => { await waitFor(() => document.body.dataset.view === 'table' && S().game && idle()); autoTo = fast.kill || 2; const n = document.querySelector('#tAutoToN'); if (n) n.value = String(autoTo); startCaps(); },
      el: '#tAutoTo', tap: true, back: false, title: 'Watch the win', text: () => `Tap Autopilot to turn ${autoTo}: it plays every turn up to the kill.` },
    { el: ['.table-main'], live: true, back: false, hold: () => capQ.length > 0 || (killTurnNow() == null && !(S().game && S().game.turn >= autoTo && idle())), title: 'Key plays', text: () => cap },
    { before: () => sleep(600).then(() => waitFor(() => killTurnNow() != null || (S().game && S().game.turn >= autoTo && idle()), 60000)), el: ['.table-main'], back: false, title: () => killTurnNow() != null ? `Dead on turn ${killTurnNow()}` : 'Not yet',
      text: () => killTurnNow() != null ? `The goldfish is dead on turn ${killTurnNow()}. Tap Log to read each play.` + (sample && sample.prev ? ' Your own deck comes back when you tap Next.' : ' The deck stays loaded: play on.') : `No kill by turn ${S().game ? S().game.turn : autoTo} this time. Tap Autopilot to go on.` },
  ];
  async function fastestGame() {
    stop();
    try {
      const d = await fastestDeck(); if (!d) throw new Error('no deck has speed numbers yet'); fast = { deck: d, seed: null, kill: null, hand: null };
      try { const t = await (await fetch('data/turn2-hands.json')).json(), hs = ((t.draw || {})[deckName(d)] || {}).hands || []; fast.hand = hs.find(h => !h.mull) || hs[0] || null; } catch (e) { /* no table: a seed is searched instead */ }
    }
    catch (e) { toast('The fastest deck could not be found: ' + (e && e.message || e)); return 'error'; }
    sample = { kind: 'fastest', prev: null };
    return start('', FASTEST).then(endSample);
  }

  // ---- the tours: one per tab, three to six steps, the key features only ----
  const TOURS = {
    deck: [
      { el: '#deckText', title: 'Paste a decklist', text: 'Moxfield, Archidekt, MTGO or plain text all work.' },
      { el: '#savedDecks', title: 'Or pick a deck', text: 'Built-in decks and the ones you saved are here.' },
      { el: '#loadDeck', title: 'Load it', text: 'Card data comes from Scryfall. Then every tab works with your deck.' },
      { el: ['#deckTiles:not(:empty)', '.deck-view'], title: 'The key numbers', text: 'Lands, curve, strengths and combos show here.' },
      { el: ['main .info-tog'], optional: true, title: 'Details on demand', text: 'Explanations stay folded. Tap ⓘ when you want one.' },
      { el: '.tabs', title: 'One tab, one job', text: 'Each tab shows its own short tour the first time. Tap ? to see it again.' },
    ],
    hands: [
      { el: '#drawHand', title: 'Draw a 7', text: 'Deal an opening hand from your deck.' },
      { el: '#mullHand', title: 'Mulligan', text: 'Shuffle it away and draw a new hand.' },
      { el: '#keepHand', title: 'Keep', text: 'Play the hand on the Practice table.' },
      { el: '#dealMany', title: 'Many hands at once', text: 'Twelve sample hands give a feel for the deck.' },
      { el: ['#chartOpenLands', '#tab-hands .two-col'], title: 'Lands in your 7', text: 'The exact odds of each land count.' },
    ],
    table: [
      { el: '.table', title: 'Practice table', text: 'Play your deck against a goldfish: an opponent that never fights back.' },
      { el: ['#zHand:not(:empty)', '#zHand', '.table-main'], title: 'Tap a card', text: 'It opens large; its buttons play it, tap it, add counters or move it.' },
      { el: '#tAuto', title: 'Autopilot', text: 'The autopilot plays this turn for you. Watch what it picks.' },
      { el: '.speed-bar', title: 'Speed', text: 'Slide toward the turtle to follow each play.' },
      { el: '#tAutoTo', title: 'Autopilot to turn', text: 'Skip ahead to the turn in the box.' },
      { el: '#tLoop', title: 'Loop', text: 'Game after game by itself. Tap again to stop.' },
    ],
    sim: [
      { el: '#runSim', title: 'Run a simulation', text: 'Thousands of autopiloted games in seconds.' },
      { el: ['#simTiles:not(:empty)', '#tab-sim .two-col'], title: 'The key numbers', text: 'Kill turn, mana and land drops at a glance.' },
      { el: '#simSuggest', optional: true, title: 'Suggestions', text: 'Cards to add or cut, from this run.' },
      { el: '#mirrorBox', title: 'Mirror match', text: 'Your deck against another, both on autopilot.' },
      { el: ['#sampleButtons:not(:empty)', () => { const e = $('#sampleButtons'); return e && e.closest('.card-box'); }], title: 'Sample games', text: 'Replay one game on the Practice table.' },
    ],
    odds: [
      { el: '#catOdds', title: 'Odds by category', text: 'The chance you have seen a land, ramp or draw.' },
      { el: '#tab-odds .cat-ctl', title: 'Cards seen', text: 'Change how many cards you have drawn.' },
      { el: () => { const e = $('#chartOdds'); return e && e.closest('.card-box'); }, title: 'Turn by turn', text: 'The chance to see them by each turn. It starts with your ramp.' },
      { el: '#oddsChoose', title: 'Choose cards', text: 'Open it to pick any cards. They count as one group.' },
    ],
    duel: [
      { el: '#tab-duel .vs-opp', title: 'Choose an opponent', text: 'A built-in deck, a saved one, or a copy of yours.' },
      { el: '#tab-duel .vs-you', title: 'Your seat', text: 'Play it yourself, or watch the autopilot play it.' },
      { el: '#tab-duel .vs-ask', title: 'Your choices', text: 'Be asked for targets and searches, or let the autopilot decide.' },
      { el: '#tab-duel .vs-new', title: 'New game', text: 'A d20 roll decides who goes first.' },
      { el: '#tab-duel .rm-box', optional: true, uses: 'friend', title: 'Play a friend', text: 'Two devices, one game: one of you invites, the other joins.' },
      { el: () => { const e = $('#tab-duel .vs-run'); return e && e.closest('.card-box'); }, title: 'Play many games', text: 'Every seat on autopilot. See who wins how often.' },
    ],
    pod: [
      { el: () => { const e = $('#tab-pod .vs-opp'); return e && e.closest('.row'); }, title: 'Four players', text: 'Pick a deck for each opponent, and who plays yours.' },
      { el: '#tab-pod .vs-ask', title: 'Your choices', text: 'Be asked, or let the autopilot decide.' },
      { el: '#tab-pod .vs-new', title: 'New game', text: 'Everyone rolls a d20. The highest goes first.' },
      { el: () => { const e = $('#tab-pod .vs-run'); return e && e.closest('.card-box'); }, title: 'Play many games', text: 'See how often each deck wins the pod.' },
    ],
  };
  const NAMES = { deck: 'Build', hands: 'Mulligan', table: 'Practice', sim: 'Simulate', odds: 'Odds', duel: 'Duel', pod: 'Pod', puzzle: 'Puzzle' };
  const view = () => document.body.dataset.view || 'deck';
  const blocked = () => !!document.querySelector('.modal.show, .lightbox.show, .ch-sheet');          // another sheet is open: wait

  // ---- "Every feature": the long tour of each tab (chosen in the ? menu). Every control, one short step each. A part that only shows
  // once a deck is loaded (or a game is on) is still explained: the bubble then sits in the middle, without a spotlight. ----
  const box = sel => () => { const e = document.querySelector(sel); return e && (e.closest('.card-box') || e); };
  const vs = (m, sel) => `#tab-${m} ${sel}`;
  const vsBox = (m, sel) => () => { const e = document.querySelector(vs(m, sel)); return e && (e.closest('.card-box') || e); };
  const FULL = {
    deck: [
      { el: '.tabs', title: 'Seven tabs', text: 'Build reads your deck. Mulligan, Practice, Simulate, Odds, Duel and Pod use it.' },
      { el: '#mirrorStatus', title: 'Card data', text: 'Where the cards come from: Scryfall, live in your browser.' },
      { el: '#appVersion', title: 'Version', text: 'The version you run. An outline means a newer one is out: tap to update.' },
      { el: '.topbar .top-sound', title: 'Sound', text: 'Music and sound effects, each with its own volume.' },
      { el: '.topbar .top-help', title: 'Help', text: 'Tours, sample games, first goals and what\'s new.' },
      { el: '#deckText', title: 'Paste a decklist', text: 'Moxfield, Archidekt, MTGO or plain text. Mark commanders with a Commander section or *CMDR*.' },
      { el: '#loadDeck', title: 'Load deck', text: 'Looks up every card. Then every tab works with the deck.' },
      { el: '#clearDeck', title: 'Clear', text: 'Empties the box for a new list. The loaded deck stays until you load another.' },
      { el: '#saveDeck', title: 'Save', text: 'Keeps the list in this browser.' },
      { el: '#savedDecks', title: 'Choose a deck', text: 'Built-in decks, grouped by bracket and colors, and the ones you saved.' },
      { el: '#manageDecks', title: 'Manage', text: 'Rename, copy, export, import or delete saved decks. Reset is in its footer.' },
      { el: '#optFormat', title: 'Format', text: 'Commander (40 life, a free mulligan) or 60-card (20 life).' },
      { el: '#optTurns', title: 'Turns to simulate', text: 'How many turns each simulated game lasts.' },
      { el: '#optMinLands', title: 'Keepable lands', text: 'The autopilot keeps a 7 with this many lands up to the next box, else it mulligans.' },
      { el: () => { const e = document.querySelector('#optFreeMull'); return e && e.closest('label'); }, title: 'First mulligan free', text: 'Commander\'s free first mulligan.' },
      { el: () => { const e = document.querySelector('#optOnPlay'); return e && e.closest('label'); }, title: 'On the play', text: 'Skip the draw on turn 1.' },
      { el: () => { const e = document.querySelector('#optCmdrFirst'); return e && e.closest('label'); }, title: 'Commander first', text: 'The autopilot casts the commander as soon as it can.' },
      { el: '#optLife', title: 'Opponent life', text: 'The goldfish\'s life: the damage needed to kill it.' },
      { el: '#optN', title: 'Games per simulation', text: '2,000 games: each percentage within about two points. More games, more precise.' },
      { el: ['#deckTiles:not(:empty)'], title: 'Key numbers', text: 'Cards, lands, average mana value and more, at a glance.' },
      { el: ['#deckProfile:not([hidden])'], title: 'Strengths and weaknesses', text: 'Read from the list with common deckbuilding rules of thumb. Open a heading for the cards.' },
      { el: ['#deckCombos:not([hidden])'], title: 'Combos and wins', text: 'Combos found in the list, cards that win outright, and finishers. The autopilot plays them.' },
      { el: ['#deckTags:not([hidden])'], title: 'Tags', text: 'What each card does, in groups. Tap a tag to list those cards.' },
      { el: ['#deckTags:not([hidden]) #tagQuery'], title: 'Search by tag', text: 'Combine tags: role:ramp -type:land. Draw odds sends the cards to the Odds tab; Tag these… adds your own tag.' },
      { el: box('#curveWall'), title: 'Curve wall', text: 'Every spell stacked by mana value. Hover or tap a card to see it large.' },
      { el: box('#landWall'), title: 'Lands & mana', text: 'Your lands and the colors they make.' },
      { el: box('#coverage'), title: 'How the engine reads your cards', text: 'Each line of rules text: simulated, approximate, needs an opponent, or in development.' },
      { el: () => { const e = document.querySelector('#covOnlyGaps'); return e && e.closest('label'); }, title: 'Only the gaps', text: 'Show just the cards with parts still in development.' },
      { el: 'main .info-tog', optional: true, title: 'ⓘ', text: 'Every explanation is folded behind ⓘ. Tap it to read more.' },
    ],
    hands: [
      { el: '#drawHand', title: 'Draw a 7', text: 'A fresh opening hand from your deck.' },
      { el: '#mullHand', title: 'Mulligan', text: 'Shuffle it away and draw again. Cards to put on the bottom are greyed.' },
      { el: '#keepHand', title: 'Keep', text: 'Play this hand on the Practice table.' },
      { el: '#dealMany', title: '12 sample hands', text: 'A dozen hands at once, for a feel of the deck.' },
      { el: '#handVerdict', optional: true, title: 'Verdict', text: 'Would the autopilot keep this hand, and why.' },
      { el: '#tab-hands .hands-looks', title: 'Playmat & sleeves', text: 'Choose the look of your table and card backs.' },
      { el: '#handStage', title: 'Your hand', text: 'Tap a card to see it large.' },
      { el: box('#chartOpenLands'), title: 'Lands in your 7', text: 'The exact odds of each land count.' },
      { el: box('#keepStats'), title: 'A keepable hand', text: 'How often the autopilot keeps, and what a good 7 holds.' },
    ],
    table: [
      { el: '.speed-bar', title: 'Autopilot speed', text: 'From turtle to rabbit: how fast the autopilot plays.' },
      { el: '#tNew', title: 'New game', text: 'Shuffle and deal a new game. The autopilot picks the mulligans.' },
      { el: '#tAuto', title: 'Autopilot turn', text: 'The autopilot plays the rest of this turn.' },
      { el: '#tAutoTo', title: 'Autopilot to turn', text: 'It plays on to the turn in the box.' },
      { el: '#tLoop', title: 'Loop', text: 'Game after game until the goldfish is dead, with a tally of kill turns. Tap again to stop.' },
      { el: '#tNext', title: 'Next turn', text: 'Attack with everything, then untap and draw.' },
      { el: '#tToken', title: 'Token', text: 'Make any token by hand.' },
      { el: '#tUndo', title: 'Undo', text: 'Take back the last action.' },
      { el: '#tLog', optional: true, title: 'Log', text: 'Open the game log (on wide screens it is always beside the table).' },
      { el: '#tab-table .table-controls .open-looks', title: 'Playmat & sleeves', text: 'The look of your table.' },
      { el: () => { const e = document.querySelector('#tFast'); return e && e.closest('label'); }, title: 'Fast', text: 'Shorter animations.' },
      { el: '#hTurn', title: 'Turn', text: 'The turn you are on.' },
      { el: '.hud-mana', title: 'Mana open', text: 'The mana you can still spend, by color.' },
      { el: '#hLife', title: 'Opponent life', text: 'The goldfish. Tap it to deal damage by hand.' },
      { el: '#hMyLife', title: 'Your life', text: 'Your own life total.' },
      { el: '#hRing', title: 'The Ring', text: 'How often the Ring has tempted you, for Ring decks.' },
      { el: '#hCmdr', title: 'Commander damage', text: '21 from one commander also kills.' },
      { el: '#hPower', title: 'Board power', text: 'The total power of your creatures.' },
      { el: '#hSpent', title: 'Mana spent', text: 'All the mana used this game.' },
      { el: '#zLibrary', title: 'Library', text: 'Cards left to draw.' },
      { el: '#zCommand', title: 'Command zone', text: 'Your commander waits here.' },
      { el: '#zGrave', title: 'Graveyard', text: 'Tap to look through it.' },
      { el: '#zExile', title: 'Exile', text: 'Cards removed from the game.' },
      { el: '#zCreatures', title: 'Battlefield', text: 'Creatures, then artifacts and enchantments, then lands.' },
      { el: '#zHand', title: 'Your hand', text: 'Tap a card: it opens large with its buttons (play it, counters, move it). Ctrl/⌘-click plays at once.' },
      { el: () => { const e = document.querySelector('.table-log'); return e && e.getBoundingClientRect().width ? e : null; }, optional: true, title: 'Game log', text: 'Every play, step by step, and why.' },
    ],
    sim: [
      { el: '#runSim', title: 'Run simulation', text: 'Thousands of games on autopilot against a goldfish.' },
      { el: ['#simTiles:not(:empty)'], title: 'Key numbers', text: 'Kill turn, commander turn, mana and land drops.' },
      { el: ['#simSuggest:not([hidden])'], title: 'Suggestions', text: 'Cards to add or cut, from this run.' },
      { el: ['#simWins:not([hidden])'], title: 'How games end', text: 'Combo, a card that wins, or damage.' },
      { el: box('#chartMana'), title: 'Mana by turn', text: 'The median, shaded from the 10th to the 90th percentile.' },
      { el: box('#chartLands'), title: 'Land drops', text: 'The chance to have N lands on turn N.' },
      { el: box('#chartCmdr'), title: 'Commander cast', text: 'On which turn the commander comes down.' },
      { el: box('#chartKill'), title: 'Kill turn', text: 'When the goldfish dies: combat, burn, drain and commander damage.' },
      { el: box('#chartDamage'), title: 'Damage by turn', text: 'Total damage dealt so far.' },
      { el: box('#chartPower'), title: 'Board power', text: 'The power on your side each turn.' },
      { el: '#mirrorBox', title: 'Mirror match', text: 'Your deck against another, or itself, both on autopilot: win rate and why.' },
      { el: ['#faceBox:not([hidden])'], title: 'Two-faced cards', text: 'Which face the autopilot casts.' },
      { el: '#labBox', title: 'Policy lab', text: 'Trial and error: the engine tries each option and keeps the better one for this deck.' },
      { el: '#abBox', title: 'A/B test', text: 'Diagnose each card, cut one, try a replacement, and compare.' },
      { el: box('#sampleButtons'), title: 'Sample games', text: 'Replay a fast, typical or slow game on the Practice table.' },
      { el: box('#heatmap'), title: 'When cards get played', text: 'The chance each card is played by each turn. Sort any column.' },
    ],
    odds: [
      { el: '#catOdds', title: 'Odds by category', text: 'The chance you have seen a land, ramp, draw and so on.' },
      { el: '#tab-odds .cat-ctl', title: 'Cards seen', text: 'Set how many cards you have drawn, with − and +.' },
      { el: ['#catBody:not(:empty)'], title: 'Tap a row', text: 'It graphs those cards turn by turn, in the box below.' },
      { el: box('#chartOdds'), title: 'By turn', text: 'The exact chance to have a group of cards by each turn: your ramp to start, as a chart and a table.' },
      { el: '#oddsTag', title: 'Select by tag', text: 'Pick cards with a tag search.' },
      { el: '#oddsGroup', title: 'Quick groups', text: 'All lands, ramp, card draw or creatures.' },
      { el: '#oddsK', title: 'At least', text: 'How many of the picked cards you need.' },
      { el: '#oddsClear', title: 'Clear', text: 'Start the pick over.' },
      { el: box('#oddsPicker'), title: 'Pick cards', text: 'Tap any cards. They count as one group; Clear goes back to the ramp.' },
    ],
  };
  const vsFull = m => [
    { el: vs(m, '.vs-opp'), title: m === 'pod' ? 'Opponents' : 'Opponent', text: 'A built-in deck, a random one, a saved one, or a copy of yours.' },
    { el: vs(m, '.vs-you'), title: 'Your seat', text: 'Play your deck yourself, or watch the autopilot play it.' },
    { el: vs(m, '.vs-ask'), title: 'My choices', text: 'Be asked for targets, searches, modes and blocks, or let the autopilot decide.' },
    { el: vs(m, '.vs-rounds'), title: 'Max rounds', text: 'The game stops after this many rounds.' },
    { el: () => { const e = document.querySelector(vs(m, '.vs-loop')); return e && e.closest('label'); }, title: 'Loop', text: 'With the autopilot in every seat, game after game with a tally.' },
    { el: vs(m, '.vs-new'), title: 'New game', text: 'Everyone rolls a d20. The highest goes first.' },
    { el: vs(m, '.vs-what'), title: 'What you are asked', text: 'The list of choices you make, and what the autopilot still decides.' },
    ...(m === 'duel' ? [
      { el: '#tab-duel .rm-box', optional: true, uses: 'friend', title: 'Play a friend', text: 'A Duel against a friend on another device. Each of you plays the deck on your own Build tab.' },
      { el: '#tab-duel .rm-box .rm-terms', optional: true, title: 'What is shared', text: 'Read what the other player gets to see, and accept it once, before you connect.' },
      { el: '#tab-duel .rm-box .rm-other', optional: true, title: 'Invite or join', text: 'Friends on the same Wi-Fi tap each other\'s name under Nearby; on other networks you both type the same room name. If that does not work, here one of you taps Invite and the other Join, and you pass two codes (or scan two QR codes). No account needed.' },
    ] : []),
    { el: [vs(m, '.vs-game:not([hidden]) .vs-bar')], title: 'Game bar', text: 'The round, the steps of the turn, and buttons to play on.' },
    { el: [vs(m, '.vs-game:not([hidden]) .vs-arena')], title: 'The table', text: 'Every player\'s cards in play. Glowing cards can be played. Tap any card to read it.' },
    { el: [vs(m, '.vs-game:not([hidden]) .vs-log')], title: 'Game log', text: 'Every play, newest at the bottom.' },
    { el: vsBox(m, '.vs-run'), title: 'Play many games', text: 'Every seat on autopilot: win rates, and sample games to replay.' },
  ];
  FULL.duel = vsFull('duel'); FULL.pod = vsFull('pod');
  // every tab, one after another: each tab's long tour, opening the tab first
  function fullAll() {
    const order = ['deck', 'hands', 'table', 'sim', 'odds', 'duel', 'pod'], steps = [];
    for (const t of order) FULL[t].forEach((st, i) => steps.push(Object.assign({}, st, { chapter: NAMES[t] }, i ? {} : { before: () => { onTabNow(t); return sleep(350); } })));
    return start('full:all', steps);
  }
  const onTabNow = t => { if (view() !== t) A().showTab(t); };
  const fullTour = t => FULL[t] ? start('full:' + t, FULL[t]) : Promise.resolve('none');
  // a tab's tour: short, or every feature (the style chosen in the ? menu, kept in the progress)
  const tourStyle = () => load().style === 'full' ? 'full' : 'short';
  function tour(t, style) { const st = (style || tourStyle()) === 'full' ? FULL[t] : TOURS[t]; return st ? start('tab:' + t, st) : Promise.resolve('none'); }
  function toggleStyle() { const p = load(); p.style = tourStyle() === 'full' ? 'short' : 'full'; save(p); toast(p.style === 'full' ? 'First-visit tours now show every feature' : 'First-visit tours are short again'); }

  // the first visit to a tab: its tour, once (a short wait lets the tab draw itself first)
  let pending = 0;
  function maybeAuto() {
    if (!autoOn() || run || load().quiet) return;          // quiet: the person chose Skip on the welcome card; tours stay under ?
    const t = view(); if (!TOURS[t] || load().seen['tab:' + t]) return;
    clearTimeout(pending);
    pending = setTimeout(() => { if (run || view() !== t || load().seen['tab:' + t]) return; if (blocked()) return void (pending = setTimeout(maybeAuto, 1500)); tour(t); }, 450);
  }
  new MutationObserver(() => { if (run && run.id && run.id.startsWith('tab:') && run.id !== 'tab:' + view()) stop('left'); maybeAuto(); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // ---- the "?" button: the help menu ----
  function menuItems() {
    return [
      ['▶', `Tour of ${NAMES[view()] || 'this tab'}`, () => tour(view(), 'short'), 'tut-m-tour'],
      ['☰', `Every feature: ${NAMES[view()] || 'this tab'}`, () => tour(view(), 'full'), 'tut-m-full'],
      ['☰', 'Every feature, every tab', () => fullAll(), 'tut-m-fullall'],
      ['🐟', 'Sample game: Practice', () => sampleGame('practice'), 'tut-m-sample'],
      ['⚔', 'Sample game: Duel', () => sampleGame('duel'), 'tut-m-duel'],
      ['⚡', 'The fastest deck', () => fastestGame(), 'tut-m-fastest'],
      ['✓', `First goals · ${goalCount()} of ${GOALS.length}`, () => openGoals(), 'tut-m-goals'],
      ['★', 'What\'s new', () => whatsNew(true), 'tut-m-new'],
      ['⚙', `First-visit tours: ${tourStyle() === 'full' ? 'every feature' : 'short'}`, () => toggleStyle(), 'tut-m-style'],
      ['↺', 'Restart the tutorial', () => restart(), 'tut-m-restart'],
    ];
  }
  function openMenu(btn) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'tut-menu'; m.setAttribute('role', 'menu'); m.id = 'tutMenu';
    for (const [ic, label, fn, cls] of menuItems()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost ' + cls; b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span aria-hidden="true">${ic}</span> ${esc(label)}`;
      b.addEventListener('click', () => { closeMenu(); fn(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth;
    m.style.top = Math.round(r.bottom + 6) + 'px'; m.style.maxHeight = Math.round(innerHeight - r.bottom - 14) + 'px';          // a phone held sideways: the menu scrolls
    m.style.left = Math.round(Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8))) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    m.querySelector('button').focus();
    setTimeout(() => { document.addEventListener('click', offMenu, true); document.addEventListener('keydown', escMenu, true); });
  }
  function closeMenu() {
    const m = $('#tutMenu'); if (m) m.remove();
    document.querySelectorAll('.tut-help').forEach(b => b.setAttribute('aria-expanded', 'false'));
    document.removeEventListener('click', offMenu, true); document.removeEventListener('keydown', escMenu, true);
  }
  function offMenu(e) { const m = $('#tutMenu'); if (m && !m.contains(e.target)) { if (e.target.closest && e.target.closest('.tut-help')) { e.stopPropagation(); } closeMenu(); } }
  function escMenu(e) { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }
  function addButtons() {
    const mk = cls => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost tut-help ' + cls; b.textContent = '?';
      b.title = 'Help: tours of each tab'; b.setAttribute('aria-label', 'Help and tours'); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
      return b; };
    const top = document.querySelector('.topbar .top-sound');
    if (top) top.before(mk('top-help')); else { const tb = document.querySelector('.topbar'); if (tb) tb.appendChild(mk('top-help')); }
    const tbl = document.querySelector('.table-controls .table-sound');          // phones: the top bar shows only the tabs on the table, so it has its own (like the sound button)
    if (tbl) tbl.after(mk('table-help'));
    // every "?" (also the one the Duel and Pod game bars draw on phones) opens the menu
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.tut-help'); if (!b) return; e.stopPropagation(); if ($('#tutMenu')) closeMenu(); else openMenu(b); });
  }


  // ======================= stage 4: the welcome card, first goals, first-time tips, what's new =======================
  const toast = t => { const a = A(); if (a && a.toast) a.toast(t); };
  const onTab = t => { if (view() !== t) A().showTab(t); };

  // ---- the welcome card: the first visit ever. "Take the tour" starts this tab's tour; "Skip" keeps every tour under ? ----
  function welcome() {
    const p = load(); p.welcome = 1; save(p);
    const t = view();
    return start('', [{ title: 'Welcome to ICEYfish', nextLabel: 'Take the tour', skipLabel: 'Skip',
      text: 'Test a Commander deck: play it, simulate thousands of games, duel the autopilot. A short tour shows the way.' }])
      .then(how => { if (how === 'done') { if (TOURS[t]) tour(t); } else { const q = load(); q.quiet = 1; save(q); toast('Tours and sample games are under ? any time'); } });
  }

  // ---- first goals: ticked as they happen, listed in the ? menu, each with "Show me" ----
  const vsGame = () => window.__isfVersus && window.__isfVersus.duel && window.__isfVersus.duel.game;
  const ownDeck = () => { const st = S(); return !!(st && st.deck && !(st.loaded && st.loaded.tutorial)); };
  const GOALS = [
    { id: 'deck', label: 'Load a deck', done: ownDeck,
      show: () => { onTab('deck'); setTimeout(() => start('', [{ el: '#savedDecks', through: true, title: 'Pick a deck', text: 'Choose a built-in deck here, or paste your own list and tap Load deck.' }]), 300); } },
    { id: 'sim', label: 'Run a simulation', done: () => !!(S() && S().sim),
      show: () => { onTab('sim'); setTimeout(() => start('', [{ el: '#runSim', tap: true, title: 'Run a simulation', text: S() && S().deck ? 'Tap Run simulation.' : 'Load a deck first, then tap Run simulation.' }]), 300); } },
    { id: 'win', label: 'Win a Practice game', done: () => { const g = S() && S().game; return !!(g && g.killTurn != null); }, show: () => sampleGame('practice') },
    { id: 'duel', label: 'Play a Duel', done: () => { const m = vsGame(); return !!(m && m.human != null && m.over); }, show: () => sampleGame('duel') },
  ];
  const goalCount = () => { const g = load().goals || {}; return GOALS.filter(x => g[x.id]).length; };
  function checkGoals() {
    if (sample) return;          // the sample games are a demo, not the person's own goals
    const p = load(); p.goals = p.goals || {}; let news = null;
    for (const g of GOALS) { let ok = false; try { ok = g.done(); } catch (e) { /* not yet */ } if (ok && !p.goals[g.id]) { p.goals[g.id] = 1; news = g; } }
    if (news) { save(p); if (autoOn() && !run) toast(`✓ First goal: ${news.label} (${goalCount()} of ${GOALS.length})`); }
  }
  function openGoals() {
    closeMenu(); checkGoals();
    const g = load().goals || {};
    const m = document.createElement('div'); m.className = 'tut-menu tut-goals'; m.id = 'tutMenu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'First goals');
    m.innerHTML = `<b class="tut-goals-h">First goals · ${goalCount()} of ${GOALS.length}</b>` + GOALS.map(x => `<div class="tut-goal${g[x.id] ? ' done' : ''}" data-goal="${x.id}"><span class="tut-tick" aria-hidden="true">${g[x.id] ? '✓' : '○'}</span><span>${esc(x.label)}</span>${g[x.id] ? '<span class="tut-sr">done</span>' : '<button type="button" class="ghost tut-showme">Show me</button>'}</div>`).join('');
    m.addEventListener('click', e => { const b = e.target.closest('.tut-showme'); if (!b) return; const x = GOALS.find(y => y.id === b.closest('.tut-goal').dataset.goal); closeMenu(); x.show(); });
    document.body.appendChild(m);
    const btn = [...document.querySelectorAll('.tut-help')].find(e => e.getBoundingClientRect().width) || document.querySelector('.topbar');
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth;
    m.style.top = Math.round(r.bottom + 6) + 'px'; m.style.maxHeight = Math.round(innerHeight - r.bottom - 14) + 'px'; m.style.left = Math.round(Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8))) + 'px';
    (m.querySelector('button') || m).focus && (m.querySelector('button') || m).focus();
    setTimeout(() => { document.addEventListener('click', offMenu, true); document.addEventListener('keydown', escMenu, true); });
  }

  // ---- first-time tips: one line the first time something new shows up, once; not shown once the person has used the feature ----
  // Never during a tour or a sample game, one at a time, no dimming: a small note beside the thing, with "Show me" where there is an action.
  const used = k => !!(load().used || {})[k];
  function markUsed(k) { const p = load(); p.used = p.used || {}; if (p.used[k]) return; p.used[k] = 1; save(p); }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'tSpeed') markUsed('speed'); }, true);
  document.addEventListener('click', e => { const t = e.target.closest ? e.target : null; if (!t) return; if (t.closest('#tLoop, .vs-loop')) markUsed('loop'); if (t.closest('.ch-auto, .ch-ok, .ch-none')) markUsed('sheet'); if (t.closest('.rm-invite, .rm-join, .rm-rejoin')) markUsed('friend'); }, true);
  const TIPS = [
    { id: 'friend', when: () => view() === 'duel' && visible(document.querySelector('#tab-duel .rm-box')), el: () => document.querySelector('#tab-duel .rm-box .box-head') || document.querySelector('#tab-duel .rm-box'),
      skip: () => used('friend'), text: 'New: play a friend on another device. One of you invites, the other joins.',
      show: () => start('', [{ el: '#tab-duel .rm-box', uses: 'friend', title: 'Play a friend', text: 'Tap Invite and send the code, or Join with the code you got. Each of you plays your own deck.' }]) },
    { id: 'sheet', when: () => document.querySelector('.ch-sheet'), el: () => document.querySelector('.ch-sheet .ch-head') || document.querySelector('.ch-sheet'),
      skip: () => used('sheet'), text: 'The game asks you. ★ marks the autopilot\'s pick, or tap Let the autopilot decide.' },
    { id: 'd20', when: () => document.querySelector('.vs-dice'), el: () => document.querySelector('.vs-dice'), text: 'A d20 each: the highest roll goes first.' },
    { id: 'meld', when: () => document.querySelector('.meld-box'), el: () => document.querySelector('.meld-box'), text: 'Two cards meld into one. The game log tells what happened.' },
    { id: 'dice', when: () => document.querySelector('.dice-box:not(.meld-box)'), el: () => document.querySelector('.dice-box:not(.meld-box)'), text: 'Dice and coins roll on screen. The result is in the game log.' },
    { id: 'odds', when: () => view() === 'odds' && document.querySelector('#chartOdds > *'), el: () => document.querySelector('#chartOdds'),
      text: 'Each bar is the chance to have drawn them by that turn. Hover or tap a bar for the numbers.' },
    { id: 'speed', when: () => view() === 'table' && S() && S().busy && +(document.querySelector('#tSpeed') || {}).value >= 10, el: () => document.querySelector('.speed-bar'),
      skip: () => used('speed'), text: 'Too fast to follow? Slide toward the turtle.', show: () => start('', [{ el: '.speed-bar', through: true, title: 'Autopilot speed', text: 'Slide toward the turtle to watch each play.' }]) },
    { id: 'loop', when: () => view() === 'table' && S() && S().game && S().game.killTurn != null && !S().busy && !(document.querySelector('#tLoop.on')), el: () => document.querySelector('#tLoop'),
      skip: () => used('loop'), text: 'Goldfish dead! Loop plays game after game by itself and tallies the kill turns.', show: () => { const b = document.querySelector('#tLoop'); if (b) b.click(); } },
  ];
  let tipEl = null, tipT = 0;
  function closeTip() { if (tipEl) { tipEl.remove(); tipEl = null; } clearTimeout(tipT); }
  function showTip(t) {
    const p = load(); p.tips = p.tips || {}; p.tips[t.id] = 1; save(p);
    closeTip();
    const anchor = t.el && t.el();
    const b = document.createElement('div'); b.className = 'tut-tip'; b.setAttribute('role', 'status'); b.dataset.tip = t.id;
    b.innerHTML = `<span class="tut-tip-text">${esc(t.text)}</span><span class="tut-tip-btns">${t.show ? '<button type="button" class="ghost tut-tip-show">Show me</button>' : ''}<button type="button" class="ghost tut-tip-ok">Got it</button></span>`;
    b.querySelector('.tut-tip-ok').addEventListener('click', closeTip);
    if (t.show) b.querySelector('.tut-tip-show').addEventListener('click', () => { closeTip(); markUsed(t.id); t.show(); });
    document.body.appendChild(b); tipEl = b;
    const W = innerWidth, H = innerHeight, bw = Math.min(340, W - 16); b.style.width = bw + 'px';
    let x = (W - bw) / 2, y = H - b.offsetHeight - 16;
    if (anchor) { const r = anchor.getBoundingClientRect(); x = Math.max(8, Math.min(r.left + r.width / 2 - bw / 2, W - bw - 8)); y = r.bottom + 8 + b.offsetHeight < H ? r.bottom + 8 : Math.max(8, r.top - b.offsetHeight - 8); }
    b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
    tipT = setTimeout(closeTip, 14000);          // it goes by itself: a tip never waits for an answer
  }
  function checkTips() {
    if (!autoOn() || run || sample || tipEl) return;
    const seen = load().tips || {};
    for (const t of TIPS) {
      if (seen[t.id]) continue;
      let on = false; try { on = !!t.when(); } catch (e) { /* not now */ }
      if (!on) continue;
      if (t.skip && t.skip()) { const p = load(); p.tips = p.tips || {}; p.tips[t.id] = 1; save(p); continue; }          // already used: no tip needed
      showTip(t); return;
    }
  }
  function tipLater() { setTimeout(checkTips, 300); }

  // ---- what's new: after an update, once, only what is new since the person's last version (whatsnew.json) ----
  // The last version seen is kept in its own key, so Reset (Remember State) and an update leave it alone.
  const WN = 'isf_whatsnew';
  const running = () => +(self.ISF_VERSION || 0);
  async function whatsNew(all) {
    let list = [];
    try { const r = await fetch('whatsnew.json', { cache: 'no-cache' }); if (r.ok) list = ((await r.json()).entries || []).filter(e => e && e.v && e.lines); } catch (e) { /* offline */ }
    const last = +(lsGet(WN) || 0), now = running();
    const items = all ? list.slice(0, 6) : list.filter(e => e.v > last && e.v <= now);
    try { localStorage.setItem(WN, String(now)); } catch (e) { /* private mode */ }
    if (!items.length) { if (all) toast('Nothing new yet'); return; }
    // one card per version, newest first; Next goes to older. Swipe left/right, the arrow keys, Back/Next, "N of M" (the tour's own counter).
    const steps = items.map(e => ({ title: `What's new in v${e.v}`, html: '<ul class="tut-new">' + e.lines.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>', nextLabel: items.length > 1 && e !== items[items.length - 1] ? 'Next' : 'Got it', skipLabel: 'Close' }));
    const done = start('', steps, { cards: true });
    const r = run; if (r) {
      let sx = null, sy = 0;          // the card viewer's swipe feel (app.js lbSwipe): a clear sideways move, vertical scroll never moves the card
      const fin = (X, Y) => { if (sx == null) return; const dx = X - sx, dy = Y - sy; sx = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0 && r.i < r.steps.length - 1) go(1); else if (dx > 0 && r.i > 0) go(-1); } };
      let lx = 0, ly = 0;
      r.bubble.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || e.target.closest('button')) return; sx = lx = e.clientX; sy = ly = e.clientY; });
      r.bubble.addEventListener('pointermove', e => { lx = e.clientX; ly = e.clientY; });
      r.bubble.addEventListener('pointerup', e => fin(e.clientX, e.clientY));
      r.bubble.addEventListener('pointercancel', () => fin(lx, ly));
    }
    return done;
  }

  // ---- on load: what's new after an update, or the welcome card on the first visit ever, then the first tab's tour ----
  async function onLoad() {
    if (!autoOn()) return maybeAuto();
    const p = load(), last = lsGet(WN);
    if (!p.welcome && !Object.keys(p.seen).length) { try { localStorage.setItem(WN, String(running())); } catch (e) { /* private mode */ } return welcome(); }          // a first visit: nothing is "new"
    if (last == null) { try { localStorage.setItem(WN, String(running())); } catch (e) { /* private mode */ } }          // before What's new existed: start counting from here
    else if (+last < running()) await whatsNew(false);
    maybeAuto();
  }
  setInterval(() => { checkGoals(); checkTips(); }, 1500);

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ } }
  function restart() { stop(); reset(); const p = load(); p.welcome = 1; save(p); maybeAuto(); if (!autoOn()) tour(view()); }

  window.ISFTutorial = { start, stop, tour, restart, reset, sampleGame, fastestGame, fastestOf, takeSeed, welcome, whatsNew, checkTips, fullAll, full: FULL, goals: GOALS, tips: TIPS, tours: TOURS, autoOn, progress: load, get active() { return run ? { id: run.id, step: run.i, of: run.steps.length } : null; }, get target() { const st = run && run.steps[run.i]; return st ? findEl(st) : null; } };

  addButtons();
  setTimeout(onLoad, 700);          // what's new or the welcome card, then the tab the app opens on (Remember State may restore one)
})();
