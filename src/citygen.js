/* ============================================================================
 * citygen.js — Procedural cities.
 *
 * Generating *a* map is easy. Generating an *interesting* one is the problem.
 *
 * A random graph almost always produces a boring search: with no obstacle
 * between start and goal the straight-line heuristic is nearly exact, A* walks
 * more or less directly there, and — worse for the comparison — Dijkstra looks
 * nearly as good. Everything that makes the hand-authored city teach something
 * is deliberate: a river the heuristic cannot see, a dead end aimed at the
 * goal, a fast road that initially heads the wrong way.
 *
 * So this file does not generate a city and hope. It generates a *candidate*,
 * runs the real A* and the real Dijkstra on it, scores whether the resulting
 * search is worth watching, and throws the candidate away if it is not.
 * Generate-and-test is far easier to get right than trying to construct a good
 * map directly.
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * Seeded randomness. Seeded so a particular city can be returned to — which
 * matters when someone wants to look at the same example twice.
 * -------------------------------------------------------------------------*/
function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WIDTH = 1000;
const HEIGHT = 700;

/* Street naming. Enough variety that two cities do not read alike. */
const NAME_A = ['Oak', 'Pine', 'Cedar', 'Elm', 'Birch', 'Maple', 'Alder', 'Willow',
  'Ash', 'Hazel', 'Rowan', 'Beech', 'Laurel', 'Juniper'];
const NAME_B = ['Row', 'Way', 'Lane', 'Street', 'Avenue', 'Road', 'Walk', 'Close'];
const CITY_NAMES = ['Brackwater', 'Stonefall', 'Ashford', 'Mirebridge', 'Каldwick',
  'Thornbury', 'Greyford', 'Havenmoor', 'Duskwell', 'Fenwick'];

/* ---------------------------------------------------------------------------
 * One candidate city.
 * -------------------------------------------------------------------------*/
