/* ICEYfish - Puzzle (T-115): hand-built puzzles that teach how cards work. Two types: a fast win (a real game from turn 1, the right sequence wins on turn
   2 or 3) and an endgame (a late board on both sides, one flow of plays wins). Difficulty is how hard the sequence is to see: easy (the opponent only blocks),
   medium (one hidden piece of interaction), hard (a full hidden hand that plays back). A wrong play plays out; hints after a loss say what to look at, never
   the line; after every puzzle, won or lost, the lesson sits behind an ⓘ. The data is puzzles.json (hand-built, engine-checked by tests/engine/puzzles.test.js);
   the rules are puzzle-core.js (a real engine seat holds the hidden hand). Progress, the streak and the hints used are kept in localStorage "isf_puzzle2". */
(function () {
  'use strict';
  const G = window.Goldfish, A = window.__isfApi, D = window.Decide, C = window.__isfChoices, Core = window.PuzzleCore;
  if (!G || !A || !D || !Core) return;
  const { h, esc } = A;
  const KEY = 'isf_puzzle2';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* blocked */ } };
  const LV = ['easy', 'medium', 'hard'], LVN = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const TYPES = { fast: { name: 'Fast win', text: 'A real game from turn 1. Your hand holds the cards for a win on turn 2 or 3, and only the right sequence wins.' }, endgame: { name: 'Endgame', text: 'A late-game position with a board on both sides. One flow of plays wins this turn.' } };
  const OPP = { easy: 'It only blocks. Its hand is empty.', medium: 'It holds one hidden piece of interaction.', hard: 'It holds a full hand you cannot see, and plays it back.' };
  let DATA = null, root = null, P = null;
  const data = () => DATA || (DATA = fetch('puzzles.json').then(r => { if (!r.ok) throw new Error('puzzles.json: ' + r.status); return r.json(); }));
  const cache = new Map();
  const tabEl = () => document.getElementById('tab-puzzle');

  // ---- loading a puzzle's cards ------------------------------------------------------------------------------------------------------
  async function cardsFor(pz) {
    if (cache.has(pz.id)) return cache.get(pz.id);
    await window.Source.init();
    const r = await window.Source.loadDeck(Core.namesOf(pz).map(n => '1 ' + n).join('\n'));
    const by = new Map(r.cards.map(c => [c.name, c]));
    const cardOf = n => by.get(n) || r.cards.find(c => c.name.split(' // ')[0] === n);
    cache.set(pz.id, cardOf); return cardOf;
  }

  // ---- the tab -----------------------------------------------------------------------------------------------------------------------
  function mount() {
    root = tabEl(); if (!root) return false;
    if (!root.dataset.pz) { root.dataset.pz = '1'; root.classList.add('pz'); root.innerHTML = '<div class="pz-body"><p class="hint">Loading the puzzles…</p></div>'; data().then(d => { if (!P) picker(d); }).catch(e => { root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not load the puzzles: ${esc(e.message)}</p></div>`; }); }
    return true;
  }
  function open() { A.showTab('puzzle'); }
  function leave() { if (C && P && P.phase !== 'over') { try { C.close(); } catch (e) { /* none open */ } } }
  const solvedOf = (prog, id) => (prog.solved || {})[id];
  function score(d, prog) {
    let done = 0, clean = 0;
    for (const pz of d.puzzles) { const r = solvedOf(prog, pz.id); if (r) { done++; if (!r.hints) clean++; } }
    return { total: d.puzzles.length, done, clean, streak: prog.streak || 0, best: prog.best || 0, hints: prog.hintsUsed || 0 };
  }
  function picker(d) {
    P = null; mount();
    const prog = load(), sc = score(d, prog);
    const row = pz => { const r = solvedOf(prog, pz.id);
      return `<button type="button" class="pz-pick${r ? ' solved' : ''}" data-id="${esc(pz.id)}" data-level="${pz.level}"><span class="pz-tick">${r ? '✓' : '○'}</span><span class="pz-pt">${esc(pz.title)}</span><span class="pz-lv">${LVN[pz.level]}</span></button>`; };
    const sec = t => { const mine = d.puzzles.filter(p => p.type === t), n = mine.filter(p => solvedOf(prog, p.id)).length;
      return `<details class="pz-type" data-type="${t}" open><summary><b>${TYPES[t].name}</b><span class="pz-n">${n}/${mine.length}</span></summary><p class="hint pz-typetext">${esc(TYPES[t].text)}</p>${LV.map(l => `<div class="pz-level" data-level="${l}"><div class="pz-lh">${LVN[l]}</div><div class="pz-rows">${mine.filter(p => p.level === l).map(row).join('')}</div></div>`).join('')}</details>`; };
    root.innerHTML = `<div class="pz-body">
      <div class="pz-head"><h2>Puzzle</h2><button type="button" class="ghost pz-info" aria-expanded="false" title="What is this?">ⓘ</button></div>
      <p class="hint pz-intro" hidden>Each puzzle is a real position you play with the real cards. You never see the opponent's hand. Easy: the opponent only blocks. Medium: it holds one hidden piece of interaction. Hard: a full hidden hand that plays back. A wrong play plays out until it can no longer be won; then you get hints (never the answer) and the lesson. The opponent plays like the engine's autopilot: it blocks, it counters or answers the first thing it can, and it uses removal at the end of your turn.</p>
      <div class="pz-score" role="status"><span><b>${sc.done}</b> of ${sc.total} solved</span><span>Streak <b>${sc.streak}</b></span><span>Best streak <b>${sc.best}</b></span><span>No hint: <b>${sc.clean}</b></span><span>Hints used: <b>${sc.hints}</b></span></div>
      ${['fast', 'endgame'].map(sec).join('')}
    </div>`;
    const info = root.querySelector('.pz-info'), intro = root.querySelector('.pz-intro');
    info.onclick = () => { intro.hidden = !intro.hidden; info.setAttribute('aria-expanded', String(!intro.hidden)); };
    root.querySelectorAll('.pz-pick').forEach(b => { b.onclick = () => start(d, b.dataset.id); });
  }
  function back() { try { C && C.close(); } catch (e) { /* none */ } const d = DATA; P = null; if (d) d.then(picker); }

  // ---- one puzzle ---------------------------------------------------------------------------------------------------------------------
  async function start(d, id) {
    const pz = d.puzzles.find(p => p.id === id); if (!pz) return;
    mount(); root.innerHTML = '<div class="pz-body"><p class="hint">Setting up the table…</p></div>';
    const tok = P = { d, pz, log: [], sel: null, atk: false, atkSel: new Set(), busy: true, phase: 'setup', hintsShown: 0, over: null };
    try {
      const cardOf = await cardsFor(pz); if (P !== tok) return;
      P.sc = Core.newScenario(cardOf, pz);
      const prog = load(); prog.tried = prog.tried || {}; prog.tried[pz.id] = (prog.tried[pz.id] || 0) + 1; save(prog);
      await nextTurn();
    } catch (e) { if (P === tok && root) { root.innerHTML = `<div class="pz-body"><p class="pz-err">Could not set up the puzzle: ${esc(e.message || e)}</p><button class="ghost pz-back">‹ Puzzles</button></div>`; root.querySelector('.pz-back').onclick = back; } }
  }
  const texts = ev => (Array.isArray(ev) ? ev : []).flatMap(e => (e && e.text ? [e.text] : []));
  const say = t => { if (t) P.log.push(t); };
  const tell = ev => { for (const t of texts(ev)) say(t); };
  // the engine's questions: the opponent's from its habit (counter or answer at the first chance), yours from the page (a response, a target, a choice)
  function answer(q) {
    if (q.kind === 'priority' && !(q.seat === 1 && (q.step === 'combat' || q.step === 'end'))) return 'none';          // T-127: the opponent acts only in the old windows (the attack, the end step)
    if (q.seat === 1) { const p = Core.greedy(q), w = p === 'none' ? null : q.options[p]; say(w ? `Opponent: ${w.name}${q.spell ? ' in response to ' + q.spell.name : ''}.` : null); return p; }
    if (q.kind === 'resolve' || q.kind === 'instant' || q.kind === 'priority') return 'none';
    if (q.pay) { const was = window.__isfPayChoose; window.__isfPayChoose = true; try { return C ? C.ask(q) : 'smart'; } finally { window.__isfPayChoose = was; } }          // a puzzle always asks how a cost is paid when there is more than one way (the Display setting does not turn the sheet off here)
    if (q.kind === 'tax') return Math.max(0, q.options.findIndex(o => /pay/i.test(o.name)));
    if (q.kind === 'counter' && !(q.options && q.options.length)) return 'none';
    return C ? C.ask(q) : 'auto';
  }
  const quit = e => (C && e === C.CANCELLED) || !P;
  async function nextTurn() {
    const tok = P, sc = P.sc;
    P.busy = true; render();
    const v = await Core.toMyTurnA(sc, answer); if (P !== tok) return;
    P.atk = false; P.atkSel = new Set(); P.busy = false;
    if (v) return finish(v);
    P.phase = 'me'; render();
  }
  async function run(fn) {
    if (!P || P.busy || P.phase === 'over') return;
    const tok = P, sc = P.sc; P.busy = true; render();
    try {
      const ev = await Core.runAsync(sc, fn, answer); if (P !== tok) return;
      tell(ev); P.atk = false; P.atkSel = new Set(); P.busy = false;
      const v = Core.verdict(sc); if (v) { sc.over = v; return finish(v); }
      render();
    } catch (e) { if (quit(e) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
  }
  async function endTurn() {
    if (!P || P.busy || P.phase !== 'me') return;
    const tok = P, sc = P.sc; P.busy = true; render();
    try {
      const v = await Core.endMineA(sc, answer); if (P !== tok) return;
      if (v) return finish(v);
      await nextTurn();
    } catch (e) { if (quit(e) || P !== tok) return; P.busy = false; say('Something went wrong: ' + (e.message || e)); render(); }
  }
  function finish(v, gaveUp) {
    P.phase = 'over'; P.busy = false; P.over = gaveUp ? 'lose' : v; P.gaveUp = !!gaveUp;
    const prog = load(), id = P.pz.id;
    if (P.over === 'win') { prog.solved = prog.solved || {}; const old = prog.solved[id]; prog.solved[id] = { hints: old ? Math.min(old.hints || 0, P.hintsShown) : P.hintsShown }; prog.streak = (prog.streak || 0) + 1; prog.best = Math.max(prog.best || 0, prog.streak); }
    else prog.streak = 0;
    if (P.hintsShown) prog.hintsUsed = (prog.hintsUsed || 0) + P.hintsShown;
    save(prog); P.hintsShown = 0; P.streakNow = prog.streak || 0;
    render();
  }

  // ---- drawing it ----------------------------------------------------------------------------------------------------------------------
  const tile = (inst, cls, title) => { const e = A.cardEl(inst.card, { iid: inst.iid, eager: true }); e.classList.add('pz-t'); if (cls) cls.split(' ').forEach(c => c && e.classList.add(c)); if (title) e.title = title; return e; };
  const castable = (g, i) => G.canPay(G.effectiveCost(g, i), G.allUnits(g)) || G.canCastBack(g, i);
  const landsLine = g => { const ls = g.battlefield.filter(p => p.asLand), open = ls.filter(l => !l.tapped).length; return ls.length ? `${open} of ${ls.length} lands untapped` : 'no lands'; };
  const graveLine = g => g.graveyard.length ? 'Graveyard: ' + g.graveyard.slice(-6).map(i => i.card.name.split(' // ')[0]).join(', ') : 'Graveyard: empty';
  function render() {
    if (!P || !root) return;
    const { pz, sc } = P, g = sc.g, b = sc.b, over = P.phase === 'over', me = P.phase === 'me' && !P.busy;
    const hand = g.hand.concat(g.command || []);
    root.innerHTML = `<div class="pz-body" data-phase="${P.phase}" data-type="${pz.type}" data-level="${pz.level}">
      <div class="pz-head"><button type="button" class="ghost pz-back">‹ Puzzles</button><h2 class="pz-title">${esc(pz.title)}</h2><button type="button" class="ghost pz-info" aria-expanded="false" title="How the opponent plays">ⓘ</button></div>
      <p class="pz-sub">${TYPES[pz.type].name} · <b>${LVN[pz.level]}</b></p>
      <div class="pz-fold" hidden><p class="hint">${esc(OPP[pz.level])} It plays like the engine's autopilot: it blocks, it counters or answers the first thing it can, and it uses removal at the end of your turn. You never see its hand.</p></div>
      <p class="pz-premise">${esc(pz.premise)}</p>
      <div class="pz-goal">${over ? (P.over === 'win' ? '<b>✓ done</b>' : '<b>not this time</b>') : `Turn <b>${g.turn || 1}</b>${pz.deadline > 1 ? ' · your turn <b>' + Math.max(1, sc.mine) + '</b> of ' + pz.deadline : ''}`}</div>
      <div class="pz-opp"><div class="pz-oh"><b>Opponent</b> <span class="pz-life" data-life="opp">${b.life} life</span> <span class="pz-sub2">${landsLine(b)} · ${b.hand.length ? `<span class="pz-hid" data-n="${b.hand.length}">${b.hand.length} card${b.hand.length === 1 ? '' : 's'} in hand (hidden)</span>` : 'no cards in hand'}</span></div>
        <div class="pz-tiles pz-oppbf">${b.battlefield.some(p => !p.asLand) ? '' : '<i class="hint">no permanents</i>'}</div><p class="pz-meta">${esc(graveLine(b))}</p></div>
      <div class="pz-table">
        <div class="pz-zone"><span class="pz-zh">You · <span class="pz-life" data-life="me">${g.life} life</span> · ${esc(landsLine(g))}</span><div class="pz-tiles pz-bf">${g.battlefield.some(p => !p.asLand) ? '' : '<i class="hint">no permanents</i>'}</div></div>
        <div class="pz-zone"><span class="pz-zh">Your hand${g.command && g.command.length ? ' and command zone' : ''}</span><div class="pz-tiles pz-hand-tiles">${hand.length ? '' : '<i class="hint">empty</i>'}</div></div>
        <p class="pz-meta">${esc(graveLine(g))}</p>
      </div>
      <div class="pz-bar"></div>
      <div class="pz-result"></div>
      <details class="pz-log"><summary>Log (${P.log.length})</summary><ol>${P.log.slice(-40).map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>
    </div>`;
    root.querySelector('.pz-oppbf').append(...b.battlefield.filter(p => !p.asLand).map(p => tile(p, 'pz-opp-t' + (p.tapped ? ' tapped' : ''), p.card.name)));
    const bf = root.querySelector('.pz-bf');
    bf.append(...g.battlefield.filter(p => !p.asLand).map(p => {
      const can = me && P.atk && G.canAttack(g, p), picked = P.atkSel.has(p.iid);
      const btn = h('button', 'pz-perm' + (can ? ' can' : '') + (picked ? ' picked' : '') + (p.tapped ? ' tapped' : ''));
      btn.type = 'button'; btn.dataset.iid = p.iid; btn.dataset.name = p.card.name; btn.title = p.card.name + (p.tapped ? ' (tapped)' : '');
      btn.appendChild(tile(p, 'pz-bf-t'));
      btn.onclick = e => { e.stopPropagation(); A.viewCard(p.card, btn.firstChild); };          // T-134: a tap opens the card; what it can do is a button in the viewer
      return btn;
    }));
    root.querySelector('.pz-hand-tiles').append(...hand.map(i => {
      const isLand = !!i.card.a.isLand, can = me && (isLand ? G.canPlayLand(g) : castable(g, i));
      const btn = h('button', 'pz-card' + (can ? ' can' : ''));
      btn.type = 'button'; btn.dataset.iid = i.iid; btn.dataset.name = i.card.name; btn.setAttribute('aria-label', i.card.name); btn.title = i.card.name;
      btn.appendChild(tile(i, ''));
      btn.onclick = e => { e.stopPropagation(); A.viewCard(i.card, btn.firstChild); };
      return btn;
    }));
    const bar = root.querySelector('.pz-bar');
    if (!over) {
      const items = [];
      const attackers = g.battlefield.filter(p => G.canAttack(g, p));
      if (P.atk) {
        items.push(`<button type="button" class="primary pz-decl" ${me && P.atkSel.size ? '' : 'disabled'}>Declare attack (${P.atkSel.size})</button>`, `<button type="button" class="ghost pz-all" ${me && attackers.length ? '' : 'disabled'}>Attack with all</button>`, '<button type="button" class="ghost pz-cancel">Cancel</button>');
      } else {
        items.push(`<button type="button" class="pz-atk" ${me && attackers.length ? '' : 'disabled'} title="Choose which creatures attack">Attack…</button>`);
        items.push(`<button type="button" class="ghost pz-pass" ${me ? '' : 'disabled'}>End turn</button>`);
        items.push('<button type="button" class="ghost pz-giveup">Give up</button>');
      }
      bar.innerHTML = items.join('') + (P.busy ? '<p class="hint pz-busy">Working…</p>' : '');
      const atk = bar.querySelector('.pz-atk'); if (atk) atk.onclick = () => { P.atk = true; P.atkSel = new Set(); render(); };
      const decl = bar.querySelector('.pz-decl'); if (decl) decl.onclick = () => { const ids = [...P.atkSel]; run(gs => D.turn.combat(gs[0], { attackers: ids })); };
      const all = bar.querySelector('.pz-all'); if (all) all.onclick = () => { const ids = attackers.map(p => p.iid); run(gs => D.turn.combat(gs[0], { attackers: ids })); };
      const cn = bar.querySelector('.pz-cancel'); if (cn) cn.onclick = () => { P.atk = false; P.atkSel = new Set(); render(); };
      const ps = bar.querySelector('.pz-pass'); if (ps) ps.onclick = endTurn;
      const gv = bar.querySelector('.pz-giveup'); if (gv) gv.onclick = () => { try { C && C.close(); } catch (e) { /* none */ } finish('lose', true); };
    } else {
      const R = root.querySelector('.pz-result'), won = P.over === 'win', L = pz.lesson;
      R.innerHTML = `<div class="pz-banner ${won ? 'win' : 'lose'}" role="status"><b>${won ? '✓ Solved.' : P.gaveUp ? 'You gave up.' : sc.g.life <= 0 ? 'You are out of life.' : 'Not this time: it can no longer be won.'}</b><span>Streak ${P.streakNow}${won ? '' : ' (reset)'}</span></div>
        <div class="pz-hints"${won ? ' hidden' : ''}><button type="button" class="ghost pz-hint">Show a hint</button><ol class="pz-hintlist"></ol></div>
        <div class="pz-lesson"><button type="button" class="ghost pz-lbtn" aria-expanded="false">ⓘ What this taught</button><div class="pz-lbody" hidden><p><b>${esc(L.mechanic)}</b></p><p>${esc(L.rules)}</p></div></div>
        <div class="pz-after"><button type="button" class="primary pz-again">Try again</button><button type="button" class="ghost pz-next">Next puzzle</button><button type="button" class="ghost pz-list">Puzzles</button></div>`;
      const hl = R.querySelector('.pz-hintlist'), hb = R.querySelector('.pz-hint');
      const drawHints = () => { hl.innerHTML = pz.hints.slice(0, P.hintsShown).map(t => `<li>${esc(t)}</li>`).join(''); hb.hidden = P.hintsShown >= pz.hints.length; hb.textContent = `Show ${P.hintsShown ? 'another' : 'a'} hint (${P.hintsShown} of ${pz.hints.length})`; };
      hb.onclick = () => { P.hintsShown++; const prog = load(); prog.hintsUsed = (prog.hintsUsed || 0) + 1; save(prog); drawHints(); };
      drawHints();
      const lb = R.querySelector('.pz-lbtn'), lbody = R.querySelector('.pz-lbody');
      lb.onclick = () => { lbody.hidden = !lbody.hidden; lb.setAttribute('aria-expanded', String(!lbody.hidden)); };
      R.querySelector('.pz-again').onclick = () => start(P.d, pz.id);
      R.querySelector('.pz-next').onclick = () => { const all = P.d.puzzles, i = all.findIndex(x => x.id === pz.id); start(P.d, all[(i + 1) % all.length].id); };
      R.querySelector('.pz-list').onclick = back;
    }
    root.querySelector('.pz-back').onclick = back;
    const info = root.querySelector('.pz-info'), fold = root.querySelector('.pz-fold');
    info.onclick = () => { fold.hidden = !fold.hidden; info.setAttribute('aria-expanded', String(!fold.hidden)); };
  }
  const pool = x => x.hand.concat(x.command || []);
  // T-134: the card viewer is where a card's actions are. A tap on a card of yours opens it; Cast / Play, abilities, loyalty and the attack pick are buttons in it.
  // Anything that cannot be done now is shown greyed with the reason, and with nothing to do the viewer is for reading only.
  const dis = (ok, why) => ok ? '' : why;
  A.addViewerActions((card, el) => {
    const btn = el && el.closest && el.closest('.pz-card, .pz-perm'); if (!btn || !P || P.phase === 'over' || !P.sc) return null;
    const g = P.sc.g, iid = +btn.dataset.iid, me = P.phase === 'me' && !P.busy, out = [], waiting = me ? '' : 'Not your turn yet';
    const hand = g.hand.concat(g.command || []).find(i => i.iid === iid);
    if (hand) {
      const isLand = !!hand.card.a.isLand, nm = hand.card.name.split(' // ')[0], ok = isLand ? G.canPlayLand(g) : castable(g, hand);
      out.push([(isLand ? 'Play ' : 'Cast ') + nm, () => run(isLand ? (gs => G.playLandCard(gs[0], gs[0].hand.find(x => x.iid === iid))) : (gs => G.castCard(gs[0], pool(gs[0]).find(x => x.iid === iid)))), 'primary', false, waiting || dis(ok, isLand ? 'No land drop left' : 'Not enough mana')]);
      return out;
    }
    const perm = g.battlefield.find(p => p.iid === iid); if (!perm) return null;
    if (P.atk && G.canAttack(g, perm)) { const on = P.atkSel.has(iid); out.push([on ? 'Keep it home' : 'Attack with this', () => { if (on) P.atkSel.delete(iid); else P.atkSel.add(iid); render(); }, 'primary', true, waiting]); }
    let menu = []; try { menu = G.abilityMenu(g, perm); } catch (e) { menu = []; }
    menu.forEach((m, i) => out.push([(m.label || 'Ability').slice(0, 60) + (m.cost ? ' · ' + m.cost : ''), () => run(gs => { const p = gs[0].battlefield.find(x => x.iid === iid); return p ? G.useAbility(gs[0], p, i) : null; }), '', false, waiting || dis(m.ok, m.why || 'Cannot be used now')]));
    if (perm.card.a.isPlaneswalker) { let st = null; try { st = G.loyaltyState(g, perm, g); } catch (e) { st = null; } if (st) st.list.forEach(it => out.push([it.label + ': ' + String(it.text).slice(0, 48), () => run(gs => { const p = gs[0].battlefield.find(x => x.iid === iid); return p ? G.useLoyalty(gs[0], p, it.i, gs[0]) : null; }), '', false, waiting || dis(it.ok, it.why || 'Cannot be used now')])); }
    return out;
  });

  // the tab: its picker is made when it is first shown; leaving it closes an open question; Escape goes back to the picker
  new MutationObserver(() => { if (document.body.dataset.view === 'puzzle') mount(); else leave(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  let viewerWasOpen = false;          // Esc that closes the card viewer must not also leave the puzzle (T-134)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') viewerWasOpen = !!document.querySelector('#lightbox.show'); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !viewerWasOpen && document.body.dataset.view === 'puzzle' && P && !document.querySelector('.ch-sheet')) back(); });
  if (document.body.dataset.view === 'puzzle') mount();

  window.ISFPuzzle = { open, state: () => P, progress: load, picker: () => DATA && DATA.then(picker) };
  window.__isfPuzzle = window.ISFPuzzle;
})();
