# A* Search — an interactive demonstration

CSCI 580, Artificial Intelligence.

An interactive, steppable demonstration of the A\* pathfinding algorithm, built as a
routing problem across a fictional city. The goal is not to animate A\* prettily but
to make its *mechanism* legible: what `g`, `h` and `f` actually are, why the frontier
is a priority queue, why a node gets closed, and why the whole thing is guaranteed to
find the cheapest route.

---

## Running it

**Open `index.html` in a browser.** That is the whole procedure. No build step, no
install, no server — it is plain HTML, CSS and JavaScript.

(`tools/dev-server.js` exists only because some embedded preview panes refuse to load
relative paths over `file://`. You do not need it. If you want it:
`node tools/dev-server.js` and visit `http://localhost:5173`.)

Best viewed at 1200px wide or more; it is a four-panel layout and does not fold down
to a phone.

---

## What you are looking at

**Riverford**: 65 intersections, 101 roads, one river, exactly two bridges.

A road's cost is `length × congestion`, where congestion is at least 1.0 — highways
are 1.0, downtown streets 2.2, the bridges 2.8. So the shortest-looking route is
frequently not the cheapest, and "distance" and "cost" come apart.

The heuristic `h` is the **straight-line distance to the goal** — the way a crow
would fly. It is drawn on the map as the dashed amber line, running straight through
buildings and across water.

| Colour | Meaning |
| --- | --- |
| Grey | Not discovered yet |
| Cyan, pulsing | In the queue — discovered, waiting |
| Amber | Being expanded right now |
| Purple | Settled — its cost is final and can never improve |
| Green | The answer |

The purple roads are the **search tree**: each node's link back to wherever it was
cheapest reached from. Watching those links flip is watching relaxation happen.

### Controls

| | |
| --- | --- |
| `←` `→` | step back / forward |
| `space` | play / pause |
| `N` | skip to the next expansion |
| `Home` / `End` | jump to start / finish |
| hover | inspect any intersection's `g`, `h`, `f` and parent |
| click | pin an intersection and watch its numbers change as you step |
| Set start / Set goal | pose your own routing problem |

---

## Three things worth watching for

1. **The heuristic being wrong.** Early on, the search heads straight at the goal —
   because that is what a straight-line estimate tells it to do — and runs into the
   river where there is no bridge. You watch the guess fail and watch A\* recover by
   falling back on what it actually knows.

2. **The trap.** Pier Road is a cul-de-sac pointed directly at the destination. Its
   `h` is very low, so A\* finds it irresistible and expands it. At step 172 the
   priority queue shows North Bridge at `f = 1073` and Pier Road at `f = 1076` — the
   dead end is second in line, three units behind the right answer.

3. **The winning route goes the wrong way first.** The cheapest drive begins by
   heading *away* from the goal, onto the fast belt road. A\* commits to the slow
   downtown grid first, because downtown reduces `h` faster, and has to be talked out
   of it by accumulating `g`.

---

## Compare with Dijkstra

The **Compare with Dijkstra** button in the header splits the map in two. It is off
by default — the demo is about A\*, and the comparison is an option rather than the
main event.

The right-hand pane is **not a second algorithm**. It is this same A\* run with the
heuristic switched off (`weight: 0`), so `f = g`. That is verified, not asserted:
across all 4160 start/goal pairs it produces an identical cost and an identical
settled count to the independently written reference Dijkstra. The two panes really
are running the same code, and the only difference is whether it is allowed to guess.

The panes are synchronised on **expansion count, not event index**. The two searches
emit different numbers of events, so matching indices would compare unrelated
moments. Matching expansion counts asks the honest question: *after the same amount
of work, how much ground has each one covered?*

On the default route the difference is modest — that route saves only 18% and ranks
3703rd of 4160 pairs for contrast, because the river forces any search to sweep the
west bank. When the current route undersells the algorithm, compare mode offers a
one-click switch to **Northbelt Mid → Eastbelt Mid**, where A\* finishes after 16
intersections and Dijkstra needs 53 for the same optimal route — 70% less work.

---

## How it works

The single design decision everything else follows from:

**`astar.js` does not draw anything and does not know the UI exists.** It runs the
search to completion and returns an ordered list of *events*, each carrying a
complete snapshot of the algorithm's state — the full queue contents, the closed set,
every `g`, every parent pointer, a narration string and a pseudocode line number.

