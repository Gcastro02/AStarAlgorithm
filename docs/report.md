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

Two features were added after the core demo was working. A **compare mode** puts A\*
beside Dijkstra on the same map, stepping in lockstep, and a **city generator**
produces fresh maps on demand so the algorithms can be watched in different terrain.

I worked with Claude (Opus 5) through Claude Code across a single extended session,
in nine phases, reviewing and approving each phase before the next began.

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

**Reusing what already existed instead of writing something new.** Two good examples
came late. Compare mode needed a second algorithm, and rather than implement Dijkstra
a second time the AI ran the existing A\* with the heuristic weight set to zero —
which *is* Dijkstra — and verified the equivalence against the independent reference
implementation across all 4160 route pairs before relying on it. That also produced a
better explanation than a bolted-on rival would have: the two panes are running the
same code, and the only difference is whether it is allowed to guess.

**The best single idea it had was the generator's quality gate.** Asked for a random
map generator, it pointed out unprompted that a random graph almost always produces a
*boring* search — with no obstacle between start and goal the heuristic is nearly
exact and Dijkstra looks nearly as good — so randomising naively would have made the
demo worse. Its solution was to generate a candidate, run the real A\* and the real
Dijkstra on it, score whether the resulting search was worth watching, and throw the
candidate away if not. Generate-and-test rather than trying to construct a good map
directly. That reused the verification machinery built three phases earlier for a
completely different purpose.

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

This recurred in a different form when the generator was built. Its first working
version accepted the *first* candidate city that cleared the quality bar, which meant
quality was pinned to the threshold: average A\* margin 32%, and 2 of 40 attempts
found nothing at all. Changing it to screen many candidates and keep the **best**
raised the average to 50% and made all 60 attempts succeed. The flaw was invisible in
the code, which looked entirely reasonable; it only appeared when the output
distribution was measured rather than spot-checked.

Both cases have the same shape: a design that is defensible in the abstract, and
wrong in a way that only aggregate measurement reveals.

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

### 8. It cannot see its own output, and nearly "fixed" things that were not broken

Three times across the project a screenshot appeared to show a serious defect — an
interface flickering, a layout collapsing with the side panel gone, a generated river
drawn as a short stub. In every case the page was fine and the preview tool was
clipping or mid-render.

The first of those cost real time. By the third, the AI had developed the right
habit: measure the geometry before believing the picture. When the layout looked
broken it queried the DOM and found every element exactly where it belonged; when the
river looked truncated it called `getBBox()` and found the full 740-unit span. Had it
trusted the images, it would have "repaired" working code three times.

I take two things from this. The tool is genuinely unable to verify visual work
reliably, which is a hard limit on the kinds of task it can finish alone. And the
compensating discipline — convert the visual question into a numeric one — is the
same discipline that found the *real* bugs.

### 9. A defect it had written months of screenshots earlier

While building the generator, the AI added a check that no two roads may cross
without an intersection between them — necessary because a generator can easily
produce such crossings. The check immediately failed on **the hand-authored map**:
two roads had been overlapping at a single point since phase 1, with no junction
there, present in every screenshot taken since.

Its first fix moved a node and produced a *different* crossing. The real problem was
topological rather than positional — a riverside road ran past a bridge head instead
of meeting it — and only became clear after the second failure.

The wider point is that this defect survived roughly a dozen rounds of human and AI
review of the same map. It was found by a machine check written for an unrelated
reason, which is an argument for writing the check even when nothing seems wrong.

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
all 4160 route pairs, 120,062 synchronisation checks, 5692 routes across generated
cities) or **geometric** (compare bounding boxes, not appearances) or **embodied**
(move an actual mouse).

There is a hopeful version of this too. Three times, a measurement the AI ran itself
overturned a conclusion the AI had previously stated with confidence — the 18% claim,
the generator's quality distribution, and the assumption that its own auto-scroll
worked. It is not that the tool cannot find its own errors. It is that it will not
find them by the kind of checking it reaches for by default.

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

That is not the whole picture, though, and the later phases complicated it. Given a
fixed goal — "let people see a different map" — it produced a genuinely good design
idea I would not have had: don't generate a map and hope, generate one, *run the real
algorithm on it*, and throw it away if the resulting search is dull. It reused
machinery built three phases earlier for an unrelated purpose to do it. So it is not
purely an implementer. It is a weak judge of what to build and a strong designer of
how, once what is settled.

The step-by-step process is what made it work. Approving one phase at a time meant
there was always something real to poke at, and poking at real things is how every
serious bug in this project was found. Had I asked for the finished application in a
single prompt, I would have received something that looked complete, read well, and
flickered when you moved the mouse.
