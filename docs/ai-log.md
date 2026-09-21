# AI Interaction Log

**Course:** CSCI 580 Artificial Intelligence
**Project:** Interactive A* demonstration
**AI tool used:** Claude (Opus 5) via Claude Code, desktop app

This file is maintained continuously during the project, not reconstructed
afterward. Each entry records what was asked, what the AI produced, and — the part
that matters for the report — **where human judgment overrode or redirected the AI.**

A raw verbatim transcript of the full session will be exported and committed
alongside this summary before submission.

---

## Session 1 — 2026-09-21 — Design and scoping

### Turn 1 — Opening prompt (human)

Pasted the assignment image and asked how to start, explicitly requesting a
step-by-step collaboration rather than a single-shot generated app.

### Turn 1 — Response (AI)

Inspected the working directory. Proposed a seven-phase plan (repo/log → design spec
→ isolated algorithm → visualization → intrinsics layer → polish → report).

Flagged two things unprompted:

1. **Deliverable 2 is a log of all AI interactions**, so logging had to start
   immediately rather than being reconstructed at the end. This file is the result.
2. The existing working folder contained unrelated projects, so the demo should get
   its own subfolder and its own git repository.

Then asked three scoping questions rather than proceeding: problem domain, tech
stack, and how deep to go on the "intrinsics" requirement.

**AI's recommendation on domain: a weighted terrain grid.** Reasoning given was that
a plain maze makes every step cost 1, which flattens the distinction between `g` and
`h`.

### Turn 2 — Decisions (human)

- **Domain: road/city network graph.** *This overrode the AI's recommendation.*
- **Stack: vanilla HTML/CSS/JS, no build step.** (Matched the AI's recommendation —
  rationale was that the grader can open the file without installing anything.)
- **Intrinsics: live `f`/`g`/`h` values plus a priority-queue panel, and narration
  with pseudocode highlighting.** Declined the "algorithm race" (A* vs Dijkstra vs
  Greedy) and the heuristic-weight slider, to keep scope controlled.

**Note for the report — the human call was the better one.** The AI had rated the
road network as the weakest of the three options on the grounds that node-link
layouts are harder to read than grids. It had not considered that on a road network
the heuristic becomes *literally* the straight-line "as the crow flies" distance,
which can be drawn on screen as a dashed line and which makes admissibility
self-evident: roads bend and traffic slows you down, so the crow-flies guess is
always optimistic. On a terrain grid the heuristic stays an abstract formula. The AI
optimized for ease of rendering; the human optimized for the actual teaching goal,
which was the stated point of the assignment. The AI acknowledged this once the
choice was made.

### Turn 2 — Response (AI)

Created the repository skeleton and wrote `docs/design-spec.md` (v1), covering:

- Eight explicit learning objectives, with a note that objectives 7 and 8 (node
  closing, and edge relaxation) are the ones most published A* demos omit.
- Map design where each feature teaches something specific — notably a river with
  only two bridges, so the viewer watches the heuristic actively mislead the search
  and then watches A* recover.
- A cost model (`cost = length × congestion`, congestion >= 1) with a written proof
  sketch of admissibility, and the observation that the `congestion >= 1` constraint
  is load-bearing rather than cosmetic: allowing a multiplier below 1 would make the
  heuristic overestimate and silently break optimality.
- An architecture where A* emits a list of complete state snapshots and the UI is a
  pure function of the current index, which makes step-backward and timeline
  scrubbing trivial instead of bug-prone.

### Tooling friction worth recording

The first attempt to write the spec via a shell heredoc failed with a quoting error
(the document contains backticks, apostrophes, and box-drawing characters). The AI
switched to a direct file write instead of debugging the shell escaping. Minor, but a
representative example of AI-driven tooling picking a fragile path first.

---

## Notes to carry into the final report

Running list of observations about where the AI helped and where it needed
correction. To be expanded each session.

**Helped so far:**

- Producing a large, well-organized spec quickly once the goals were fixed.
- Catching the logging requirement at the start rather than at the end.
- Articulating the admissibility argument precisely, including which design
  constraint the correctness claim actually depends on.

**Needed human correction so far:**

- Recommended the wrong problem domain by optimizing for implementation convenience
  over pedagogical value.
- Reached for a fragile shell-quoting approach before falling back to a simpler tool.

---

## Session 1 (cont.) — Pseudocode panel clarification

### Turn 3 — Question (human)

Asked what the pseudocode panel actually does — whether it highlights as the
algorithm runs across the map.