function generateCandidate(seed) {
  const rng = makeRng(seed);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const between = (lo, hi) => lo + rng() * (hi - lo);

  /* -- The river ----------------------------------------------------------
     A meander down the middle. Kept roughly vertical so the two banks are
     genuinely separated and a crossing is genuinely required. */
  const riverX = between(0.42, 0.58) * WIDTH;
  const river = [];
  const bends = 7;
  for (let i = 0; i <= bends; i++) {
    const t = i / bends;
    const y = -20 + t * (HEIGHT + 40);
    const wobble = Math.sin(t * Math.PI * between(1.4, 2.6)) * between(30, 70);
    river.push([riverX + wobble, y]);
  }

  /* x of the river centreline at a given y, by linear interpolation. */
  const riverAt = (y) => {
    for (let i = 0; i < river.length - 1; i++) {
      const [x1, y1] = river[i];
      const [x2, y2] = river[i + 1];
      if (y >= y1 && y <= y2) return x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
    }
    return river[river.length - 1][0];
  };

  /* -- Intersections on a jittered lattice --------------------------------
     Jitter is kept below half the cell spacing. That is what makes the
     lattice-neighbour edges planar for free: two roads joining adjacent cells
     cannot reach far enough to cross a third. Delaunay triangulation would be
     the general answer and about 150 lines; this is the cheap one that works
     because we control the point set. */
  const cols = 9 + Math.floor(rng() * 2);   // 9..10
  const rows = 7 + Math.floor(rng() * 2);   // 7..8
  const marginX = 70;
  const marginY = 60;
  const cellW = (WIDTH - 2 * marginX) / (cols - 1);
  const cellH = (HEIGHT - 2 * marginY) / (rows - 1);
  const jitter = Math.min(cellW, cellH) * 0.26;

  const RIVER_CLEARANCE = 30;
  const grid = [];        // grid[r][c] = node id or null
  const nodes = [];

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      /* Thin the lattice slightly so the city does not look like graph paper,
         but never at the edges, which carry the belt road. */
      const onRim = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      if (!onRim && rng() < 0.08) { grid[r][c] = null; continue; }

      const x = marginX + c * cellW + between(-jitter, jitter);
      const y = marginY + r * cellH + between(-jitter, jitter);

      /* Nothing may sit in the water. */
      if (Math.abs(x - riverAt(y)) < RIVER_CLEARANCE) { grid[r][c] = null; continue; }

      const id = `n${r}_${c}`;
      grid[r][c] = id;
      nodes.push({ id, name: `${pick(NAME_A)} ${pick(NAME_B)}`, x: Math.round(x), y: Math.round(y) });
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sideOf = (id) => (byId.get(id).x < riverAt(byId.get(id).y) ? 'W' : 'E');

  /* -- Roads ---------------------------------------------------------------
     Lattice neighbours only, so the result is planar. Edges that would cross
     the river are dropped; the only crossings are the bridges added below. */
  const edges = [];
  const seen = new Set();
  const addEdge = (a, b, type) => {
    if (!a || !b || a === b) return false;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return false;
    if (sideOf(a) !== sideOf(b) && type !== 'bridge') return false;
    seen.add(key);
    edges.push({ a, b, type });
    return true;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = grid[r][c];
      if (!id) continue;
      const onRim = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;

      /* The rim is the belt road: fast, and it goes the long way around. */
      const rimNext = (rr, cc) => (rr === 0 || cc === 0 || rr === rows - 1 || cc === cols - 1);

      const right = c + 1 < cols ? grid[r][c + 1] : null;
      const down = r + 1 < rows ? grid[r + 1][c] : null;

      if (right) {
        const bothRim = onRim && rimNext(r, c + 1) && (r === 0 || r === rows - 1);
        addEdge(id, right, bothRim ? 'highway' : (rng() < 0.3 ? 'arterial' : 'street'));
      }
      if (down) {
        const bothRim = onRim && rimNext(r + 1, c) && (c === 0 || c === cols - 1);
        addEdge(id, down, bothRim ? 'highway' : (rng() < 0.3 ? 'arterial' : 'street'));
      }
    }
  }

  /* Repair holes left by thinning: a node whose lattice neighbours were
     removed can end up isolated, so reach one cell further. */
  const degree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.a, degree.get(e.a) + 1);
    degree.set(e.b, degree.get(e.b) + 1);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = grid[r][c];
      if (!id || degree.get(id) > 0) continue;
      for (const [dr, dc] of [[0, 2], [2, 0], [0, -2], [-2, 0]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        if (grid[rr][cc] && addEdge(id, grid[rr][cc], 'street')) {
          degree.set(id, degree.get(id) + 1);
          break;
        }
      }
    }
  }

  /* -- Bridges -------------------------------------------------------------
     Two or three, never more. The scarcity is the whole point: it is what
     makes the straight-line guess visibly wrong. */
  const bridgeCount = rng() < 0.35 ? 3 : 2;
  const bridgeRows = [];
  const spacing = Math.floor(rows / (bridgeCount + 1));
  for (let i = 1; i <= bridgeCount; i++) bridgeRows.push(Math.max(0, Math.min(rows - 1, i * spacing)));

  /* A bridge should look like a bridge: a short span between the two banks at
     roughly the same latitude. Picking "nearest node on each side of this row"
     can produce a long diagonal when the river-clearance rule culled the nodes
     closest to the water, so candidates are scored on span and on how level
     they are, and anything too long is rejected outright. */
  const MAX_BRIDGE = Math.max(cellW * 2.1, RIVER_CLEARANCE * 3);
  const bridges = [];

  for (const r of bridgeRows) {
    let bestPair = null;
    for (let dr = 0; dr <= 1; dr++) {
      for (const rr of [r - dr, r + dr]) {
        if (rr < 0 || rr >= rows) continue;
        for (let c = 0; c < cols; c++) {
          const wId = grid[rr][c];
          if (!wId || sideOf(wId) !== 'W') continue;
          for (let cc = 0; cc < cols; cc++) {
            const eId = grid[rr][cc];
            if (!eId || sideOf(eId) !== 'E') continue;
            const w = byId.get(wId);
            const e = byId.get(eId);
            const span = Math.hypot(w.x - e.x, w.y - e.y);
            if (span > MAX_BRIDGE) continue;
            /* Prefer short and level. */
            const cost = span + Math.abs(w.y - e.y) * 2.5;
            if (!bestPair || cost < bestPair.cost) bestPair = { w: wId, e: eId, cost };
          }
        }
      }
      if (bestPair) break;
    }
    if (bestPair && addEdge(bestPair.w, bestPair.e, 'bridge')) bridges.push([bestPair.w, bestPair.e]);
  }

  /* Fewer than two crossings and the map is either trivial or impossible. */
  if (bridges.length < 2) return null;

  /* -- A dead end aimed at the goal ---------------------------------------
     Added after start and goal are chosen, below. */

  /* -- Start and goal ------------------------------------------------------
     Opposite banks, far apart, and — the important part — positioned so the
     straight line between them does NOT pass near a bridge. That is what
     forces the detour the whole demo is built around. */
  const westNodes = nodes.filter((n) => sideOf(n.id) === 'W');
  const eastNodes = nodes.filter((n) => sideOf(n.id) === 'E');
  if (!westNodes.length || !eastNodes.length) return null;

  const bridgeMidY = bridges.map(([w, e]) => (byId.get(w).y + byId.get(e).y) / 2);

  const pairs = [];
  for (const w of westNodes) {
    for (const e of eastNodes) {
      const span = Math.hypot(w.x - e.x, w.y - e.y);
      if (span < WIDTH * 0.5) continue;
      /* How far is the straight line's river crossing from the nearest bridge? */
      const midY = (w.y + e.y) / 2;
      const detour = Math.min(...bridgeMidY.map((by) => Math.abs(by - midY)));
      pairs.push({ start: w.id, goal: e.id, score: span * 0.4 + detour * 2.2 });
    }
  }
  if (!pairs.length) return null;

  /* Geometry can only suggest. Which of these is actually the best route to
     feature is decided by running the search on it -- see pickBestRoute(). */
  pairs.sort((p, q) => q.score - p.score);
  const best = pairs[0];
  const candidatePairs = pairs.slice(0, 24);

  /* The trap: a cul-de-sac on the start's bank, pointed at the goal, placed
     where the heuristic will find it irresistible. */
  const goalNode = byId.get(best.goal);
  const bankCandidates = westNodes
    .filter((n) => degree.get(n.id) >= 2 && Math.abs(n.x - riverAt(n.y)) < cellW * 1.6)
    .sort((p, q) => Math.hypot(p.x - goalNode.x, p.y - goalNode.y) - Math.hypot(q.x - goalNode.x, q.y - goalNode.y));

  if (bankCandidates.length) {
    const anchor = bankCandidates[0];
    const towards = riverAt(anchor.y) - anchor.x;
    const px = Math.round(anchor.x + Math.max(18, towards - RIVER_CLEARANCE - 6));
    const py = Math.round(anchor.y + between(-10, 10));
    if (Math.abs(px - riverAt(py)) > RIVER_CLEARANCE - 8 && px > anchor.x + 12) {
      const id = 'deadend';
      nodes.push({ id, name: `${pick(NAME_A)} Pier`, x: px, y: py });
      byId.set(id, nodes[nodes.length - 1]);
      edges.push({ a: anchor.id, b: id, type: 'street' });
    }
  }

  return {
    name: pick(CITY_NAMES),
    seed,
    nodes,
    edges,
    river,
    parks: [],
    defaultStart: best.start,
    defaultGoal: best.goal,
    candidatePairs,
  };
}

