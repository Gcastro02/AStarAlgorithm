/* ============================================================================
 * graph.js — The city.
 *
 * Pure data plus the arithmetic that turns it into a weighted graph.
 * Knows nothing about A*, nothing about the DOM, nothing about rendering.
 *
 * Loaded as a classic script (not an ES module) so that index.html opens
 * directly from the filesystem. ES modules are blocked by CORS over file://.
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * Road types.
 *
 * cost(edge) = euclidean_length(edge) * congestion
 *
 * INVARIANT: every congestion value must be >= 1.0.
 *
 * This is not a cosmetic choice. The heuristic is straight-line distance. If
 * any road were cheaper than its own straight-line length, the heuristic could
 * overestimate the remaining cost, admissibility would break, and A* could
 * return a route that is not optimal -- silently, with no error. validateCity()
 * checks this invariant at load time.
 * -------------------------------------------------------------------------*/
const ROAD_TYPES = {
  highway:  { congestion: 1.0, width: 7, label: 'Highway / belt road', note: 'Free-flowing: cost equals its true length' },
  arterial: { congestion: 1.4, width: 4.5, label: 'Arterial',           note: 'Some lights and turns' },
  street:   { congestion: 2.2, width: 2.5, label: 'Downtown street',    note: 'Lights, turns, pedestrians' },
  bridge:   { congestion: 2.8, width: 6, label: 'Bridge',             note: 'Congested chokepoint -- and the only way across' },
};

/* ---------------------------------------------------------------------------
 * Geography. Decoration for the renderer; the algorithm never sees it.
 * The river matters only in that no edge crosses it except the two bridges.
 * -------------------------------------------------------------------------*/
const RIVER = [
  [460, -20], [450, 90], [485, 180], [515, 290],
  [525, 400], [495, 510], [530, 610], [555, 720],
];

const PARKS = [
  { name: 'The Commons', points: [[620, 270], [700, 288], [690, 350], [615, 340]] },
  { name: 'Quarry Green', points: [[150, 620], [215, 600], [235, 665], [165, 680]] },
];

/* ---------------------------------------------------------------------------
 * Nodes: intersections, placed on real 2-D coordinates in a 1000x700 space.
 * Coordinates are load-bearing -- Euclidean distance between them IS the
 * heuristic, so moving a node changes how the search behaves.
 * -------------------------------------------------------------------------*/
const n = (id, name, x, y) => ({ id, name, x, y });