### Turn 3 — Response (AI)

Confirmed the behavior and wrote the canonical 25-line pseudocode listing plus an
explicit event-to-line mapping table into the spec (§6). Identified line 19,
`tentative_g < g[neighbor]`, as the single most valuable line to display, since the
RELAX and SKIP events are the same line resolving two opposite ways.

**A real error the question surfaced.** Writing the pseudocode out exposed an
ordering bug in spec v1: the AI had listed the `CLOSE` event as occurring *after* the
neighbor loop, when standard A* closes the current node immediately after the goal
check, before examining neighbors. Because the neighbor loop skips already-closed
nodes, closing late would have produced an animation that contradicted the pseudocode
displayed next to it. Corrected in v1.1.

Worth noting for the report: the AI generated this error while writing confident,
well-formatted prose, and did not catch it until forced to write the concrete
pseudocode that the prose was supposed to describe. The human question, which was
only a request for clarification and not a challenge, is what triggered the check.

---

## Session 1 (cont.) — Phase 1: the city graph and static map

### Turn 4 — Instruction (human)

Approved the spec and asked to proceed to phase 1.

### Turn 4 — Response (AI)

Built `src/graph.js` (65 intersections, 101 roads), `src/render.js`, `styles.css`,
`index.html`, and `src/main.js`. Map renders; controls are present but disabled
pending phase 2.

**Constraint the AI raised before writing code.** ES modules are blocked by CORS over
`file://`, so an `import`/`export` build would have shown the grader a blank page
unless they ran a local web server. Since "just open index.html" was the entire
justification for choosing vanilla JS, the code uses classic `<script>` tags with
named globals instead. This was caught before implementation rather than after.

### Verification, and a defect the AI found in its own map

The map was checked in a browser. The AI added a geometric validator to
`validateCity()` that tests every road segment against the river polyline, asserting
that only the two bridges cross it and that no road passes within half the river's
drawn width.

That validator immediately failed on one road: the Pier Road cul-de-sac ended 16.3px
from the river centreline, inside the drawn water. By eye at full-map zoom this was
invisible. Fixed by moving the node.

This is worth reporting: the AI could not visually inspect its own output reliably
(the preview pane could not crop-zoom), and rather than guessing, it converted the
visual question into a geometric assertion that a machine could answer. The check is
now permanent and will catch the same class of error if the map is edited later.

**A second defect found by testing rather than reading.** Simulating a hover on the
dead-end node revealed the narration read "1 road meet here." Correct pluralisation of
the noun, incorrect conjugation of the verb — precisely the kind of error that reads
as fluent and passes casual review.

### Design details the AI proposed that survived review

- Cheapest-looking route is deliberately not the cheapest: a fast belt road that
  heads *away* from the goal beats the slow downtown grid that heads toward it. At
  the start node the belt road has a worse `f` than downtown, so A* will commit to
  downtown first and have to be talked out of it.
- The Pier Road cul-de-sac has `h = 365`, far lower than any node on the real route,
  which guarantees A* will pop it and discover the dead end. The trap is not
  decorative; the numbers force the search into it.

### Tooling friction

The in-app preview pane renders files outside the project root as static snapshots,
so relative CSS and JS paths did not load and the first screenshot was unstyled text.
Resolved by running a throwaway local static server for previewing only; the
deliverable itself still needs no server.

---

## Session 1 (cont.) — Hover oscillation bug

### Turn 5 — Bug report (human)

Reported that moving the cursor near (not yet onto) a map node made the interface
"freak out by zooming in and out really fast and changing the text really fast."
Noted the AI might not be able to observe it.

### Turn 5 — Response (AI)

Diagnosed it as a layout feedback loop rather than an animation or rendering fault,
then measured it in the browser instead of assuming:

- The narration bar and the map were rows of the same CSS grid, with the map sized
  `1fr`.
- Hover text of a different line count than the default changed the narration row's
  height by **40.5px**.
- That resized the map row, rescaling the SVG and moving the hovered node **20.3px**.
- 20.3px exceeds the node's 14px hover radius, so the cursor left the node, `mouseout`
  fired, the text reset, the row shrank, and the node moved back under the cursor.
  The loop then repeated at frame rate.

Fixes: the narration bar now has a **fixed** height (overflowing internally by
scrolling rather than by growing), so text can never resize the map; and hover
handlers now ignore transitions between a node's own child elements.

Verified with the same measurement across five nodes at two viewport widths: node
displacement is now exactly 0px in every case, including against a deliberately
absurd 800-word narration string.