/* ---------------------------------------------------------------------------
 * Quality gate.
 *
 * This is the part that actually matters. A map that passes validateCity() is
 * merely *legal*; these checks ask whether it is worth looking at.
 * -------------------------------------------------------------------------*/
function scoreRoute(city, startId, goalId) {
  const reasons = [];
  /* record:false -- this is screening, and we need only the outcome. Roughly
     14x cheaper than a recorded run, which is what makes it affordable to
     score dozens of routes per candidate city. */
  const a = runAStar(city, startId, goalId, { record: false });
  const d = runAStar(city, startId, goalId, { weight: 0, record: false });

  if (!a.result.found) return { ok: false, reasons: ['no route between start and goal'], quality: -1 };

  /* The route must actually cross the river, or the obstacle taught nothing. */
  let usesBridge = false;
  for (let i = 1; i < a.result.path.length; i++) {
    const edge = city.edgeBetween(a.result.path[i - 1], a.result.path[i]);
    if (edge && edge.type === 'bridge') { usesBridge = true; break; }
  }
  if (!usesBridge) reasons.push('optimal route never crosses the river');

  /* Long enough to be worth stepping through. */
  if (a.result.path.length < 6) reasons.push(`route is only ${a.result.path.length} intersections`);

  /* A* must earn its keep against Dijkstra, or compare mode falls flat. */
  const saving = d.result.settled ? 1 - a.result.settled / d.result.settled : 0;
  if (saving < 0.35) reasons.push(`A* only saves ${Math.round(saving * 100)}% over Dijkstra`);

  /* Enough exploration to watch, not so much that it drags. */
  const coverage = a.result.settled / city.nodes.length;
  if (coverage < 0.12) reasons.push('search finishes almost immediately');
  if (coverage > 0.85) reasons.push('search settles nearly the whole city');

  return {
    ok: reasons.length === 0,
    reasons,
    /* What we maximise when choosing between acceptable routes: mostly the
       margin over Dijkstra, with a nudge toward routes long enough to have a
       story. */
    quality: saving + Math.min(a.result.path.length, 16) / 160,
    stats: {
      nodes: city.nodes.length,
      edges: city.edges.length,
      start: startId,
      goal: goalId,
      cost: a.result.cost,
      settled: a.result.settled,
      dijkstraSettled: d.result.settled,
      saving,
      pathLength: a.result.path.length,
    },
  };
}