const NODES = [
  /* -- Gateway (default start) ------------------------------------------- */
  n('harbor_gate', 'Harbor Gate', 120, 370),

  /* -- The belt road: fast, but it goes the long way around --------------- */
  n('ring_w1', 'Westbelt & Quay',   85, 300),
  n('ring_w2', 'Westbelt & Hill',   95, 200),
  n('ring_n1', 'Northbelt & Hill', 180, 110),
  n('ring_n2', 'Northbelt Mid',    300,  75),
  n('ring_n3', 'Northbelt & Ford', 400, 100),
  n('ring_s1', 'Southbelt & Quay',  95, 470),
  n('ring_s2', 'Southbelt & Mill', 130, 570),
  n('ring_s3', 'Southbelt Mid',    250, 640),
  n('ring_s4', 'Southbelt & Ford', 380, 650),

  /* -- Downtown: dense, direct, and slow ---------------------------------- */
  n('d11', '1st & Oak',   200, 230), n('d12', '2nd & Oak',   265, 230),
  n('d13', '3rd & Oak',   330, 230), n('d14', '4th & Oak',   395, 230),
  n('d21', '1st & Pine',  200, 300), n('d22', '2nd & Pine',  265, 300),
  n('d23', '3rd & Pine',  330, 300), n('d24', '4th & Pine',  395, 300),
  n('d31', '1st & Main',  200, 370), n('d32', '2nd & Main',  265, 370),
  n('d33', '3rd & Main',  330, 370), n('d34', '4th & Main',  395, 370),
  n('d41', '1st & Cedar', 200, 440), n('d42', '2nd & Cedar', 265, 440),
  n('d43', '3rd & Cedar', 330, 440), n('d44', '4th & Cedar', 395, 440),

  /* -- Residential connectors -------------------------------------------- */
  n('nr1', 'Birch & Hill', 250, 165), n('nr2', 'Birch & Ford', 350, 160),
  n('sr1', 'Mill & 1st',   200, 530), n('sr2', 'Mill & 3rd',   300, 545),
  n('sr3', 'Mill & Ford',  400, 530),

  /* -- West riverbank: where the heuristic runs out of road --------------- */
  n('rw1', 'Riverside North',  430, 200),
  n('rw2', 'Riverside & Pine', 455, 290),
  n('rw3', 'Riverside & Main', 470, 370),
  n('rw4', 'Riverside & Cedar',465, 450),
  n('rw5', 'Riverside South',  455, 520),

  /* -- The trap: a dead end aimed straight at the goal -------------------- */
  n('pier_end', 'Pier Road', 496, 356),

  /* -- The only two crossings -------------------------------------------- */
  n('nb_w', 'North Bridge (west)', 420, 140),
  n('nb_e', 'North Bridge (east)', 520, 140),
  n('sb_w', 'South Bridge (west)', 475, 600),
  n('sb_e', 'South Bridge (east)', 580, 600),

  /* -- East riverbank ----------------------------------------------------- */
  n('re1', 'Eastbank North',  560, 210),
  n('re2', 'Eastbank & Vine', 570, 300),
  n('re3', 'Eastbank & Elm',  575, 390),
  n('re4', 'Eastbank & Bay',  560, 480),
  n('re5', 'Eastbank South',  590, 620),

  /* -- The Skyway: a fast diagonal that points almost at the goal --------- */
  n('hw1', 'Skyway West', 585, 160),
  n('hw2', 'Skyway Mid',  660, 210),
  n('hw3', 'Skyway East', 740, 265),
  n('hw4', 'Skyway Ramp', 810, 310),

  n('ne1', 'Crest & North', 645,  90),
  n('ne2', 'Crest & Ridge', 745, 115),

  /* -- East suburb grid --------------------------------------------------- */
  n('ed11', 'Vine & 5th', 650, 400), n('ed12', 'Vine & 6th', 730, 410), n('ed13', 'Vine & 7th', 800, 420),
  n('ed21', 'Elm & 5th',  640, 500), n('ed22', 'Elm & 6th',  720, 505), n('ed23', 'Elm & 7th',  800, 500),
  n('ed31', 'Bay & 5th',  660, 600), n('ed32', 'Bay & 6th',  750, 610), n('ed33', 'Bay & 7th',  830, 590),

  /* -- East bypass -------------------------------------------------------- */
  n('er1', 'Eastbelt North', 900, 200),
  n('er2', 'Eastbelt Mid',   945, 350),
  n('er3', 'Eastbelt South', 910, 500),

  /* -- Destination -------------------------------------------------------- */
  n('summit_plaza', 'Summit Plaza', 860, 330),
];

/* ---------------------------------------------------------------------------
 * Edges. Undirected: every road can be driven both ways at the same cost.
 * -------------------------------------------------------------------------*/
const e = (a, b, type) => ({ a, b, type });

