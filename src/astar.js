/* ============================================================================
 * astar.js — A* search.
 *
 * This file knows nothing about the DOM, SVG, colours, or panels. It runs the
 * search to completion and returns an ordered list of EVENTS, each one carrying
 * a complete snapshot of the algorithm's state at that instant.
 *
 * The UI is then a pure function of events[i]. That is what makes stepping
 * backward free: you decrement an index, you do not undo anything.
 * ==========================================================================*/

/* The listing shown in the pseudocode panel. Kept here, beside the code it
   describes, so the two cannot drift apart. Line numbers are 1-based and are
   referenced by every event below. */
const PSEUDOCODE = [
  /*  1 */ 'open ← priority queue containing start',
  /*  2 */ 'g[start] ← 0',
  /*  3 */ 'f[start] ← h(start)',
  /*  4 */ '',
  /*  5 */ 'while open is not empty:',
  /*  6 */ '    current ← open.pop_lowest_f()',
  /*  7 */ '',
  /*  8 */ '    if current == goal:',
  /*  9 */ '        return reconstruct_path(current)',
  /* 10 */ '',
  /* 11 */ '    closed.add(current)',
  /* 12 */ '',
  /* 13 */ '    for each neighbor of current:',
  /* 14 */ '        if neighbor in closed:',
  /* 15 */ '            continue',
  /* 16 */ '',
  /* 17 */ '        tentative_g ← g[current] + cost(current, neighbor)',
  /* 18 */ '',
  /* 19 */ '        if tentative_g < g[neighbor]:',
  /* 20 */ '            parent[neighbor] ← current',
  /* 21 */ '            g[neighbor] ← tentative_g',
  /* 22 */ '            f[neighbor] ← tentative_g + h(neighbor)',
  /* 23 */ '            open.add_or_update(neighbor, f[neighbor])',
  /* 24 */ '',
  /* 25 */ 'return failure',
];

const EVENT = {
  INIT: 'INIT',
  POP: 'POP',
  GOAL_CHECK: 'GOAL_CHECK',
  CLOSE: 'CLOSE',
  EXAMINE: 'EXAMINE_NEIGHBOR',
  RELAX: 'RELAX',
  SKIP: 'SKIP',
  SKIP_CLOSED: 'SKIP_CLOSED',
  DONE: 'DONE',
  EXHAUSTED: 'EXHAUSTED',
};

const num = (value) => (Number.isFinite(value) ? Math.round(value).toString() : '∞');

/**
 * Run A* and record every step.
 *
 * @param {object} city      from buildCity()
 * @param {string} startId
 * @param {string} goalId
 * @param {object} [options] { weight = 1, tieBreak = 'prefer-larger-g' }
 *   weight scales h. 1 is ordinary A*. 0 degenerates to Dijkstra. Above 1 the
 *   heuristic can overestimate, admissibility is lost, and the route returned
 *   may be worse than optimal -- which is a thing worth being able to show.
 * @returns {{events: object[], result: object}}
 */
