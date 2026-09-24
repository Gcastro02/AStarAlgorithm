# Experience report — building an A* demonstration with AI assistance

**CSCI 580, Artificial Intelligence**
**Deliverable 3**

> *Draft. Written from the session record in [`ai-log.md`](ai-log.md); every incident
> below is traceable to a specific commit or measurement. Edit freely to match your
> own voice and add anything I experienced that the log does not capture.*

---

## What I built

An interactive demonstration of A\* as a routing problem across a fictional city of
65 intersections and 101 roads, split by a river with only two bridges. The viewer
can step through the search one event at a time — forward or backward — while four
synchronised panels show the priority queue sorted by `f`, one intersection's `g`/`h`/`f`
arithmetic, a plain-English narration of the current step, and the pseudocode with the
executing line highlighted.

I worked with Claude (Opus 5) through Claude Code across a single extended session,
in seven phases, reviewing and approving each phase before the next began.

---

## How I worked

The most consequential decision I made was procedural rather than technical: **I
refused to ask for the whole thing at once.** The first instruction was explicitly
"we'll take it step by step instead of just creating something instantly." Each phase
produced something I could look at and approve before the next started.

This mattered more than I expected. Two of the most serious defects in the project
were caught because there was a working artifact in front of me at the end of a
phase, not a finished application at the end of a session.

I also required that the AI write down its design decisions *before* writing code.
The design spec that came out of phase 0 turned out to be the single most useful
document in the project — not because the AI's plan was perfect, but because writing
it down made one of its errors visible early (see below).

---

## Where the AI was most helpful

**Producing volume with structure.** The city map is hand-authored: 65 intersections
with real coordinates, 101 roads, and a set of features each chosen to teach
something specific — a river that makes the heuristic visibly wrong, a cul-de-sac
aimed at the goal, a fast road that initially heads away from it. Producing that by
hand would have taken me hours. It also generated a distinct narration sentence for
each of the 347 search events, with the correct numbers interpolated into each one.
This is the kind of work where the tool is straightforwardly excellent.

**Being precise about things it already knows.** The admissibility argument in the
spec is correct and well stated, and it identified something I would have missed: the
constraint that every congestion multiplier must be `≥ 1` is not a cosmetic choice,
it is what the correctness claim *depends on*. A single road cheaper than its own
straight-line length would make the heuristic overestimate and the demo would
silently return suboptimal routes with no error anywhere. That constraint is now
enforced by a runtime check.

**Turning vague quality questions into machine-checkable assertions.** This was the
most valuable behaviour I saw. When it needed to confirm no road illegally crossed
the river and couldn't zoom the preview reliably, it did not guess — it wrote a
geometric test of every road segment against the river polyline. That test
immediately failed on a cul-de-sac ending 16.3px inside the drawn water, which was
invisible by eye. The same instinct produced a check that no closed node's `g` ever
changes after closing (exactly the property admissibility buys), and eventually a
sweep of **all 4160 ordered start/goal pairs in the city**, which found zero
failures.

**Executing a refactor under a stated constraint.** Twice it correctly anticipated a
structural problem: ES modules are blocked over `file://`, so it used classic script
tags to keep "just open index.html" true; and when routes became re-runnable it
reused the timeline player rather than rebuilding it, because rebuilding would have
stacked a second document-level keyboard listener and made every arrow press step
twice.

---

## Where it struggled

### 1. Code that is idiomatic, plausible, and quietly wrong

This was the dominant failure mode, and it happened **three separate times** in the
same form: correct-looking code resting on an unstated precondition that was never
checked.

- Every keyboard shortcut was dead, because the handler began
  `if (ev.target.matches(...))` — and when a keydown occurs with nothing focused,
  `ev.target` is the *document*, which has no `.matches()` method. The call threw and
  killed the handler.
- The pseudocode panel's auto-scroll used `element.offsetTop`, which is measured from
  the nearest *positioned* ancestor. The scroll container had no `position`, so the
  arithmetic was silently using page coordinates.
- A clicked button retains keyboard focus, so pressing space afterwards both
  re-activated the button and fired the global play/pause shortcut, cancelling out.

None of these look wrong. Each is a real pattern, copied faithfully. The defect lives
entirely in an assumption about context that the code never states and the AI never
verified.

### 2. Its own tests passed while the feature was broken

Twice, the AI verified something and got a green result from a broken feature.

When checking hover behaviour it dispatched a synthetic `mouseover` event and
correctly observed that the text updated. But a synthetic event does not move a real
cursor, so the feedback loop that made the interface unusable never triggered. **The
test passed; the feature was broken.** I found it in about ten seconds by moving a
mouse.

When checking the pseudocode auto-scroll, the first line it happened to test was line
19 — which sits near the bottom of a 25-line listing. The broken code clamped every
scroll to the bottom, so line 19 was visible and the panel looked correct. Only an
exhaustive geometric check across all 347 events revealed that line 6 had been
scrolled off the top the entire time.

The lesson I take from this is not that the AI tests badly — it tests more than I
would have. It is that **its tests tend to be illustrative rather than exhaustive**,
and illustrative tests are exactly the ones that a plausible-but-wrong implementation
passes.

