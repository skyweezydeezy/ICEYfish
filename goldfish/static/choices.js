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