function runAStar(city, startId, goalId, options = {}) {
  const weight = options.weight === undefined ? 1 : options.weight;
  const tieBreak = options.tieBreak || 'prefer-larger-g';

  const h = (id) => weight * euclidean(city.node(id), city.node(goalId));
  const name = (id) => city.node(id).name;

  const g = new Map([[startId, 0]]);
  const parent = new Map();
  const closed = new Set();
  const open = new PriorityQueue(tieBreak);

  const events = [];
  let heapProblem = null;

  /* Build one immutable snapshot of everything the UI could want to draw. */
  const emit = (type, line, narration, extra = {}) => {
    events.push({
      index: events.length,
      type,
      line,
      narration,
      open: open.snapshot(),
      closed: [...closed],
      g: Object.fromEntries(g),
      parent: Object.fromEntries(parent),
      expanded: closed.size,
      discovered: g.size,
      ...extra,
    });
  };

  /* -- Initialise --------------------------------------------------------- */
  const h0 = h(startId);
  open.addOrUpdate(startId, h0, 0, h0);
  emit(EVENT.INIT, 3,
    `Start at ${name(startId)}. Its g is 0 — we are already here, so it has cost ` +
    `nothing to reach. Its h is ${num(h0)}, the straight-line distance to ` +
    `${name(goalId)}. So f = 0 + ${num(h0)} = ${num(h0)}: our first guess at the ` +
    `total trip. Every other intersection is still unknown, with g = ∞.`,
    { current: startId });

  /* -- Main loop ---------------------------------------------------------- */
  while (!open.isEmpty()) {
    const queueBefore = open.snapshot();
    const top = open.pop();
    const current = top.id;

    heapProblem = heapProblem || open.checkInvariant();

    const runnerUp = queueBefore[1];
    emit(EVENT.POP, 6,
      `Popped ${name(current)} with f = ${num(top.f)} — the lowest f in the queue, ` +
      `so it is the most promising unfinished lead we have. ` +
      (runnerUp
        ? `Next best was ${name(runnerUp.id)} at f = ${num(runnerUp.f)}.`
        : `It was the only thing left in the queue.`),
      { current, popped: { ...top } });

    /* -- Goal test happens on POP, not on discovery ----------------------- */
    if (current === goalId) {
      emit(EVENT.GOAL_CHECK, 8,
        `This is ${name(goalId)} — and it came off the queue with the lowest f of ` +
        `anything remaining. Every other route still under consideration already ` +
        `costs more than this one. So this route is optimal, and we can stop.`,
        { current, isGoal: true });

      const path = [];
      for (let node = goalId; node !== undefined; node = parent.get(node)) path.push(node);
      path.reverse();

      const cost = g.get(goalId);
      emit(EVENT.DONE, 9,
        `Route found: ${path.length} intersections, total cost ${num(cost)}. ` +
        `A* settled ${closed.size + 1} intersections out of ${city.nodes.length} to prove it. ` +
        `Reading the answer is just walking the parent pointers backward from the goal.`,
        { current, path: [...path], cost, found: true });

      return {
        events,
        result: {
          found: true, path, cost,
          expanded: closed.size,
          /* The goal is popped but never closed, so closed.size undercounts the
             work done by exactly one. `settled` is the honest figure to compare
             against another algorithm. */
          settled: closed.size + 1,
          discovered: g.size,
          heapProblem,
        },
      };
    }

    emit(EVENT.GOAL_CHECK, 8,
      `Not ${name(goalId)} yet, so we carry on. Note that A* only checks for the ` +
      `goal here, when a node is popped — not when it is first discovered.`,
      { current, isGoal: false });

    /* -- Close it: its cost is now final ---------------------------------- */
    closed.add(current);
    emit(EVENT.CLOSE, 11,
      `${name(current)} is settled. Because it had the lowest f in the queue and ` +
      `h never overestimates, no cheaper route to it can exist. Its g of ` +
      `${num(g.get(current))} is final — we will never revisit it.`,
      { current, justClosed: current });

    /* -- Examine each neighbour ------------------------------------------- */
    for (const { to: neighbour, cost: edgeCost, edge } of city.neighbours(current)) {
      if (closed.has(neighbour)) {
        emit(EVENT.SKIP_CLOSED, 14,
          `${name(neighbour)} is already settled — we proved its cheapest cost ` +
          `earlier, so there is nothing to check. Skip it.`,
          { current, neighbour, edge: edge.index });
        continue;
      }

      const currentG = g.get(current);
      const tentativeG = currentG + edgeCost;
      const previousG = g.has(neighbour) ? g.get(neighbour) : Infinity;

      emit(EVENT.EXAMINE, 17,
        `Could we reach ${name(neighbour)} more cheaply through ${name(current)}? ` +
        `That would cost ${num(currentG)} to get here, plus ${num(edgeCost)} for the ` +
        `road — ${num(tentativeG)} in total. The best we knew before was ` +
        `${num(previousG)}.`,
        { current, neighbour, edge: edge.index, tentativeG, previousG, edgeCost });

      if (tentativeG < previousG) {
        const hN = h(neighbour);
        const fN = tentativeG + hN;
        const wasKnown = Number.isFinite(previousG);
        const previousF = wasKnown ? previousG + hN : Infinity;

        parent.set(neighbour, current);
        g.set(neighbour, tentativeG);
        open.addOrUpdate(neighbour, fN, tentativeG, hN);
        heapProblem = heapProblem || open.checkInvariant();

        let text = wasKnown
          ? `Cheaper. ${num(tentativeG)} beats the ${num(previousG)} we had, so we ` +
            `rewrite ${name(neighbour)}'s route to come through ${name(current)} ` +
            `instead. Its f drops from ${num(previousF)} to ${num(fN)} and it moves ` +
            `up the queue.`
          : `New. We had no route to ${name(neighbour)} at all, so anything beats ` +
            `nothing. g = ${num(tentativeG)}, h = ${num(hN)}, f = ${num(fN)}. ` +
            `Into the queue it goes.`;

        if (neighbour === goalId) {
          text += ` Note: the goal is now in the queue — but A* does not stop. A ` +
                  `cheaper route to it may still be found. We only finish when the ` +
                  `goal is popped.`;
        }

        emit(EVENT.RELAX, 19, text, {
          current, neighbour, edge: edge.index,
          tentativeG, previousG, newF: fN, previousF, hOfNeighbour: hN,
          reparented: wasKnown,
        });
      } else {
        emit(EVENT.SKIP, 19,
          `No better. ${num(tentativeG)} is not cheaper than the ${num(previousG)} ` +
          `we already have for ${name(neighbour)}, so we leave it alone. The route ` +
          `we already knew stays.`,
          { current, neighbour, edge: edge.index, tentativeG, previousG });
      }
    }
  }

  emit(EVENT.EXHAUSTED, 25,
    `The queue is empty and we never reached ${name(goalId)}. There is no route.`,
    { found: false });

  return {
    events,
    result: { found: false, path: [], cost: Infinity, expanded: closed.size, settled: closed.size, discovered: g.size, heapProblem },
  };
}