const EDGES = [
  /* Belt road -- highway speed, terrible directness */
  e('harbor_gate', 'ring_w1', 'highway'), e('ring_w1', 'ring_w2', 'highway'),
  e('ring_w2', 'ring_n1', 'highway'),     e('ring_n1', 'ring_n2', 'highway'),
  e('ring_n2', 'ring_n3', 'highway'),
  e('harbor_gate', 'ring_s1', 'highway'), e('ring_s1', 'ring_s2', 'highway'),
  e('ring_s2', 'ring_s3', 'highway'),     e('ring_s3', 'ring_s4', 'highway'),

  /* Belt road -> bridge ramps */
  e('ring_n3', 'nb_w', 'arterial'), e('ring_s4', 'sb_w', 'arterial'),

  /* Downtown approach */
  e('harbor_gate', 'd31', 'arterial'),

  /* Downtown grid -- east/west */
  e('d11', 'd12', 'street'), e('d12', 'd13', 'street'), e('d13', 'd14', 'street'),
  e('d21', 'd22', 'street'), e('d22', 'd23', 'street'), e('d23', 'd24', 'street'),
  e('d31', 'd32', 'street'), e('d32', 'd33', 'street'), e('d33', 'd34', 'street'),
  e('d41', 'd42', 'street'), e('d42', 'd43', 'street'), e('d43', 'd44', 'street'),

  /* Downtown grid -- north/south */
  e('d11', 'd21', 'street'), e('d21', 'd31', 'street'), e('d31', 'd41', 'street'),
  e('d12', 'd22', 'street'), e('d22', 'd32', 'street'), e('d32', 'd42', 'street'),
  e('d13', 'd23', 'street'), e('d23', 'd33', 'street'), e('d33', 'd43', 'street'),
  e('d14', 'd24', 'street'), e('d24', 'd34', 'street'), e('d34', 'd44', 'street'),

  /* North residential */
  e('d12', 'nr1', 'arterial'), e('d13', 'nr2', 'arterial'), e('nr1', 'nr2', 'arterial'),
  e('nr1', 'ring_n1', 'arterial'), e('nr2', 'ring_n2', 'arterial'), e('nr2', 'nb_w', 'arterial'),

  /* South residential */
  e('d41', 'sr1', 'arterial'), e('d43', 'sr2', 'arterial'), e('d44', 'sr3', 'arterial'),
  e('sr1', 'sr2', 'arterial'), e('sr2', 'sr3', 'arterial'),
  e('sr1', 'ring_s2', 'arterial'), e('sr2', 'ring_s3', 'arterial'), e('sr3', 'ring_s4', 'arterial'),
  e('sr3', 'rw5', 'arterial'),

  /* West riverbank road */
  e('rw1', 'rw2', 'arterial'), e('rw2', 'rw3', 'arterial'),
  e('rw3', 'rw4', 'arterial'), e('rw4', 'rw5', 'arterial'),
  e('rw1', 'nb_w', 'arterial'), e('rw5', 'sb_w', 'arterial'),
  e('d14', 'rw1', 'arterial'), e('d24', 'rw2', 'arterial'),
  e('d34', 'rw3', 'arterial'), e('d44', 'rw4', 'arterial'),

  /* The cul-de-sac. One edge in, no edge out. */
  e('rw3', 'pier_end', 'street'),

  /* The crossings */
  e('nb_w', 'nb_e', 'bridge'), e('sb_w', 'sb_e', 'bridge'),

  /* East riverbank road */
  e('re1', 're2', 'arterial'), e('re2', 're3', 'arterial'),
  e('re3', 're4', 'arterial'), e('re4', 'sb_e', 'arterial'),
  e('nb_e', 're1', 'arterial'), e('sb_e', 're5', 'arterial'),

  /* The Skyway */
  e('nb_e', 'hw1', 'highway'), e('hw1', 'hw2', 'highway'),
  e('hw2', 'hw3', 'highway'), e('hw3', 'hw4', 'highway'),
  e('hw4', 'summit_plaza', 'highway'),
  e('re2', 'hw2', 'arterial'),

  /* Northeast link */
  e('hw1', 'ne1', 'arterial'), e('ne1', 'ne2', 'arterial'), e('ne2', 'er1', 'arterial'),

  /* East suburb grid */
  e('ed11', 'ed12', 'street'), e('ed12', 'ed13', 'street'),
  e('ed21', 'ed22', 'street'), e('ed22', 'ed23', 'street'),
  e('ed31', 'ed32', 'street'), e('ed32', 'ed33', 'street'),
  e('ed11', 'ed21', 'street'), e('ed21', 'ed31', 'street'),
  e('ed12', 'ed22', 'street'), e('ed22', 'ed32', 'street'),
  e('ed13', 'ed23', 'street'), e('ed23', 'ed33', 'street'),
  e('re3', 'ed11', 'arterial'), e('re4', 'ed21', 'arterial'),
  e('re5', 'ed31', 'arterial'), e('sb_e', 'ed31', 'street'),
  e('ed13', 'summit_plaza', 'arterial'),

  /* East bypass */
  e('er1', 'summit_plaza', 'highway'), e('er1', 'er2', 'highway'),
  e('er2', 'er3', 'highway'), e('er2', 'summit_plaza', 'arterial'),
  e('er3', 'ed33', 'arterial'),
];

