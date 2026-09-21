/* ============================================================================
 * main.js — Wiring.
 *
 * Phase 1: validate the city, draw it, fill the readouts. The controls stay
 * disabled until phase 3 gives them an event list to step through.
 * ==========================================================================*/

(function main() {
  const city = CITY;
  const startId = city.defaultStart;
  const goalId = city.defaultGoal;

  /* -- Self-check before drawing anything --------------------------------- */
  const problems = validateCity(city);
  const problemList = document.getElementById('problems');
  if (problems.length) {
    problemList.classList.remove('is-hidden');
    problemList.innerHTML = problems.map((p) => `<li>${p}</li>`).join('');
    console.error('City validation failed:', problems);
  }

  /* -- Draw --------------------------------------------------------------- */
  const svg = document.getElementById('map');
  const view = renderCity(svg, city, { startId, goalId });
  drawHeuristicLine(view, city, startId, goalId);
  renderLegend(document.getElementById('legend'), city);

  /* -- Readouts ----------------------------------------------------------- */
  const start = city.node(startId);
  const goal = city.node(goalId);
  const crowFlies = euclidean(start, goal);

  /* Cheapest single road in the city, used below to make the point that the
     crow-flies number is a floor, not a forecast. */
  const totalRoadCost = city.edges.reduce((sum, e) => sum + e.cost, 0);

  const facts = [
    ['Intersections', city.nodes.length],
    ['Roads', city.edges.length],
    ['River crossings', city.edges.filter((e) => e.type === 'bridge').length],
    ['Straight-line start &rarr; goal', crowFlies.toFixed(0), true],
    ['Total road cost in city', totalRoadCost.toFixed(0)],
  ];

  document.getElementById('facts').innerHTML = facts
    .map(([label, value, accent]) =>
      `<dt>${label}</dt><dd class="${accent ? 'accent' : ''}">${value}</dd>`)
    .join('');

  /* -- Hover: report a node's h value, since that is the only quantity that
        exists before the search has run --------------------------------- */
  const narration = document.getElementById('narration');
  const defaultNarration = narration.innerHTML;

  /* Track which node is hovered so that moving the cursor between a node's own
     child elements (the fat hit circle, the visible dot, the <title>) does not
     rewrite the narration on every crossing. */
  let hoveredId = null;

  svg.addEventListener('mouseover', (ev) => {
    const group = ev.target.closest('.node');
    if (!group || group.dataset.node === hoveredId) return;
    hoveredId = group.dataset.node;
    const nd = city.node(group.dataset.node);
    const h = euclidean(nd, goal);
    const roads = city.neighbours(nd.id).length;
    narration.innerHTML =
      `<strong>${nd.name}.</strong> ` +
      `h = ${h.toFixed(0)} &mdash; that is how far the goal is in a straight line from here, ` +
      `ignoring every road. ${roads === 1 ? '1 road meets' : roads + ' roads meet'} here.` +
      (roads === 1 ? ' <strong>This is a dead end.</strong>' : '');
  });

  svg.addEventListener('mouseout', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
    /* Ignore moves that land on another part of the same node. */
    const to = ev.relatedTarget;
    if (to && to.closest && to.closest('.node') === group) return;
    hoveredId = null;
    narration.innerHTML = defaultNarration;
  });

  console.log(
    `%cRiverford loaded%c  ${city.nodes.length} intersections, ${city.edges.length} roads. ` +
    `Straight-line start->goal: ${crowFlies.toFixed(1)}. ` +
    `${problems.length ? problems.length + ' PROBLEM(S)' : 'All self-checks passed.'}`,
    'color:#3fb950;font-weight:bold', 'color:inherit'
  );

  /* -- Phase 2: run the search and prove the answer -----------------------
     Nothing is drawn from this yet. The point is that the algorithm is done,
     correct, and produces the event list the UI will consume in phase 3. */
  const check = verifySearch(city, startId, goalId);
  const { result, reference, events } = check;

  if (check.failures.length) {
    console.error('A* VERIFICATION FAILED:', check.failures);
    problemList.classList.remove('is-hidden');
    problemList.innerHTML += check.failures.map((f) => `<li>${f}</li>`).join('');
  } else {
    console.log(
      `%cA* verified%c  cost ${result.cost.toFixed(1)} over ${result.path.length} intersections. ` +
      `Independent Dijkstra agrees (${reference.cost.toFixed(1)}). ` +
      `A* settled ${result.settled} vs Dijkstra's ${reference.expanded}. ` +
      `${events.length} events recorded.`,
      'color:#3fb950;font-weight:bold', 'color:inherit'
    );
    console.log('Route:', result.path.map((id) => city.node(id).name).join(' -> '));
  }

  /* Surface the answer in the facts panel so it is visible without devtools. */
  document.getElementById('facts').innerHTML +=
    `<dt>Cheapest route cost</dt><dd class="accent">${result.cost.toFixed(0)}</dd>` +
    `<dt>Intersections settled</dt><dd>${result.settled} of ${city.nodes.length}</dd>`;

  document.getElementById('status').textContent =
    `search solved: cost ${result.cost.toFixed(0)}, ${events.length} steps recorded — stepping arrives in phase 3`;

  /* Expose for console poking while building later phases. */
  window.DEMO = { city, check, events, result };
})();