/* ============================================================================
 * Cross-check: an independent Dijkstra.
 *
 * Deliberately written differently from the A* above -- no heap, no heuristic,
 * a plain linear scan for the minimum. If two implementations that share no
 * code agree on the cost, the number is trustworthy. If they disagree, one of
 * them is wrong and the demo would have been teaching a lie.
 * ==========================================================================*/
function runDijkstra(city, startId, goalId) {
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const done = new Set();
  let expanded = 0;

  for (;;) {
    let best;
    let bestCost = Infinity;
    for (const [id, cost] of dist) {
      if (!done.has(id) && cost < bestCost) { bestCost = cost; best = id; }
    }
    if (best === undefined) break;

    done.add(best);
    expanded++;
    if (best === goalId) break;

    for (const { to, cost } of city.neighbours(best)) {
      if (done.has(to)) continue;
      const candidate = bestCost + cost;
      if (candidate < (dist.has(to) ? dist.get(to) : Infinity)) {
        dist.set(to, candidate);
        prev.set(to, best);
      }
    }
  }

  if (!dist.has(goalId)) return { found: false, path: [], cost: Infinity, expanded };

  const path = [];
  for (let node = goalId; node !== undefined; node = prev.get(node)) path.push(node);
  path.reverse();
  return { found: true, path, cost: dist.get(goalId), expanded };
}

/* ============================================================================
 * Verification. Run on load; the demo should never ship showing a wrong route.
 * ==========================================================================*/
function verifySearch(city, startId, goalId) {
  const failures = [];
  const { events, result } = runAStar(city, startId, goalId);
  const reference = runDijkstra(city, startId, goalId);

  if (result.heapProblem) failures.push(`Priority queue corrupted: ${result.heapProblem}`);

  if (result.found !== reference.found) {
    failures.push(`A* found=${result.found} but Dijkstra found=${reference.found}`);
  }

  if (result.found) {
    /* The headline check: same cost as an implementation sharing no code. */
    if (Math.abs(result.cost - reference.cost) > 1e-9) {
      failures.push(
        `A* cost ${result.cost.toFixed(4)} != Dijkstra cost ${reference.cost.toFixed(4)}. ` +
        `A* is returning a suboptimal route.`
      );
    }

    /* The path must be a real drive, not just a plausible list of names. */
    if (result.path[0] !== startId) failures.push('Path does not start at the start.');
    if (result.path[result.path.length - 1] !== goalId) failures.push('Path does not end at the goal.');

    let walked = 0;
    for (let i = 0; i < result.path.length - 1; i++) {
      const edge = city.edgeBetween(result.path[i], result.path[i + 1]);
      if (!edge) {
        failures.push(`Path step ${result.path[i]} -> ${result.path[i + 1]} is not a road.`);
        break;
      }
      walked += edge.cost;
    }
    if (Math.abs(walked - result.cost) > 1e-9) {
      failures.push(`Path edges sum to ${walked.toFixed(2)} but reported cost is ${result.cost.toFixed(2)}.`);
    }

    /* A* must never be worse than Dijkstra at pruning. If it were, the
       heuristic would be doing no work and the whole premise would be wrong. */
    if (result.settled > reference.expanded) {
      failures.push(
        `A* settled ${result.settled} nodes, more than Dijkstra's ${reference.expanded}. ` +
        `The heuristic is hurting rather than helping.`
      );
    }
  }

  /* Once a node is closed its g must never change again. This is precisely
     what admissibility buys, so it is worth asserting rather than assuming. */
  const closedAt = new Map();
  for (const event of events) {
    if (event.type === EVENT.CLOSE) closedAt.set(event.justClosed, event.g[event.justClosed]);
    for (const [id, gValue] of Object.entries(event.g)) {
      if (closedAt.has(id) && Math.abs(closedAt.get(id) - gValue) > 1e-9) {
        failures.push(`g[${id}] changed after it was closed (${closedAt.get(id)} -> ${gValue}).`);
        closedAt.set(id, gValue);
      }
    }
  }

  return { failures, result, reference, events };
}