### 3. Bugs that live between individually sensible decisions

The worst bug in the project was an interface that flickered violently when the
cursor approached a map node. The cause: the narration bar and the map were rows of
the same CSS grid, so hover text of a different line count changed the narration
height by 40.5px, which resized the map, which rescaled the SVG, which moved the
hovered node 20.3px — past its 14px hover radius. The cursor left the node,
`mouseout` fired, the text reset, and the node moved back under the cursor. At frame
rate.

Every individual decision there was defensible: a responsive grid, a narration bar
that adapts to its content, a generous invisible hover target. The defect existed
only in the *interaction* between three separately sensible choices, and reading any
one file would never have revealed it.

### 4. It did not generalise the lesson until it had failed concretely

There is a clean natural experiment here. The oscillation bug above is a feedback
loop caused by a UI update destroying the thing the cursor was pointing at. The AI
did not anticipate it and shipped it.

Three phases later, writing a hover handler for the priority queue, it recognised the
same shape in completely different code — hovering a row would have rebuilt the row's
HTML underneath the cursor — and split the rendering to avoid it *before* shipping.
It did the same again when reusing the timeline player.

So the pattern did generalise. But it generalised **only after a concrete failure**,
not from the general principle. That seems worth stating plainly: being shown one
real instance changed its behaviour in a way that abstract care did not.

### 5. Statistical overgeneralisation from a single measurement

In phase 2 the AI measured A\*'s advantage on the default route, found it settled 18%
fewer intersections than Dijkstra, and reported that as a characteristic of the demo —
flagging it as a possible weakness worth addressing.

When the same measurement was later run across all 4160 pairs, the true average was
**37.7%**. The default route ranks **3703rd of 4160** for contrast — it is in the
bottom 11%, because the river forces any search to sweep the west bank thoroughly.
The AI had generalised a headline claim from `n = 1`, and the claim was roughly half
the real figure.

### 6. It got the highest-level design decision wrong

At the very start the AI recommended a weighted terrain grid over a road network,
rating the road network the *weakest* of three options because node-link layouts are
harder to render legibly. I chose the road network anyway.

That was the right call, and the reason is the whole point of the assignment: on a
road network the heuristic **is** the straight-line "as the crow flies" distance, so
it can be drawn on screen as a literal dashed line through buildings and across
water, and admissibility becomes self-evident — roads bend and traffic only slows you
down, so the crow-flies guess is always optimistic. On a terrain grid the heuristic
stays an abstract formula.

The AI had optimised for implementation convenience. I optimised for the teaching
goal, which was the stated point of the exercise. It acknowledged this once the
choice was made, and the entire demo's best moment — watching the heuristic aim the
search at a river with no bridge — only exists because of that override.

### 7. Small arithmetic errors that flattered its own work

Twice the AI produced an off-by-one in its own benchmark, both times in its favour:
A\* returns as soon as the goal is *popped* and never adds it to the closed set, so
`closed.size` undercounts the work done by exactly one. It reported "44 vs 55, 20%
less work" when the honest comparison was 45 vs 55, or 18%. It caught this itself on
review, and then reintroduced the same error in a different display a phase later.

Minor in magnitude. Notable in direction.

---

## The pattern behind the failures

Every significant defect in this project sat in the gap between *code that is correct
in the abstract* and *code that is correct in this context*. The AI never wrote
nonsense. It wrote plausible, idiomatic, well-commented things whose hidden
assumptions it had not checked — about the DOM, about layout, about what its own
measurements generalised to.

That has a practical consequence. Reviewing AI output by reading it is close to
useless for this class of bug, because reading is precisely the check the output is
optimised to pass. What worked was making the check **exhaustive** (all 347 events,
all 4160 pairs) or **geometric** (compare bounding boxes, not appearances) or
**embodied** (move an actual mouse).

---

## The division of labour that actually worked

**I noticed, it measured and repaired.** Every bug I found, I found by using the
thing — moving a cursor, clicking a button. Once I pointed at a symptom, the AI was
genuinely excellent at diagnosis: for the oscillation bug it went from "something
flickers" to a measured 40.5px layout shift causing a 20.3px node displacement past a
14px hover radius, with a verified fix, in minutes. It could not have noticed that
bug. It was very good at explaining it.

**I set the goals, it executed them.** The one decision it made about *what to build*
rather than *how to build it* — the domain choice — was the one it got wrong.

**It was better at rigour than I would have been.** Left to myself I would not have
written a river-crossing geometry test, or replayed a closed-node invariant across
347 events, or swept 4160 route pairs. When asked to verify something, it reached for
a stronger check than I would have, and several real defects fell out of checks I
would not have thought to write.

---

## Conclusion

The tool was most valuable as an extremely fast, extremely rigorous implementer of
decisions that had already been made, and least reliable exactly where it appeared
most confident — fluent code and fluent prose resting on unverified assumptions about
context.

The step-by-step process is what made it work. Approving one phase at a time meant
there was always something real to poke at, and poking at real things is how every
serious bug in this project was found. Had I asked for the finished application in a
single prompt, I would have received something that looked complete, read well, and
flickered when you moved the mouse.