/**
 * Of the geometrically plausible start/goal pairs, which actually produces the
 * best demonstration? Geometry cannot answer that — only running the search
 * can. This is the difference between a map that is legal and one worth
 * looking at.
 */
function pickBestRoute(city, candidatePairs) {
  let best = null;
  let lastReasons = null;
  for (const pair of candidatePairs) {
    const scored = scoreRoute(city, pair.start, pair.goal);
    if (!scored.ok) { lastReasons = scored.reasons; continue; }
    if (!best || scored.quality > best.quality) best = scored;
  }
  return { best, lastReasons };
}

/* ---------------------------------------------------------------------------
 * Generate until something good comes out.
 *
 * Returns { city, spec, seed, stats, attempts } or null if nothing passed.
 * -------------------------------------------------------------------------*/
function generateCity(seed, maxAttempts = 24) {
  let attempt = 0;
  let current = (seed === undefined || seed === null) ? (Math.random() * 1e9) | 0 : seed;
  let lastRejection = null;
  let winner = null;

  /* Good enough to stop looking. Without this the loop always runs to the
     attempt limit, which is wasted time once an excellent city has appeared. */
  const EXCELLENT = 0.62;

  while (attempt < maxAttempts) {
    attempt++;
    const spec = generateCandidate(current);

    if (spec) {
      let city = null;
      try { city = buildCity(spec); } catch (err) { city = null; }

      if (city) {
        const legal = validateCity(city);
        if (legal.length === 0) {
          const { best, lastReasons } = pickBestRoute(city, spec.candidatePairs || []);
          if (best) {
            if (!winner || best.quality > winner.scored.quality) {
              winner = { spec, city, seed: current, scored: best };
            }
            if (best.quality >= EXCELLENT) break;
          } else {
            lastRejection = lastReasons;
          }
        } else {
          lastRejection = legal;
        }
      }
    }

    /* Deterministic walk through seeds, so a given starting seed always
       produces the same accepted city. */
    current = (Math.imul(current, 1664525) + 1013904223) | 0;
    if (current < 0) current = ~current;
  }

  if (!winner) return { city: null, attempts: attempt, lastRejection };

  /* Rebuild with the winning route as the city's default, so the demo opens on
     the pair that actually shows the algorithm off. */
  const finalSpec = {
    ...winner.spec,
    defaultStart: winner.scored.stats.start,
    defaultGoal: winner.scored.stats.goal,
  };

  return {
    city: buildCity(finalSpec),
    spec: finalSpec,
    seed: winner.seed,
    stats: winner.scored.stats,
    attempts: attempt,
  };
}