The UI is then a pure function of `events[i]`.

This is why stepping *backward* works correctly and was free to build: you decrement
an index and repaint. There are no inverse operations and no undo stack, so there is
no class of bug where stepping back leaves stale state behind. Timeline scrubbing
comes free for the same reason.

```
src/
  graph.js          the city: nodes, roads, congestion, plus self-checks
  priorityqueue.js  binary min-heap with in-place priority updates
  astar.js          the search; emits the event list. No DOM.
  render.js         SVG map; paintEvent() is a pure function of one event
  panels.js         queue, inspector, pseudocode, map key
  controls.js       the timeline player and keyboard shortcuts
  main.js           wiring
```

Loaded as classic `<script>` tags rather than ES modules, deliberately: ES modules
are blocked by CORS over `file://`, which would have meant the page only worked
behind a web server.

---

## Correctness

The demo is a teaching tool, so being *convincing* is not enough — it has to be
right. Checks that run on every page load:

- **A\*'s cost is compared against an independent Dijkstra** written differently on
  purpose: no heap, no heuristic, a plain linear scan. Two implementations sharing no
  code agreeing on the answer is meaningfully stronger than one implementation
  looking plausible.
- The returned path is verified to be a **real drive** — consecutive nodes genuinely
  adjacent, edge costs summing to the reported total.
- **No closed node's `g` ever changes after it is closed**, replayed across all
  recorded events. This is exactly the property admissibility buys, so it is asserted
  rather than assumed.
- The heap's internal invariant is re-checked after every push and pop.
- The map itself is validated: every congestion multiplier is `≥ 1` (the constraint
  the correctness claim rests on), the graph is connected, and **no road crosses the
  river except the two bridges**.

Offline, the full verifier has been run across **every ordered start/goal pair in the
city — 4160 of them — with zero failures.**

That sweep also measured the payoff: across all pairs, **A\* settles 37.7% fewer
intersections than Dijkstra** while always returning the same optimal cost.

### Why the heuristic is safe

Every road costs at least its own straight-line length, because congestion is never
below 1. By the triangle inequality, any route from a node to the goal is at least
the straight-line distance between them. So:

```
h(n) = straight-line(n, goal)  ≤  true remaining cost
```

`h` never overestimates — it is **admissible** — and A\* therefore cannot be tricked
into settling for a worse route.

That `congestion ≥ 1` constraint is load-bearing, not cosmetic. A single "fast lane"
cheaper than its own length would make `h` overestimate and A\* could silently return
a suboptimal route with no error anywhere. `validateCity()` enforces it.

---

## Documentation

## A different city

The **New city** button in the route bar generates a fresh one. Riverford is the default and `Back to Riverford` returns to it.

Generation is not random-and-hope. A random graph almost always produces a boring search — with no obstacle between start and goal the heuristic is nearly exact, A* walks more or less straight there, and Dijkstra looks nearly as good. So the generator produces a *candidate*, runs `validateCity()` on it, then runs the real A* and the real Dijkstra over two dozen possible routes, and **scores whether the resulting search is worth watching**: does the best route cross the river, is it long enough to step through, does A* settle meaningfully fewer intersections than Dijkstra, does the search explore enough of the map. Candidates that fail are discarded and it tries again.

Across 60 generated cities: every one passes full validation and A* verification, and **A* settles 52%% fewer intersections than Dijkstra on average** (range 42-60%%). Generation takes about 350ms, most of it spent searching candidate cities that get thrown away.

Each city shows its **seed**, so a particular one can be returned to.

---

- [`docs/design-spec.md`](docs/design-spec.md) — the design, written before the code,
  including the learning objectives each map feature exists to serve.
- [`docs/transcript.md`](docs/transcript.md) — verbatim session transcript
  (assignment deliverable 2).
- [`docs/ai-log.md`](docs/ai-log.md) — log of AI tool use throughout (assignment
  deliverable 2).
- [`docs/report.md`](docs/report.md) — experience report (assignment deliverable 3).

## Deferred ideas

Recorded in the design spec's open questions: a seeded "new city" generator with a
quality gate, a heuristic-weight slider that demonstrates what happens when
admissibility breaks, and a tie-breaking toggle.
