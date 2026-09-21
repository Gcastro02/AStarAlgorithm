# A* Interactive Demonstration — Design Specification

**Course:** CSCI 580 Artificial Intelligence
**Status:** Draft v1 — awaiting review before implementation

---

## 1. The one-sentence goal

A viewer who has never seen A* should, after three minutes of clicking, be able to explain **why A\* explores fewer places than Dijkstra without ever missing the best route** — and be able to point at the number on screen that makes that true.

### Learning objectives

By the end of the interaction, the viewer should be able to say:

1. **What is being minimized.** A* finds the cheapest route, not the shortest hop-count.
2. **What `g` is.** The *known* cost from start to this node. A fact, already paid.
3. **What `h` is.** An *estimate* of the remaining cost from this node to the goal. A guess, not yet paid.
4. **What `f = g + h` is.** The estimated total cost of a route that goes through this node. The single number the algorithm sorts on.
5. **Why the frontier is a priority queue.** A* always expands the node with the smallest `f` — "always pursue the most promising unfinished lead."
6. **Why the heuristic must be optimistic (admissible).** If `h` never overestimates, A* cannot be tricked into settling for a worse route.
7. **Why a node gets "closed."** Once popped with the smallest `f`, its `g` is final.
8. **What relaxation is.** Finding a cheaper way to reach a node you had already seen, and rewriting its parent pointer.

Objectives 7 and 8 are the ones most demos skip. They are where the algorithm's correctness actually lives, so the UI must make them visible events, not silent state changes.

---

## 2. Domain: a city road network

**Chosen over a grid deliberately.** On a uniform grid every step costs 1, so `g` is just "number of steps taken" and `h` is "number of steps remaining" — the two quantities look like the same kind of thing, and the viewer never feels the difference between *known cost* and *estimated cost*.

On a road network:

- `g` = actual driving cost along roads you have traced.
- `h` = **straight-line distance to the goal**, the way a crow would fly.

These are visibly different things. `h` can be drawn on screen as a literal dashed straight line through buildings and across water. Everyone already has the intuition "the road doesn't go straight there," which is exactly the intuition A* runs on.

It is also the honest motivating example: this is what a GPS does.

---

## 3. Map design

A hand-authored fictional city, roughly 60–90 intersections (nodes) and 120–180 road segments (edges), laid out on real 2-D coordinates so Euclidean distance is meaningful.

Deliberate features, each one teaching something:

| Feature | What it teaches |
| --- | --- |
| **A river with only two bridges** | The heuristic pulls the search straight toward the goal, into a dead end at the water. The viewer *watches the guess be wrong* and watches A* recover. This is the single most valuable moment in the demo. |
| **A ring road (fast, indirect) vs. downtown streets (slow, direct)** | The cheapest route is not the one that looks shortest. Separates "distance" from "cost." |
| **A dense downtown grid** | Produces many nodes with near-identical `f` values, so the priority queue visibly churns and reorders. |
| **A cul-de-sac pointed at the goal** | A trap that a purely greedy search would fall into. |
| **One long diagonal highway** | A case where `h` is nearly exact, so A* walks almost straight to the goal with barely any wasted exploration — the best-case showcase. |

The default start/goal pair will be chosen so the route must cross the river, guaranteeing the interesting behavior on first load without the viewer configuring anything.

---

## 4. Cost model and the admissibility argument

Each road segment has:

```
cost(edge) = euclidean_length(edge) × congestion(edge)
```

where `congestion >= 1.0`:

| Road type | Congestion | Meaning |
| --- | --- | --- |
| Highway / ring road | 1.0 | Free-flowing, cost equals its true length |
| Arterial | 1.4 | Some lights |
| Downtown street | 2.2 | Lights, turns, pedestrians |
| Bridge (bottleneck) | 2.8 | Congested chokepoint |

Heuristic:

```
h(n) = euclidean_distance(n, goal)
```

**Why this is admissible — and why the constraint `congestion >= 1.0` is load-bearing:**

