/* ============================================================================
 * main.js — Wiring.
 *
 * Validate the city, draw it, run the search, hand the event list to a player.
 * Everything after that is: move an index, repaint.
 *
 * The route is changeable, so the search can be re-run for any start/goal pair.
 * Note that the PLAYER is reused rather than rebuilt when that happens --
 * bindControls() attaches a document-level keydown listener, and rebuilding
 * would stack a second copy.
 * ==========================================================================*/

(function main() {
  const city = CITY;

  /* -- Self-checks before drawing anything -------------------------------- */
  const problemList = document.getElementById('problems');
  const showProblems = (list) => {
    if (!list.length) return;
    problemList.classList.remove('is-hidden');
    problemList.innerHTML += list.map((p) => `<li>${p}</li>`).join('');
  };

  const problems = validateCity(city);
  if (problems.length) {
    showProblems(problems);
    console.error('City validation failed:', problems);
  }

  /* -- Element handles ----------------------------------------------------- */
  const svg = document.getElementById('map');
  const mapPane = document.querySelector('.map-pane');

  const els = {
    back: document.getElementById('btn-back'),
    step: document.getElementById('btn-step'),
    nextPop: document.getElementById('btn-nextpop'),
    play: document.getElementById('btn-play'),
    reset: document.getElementById('btn-reset'),
    end: document.getElementById('btn-end'),
    scrub: document.getElementById('scrub'),
    speed: document.getElementById('speed'),
    status: document.getElementById('status'),
    narration: document.getElementById('narration'),
    inspector: document.getElementById('inspector'),
    inspSource: document.getElementById('insp-source'),
    queue: document.getElementById('queue'),
    queueCount: document.getElementById('queue-count'),
    pseudocode: document.getElementById('pseudocode'),
    pcHint: document.getElementById('pc-hint'),
    stats: document.getElementById('stats'),
    routeStart: document.getElementById('route-start'),
    routeGoal: document.getElementById('route-goal'),
    pickStart: document.getElementById('btn-pick-start'),
    pickGoal: document.getElementById('btn-pick-goal'),
    routeReset: document.getElementById('btn-route-reset'),
  };

  const SHORT_LABEL = {
    INIT: 'init', POP: 'pop', GOAL_CHECK: 'goal?', CLOSE: 'close',
    EXAMINE_NEIGHBOR: 'examine', RELAX: 'relax', SKIP: 'skip',
    SKIP_CLOSED: 'skip (settled)', DONE: 'done', EXHAUSTED: 'no route',
  };

  renderStateKey(document.getElementById('key-states'));
  renderLegend(document.getElementById('legend'), city);
  renderPseudocode(els.pseudocode);

  /* -- Mutable session state ------------------------------------------------ */
  let startId = city.defaultStart;
  let goalId = city.defaultGoal;
  let check = null;      // { events, result, reference, failures }
  let view = null;       // handles from renderCity
  let pinnedId = null;
  let hoveredId = null;
  let pickMode = null;   // 'start' | 'goal' | null
  let renderedIndex = -1;
  let notice = '';       // transient message that outranks the step narration

  const focusId = () => hoveredId || pinnedId || defaultFocus(player.event);

  /* -- Painting ------------------------------------------------------------- */
  const repaint = () => {
    const event = player.event;
    const focus = focusId();

    paintEvent(view, city, event, focus);
    renderInspector(els.inspector, city, event, focus, goalId);

    /* The queue list is rebuilt only when the algorithm state changes. A pure
       focus change (hover, pin) just toggles a class, because rebuilding the
       list would destroy the row under the cursor and recreate it. */
    if (player.index !== renderedIndex) {
      renderQueue(els.queue, city, event, focus);
      renderedIndex = player.index;
    } else {
      updateQueueFocus(els.queue, focus);
    }

    highlightPseudocode(els.pseudocode, event);
    els.pcHint.textContent = event.lineEnd && event.lineEnd !== event.line
      ? `lines ${event.line}–${event.lineEnd}`
      : `line ${event.line}`;

    /* You are normally hovering the very node you just clicked, so check the
       pin first -- otherwise clicking appears to do nothing until the cursor
       moves away. */
    els.inspSource.textContent =
      pinnedId && (hoveredId === null || hoveredId === pinnedId)
        ? 'pinned — click again to release'
        : hoveredId
          ? 'hovering'
          : 'follows the search';

    els.queueCount.textContent = event.open.length
      ? `${event.open.length} waiting, sorted by f`
      : 'empty';
  };

  /* -- The player ----------------------------------------------------------- */
  const onChange = (event, index, api) => {
    repaint();

    els.narration.innerHTML = notice ||
      `<strong>${SHORT_LABEL[event.type] || event.type}.</strong> ${event.narration}`;
    notice = '';

    /* The goal is popped but never added to the closed set, so once we reach
       it closed.size undercounts by one. Same correction as result.settled. */
    const settled = event.expanded + (event.isGoal || event.path ? 1 : 0);
    els.status.textContent =
      `${index + 1}/${player.length} · ${SHORT_LABEL[event.type] || event.type} · ${settled} settled`;

    if (els.scrub.value !== String(index)) els.scrub.value = String(index);
    els.play.textContent = api.playing ? 'Pause' : 'Play';

    els.back.disabled = index === 0;
    els.reset.disabled = index === 0;
    els.step.disabled = api.atEnd;
    els.end.disabled = api.atEnd;
    els.nextPop.disabled = api.atEnd;
  };

  /* -- Loading a route ------------------------------------------------------
     Re-runs the search, redraws the city (start and goal markers move), and
     hands the new event list to the existing player. */
  function loadRoute(nextStart, nextGoal) {
    startId = nextStart;
    goalId = nextGoal;

    check = verifySearch(city, startId, goalId);
    if (check.failures.length) {
      console.error('A* VERIFICATION FAILED:', check.failures);
      showProblems(check.failures);
    } else {
      console.log(
        `%cA* verified%c  ${city.node(startId).name} → ${city.node(goalId).name}: ` +
        `cost ${check.result.cost.toFixed(1)}, ${check.result.settled} settled. ` +
        `Independent Dijkstra agrees (${check.reference.cost.toFixed(1)}). ` +
        `${check.events.length} events.`,
        'color:#3fb950;font-weight:bold', 'color:inherit'
      );
    }

    view = renderCity(svg, city, { startId, goalId });

    els.stats.innerHTML =
      `<b>${city.nodes.length}</b> intersections &middot; <b>${city.edges.length}</b> roads &middot; ` +
      (check.result.found
        ? `cheapest route <b>${check.result.cost.toFixed(0)}</b>`
        : `<b>no route</b>`);

    els.routeStart.textContent = city.node(startId).name;
    els.routeGoal.textContent = city.node(goalId).name;

    els.scrub.max = String(check.events.length - 1);
    renderedIndex = -1;
    pinnedId = null;
    hoveredId = null;

    player.load(check.events);
  }

  /* Player needs an event list to exist; build the default route first. */
  check = verifySearch(city, startId, goalId);
  const player = createPlayer(check.events, onChange);
  bindControls(player, els);
  loadRoute(startId, goalId);

  /* -- Picking a new start or goal ------------------------------------------ */
  function setPickMode(mode) {
    pickMode = mode;
    els.pickStart.classList.toggle('is-armed', mode === 'start');
    els.pickGoal.classList.toggle('is-armed', mode === 'goal');
    mapPane.classList.toggle('is-picking', mode !== null);

    if (mode) {
      notice = `<strong>Pick a ${mode}.</strong> Click any intersection on the map. ` +
               `Press Escape to cancel.`;
      els.narration.innerHTML = notice;
      notice = '';
    }
  }

  els.pickStart.addEventListener('click', (ev) => {
    setPickMode(pickMode === 'start' ? null : 'start');
    ev.currentTarget.blur();
  });

  els.pickGoal.addEventListener('click', (ev) => {
    setPickMode(pickMode === 'goal' ? null : 'goal');
    ev.currentTarget.blur();
  });

  els.routeReset.addEventListener('click', (ev) => {
    setPickMode(null);
    loadRoute(city.defaultStart, city.defaultGoal);
    ev.currentTarget.blur();
  });

  /* -- Map interaction ------------------------------------------------------ */
  svg.addEventListener('mouseover', (ev) => {
    const group = ev.target.closest('.node');
    if (!group || group.dataset.node === hoveredId) return;
    hoveredId = group.dataset.node;
    repaint();
  });

  svg.addEventListener('mouseout', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
    const to = ev.relatedTarget;
    if (to && to.closest && to.closest('.node') === group) return;
    hoveredId = null;
    repaint();
  });

  svg.addEventListener('click', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
    const id = group.dataset.node;

    if (pickMode) {
      const other = pickMode === 'start' ? goalId : startId;
      if (id === other) {
        /* Allowing start == goal produces a four-event search that teaches
           nothing, so refuse it and say why rather than silently ignoring. */
        notice = `<strong>Pick somewhere else.</strong> ${city.node(id).name} is ` +
                 `already the ${pickMode === 'start' ? 'goal' : 'start'}. ` +
                 `A route needs two different intersections.`;
        els.narration.innerHTML = notice;
        notice = '';
        return;
      }
      const wasPicking = pickMode;
      setPickMode(null);
      loadRoute(wasPicking === 'start' ? id : startId, wasPicking === 'goal' ? id : goalId);
      return;
    }

    pinnedId = pinnedId === id ? null : id;
    repaint();
  });

  /* -- Queue interaction ---------------------------------------------------- */
  els.queue.addEventListener('click', (ev) => {
    const row = ev.target.closest('.q-row');
    if (!row) return;
    pinnedId = pinnedId === row.dataset.node ? null : row.dataset.node;
    repaint();
  });

  els.queue.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest('.q-row');
    if (!row || row.dataset.node === hoveredId) return;
    hoveredId = row.dataset.node;
    repaint();
  });

  els.queue.addEventListener('mouseleave', () => {
    if (!hoveredId) return;
    hoveredId = null;
    repaint();
  });

  /* -- Map key --------------------------------------------------------------
     It necessarily covers part of the city, so it can be folded away. */
  const mapKey = document.getElementById('map-key');
  const keyToggle = document.getElementById('key-toggle');
  keyToggle.addEventListener('click', () => {
    const collapsed = mapKey.classList.toggle('is-collapsed');
    keyToggle.setAttribute('aria-expanded', String(!collapsed));
    keyToggle.textContent = collapsed ? 'Key ▸' : 'Key';
    keyToggle.blur();
  });

  /* -- Help overlay --------------------------------------------------------- */
  const helpOverlay = document.getElementById('help-overlay');
  const helpBtn = document.getElementById('help-btn');
  const setHelp = (open) => {
    helpOverlay.classList.toggle('is-hidden', !open);
    helpBtn.setAttribute('aria-expanded', String(open));
    if (open) player.pause();
  };

  helpBtn.addEventListener('click', () => { setHelp(true); helpBtn.blur(); });
  document.getElementById('help-close').addEventListener('click', () => setHelp(false));
  helpOverlay.addEventListener('click', (ev) => {
    if (ev.target === helpOverlay) setHelp(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!helpOverlay.classList.contains('is-hidden')) { setHelp(false); return; }
    if (pickMode) setPickMode(null);
  });

  /* Expose for console poking. */
  window.DEMO = {
    city, player, repaint, loadRoute,
    get view() { return view; },
    get check() { return check; },
    get events() { return check.events; },
    get result() { return check.result; },
  };

  console.log(
    `%cRiverford loaded%c  ${city.nodes.length} intersections, ${city.edges.length} roads. ` +
    `${problems.length ? problems.length + ' PROBLEM(S)' : 'All self-checks passed.'} ` +
    `Use arrow keys to step, space to play.`,
    'color:#3fb950;font-weight:bold', 'color:inherit'
  );
})();
