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
  const fLabels = new Map();
  for (const nd of city.nodes) {
    const role = nd.id === startId ? 'start' : nd.id === goalId ? 'goal' : 'plain';
    const group = svgEl('g', {
      class: `node node--${role} node--unvisited`,
      'data-node': nd.id,
      transform: `translate(${nd.x},${nd.y})`,
    }, layers.nodes);

    /* Invisible fat circle so hovering a 5px dot is not an act of precision. */
    svgEl('circle', { r: 14, class: 'node-hit' }, group);
    svgEl('circle', { r: role === 'plain' ? 5 : 9, class: 'node-dot' }, group);

    /* f value, filled in during paint. Created once so stepping is a text
       assignment rather than DOM construction. */
    const f = svgEl('text', { class: 'node-f', x: 0, y: -11, 'text-anchor': 'middle' }, group);
    fLabels.set(nd.id, f);

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

  return { layers, nodeEls, edgeEls, fLabels, startId, goalId };
}

/* ---------------------------------------------------------------------------
 * paintEvent — the whole UI, as a pure function of one algorithm snapshot.
 *
 * Nothing here is incremental and nothing is undone. Every element's class is
 * recomputed from scratch on each call, which is why stepping backward needs no
 * special handling at all: painting events[i-1] is the same operation as
 * painting events[i+1]. At 65 nodes and 101 roads this costs nothing.
 * -------------------------------------------------------------------------*/
function paintEvent(view, city, event, focusId) {
  const goal = city.node(view.goalId);

  const openEntries = new Map(event.open.map((entry) => [entry.id, entry]));
  const closed = new Set(event.closed);
  const onPath = event.path ? new Set(event.path) : null;

  /* Edges of the final answer, and edges of the search tree A* has built so
     far (each node's link back to the parent it was cheapest reached from). */
  const pathEdges = new Set();
  if (event.path) {
    for (let i = 0; i < event.path.length - 1; i++) {
      const edge = city.edgeBetween(event.path[i], event.path[i + 1]);
      if (edge) pathEdges.add(edge.index);
    }
  }

  const treeEdges = new Set();
  for (const [child, parentId] of Object.entries(event.parent)) {
    const edge = city.edgeBetween(child, parentId);
    if (edge) treeEdges.add(edge.index);
  }

  /* -- Nodes -------------------------------------------------------------- */
  for (const nd of city.nodes) {
    const classes = ['node'];
    if (nd.id === view.startId) classes.push('node--start');
    if (nd.id === view.goalId) classes.push('node--goal');

    if (onPath && onPath.has(nd.id)) classes.push('node--path');
    else if (nd.id === event.current) classes.push('node--current');
    else if (closed.has(nd.id)) classes.push('node--closed');
    else if (openEntries.has(nd.id)) classes.push('node--open');
    else classes.push('node--unvisited');

    /* The neighbour under consideration this step gets its own ring, so the
       viewer can see which of several roads is being priced right now. */
    if (nd.id === event.neighbour) classes.push('node--neighbour');
    if (nd.id === focusId) classes.push('node--focused');

    view.nodeEls.get(nd.id).setAttribute('class', classes.join(' '));

    /* f = g + h, shown for anything with a known route. Consistent for open
       and closed nodes alike: it is always "estimated total trip through here". */
    const label = view.fLabels.get(nd.id);
    const gValue = event.g[nd.id];
    if (Number.isFinite(gValue)) {
      label.textContent = Math.round(gValue + euclidean(nd, goal));
      label.setAttribute('class', closed.has(nd.id) ? 'node-f node-f--closed' : 'node-f');
    } else {
      label.textContent = '';
    }
  }

  /* -- Roads -------------------------------------------------------------- */
  for (const edge of city.edges) {
    const classes = ['road', `road--${edge.type}`];
    if (pathEdges.has(edge.index)) classes.push('road--path');
    else if (treeEdges.has(edge.index)) classes.push('road--tree');
    if (edge.index === event.edge) classes.push('road--examining');
    view.edgeEls.get(edge.index).setAttribute('class', classes.join(' '));
  }

  /* -- The heuristic, drawn from wherever the search currently stands ------ */
  const existing = view.layers.overlay.querySelector('.h-line');
  if (existing) existing.remove();
  if (event.current && !event.path) {
    drawHeuristicLine(view, city, event.current, view.goalId);
  }
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

/* The map key and legend live in panels.js, alongside the other panels. */
