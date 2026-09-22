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
  const problems = validateCity(city);
  const showProblems = (list) => {
    if (!list.length) return;
    problemList.classList.remove('is-hidden');
    problemList.innerHTML += list.map((p) => `<li>${p}</li>`).join('');
  };
  if (problems.length) {
    showProblems(problems);
    console.error('City validation failed:', problems);
  }

  /* -- Draw the static city ----------------------------------------------- */
  const svg = document.getElementById('map');
  const view = renderCity(svg, city, { startId, goalId });
  renderLegend(document.getElementById('legend'), city);

  /* -- Run and verify the search ------------------------------------------ */
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

  /* -- Readouts ------------------------------------------------------------ */
  const crowFlies = euclidean(city.node(startId), city.node(goalId));
  const facts = [
    ['Intersections', city.nodes.length],
    ['Roads', city.edges.length],
    ['River crossings', city.edges.filter((e) => e.type === 'bridge').length],
    ['Straight-line start &rarr; goal', crowFlies.toFixed(0), true],
    ['Cheapest route cost', result.cost.toFixed(0), true],
    ['Intersections settled', `${result.settled} of ${city.nodes.length}`],
  ];
  document.getElementById('facts').innerHTML = facts
    .map(([label, value, accent]) =>
      `<dt>${label}</dt><dd class="${accent ? 'accent' : ''}">${value}</dd>`)
    .join('');

  /* -- Narration ----------------------------------------------------------
     Hovering a node temporarily replaces the step narration; leaving it puts
     the step narration back. So the current step's text is kept in a variable
     rather than read back out of the DOM. */
  const narration = document.getElementById('narration');
  let stepNarration = '';
  let hoveredId = null;

  const showNarration = (html) => { narration.innerHTML = html; };

  /* -- The player ---------------------------------------------------------- */
  const SHORT_LABEL = {
    INIT: 'init', POP: 'pop', GOAL_CHECK: 'goal?', CLOSE: 'close',
    EXAMINE_NEIGHBOR: 'examine', RELAX: 'relax', SKIP: 'skip',
    SKIP_CLOSED: 'skip (settled)', DONE: 'done', EXHAUSTED: 'no route',
  };

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
  };

  const player = createPlayer(events, (event, index, api) => {
    paintEvent(view, city, event);

    stepNarration = `<strong>${SHORT_LABEL[event.type] || event.type}.</strong> ${event.narration}`;
    if (hoveredId === null) showNarration(stepNarration);

    /* The goal is popped but never added to the closed set, so once we reach it
       closed.size undercounts by one. Same correction as result.settled. */
    const settled = event.expanded + (event.isGoal || event.path ? 1 : 0);
    els.status.textContent =
      `${index + 1}/${events.length} · ${SHORT_LABEL[event.type] || event.type} · ` +
      `${settled} settled`;

    if (els.scrub.value !== String(index)) els.scrub.value = String(index);
    els.play.textContent = api.playing ? 'Pause' : 'Play';

    els.back.disabled = index === 0;
    els.reset.disabled = index === 0;
    els.step.disabled = api.atEnd;
    els.end.disabled = api.atEnd;
    els.nextPop.disabled = api.atEnd;
  });

  bindControls(player, els);
  player.goTo(0);

  /* -- Hover inspection ---------------------------------------------------- */
  svg.addEventListener('mouseover', (ev) => {
    const group = ev.target.closest('.node');
    if (!group || group.dataset.node === hoveredId) return;
    hoveredId = group.dataset.node;

    const nd = city.node(hoveredId);
    const event = player.event;
    const h = euclidean(nd, city.node(goalId));
    const g = event.g[nd.id];
    const parentId = event.parent[nd.id];
    const isClosed = event.closed.includes(nd.id);
    const queued = event.open.find((entry) => entry.id === nd.id);

    let state;
    if (isClosed) state = 'settled — its cost is final';
    else if (queued) state = 'in the queue, waiting';
    else state = 'not yet discovered';

    showNarration(
      `<strong>${nd.name}</strong> — ${state}. ` +
      (Number.isFinite(g)
        ? `g = ${Math.round(g)} (known cost to get here), ` +
          `h = ${Math.round(h)} (straight-line guess for the rest), ` +
          `f = ${Math.round(g + h)}.` +
          (parentId ? ` Best route so far arrives from ${city.node(parentId).name}.` : '')
        : `No route to it yet, so g = ∞. Its h would be ${Math.round(h)}.`)
    );
  });

  svg.addEventListener('mouseout', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
    const to = ev.relatedTarget;
    if (to && to.closest && to.closest('.node') === group) return;
    hoveredId = null;
    showNarration(stepNarration);
  });

  /* Expose for console poking while building later phases. */
  window.DEMO = { city, view, check, events, result, player };

  console.log(
    `%cRiverford loaded%c  ${city.nodes.length} intersections, ${city.edges.length} roads. ` +
    `${problems.length ? problems.length + ' PROBLEM(S)' : 'All self-checks passed.'} ` +
    `Use arrow keys to step, space to play.`,
    'color:#3fb950;font-weight:bold', 'color:inherit'
  );
})();