const DEFAULT_START = 'harbor_gate';
const DEFAULT_GOAL = 'summit_plaza';

/* ---------------------------------------------------------------------------
 * Geometry + the heuristic itself.
 * -------------------------------------------------------------------------*/

function euclidean(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/* Orientation of the ordered triple (a, b, c): >0 counter-clockwise. */
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/* Do segments a-b and c-d properly cross? Touching endpoints do not count. */
function segmentsCross(a, b, c, d) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/* Shortest distance from point p to segment a-b. */
function pointSegmentDistance(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/* Closest approach between segment p-q and segment a-b. */
function segmentDistance(p, q, a, b) {
  if (segmentsCross(p, q, a, b)) return 0;
  return Math.min(
    pointSegmentDistance(p, a, b), pointSegmentDistance(q, a, b),
    pointSegmentDistance(a, p, q), pointSegmentDistance(b, p, q)
  );
}

/**
 * h(n) -- the straight-line, "as the crow flies" distance to the goal.
 *
 * Admissible because every edge costs at least its own Euclidean length
 * (congestion >= 1), and by the triangle inequality the summed lengths of any
 * route are at least the straight-line distance. So h never overestimates.
 */
function heuristic(city, nodeId, goalId) {
  return euclidean(city.node(nodeId), city.node(goalId));
}

/* ---------------------------------------------------------------------------
 * Build the adjacency structure the search actually walks.
 * -------------------------------------------------------------------------*/

/* The hand-authored city. Passed to buildCity() by default; the generator in
   citygen.js produces specs of exactly this shape. */
const RIVERFORD = {
  name: 'Riverford',
  seed: null,
  nodes: NODES,
  edges: EDGES,
  river: RIVER,
  parks: PARKS,
  defaultStart: DEFAULT_START,
  defaultGoal: DEFAULT_GOAL,
};

/**
 * Turn a city spec into the structure the search walks.
 * @param {object} [spec] { name, seed, nodes, edges, river, parks, defaultStart, defaultGoal }
 */
function buildCity(spec = RIVERFORD) {
  const NODES = spec.nodes;
  const EDGES = spec.edges;
  const byId = new Map(NODES.map((node) => [node.id, node]));
  const node = (id) => {
    const found = byId.get(id);
    if (!found) throw new Error(`Unknown node id: ${id}`);
    return found;
  };

  const edges = EDGES.map((edge, index) => {
    const road = ROAD_TYPES[edge.type];
    if (!road) throw new Error(`Unknown road type "${edge.type}" on edge ${index}`);
    const length = euclidean(node(edge.a), node(edge.b));
    return {
      ...edge,
      index,
      length,
      congestion: road.congestion,
      cost: length * road.congestion,
    };
  });

  /* Undirected: each edge appears in both endpoints' neighbour lists. */
  const adjacency = new Map(NODES.map((nd) => [nd.id, []]));
  for (const edge of edges) {
    adjacency.get(edge.a).push({ to: edge.b, cost: edge.cost, edge });
    adjacency.get(edge.b).push({ to: edge.a, cost: edge.cost, edge });
  }

  /* Stable neighbour order, so a run is reproducible and the narration
     always visits neighbours in the same sequence. */
  for (const list of adjacency.values()) list.sort((p, q) => p.to.localeCompare(q.to));

  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edgeLookup = new Map(edges.map((edge) => [edgeKey(edge.a, edge.b), edge]));

  return {
    name: spec.name || 'Unnamed city',
    seed: spec.seed === undefined ? null : spec.seed,
    nodes: NODES,
    edges,
    adjacency,
    node,
    has: (id) => byId.has(id),
    neighbours: (id) => adjacency.get(id) || [],
    edgeBetween: (a, b) => edgeLookup.get(edgeKey(a, b)),
    river: spec.river || [],
    parks: spec.parks || [],
    roadTypes: ROAD_TYPES,
    defaultStart: spec.defaultStart,
    defaultGoal: spec.defaultGoal,
  };
}

/* ---------------------------------------------------------------------------
 * Self-checks. Cheap to run, and they catch the failure modes that would
 * otherwise show up as a mysteriously wrong route much later.
 * -------------------------------------------------------------------------*/

function validateCity(city) {
  const problems = [];

  /* The invariant the correctness of the whole demo rests on. */
  for (const [name, road] of Object.entries(city.roadTypes)) {
    if (road.congestion < 1) {
      problems.push(
        `Road type "${name}" has congestion ${road.congestion} < 1. This breaks ` +
        `admissibility: the straight-line heuristic would overestimate and A* ` +
        `could return a suboptimal route.`
      );
    }
  }

  /* Duplicate node ids would make one of them unreachable. */
  const seen = new Set();
  for (const nd of city.nodes) {
    if (seen.has(nd.id)) problems.push(`Duplicate node id: ${nd.id}`);
    seen.add(nd.id);
  }

  /* Duplicate edges would double-count in the adjacency list. */
  const edgeSeen = new Set();
  for (const edge of city.edges) {
    const key = edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`;
    if (edgeSeen.has(key)) problems.push(`Duplicate edge: ${edge.a} <-> ${edge.b}`);
    edgeSeen.add(key);
    if (edge.a === edge.b) problems.push(`Self-loop on ${edge.a}`);
  }

  /* The river is the whole point of the map: it must be crossable ONLY at the
     bridges. A stray road across the water would quietly destroy the demo's
     central moment, and it is almost invisible by eye at this scale. */
  const HALF_WATER_WIDTH = 17;
  for (const edge of city.edges) {
    const p = [city.node(edge.a).x, city.node(edge.a).y];
    const q = [city.node(edge.b).x, city.node(edge.b).y];

    let crosses = false;
    let closest = Infinity;
    for (let i = 0; i < city.river.length - 1; i++) {
      const r1 = city.river[i];
      const r2 = city.river[i + 1];
      if (segmentsCross(p, q, r1, r2)) crosses = true;
      closest = Math.min(closest, segmentDistance(p, q, r1, r2));
    }

    if (edge.type === 'bridge') {
      if (!crosses) {
        problems.push(`Bridge ${edge.a} <-> ${edge.b} does not actually span the river.`);
      }
    } else if (crosses) {
      problems.push(
        `Road ${edge.a} <-> ${edge.b} crosses the river but is not a bridge. ` +
        `This gives the search a third crossing and defeats the map's design.`
      );
    } else if (closest < HALF_WATER_WIDTH) {
      problems.push(
        `Road ${edge.a} <-> ${edge.b} passes within ${closest.toFixed(1)}px of the ` +
        `river centreline, so it will look like it drives through the water.`
      );
    }
  }

  /* Roads must not cross each other except at intersections. A crossing with
     no node there is a road the search cannot turn onto, which makes the map
     lie about its own connectivity -- and it is very hard to see by eye. This
     check found exactly such a defect in the hand-authored map, months of
     screenshots after it was introduced. O(E^2), which at ~100 edges is free. */
  for (let i = 0; i < city.edges.length; i++) {
    for (let j = i + 1; j < city.edges.length; j++) {
      const e = city.edges[i];
      const f = city.edges[j];
      /* Roads meeting at a shared intersection are not a crossing. */
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
      const p = [city.node(e.a).x, city.node(e.a).y];
      const q = [city.node(e.b).x, city.node(e.b).y];
      const r = [city.node(f.a).x, city.node(f.a).y];
      const t = [city.node(f.b).x, city.node(f.b).y];
      if (segmentsCross(p, q, r, t)) {
        problems.push(
          `Roads ${e.a}–${e.b} and ${f.a}–${f.b} cross with no intersection between them.`
        );
      }
    }
  }

  /* An isolated node can never appear in the search, which looks like a bug
     in A* rather than a bug in the map. */
  const reached = new Set([city.defaultStart]);
  const queue = [city.defaultStart];
  while (queue.length) {
    for (const { to } of city.neighbours(queue.pop())) {
      if (!reached.has(to)) { reached.add(to); queue.push(to); }
    }
  }
  for (const nd of city.nodes) {
    if (!reached.has(nd.id)) problems.push(`"${nd.name}" (${nd.id}) is unreachable from the start`);
  }

  return problems;
}

const CITY = buildCity();