The true remaining cost from `n` to the goal is a sum of edge costs. Each edge costs *at least* its Euclidean length (since congestion >= 1). The sum of the Euclidean lengths of any path from `n` to the goal is at least the straight-line distance from `n` to the goal, by the triangle inequality. Therefore:

```
h(n) = straight-line(n, goal)  <=  true remaining cost
```

So `h` never overestimates. A* is guaranteed to return the optimal route.

This argument should appear in the UI itself, in plain language, not buried in a README. Something like:

> *The crow-flies guess is always optimistic — roads bend, and traffic only ever slows you down. A guess that is never too high is called* **admissible**, *and it is the reason A\* never misses the best route.*

**Design note — a deliberate trap we are avoiding:** if congestion could drop below 1.0 (a "fast lane" cheaper than its own length), `h` would overestimate and A* could return a suboptimal route. Keeping every multiplier at or above 1 is not an arbitrary aesthetic choice; it is what makes the correctness claim true. Worth stating in the report.

---

## 5. Screen layout

```
┌──────────────────────────────────────┬───────────────────────────┐
│                                      │  PRIORITY QUEUE (open set)│
│                                      │  sorted by f, live        │
│          THE CITY MAP                │  ┌──────────────────────┐ │
│                                      │  │> Elm & 4th   f=41.2  │ │  <- next to pop
│   nodes = intersections              │  │  Oak & 2nd   f=43.8  │ │
│   edges = roads, thickness = speed   │  │  Pier Rd     f=44.1  │ │
│   dashed line = h for current node   │  │  ...                 │ │
│                                      │  └──────────────────────┘ │
│                                      ├───────────────────────────┤
│                                      │  NODE INSPECTOR           │
│                                      │  g = 18.4  (known)        │
│                                      │  h = 22.8  (estimate)     │
│                                      │  f = 41.2  (g + h)        │
│                                      │  came from: Main & 3rd    │
├──────────────────────────────────────┼───────────────────────────┤
│  NARRATION                           │  PSEUDOCODE               │
│  "Popped Elm & 4th (f=41.2) — the    │   while open is not empty:│
│   most promising lead. Checking its  │ >   n = open.pop_min()    │  <- highlighted
│   3 neighbors..."                    │     if n == goal: done    │
├──────────────────────────────────────┴───────────────────────────┤
│  << Step   > Play   Reset       speed ---o---                    │
└──────────────────────────────────────────────────────────────────┘
```

The three panels on the right are the "intrinsics" layer. The map alone would be a pretty animation; the map *plus* the synchronized queue, numbers, and code is what makes the mechanism legible.

### Visual language

| Element | Appearance | Meaning |
| --- | --- | --- |
| Unvisited node | small, pale outline | not yet discovered |
| **Open / frontier** | bright fill, pulsing ring | discovered, cost estimated, waiting in queue |
| **Closed** | solid muted fill | expanded; its `g` is final and cannot improve |
| **Current** | large, high-contrast halo | just popped, being expanded this step |
| **Final path** | thick bright stroke along edges | the answer |
| Parent pointer | small arrow toward the node it came from | the tree A* is building |
| `h` visualization | dashed straight line, current node to goal | the optimistic guess, drawn literally |
| Edge thickness | thicker = faster road | cost model made visible without numbers |

Every node in the open or closed set displays its `f` value as a small label once it has one. Labels for `g` and `h` appear on hover and in the inspector, to avoid clutter.

---

## 6. Interaction model

**Primary control: stepping.** The demo is a state machine the viewer drives. Nothing happens on a timer unless they press Play.

- **Step forward** — advance exactly one algorithm event.
- **Step backward** — a hard requirement, and it drives the architecture (see §7). Being able to go *back* one step is what lets a confused viewer re-watch the moment they missed. Most demos cannot do this, and it is the difference between "I saw it happen" and "I understand it."
- **Play / pause** with a speed slider.
- **Click a node** to set start (first click) / goal (second click), then re-run.
- **Hover any node** to inspect its `g`, `h`, `f`, and parent at the current moment in time.
- **Click a row in the priority queue** to highlight that node on the map — ties the abstract queue back to geography.

