/* ============================================================================
 * main.js — Wiring.
 *
 * Validate the city, draw it, run the search, then hand the resulting event
 * list to a player. Everything after that is: move an index, repaint.
 * ==========================================================================*/

(function main() {
  const city = CITY;
  const startId = city.defaultStart;
  const goalId = city.defaultGoal;

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

  /* -- Draw the static city ------------------------------------------------ */
  const svg = document.getElementById('map');
  const view = renderCity(svg, city, { startId, goalId });
  renderStateKey(document.getElementById('key-states'));
  renderLegend(document.getElementById('legend'), city);

  /* -- Run and verify the search ------------------------------------------- */
  const check = verifySearch(city, startId, goalId);
  const { result, reference, events } = check;

  if (check.failures.length) {
    console.error('A* VERIFICATION FAILED:', check.failures);
    showProblems(check.failures);
  } else {
    console.log(
      `%cA* verified%c  cost ${result.cost.toFixed(1)} over ${result.path.length} intersections. ` +
      `Independent Dijkstra agrees (${reference.cost.toFixed(1)}). ` +
      `A* settled ${result.settled} vs Dijkstra's ${reference.expanded}. ` +
      `${events.length} events recorded.`,
      'color:#3fb950;font-weight:bold', 'color:inherit'
    );
  }

  document.getElementById('stats').innerHTML =
    `<b>${city.nodes.length}</b> intersections &middot; <b>${city.edges.length}</b> roads &middot; ` +
    `cheapest route <b>${result.cost.toFixed(0)}</b>`;

  /* -- Element handles ------------------------------------------------------ */
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
  };

  const SHORT_LABEL = {
    INIT: 'init', POP: 'pop', GOAL_CHECK: 'goal?', CLOSE: 'close',
    EXAMINE_NEIGHBOR: 'examine', RELAX: 'relax', SKIP: 'skip',
    SKIP_CLOSED: 'skip (settled)', DONE: 'done', EXHAUSTED: 'no route',
  };

  /* -- Focus -----------------------------------------------------------------
     The inspector normally follows the search. Hovering a node, or clicking a
     queue row, pins it to that node instead until the pin is released. */
  let pinnedId = null;
  let hoveredId = null;

  const focusId = () => hoveredId || pinnedId || defaultFocus(player.event);

  /* The queue list is rebuilt only when the algorithm state changes. A pure
     focus change (hover, pin) just toggles a class, because rebuilding the
     list would destroy the row under the cursor and recreate it. */
  let renderedIndex = -1;

  const repaint = () => {
    const event = player.event;
    const focus = focusId();

    paintEvent(view, city, event, focus);
    renderInspector(els.inspector, city, event, focus, goalId);

    if (player.index !== renderedIndex) {
      renderQueue(els.queue, city, event, focus);
      renderedIndex = player.index;
    } else {
      updateQueueFocus(els.queue, focus);
    }

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
  const player = createPlayer(events, (event, index, api) => {
    repaint();

    els.narration.innerHTML =
      `<strong>${SHORT_LABEL[event.type] || event.type}.</strong> ${event.narration}`;

    /* The goal is popped but never added to the closed set, so once we reach
       it closed.size undercounts by one. Same correction as result.settled. */
    const settled = event.expanded + (event.isGoal || event.path ? 1 : 0);
    els.status.textContent =
      `${index + 1}/${events.length} · ${SHORT_LABEL[event.type] || event.type} · ${settled} settled`;

    if (els.scrub.value !== String(index)) els.scrub.value = String(index);
    els.play.textContent = api.playing ? 'Pause' : 'Play';

    els.back.disabled = index === 0;
    els.reset.disabled = index === 0;
    els.step.disabled = api.atEnd;
    els.end.disabled = api.atEnd;
    els.nextPop.disabled = api.atEnd;
  });

  bindControls(player, els);

  /* -- Hovering the map ----------------------------------------------------- */
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

  /* Clicking a node pins it, so you can step forward and watch one particular
     intersection's numbers change. */
  svg.addEventListener('click', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
    pinnedId = pinnedId === group.dataset.node ? null : group.dataset.node;
    repaint();
  });

  /* -- Clicking a queue row ------------------------------------------------ */
  els.queue.addEventListener('click', (ev) => {
    const row = ev.target.closest('.q-row');
    if (!row) return;
    pinnedId = pinnedId === row.dataset.node ? null : row.dataset.node;
    repaint();
  });

  /* Hovering a queue row highlights that intersection on the map -- the link
     between an abstract queue position and a real place. */
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

  player.goTo(0);

  /* Expose for console poking while building later phases. */
  window.DEMO = { city, view, check, events, result, player, repaint };

  console.log(
    `%cRiverford loaded%c  ${city.nodes.length} intersections, ${city.edges.length} roads. ` +
    `${problems.length ? problems.length + ' PROBLEM(S)' : 'All self-checks passed.'} ` +
    `Use arrow keys to step, space to play.`,
    'color:#3fb950;font-weight:bold', 'color:inherit'
  );
})();
