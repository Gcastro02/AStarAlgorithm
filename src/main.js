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

  svg.addEventListener('mouseover', (ev) => {
    const group = ev.target.closest('.node');
    if (!group) return;
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
    if (ev.target.closest('.node')) narration.innerHTML = defaultNarration;
  });

  console.log(
    `%cRiverford loaded%c  ${city.nodes.length} intersections, ${city.edges.length} roads. ` +
    `Straight-line start->goal: ${crowFlies.toFixed(1)}. ` +
    `${problems.length ? problems.length + ' PROBLEM(S)' : 'All self-checks passed.'}`,
    'color:#3fb950;font-weight:bold', 'color:inherit'
  );
})();