### Granularity of a "step"

A step is not one loop iteration. It is one *meaningful event*, so the viewer can watch the inside of an iteration:

1. `POP` — take the lowest-`f` node off the queue, mark it current.
2. `GOAL_CHECK` — is this the goal? (Shown even when the answer is no, because *when* you check matters.)
3. `EXAMINE_NEIGHBOR` — one event per neighbor, showing the tentative `g` being computed.
4. `RELAX` / `SKIP` — either we found a cheaper route to that neighbor (rewrite its `g` and parent, animate the pointer flipping) or we did not (say so explicitly).
5. `CLOSE` — the current node is finished.
6. `DONE` — goal popped; reconstruct the path by walking parent pointers backward, animated one hop at a time.

Fast-forward buttons ("skip to next POP", "run to completion") keep this from being tedious.

---

## 7. Architecture: algorithm as a list of states

The single most important engineering decision.

**The A\* implementation does not draw anything and does not know the UI exists.** It runs to completion and emits an ordered list of *events*, each carrying a complete snapshot of the algorithm's state:

```js
{
  type: 'RELAX',
  currentNode: 'elm_4th',
  neighbor: 'oak_2nd',
  tentativeG: 24.1,
  previousG: 29.7,
  open: [...],          // full queue contents, ordered
  closed: [...],
  gScores: {...},
  parents: {...},
  narration: "Found a cheaper way to Oak & 2nd: 24.1 beats the old 29.7. Rewriting its route.",
  pseudocodeLine: 11
}
```

The UI is then a pure function of `events[currentIndex]`.

Why this matters:

- **Step-backward becomes free.** Decrement an index. No inverse operations, no undo stack, no bugs where stepping back leaves stale state.
- **Scrubbing a timeline becomes free.** Jump to any index.
- **The algorithm stays readable** as textbook A*, which matters because a grader will read it. No rendering calls tangled into the loop.
- **It is testable.** We can assert the final path cost against a known-correct reference, and assert that a closed node's `g` never later decreases — the invariant that admissibility buys us.

Trade-off: the whole search is computed up front, so we cannot demo a search too large to hold in memory. At ~90 nodes this is irrelevant — a few hundred events at most.

### Module layout

```
src/
  graph.js          city data: nodes, edges, congestion; adjacency building
  astar.js          pure A*; returns event list. No DOM.
  priorityqueue.js  binary heap, instrumented so we can read its contents for display
  render.js         SVG map drawing; pure function of one event
  panels.js         queue / inspector / narration / pseudocode; pure function of one event
  controls.js       stepping, playback, click handling
  main.js           wiring
```

SVG over Canvas: we need hover targets, text labels, and CSS transitions on individual nodes. At this scale SVG's performance is a non-issue and its inspectability in devtools is a real advantage while debugging.

---

## 8. Build phases

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 0 | Repo, spec, AI log | this document exists |
| 1 | `graph.js` + static map render | The city draws, roads vary in thickness, nothing moves |
| 2 | `astar.js` + event list | Correct path cost in console; no UI |
| 3 | Stepping + map state colors | Can step through, watch open/closed spread |
| 4 | Priority queue + inspector panels | Numbers on screen match the map |
| 5 | Narration + pseudocode highlighting | Every step explains itself in words |
| 6 | Polish: start/goal picking, speed, legend, styling | Presentable |
| 7 | README + report | Submittable |

---

## 9. Open questions to settle later

- **Tie-breaking.** When two nodes have equal `f`, which pops first? Preferring the larger `g` is the standard trick and produces visibly straighter searches. Possibly worth exposing as a toggle, since watching tie-breaking change the search shape is a genuine insight — but it risks clutter. Defer.
- **Should the heuristic weight slider make the cut?** It was cut from scope in the initial decision. If phases 1–6 land comfortably, adding a `w` multiplier on `h` (where `w > 1` breaks admissibility and visibly yields a worse path) is the highest-value single addition available. Revisit after phase 5.
- **Mobile layout.** Four panels will not fit a phone. Decide whether to support a stacked layout or simply declare desktop-only.
