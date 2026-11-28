/* ICEYfish - the question sheet of a played game (1v1 and Pod): a library search, a target, a mode, a discard, a sacrifice, a
   counterspell. decide.js makes the question (what is asked, the options, the autopilot's pick); versus.js calls ask(q) and gets a
   promise of the answer: 'auto' (the autopilot decides), 'none', an option number, or a list of option numbers.
   The sheet lies over the bottom of the table and folds away ("Look at the table") so the board stays readable while you choose. */
(function () {
  'use strict';
  const A = window.__isfApi;
  if (!A) return;
  const { h, esc } = A;
  const CANCELLED = { cancelled: true };                     // the game the question belonged to is gone (a new game was started)
  let open = null;

  function close() { const o = open; if (!o) return; open = null; o.el.remove(); o.reject(CANCELLED); }
  function finish(pick) { const o = open; if (!o) return; open = null; o.el.remove(); o.resolve(pick); }

  // Identical options share one tile (four Swamps in a library, five Soldier tokens). A tile holds every option it stands for (the
  // autopilot's first), so with "choose two" you can take two Forests from one tile: each click takes one more, then back to none.
  function tiles(q) {
    const out = [], by = new Map();
    for (const o of q.options) {
      const key = [o.name, o.note, o.owner].join('|');
      let t = by.get(key);
      if (!t) { t = { ks: [], o, def: 0 }; by.set(key, t); out.push(t); }
      if (o.def) { t.ks.splice(t.def, 0, o.k); t.def++; t.o = o; } else t.ks.push(o.k);
    }
    if (q.kind === 'search') out.sort((x, y) => x.o.name.localeCompare(y.o.name));
    if (q.kind === 'x') out.sort((x, y) => parseInt(x.o.name.replace(/\D+/g, ''), 10) - parseInt(y.o.name.replace(/\D+/g, ''), 10));          // X = 0, 1, 2…: in number order, the autopilot's value still preselected
    else out.sort((x, y) => (y.def ? 1 : 0) - (x.def ? 1 : 0));
    out.forEach((t, i) => { t.i = i; });
    return out;
  }

  // T-089: paying a cost. The cost on top, every source that can help as a chip showing the mana it makes, a colour picker only on a
  // source that can make more than one of the colours the cost asks for. Confirm is on only when the choice pays the cost exactly;
  // "Pay automatically" (the autopilot's choice) is the pre-selected default.
  const SYM = { W: '⚪', U: '🔵', B: '⚫', R: '🔴', G: '🟢', C: '◇', generic: '①' };
  function askPay(q) {
    close();
    return new Promise((resolve, reject) => {
      const P = q.pay, sel = new Map();                       // unit -> the colour forced on it (null: the engine picks)
      for (const k of (P.smart && P.smart.length === P.n ? P.smart : q.def)) sel.set(q.options[k].u, null);          // T-099: it starts on the payment that wastes no mana
      const el = h('div', 'ch-sheet pay');
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', q.title);
      el.innerHTML = `
        <div class="ch-head"><b class="ch-title">${esc(q.title)}</b><button class="ghost ch-peek" title="Fold this away to look at the table">Look at the table</button></div>
        <div class="ch-body">
          <div class="ch-text hint">${esc(q.text)}</div>
          <div class="ch-paycost"><b>${esc(P.text)}</b> <span class="ch-count"></span></div>
          <div class="ch-opts ch-paychips"></div>
          <div class="ch-paywaste" role="status" hidden></div>
          <div class="row wrap ch-btns"><button class="primary ch-ok">Confirm</button><button class="ghost ch-auto" title="Tap the sources that waste no mana">Pay automatically</button></div>
        </div>`;
      const $ = s => el.querySelector(s), box = $('.ch-opts');
      const picks = () => P.solve([...sel].map(([u, force]) => ({ u, force })));
      const render = () => {
        const ks = sel.size === P.n ? picks() : null, role = new Map();
        if (ks) for (const k of ks) role.set(q.options[k].u, q.options[k].role);
        box.replaceChildren();
        for (const u of P.units) {
          const on = sel.has(u.u), c = h('div', 'ch-paychip' + (on ? ' sel' : '')), b = h('button', 'ch-opt text'); b.type = 'button'; b.dataset.u = u.u; b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.appendChild(h('span', 'ch-name', esc(u.name) + (u.floating ? '' : '')));
          b.appendChild(h('span', 'ch-mana', u.colors.map(x => SYM[x] || x).join(' ')));
          if (u.side.length) b.appendChild(h('small', 'ch-note', esc(u.side.join(' · '))));
          if (on && role.has(u.u)) b.appendChild(h('span', 'ch-took', 'pays ' + (SYM[role.get(u.u)] || '') + (role.get(u.u) === 'generic' ? ' generic' : '')));
          c.appendChild(b);
          if (on && u.colors.length > 1) {                                 // a colour picker only where the source has a choice
            const pk = h('span', 'ch-paycol'); pk.setAttribute('role', 'group'); pk.setAttribute('aria-label', 'Colour of ' + u.name);
            for (const x of [null, ...u.colors]) { const cb = h('button', 'ch-col' + ((sel.get(u.u) || null) === x ? ' on' : '')); cb.type = 'button'; cb.dataset.u = u.u; cb.dataset.col = x || ''; cb.textContent = x ? SYM[x] || x : 'auto'; cb.title = x ? 'Make ' + x : 'Let the engine choose'; pk.appendChild(cb); }
            c.appendChild(pk);
          }
          box.appendChild(c);
        }
        { // T-099: what this selection leaves floating, and the payment that wastes none
          const wb = $('.ch-paywaste'), w = sel.size === P.n && ks ? P.waste([...sel.keys()]) : [];
          const sw = P.smart && P.smart.length === P.n ? P.waste(P.smart.map(k => q.options[k].u)) : [];
          const lost = x => x.reduce((t, e) => t + e.left, 0);
          wb.hidden = !w.length;
          if (w.length) wb.textContent = '⚠ ' + w.map(e => `${e.name} makes ${e.made}; ${e.left} ${e.left === 1 ? 'is' : 'are'} left floating`).join('; ') + (lost(sw) < lost(w) ? ' — "Pay automatically" wastes less.' : ' — it floats until the end of the turn.');
        }
        const ok = ks !== null && sel.size === P.n; $('.ch-ok').disabled = !ok;
        $('.ch-count').textContent = `${sel.size} of ${P.n} chosen${sel.size === P.n && !ok ? ' · does not pay the cost' : ''}`;
      };
      el.addEventListener('click', e => {
        e.stopPropagation();
        const t = e.target;
        if (t.closest('.ch-peek')) { const f = el.classList.toggle('peek'); t.closest('.ch-peek').textContent = f ? 'Show the choice' : 'Look at the table'; return; }
        const cb = t.closest('.ch-col'); if (cb) { sel.set(+cb.dataset.u, cb.dataset.col || null); return render(); }
        const b = t.closest('.ch-opt');
        if (b) { const u = +b.dataset.u; if (sel.has(u)) sel.delete(u); else if (sel.size < P.n) sel.set(u, null); return render(); }
        if (t.closest('.ch-auto')) return finish('smart');
        if (t.closest('.ch-ok') && !$('.ch-ok').disabled) return finish(picks());
      });
      open = { q, el, resolve, reject };
      document.body.appendChild(el);
      render();
    });
  }

  // T-130: the priority sheet (T-127; docs/PRIORITY-DESIGN.md section 6). You hold priority at a step: one line says what is happening
  // (the top of the stack, else whose turn it is), a big Pass is the default, and what you can use now sits below it as options.
  // Touch: a tap selects an option and "Cast"/"Use" confirms it (T-102: nothing is played by one stray tap). Mouse: a click plays it.
  // Every button ignores taps in the first 350 ms after the sheet opens or the selection changes (the ghost tap of the tap that opened it).
  const GHOST_MS = 350;
  function priorityLine(q) {
    const top = q.stack && q.stack[0];
    if (top) {
      const verb = top.kind === 'spell' ? (top.who === 'You' ? 'cast' : 'casts') : top.kind === 'ability' ? (top.who === 'You' ? 'activated' : 'activates') : 'trigger:';
      return `${top.who} ${verb} ${top.name}${top.text ? ' · ' + top.text : ''}${q.stack.length > 1 ? ` (+${q.stack.length - 1} more)` : ''}`;
    }
    return q.turnOf === 'You' || !q.turnOf ? 'Your turn · nothing is on the stack' : `${q.turnOf}'s turn · nothing is on the stack`;
  }
  function askPriority(q) {
    close();
    return new Promise((resolve, reject) => {
      const el = h('div', 'ch-sheet priority');
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', (q.stepName || 'You have priority') + ': you have priority');
      const seen = new Map(), items = [];          // identical options (two Lightning Bolts) share one chip; it plays the first
      for (const o of q.options) { const key = o.name + '|' + o.note; const it = seen.get(key); if (it) it.n++; else { const x = { o, n: 1 }; seen.set(key, x); items.push(x); } }
      el.innerHTML = `
        <div class="ch-head"><b class="ch-title">${esc(q.stepName || 'You have priority')}</b><button class="ghost ch-i" type="button" aria-expanded="false" title="What is this?" aria-label="What is this?">ⓘ</button><button class="ghost ch-peek" title="Fold this away to look at the table">Look at the table</button></div>
        <div class="ch-body">
          <div class="pr-ctx" role="status">${esc(priorityLine(q))}</div>
          <div class="ch-info hint" hidden>${esc(q.text || '')} Passing moves the game on; if everyone passes with something on the stack, it resolves. You can change when you are stopped in Settings → Display → Stop to respond.</div>
          <div class="row ch-btns pr-btns"><button class="primary pr-pass ch-none ch-auto" type="button">Pass</button><button class="pr-go" type="button" hidden></button></div>
          <div class="ch-opts pr-opts" role="group" aria-label="What you can use now"></div>
        </div>`;
      const $ = s => el.querySelector(s), box = $('.pr-opts'), go = $('.pr-go');
      let sel = null, at = Date.now(), lastType = '';
      const ghost = () => Date.now() - at < GHOST_MS;
      const touchy = () => lastType ? lastType === 'touch' : !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      const verbOf = o => (o.ability ? 'Use ' : 'Cast ') + o.name;
      items.forEach((it, i) => {
        const b = h('button', 'ch-opt text pr-opt'); b.type = 'button'; b.dataset.i = i; b.dataset.k = it.o.k; b.setAttribute('aria-pressed', 'false');
        b.appendChild(h('span', 'ch-name', esc(it.o.name) + (it.n > 1 ? ` <i>×${it.n}</i>` : '')));
        if (it.o.note) b.appendChild(h('small', 'ch-note', esc(it.o.note.replace(/^in response: /, ''))));
        box.appendChild(b);
      });
      if (!items.length) box.remove();
      const paint = () => {
        box.querySelectorAll('.pr-opt').forEach(b => { const on = sel === +b.dataset.i; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        go.hidden = sel == null; if (sel != null) go.textContent = verbOf(items[sel].o);
      };
      el.addEventListener('pointerdown', e => { lastType = e.pointerType || ''; }, true);
      el.addEventListener('click', e => {
        e.stopPropagation();
        const t = e.target;
        if (t.closest('.ch-peek')) { const f = el.classList.toggle('peek'); t.closest('.ch-peek').textContent = f ? 'Show the choice' : 'Look at the table'; return; }
        if (t.closest('.ch-i')) { const b = t.closest('.ch-i'), inf = $('.ch-info'); inf.hidden = !inf.hidden; b.setAttribute('aria-expanded', inf.hidden ? 'false' : 'true'); return; }
        if (ghost()) return;
        const b = t.closest('.pr-opt');
        if (b) { const i = +b.dataset.i; if (!touchy()) return finish(items[i].o.k); sel = sel === i ? null : i; at = Date.now(); return paint(); }
        if (t.closest('.pr-go') && sel != null) return finish(items[sel].o.k);
        if (t.closest('.pr-pass')) return finish('none');
      });
      open = { q, el, resolve, reject };
      document.body.appendChild(el);
      paint();
    });
  }

  function ask(q) {
    if (q.kind === 'priority') return askPriority(q);
    if (q.pay) return window.__isfPayChoose ? askPay(q) : Promise.resolve('smart');          // the Display setting "Choose how I pay mana" (off: nothing is shown, and the payment that wastes no mana is made)
    close();
    return new Promise((resolve, reject) => {
      const ts = tiles(q), take = new Map();                  // tile -> how many of its cards are chosen
      ts.forEach(t => { if (t.def) take.set(t, q.multi ? t.def : 1); });
      if (!q.multi) { let one = false; ts.forEach(t => { if (take.has(t)) { if (one) take.delete(t); one = true; } }); }
      const fan = !!q.fan && ts.every(t => t.o.card);
      const el = h('div', 'ch-sheet ' + q.kind + (fan ? ' fanned' : ''));
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', q.title);
      const defNames = q.def.map(k => q.options[k].name);
      el.innerHTML = `
        <div class="ch-head"><b class="ch-title">${esc(q.title)}</b><button class="ghost ch-peek" title="Fold this away to look at the table">Look at the table</button></div>
        <div class="ch-body">
          <div class="ch-text hint">${esc(q.text)}${q.multi ? ` <b class="ch-count"></b>` : ''}</div>
          ${q.combo ? `<div class="ch-combo" role="status"><b>Combo assembled</b><span class="ch-combo-name">${esc(q.combo.name)}</span>${q.combo.cards.length ? `<small>${esc(q.combo.cards.join(' + '))}</small>` : ''}</div>` : ''}
          ${q.combo && q.combo.outcome === 'mana' ? `<div class="ch-mana row"><label>How much mana? <input class="ch-mana-n" type="number" min="1" step="1" placeholder="number" aria-label="How much mana"></label><button class="ch-mana-go" type="button" disabled>Take that much</button><button class="ch-mana-inf" type="button" title="As much as you like" aria-label="Infinite mana: as much as you like">∞<span class="ch-inf-w"> Infinite</span></button></div>` : ''}
          ${q.dest ? `<div class="ch-dest"><span>Goes to</span> <b>${esc(q.dest)}</b></div>` : ''}
          ${ts.length > 12 ? '<input class="ch-filter" type="search" placeholder="Filter by name or type…" aria-label="Filter the cards">' : ''}
          ${q.stack && q.stack.length ? `<details class="ch-stack"><summary>On the stack · ${q.stack.length} <small>(top: ${esc(q.stack[0].name)})</small></summary><div class="ch-stack-list"></div></details>` : ''}
          <div class="ch-main"><div class="ch-spell"></div><div class="ch-opts"></div></div>
          <div class="ch-picked"></div>
          <div class="row wrap ch-btns">
            <button class="primary ch-ok"></button>
            ${q.none ? `<button class="ch-none">${esc(q.none)}</button>` : ''}
            ${q.noAuto ? '' : `<button class="ghost ch-auto" title="Take what the autopilot would choose">Let the autopilot decide<small> · ${esc(defNames.length ? defNames.join(', ') : (q.none || 'nothing'))}</small></button>`}
          </div>
        </div>`;
      const $ = s => el.querySelector(s), box = $('.ch-opts');
      if (q.stack && q.stack.length) {          // the stack, newest first: each item with whose it is and what it is
        const KIND = { spell: 'spell', ability: 'triggered ability', triggered: 'triggered, waiting to go on the stack' };
        for (const it of q.stack) { const b = h('div', 'ch-stack-item'); if (it.card) b.appendChild(A.cardEl(it.card, {})); b.appendChild(h('small', '', `${esc(it.who)} · ${KIND[it.kind] || it.kind}`)); if (it.text) b.title = it.text; $('.ch-stack-list').appendChild(b); }
      }
      if (q.spell) { const c = A.cardEl(q.spell, { eager: true }); $('.ch-spell').append(c, h('small', '', esc(q.spellNote || 'being cast'))); } else $('.ch-spell').remove();
      if (q.targets && q.targets.length) { const tb = h('div', 'ch-targets'); for (const t of q.targets) { const b = h('div', 'ch-target'); if (t.card) b.appendChild(A.cardEl(t.card, {})); b.appendChild(h('small', '', esc('target: ' + t.name))); tb.appendChild(b); } const sp = $('.ch-spell'); if (sp) sp.appendChild(tb); }          // T-072: what the spell targets
      for (const t of ts) {
        const b = h('button', 'ch-opt' + (t.def ? ' def' : '') + (t.o.card ? '' : ' text') + (t.o.disabled ? ' off' : ''));
        if (t.o.disabled) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }          // shown, with the reason in its note, but it cannot be picked
        b.type = 'button'; b.dataset.t = t.i; b.dataset.k = t.ks[0]; b.title = t.o.name + (t.ks.length > 1 ? ` (${t.ks.length} in your library)` : '');
        b.dataset.find = (t.o.name + ' ' + (t.o.card ? t.o.card.type_line || '' : '')).toLowerCase();
        if (t.o.card) { const c = A.cardEl(t.o.card, { face: t.o.face || 0 }); b.appendChild(c); }
        b.appendChild(h('span', 'ch-name', esc(t.o.name) + (t.ks.length > 1 ? ` <i>×${t.ks.length}</i>` : '')));
        if (t.o.note) b.appendChild(h('small', 'ch-note', esc(t.o.note)));
        if (t.def && !q.noAuto) b.appendChild(h('span', 'ch-star', '★ autopilot'));
        b.appendChild(h('span', 'ch-took'));
        b._acts = () => viewerActs(t);          // T-134: a tap on its picture opens the viewer; picking it is the button there
        box.appendChild(b);
      }
      // the fan: a few cards spread in an arc; a long library is one overlapping row that scrolls sideways
      const layFan = () => {
        if (!fan) return;
        const shown = [...box.querySelectorAll('.ch-opt')].filter(b => !b.hidden), n = shown.length;
        const w = shown[0] ? shown[0].getBoundingClientRect().width || 128 : 128, arc = n <= 14 && box.clientWidth >= w * (1 + (n - 1) * 0.58) + 60;          // an arc only when it fits
        box.classList.toggle('arc', arc);
        shown.forEach((b, i) => { const x = n > 1 ? i / (n - 1) - 0.5 : 0; b.style.setProperty('--rot', arc ? (x * Math.min(28, n * 3.2)).toFixed(1) + 'deg' : '0deg'); b.style.setProperty('--dip', arc ? (x * x * Math.min(36, n * 4)).toFixed(1) + 'px' : '0px'); b.style.zIndex = String(i + 1); b.style.marginLeft = i === 0 ? '0' : arc ? `calc(var(--fan-w) * ${n <= 5 ? -0.12 : n <= 9 ? -0.3 : -0.42})` : ''; });          // a few cards barely overlap
      };
      const count = () => [...take.values()].reduce((a, b) => a + b, 0);
      const picks = () => { const ks = []; for (const [t, n] of take) ks.push(...t.ks.slice(0, n)); return ks.sort((x, y) => x - y); };
      const refresh = () => {
        box.querySelectorAll('.ch-opt').forEach(b => { const t = ts[+b.dataset.t], n = take.get(t) || 0; b.classList.toggle('sel', n > 0); b.setAttribute('aria-pressed', n > 0 ? 'true' : 'false'); b.querySelector('.ch-took').textContent = n > 1 ? '×' + n : ''; });
        const ok = $('.ch-ok'), n = count(), word = q.kind === 'search' ? 'Submit' : null;
        ok.hidden = !ts.length;                               // nothing to pick (a spell on the stack you cannot answer): only "Let it resolve"
        if (q.multi) {
          ok.disabled = n < q.min || n > q.max;
          ok.textContent = word ? (n ? `Submit (${n})` : 'Submit: take nothing') : q.kind === 'mode' ? 'Choose these' : `Confirm ${n} card${n === 1 ? '' : 's'}`;
          $('.ch-count').textContent = q.min === q.max ? `${n} of ${q.max} chosen.` : q.min === 0 ? `${n} of up to ${q.max} chosen.` : `${n} chosen (${q.min} to ${q.max}).`;
        } else {
          const t = [...take.keys()][0];
          ok.disabled = !t;
          ok.textContent = !t ? (word ? 'Select a card' : q.kind === 'loyalty' ? 'Choose an ability' : 'Choose a card') : (word ? 'Submit' : q.kind === 'loyalty' ? 'Activate ' + t.o.label : (q.kind === 'counter' && !/^counter it/.test(t.o.note || '')) || q.kind === 'resolve' || q.kind === 'face' ? 'Cast ' + t.o.name : q.kind === 'counter' ? 'Counter with ' + t.o.name : 'Choose ' + t.o.name);
          if (flip) { const fi = $('.ch-faceinfo'); if (fi && t) fi.innerHTML = `<b>${esc(t.o.name)}</b><small>${esc(t.o.note || '')}</small><span class="hint">${t.o.face ? 'Back face' : 'Front face'} · ⟲ turns the card over</span>`; }
        }
        const pk = $('.ch-picked');
        if (pk && q.kind === 'search') pk.textContent = n ? 'Selected: ' + picks().map(k => q.options[k].name).join(', ') : 'Nothing selected yet.'; else if (pk) pk.remove();
      };
      const pickTile = tile => {
        const has = take.get(tile) || 0;
        if (!q.multi) { const was = has; take.clear(); if (!was || !fan) take.set(tile, 1); }
        else if (has < tile.ks.length && count() < q.max) take.set(tile, has + 1);
        else if (has < tile.ks.length && q.max === 1) { take.clear(); take.set(tile, 1); }
        else take.delete(tile);
        refresh();
      };
      // what the viewer offers for one option of the sheet: choosing (or un-choosing) it. A single pick closes the viewer; picking several stays open to swipe on.
      const viewerActs = t => {
        const on = (take.get(t) || 0) > 0, name = t.o.name.split(' // ')[0], note = t.o.note || '';
        const label = on ? 'Un-choose ' + name : /^counter it/i.test(note) ? note : q.kind === 'target' ? 'Target ' + name : 'Choose ' + name;
        return [[label, () => pickTile(t), 'primary', !!q.multi, t.o.disabled ? (note || 'Cannot be chosen') : '']];
      };
      el.addEventListener('click', e => {
        e.stopPropagation();                                  // nothing under the sheet reacts: a tap on a card opens the viewer, below
        const t = e.target;
        if (t.closest('.ch-peek')) { const f = el.classList.toggle('peek'); t.closest('.ch-peek').textContent = f ? 'Show the choice' : 'Look at the table'; return; }
        const b = t.closest('.ch-opt');
        { const m = b ? b.querySelector('.mtg') : !t.closest('button') && t.closest('.mtg'); if (m && A.cardOf(m)) return A.viewCard(A.cardOf(m), m); }          // any card of the sheet: the stack, the spell, its targets, the options
        if (b) return pickTile(ts[+b.dataset.t]);
        if (t.closest('.ch-mana-go') && !t.closest('.ch-mana-go').disabled) return finish({ mana: Math.floor(+$('.ch-mana-n').value) });
        if (t.closest('.ch-mana-inf')) { const k = q.options.findIndex(o => o.id === 'mana:inf'); if (k >= 0) return finish(k); }
        if (t.closest('.ch-auto')) return finish('auto');
        if (t.closest('.ch-none')) return finish('none');
        if (t.closest('.ch-ok') && !$('.ch-ok').disabled) return finish(q.multi ? picks() : picks()[0]);
      });
      const mn = $('.ch-mana-n'); if (mn) mn.addEventListener('input', () => { $('.ch-mana-go').disabled = !(Math.floor(+mn.value) >= 1); });
      const flt = $('.ch-filter');
      if (flt) flt.addEventListener('input', () => { const v = flt.value.trim().toLowerCase(); box.querySelectorAll('.ch-opt').forEach(b => { b.hidden = !!v && !b.dataset.find.includes(v); }); layFan(); });
      // a two-faced card: one card, not two pictures side by side. ⟲ swings it around; the face showing is the face that is cast.
      let flip = null;
      if (q.kind === 'face' && A.flipCardEl && ts.length === 2) {
        const byFace = f => ts.find(t => t.o.face === f), start = [...take.keys()][0] || ts[0];
        flip = A.flipCardEl(start.o.card, { face: start.o.face, onFlip: f => { take.clear(); take.set(byFace(f), 1); refresh(); } });
        box.replaceChildren(h('div', 'ch-faceflip'));
        box.firstChild.append(flip, h('div', 'ch-faceinfo'));
        el.classList.add('flipping');
      }
      open = { q, el, resolve, reject };
      document.body.appendChild(el);
      layFan(); refresh();
      if (fan) { const d = box.querySelector('.ch-opt.def'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    });
  }

  // The steps of a turn as a strip in the bar above the table. The strip is written once and the step being played is lit in place
  // (lightStep), so the buttons beside it are not rebuilt at every step: a click on Pause always lands.
  const SHORT = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main', combat: 'Combat', main2: 'Main 2', end: 'End' };
  // A static box: it is never hidden and never changes size (see choices.css). index.html writes the same seven items for Practice.
  function stepsHtml(D) { return `<span class="vs-steps">${D.STEPS.map(s => `<i data-step="${s}" data-t="${SHORT[s]}">${SHORT[s]}</i>`).join('')}</span>`; }
  function lightStep(strip, D, step, who) {
    if (!strip) return;
    strip.title = step && D ? `${who ? who + ': ' : ''}${D.STEP_NAME[step]} step` : '';
    strip.querySelectorAll('i').forEach(i => i.classList.toggle('on', i.dataset.step === step));
  }

  A.addViewerActions((card, el) => { const b = el && el.closest && el.closest('.ch-opt'); return b && b._acts ? b._acts() : null; });
  window.__isfChoices = { ask, close, answer: finish, CANCELLED, stepsHtml, lightStep, current: () => (open ? open.q : null) };
})();