### Why this one matters for the report

This bug came from the AI, and it is a good example of the category of mistake these
tools make. Each individual decision was reasonable — a responsive grid, a narration
bar that adapts to its content, a generous invisible hover target. The defect lived
only in the *interaction* between three separately sensible choices, and it could not
be found by reading any single file.

It also would not have been caught by the AI's own testing. Earlier verification
simulated hover by dispatching a synthetic `mouseover`, which correctly reported that
the text updated. A synthetic event does not move a real cursor, so the feedback loop
never triggered. **The test passed; the feature was broken.** The human caught it in
about ten seconds by moving a mouse.

The diagnosis and fix, once pointed at, took the AI a few minutes and produced a
measured before/after rather than a guess. That division — human notices, AI
measures and repairs — is the honest summary of where the tool is strong.

---

## Session 1 (cont.) — Phase 2: the search itself

### Turn 6 — Instruction (human)

Approved phase 1 and asked to begin phase 2.

### Turn 6 — Response (AI)

Wrote three files: `src/priorityqueue.js` (binary min-heap with in-place priority
update), `src/astar.js` (the search, plus an independent Dijkstra and a verifier),
and a throwaway headless harness that loads the browser scripts into a Node sandbox
so the algorithm could be tested without a UI.

**Result: A\* returns cost 1265.5. The independent Dijkstra returns 1265.5.** The
route is the belt road to the North Bridge and then the Skyway, exactly as predicted
from the map design in phase 1.

### Checks that now run on every page load

Rather than asserting the answer looked right, the AI wrote checks a machine can
fail:

- A* cost equals the cost from an independent Dijkstra that shares no code with it.
- The returned path is a real drive: consecutive nodes are genuinely adjacent, and
  the edge costs sum to the reported total.
- A* never settles more nodes than Dijkstra.
- **Once a node is closed its `g` never changes again** — replayed across all 347
  recorded events. This is precisely the property admissibility is supposed to buy,
  so it is asserted rather than assumed.
- The heap's internal invariant is re-checked after every push and pop.

### Design decisions worth recording

- **The queue updates priorities in place** rather than pushing duplicate entries
  and discarding stale ones. The lazy approach is simpler and more common, but it
  would show the same intersection listed twice in the queue panel, which is
  confusing for no benefit at 65 nodes. The display requirement drove the data
  structure choice.
- **`snapshot()` sorts a copy.** A heap only guarantees its root is the minimum; its
  backing array is *not* in sorted order. Rendering the raw array would have shown
  the viewer a subtly wrong queue — right at the top, wrong below it — which is the
  kind of error that teaches something false while looking correct.
- **The goal is tested when popped, not when discovered.** The narration calls this
  out explicitly, and when the goal first enters the queue the narration says the
  search cannot stop yet because a cheaper route may still appear.

### An error the AI made and caught in its own measurement

The first verification run reported "A* settled 44 nodes vs Dijkstra's 55, 20% less
work." That comparison was unfair: A* returns as soon as the goal is *popped* and
never adds it to the closed set, while the reference Dijkstra counts the goal as
settled. The AI was comparing 44 against 55 when the honest comparison was 45 against
55. Added a separate `settled` field and corrected the figure to **18%**.

Small, but it is exactly the kind of off-by-one that makes a benchmark flattering,
and it was in the AI's own self-congratulatory output.

### A finding to raise with the human rather than fix unilaterally

A*'s pruning advantage on this map is real but **modest: 45 settled versus 55, about
18%**. The river forces any search to explore the west bank thoroughly, and at 65
nodes there is limited room for the heuristic to show off. The nodes A* skips are all
east-side filler.

Separately, a sweep of the heuristic weight (the slider that was cut from scope)
produced a much stronger result:

| weight | cost | settled | optimal? |
| --- | --- | --- | --- |
| 0 (= Dijkstra) | 1265.5 | 54 | yes |
| 1 (normal A*) | 1265.5 | 44 | yes |
| 2 | 1265.5 | 31 | yes |
| 3 | 1648.2 | 33 | **no — 30% worse route** |

At w=3 the heuristic overestimates, admissibility breaks, and the demo would *show*
a visibly worse route rather than merely asserting that one is possible. This is
strong evidence that the cut feature is the highest-value remaining addition.

### Performance note

347 events at roughly 749 KB total, holding full state snapshots. Irrelevant at this
scale, and it buys free step-backward and timeline scrubbing. Snapshot independence
between adjacent events was verified explicitly rather than assumed.
