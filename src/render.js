/* ============================================================================
 * render.js — Draws the city as SVG.
 *
 * Phase 1: static only. Nothing here knows about A* yet. Later phases will add
 * a paint(event) function that recolours these same elements from one
 * algorithm state snapshot -- which is why every node and edge gets a stable
 * id here, so repainting is a lookup rather than a redraw.
 * ==========================================================================*/

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

/* Landmarks worth labelling on the map itself. Labelling all 65 intersections
   would be unreadable; everything else gets a hover tooltip instead. */
const LABELLED = new Set([
  'harbor_gate', 'summit_plaza', 'pier_end',
  'nb_w', 'sb_w', 'hw2',
]);

const LABEL_TEXT = {
  harbor_gate: 'START — Harbor Gate',
  summit_plaza: 'GOAL — Summit Plaza',
  pier_end: 'Pier Rd (dead end)',
  nb_w: 'North Bridge',
  sb_w: 'South Bridge',
  hw2: 'The Skyway',
};

/* dx, dy, text-anchor. The pier label sits below-left so it does not collide
   with the heuristic line's own label, which runs through the same spot. */
const LABEL_OFFSET = {
  harbor_gate:  [0, -20, 'middle'],
  summit_plaza: [0, -20, 'middle'],
  pier_end:     [-12, 20, 'end'],
  nb_w:         [0, -18, 'middle'],
  sb_w:         [0, -18, 'middle'],
  hw2:          [12, -14, 'start'],
};

/**
 * Draw the whole city. Returns handles to the created elements so later
 * phases can repaint without rebuilding the DOM.
 */
function renderCity(svg, city, options = {}) {
  const startId = options.startId || city.defaultStart;
  const goalId = options.goalId || city.defaultGoal;

  svg.innerHTML = '';

  /* Painter's order: water, then land, then roads, then intersections. */
  const layers = {
    water: svgEl('g', { class: 'layer-water' }, svg),
    parks: svgEl('g', { class: 'layer-parks' }, svg),
    roads: svgEl('g', { class: 'layer-roads' }, svg),
    overlay: svgEl('g', { class: 'layer-overlay' }, svg),
    nodes: svgEl('g', { class: 'layer-nodes' }, svg),
    labels: svgEl('g', { class: 'layer-labels' }, svg),
  };

  /* -- The river ---------------------------------------------------------- */
  const riverPath = city.river.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  /* Drawn twice: a wide soft band for the bank, a narrower one for the water. */
  svgEl('path', { d: riverPath, class: 'river-bank' }, layers.water);
  svgEl('path', { d: riverPath, class: 'river' }, layers.water);

  /* -- Parks -------------------------------------------------------------- */
  for (const park of city.parks) {
    const points = park.points.map((p) => p.join(',')).join(' ');
    const shape = svgEl('polygon', { points, class: 'park' }, layers.parks);
    svgEl('title', {}, shape).textContent = park.name;
  }

  /* -- Roads -------------------------------------------------------------- */
  const edgeEls = new Map();
  for (const edge of city.edges) {
    const a = city.node(edge.a);
    const b = city.node(edge.b);
    const road = city.roadTypes[edge.type];

    const line = svgEl('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      class: `road road--${edge.type}`,
      'stroke-width': road.width,
      'data-edge': edge.index,
    }, layers.roads);

    svgEl('title', {}, line).textContent =
      `${a.name} <-> ${b.name}\n${road.label}\n` +
      `length ${edge.length.toFixed(0)} x congestion ${edge.congestion} = cost ${edge.cost.toFixed(0)}`;

    edgeEls.set(edge.index, line);
  }

  /* -- Intersections ------------------------------------------------------ */
  const nodeEls = new Map();
  for (const nd of city.nodes) {
    const role = nd.id === startId ? 'start' : nd.id === goalId ? 'goal' : 'plain';
    const group = svgEl('g', {
      class: `node node--${role}`,
      'data-node': nd.id,
      transform: `translate(${nd.x},${nd.y})`,
    }, layers.nodes);

    /* Invisible fat circle so hovering a 5px dot is not an act of precision. */
    svgEl('circle', { r: 14, class: 'node-hit' }, group);
    svgEl('circle', { r: role === 'plain' ? 5 : 9, class: 'node-dot' }, group);

    const degree = city.neighbours(nd.id).length;
    svgEl('title', {}, group).textContent =
      `${nd.name}\n(${nd.x}, ${nd.y})  •  ${degree} road${degree === 1 ? '' : 's'}` +
      (degree === 1 ? '\nDead end.' : '');

    nodeEls.set(nd.id, group);
  }

  /* -- Landmark labels ---------------------------------------------------- */
  for (const id of LABELLED) {
    if (!city.has(id)) continue;
    const nd = city.node(id);
    const [dx, dy, anchor] = LABEL_OFFSET[id] || [0, -16, 'middle'];
    const cls = id === startId ? 'map-label map-label--start'
      : id === goalId ? 'map-label map-label--goal'
      : 'map-label';
    const text = svgEl('text', {
      x: nd.x + dx, y: nd.y + dy, class: cls,
      'text-anchor': anchor,
    }, layers.labels);
    text.textContent = LABEL_TEXT[id] || nd.name;
  }

  return { layers, nodeEls, edgeEls, startId, goalId };
}

/**
 * The heuristic, drawn literally: a dashed straight line from a node to the
 * goal, ignoring every road. Phase 1 uses it to show the start's h value;
 * later phases will move it to whichever node is currently being expanded.
 */
function drawHeuristicLine(view, city, fromId, goalId) {
  const existing = view.layers.overlay.querySelector('.h-line');
  if (existing) existing.remove();

  const from = city.node(fromId);
  const goal = city.node(goalId);
  const group = svgEl('g', { class: 'h-line' }, view.layers.overlay);
  svgEl('line', { x1: from.x, y1: from.y, x2: goal.x, y2: goal.y, class: 'h-line-stroke' }, group);

  const label = svgEl('text', {
    x: (from.x + goal.x) / 2,
    y: (from.y + goal.y) / 2 - 8,
    class: 'h-line-label',
    'text-anchor': 'middle',
  }, group);
  label.textContent = `h = ${euclidean(from, goal).toFixed(0)} as the crow flies`;
}

/**
 * Build the legend from the road table, so it can never drift out of sync
 * with the costs the algorithm actually uses.
 */
function renderLegend(container, city) {
  container.innerHTML = '';
  const entries = Object.entries(city.roadTypes);
  for (const [key, road] of entries) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML =
      `<svg class="legend-swatch" viewBox="0 0 34 12" aria-hidden="true">` +
      `<line x1="1" y1="6" x2="33" y2="6" class="road road--${key}" stroke-width="${road.width}"/></svg>` +
      `<span class="legend-name">${road.label}</span>` +
      `<span class="legend-cost">x${road.congestion.toFixed(1)}</span>`;
    row.title = road.note;
    container.appendChild(row);
  }
}
