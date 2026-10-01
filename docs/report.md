# Experience report: building an A* demonstration with AI assistance

**CSCI 580, Artificial Intelligence**
**Deliverable 3**

## What I built

An interactive demo of A* set up as a routing problem. The map is a fictional city
with 65 intersections and 101 roads, split down the middle by a river that only has
two bridges. You can step through the search one event at a time, forward or backward,
and four panels update as you go: the priority queue sorted by `f`, the `g`/`h`/`f`
numbers for whichever intersection you're looking at, a plain-English description of
the current step, and the pseudocode with the executing line highlighted.

After the core demo worked I added two more things. A compare mode that puts A* next
to Dijkstra on the same map and steps them together, and a generator that builds new
cities on demand so you can watch both algorithms in different terrain.

I used Claude (Opus 5) through Claude Code in one long session, split into nine
phases. I reviewed and approved each phase before starting the next one.

## How I worked with it

The most important decision I made wasn't technical. I refused to ask for the whole
thing at once. My first message said we'd "take it step by step instead of just
creating something instantly," and every phase had to produce something I could
actually click on before we moved to the next one.

That mattered more than I expected it to. Two of the worst bugs in this project got
caught only because there was a working thing in front of me at the end of a phase,
instead of a finished app at the end of a session.

I also made it write down the design before writing any code. The spec from phase 0
ended up being the most useful document in the project, and not because the plan was
right. It was useful because putting the plan in writing exposed an error in it early.

## What it was good at

**Volume, with structure.** The city is hand-authored: 65 intersections with real
coordinates, 101 roads, and specific features picked to teach specific things. A river
that makes the heuristic visibly wrong, a dead-end street pointed right at the goal, a
fast road that starts off heading the wrong way. Doing that by hand would have taken
me hours. It also wrote a separate narration sentence for each of the 347 search
events with the right numbers filled into each one. For this kind of work the tool is
just plain good.

**Precision on things it already knows.** The admissibility argument in the spec is
correct and clearly written, and it caught something I would have missed completely.
The rule that every congestion multiplier has to be at least 1 isn't a style choice,
it's what the entire correctness claim depends on. One road cheaper than its own
straight-line length would make the heuristic overestimate, and the demo would quietly
start returning routes that aren't optimal, with no error message anywhere. There's a
runtime check enforcing it now.

**Turning "does this look right?" into something a machine can answer.** This was the
single most useful habit it had. It needed to confirm that no road illegally crossed
the river, couldn't zoom the preview to check, and instead of guessing it wrote a
geometric test of every road segment against the river. The test failed immediately on
a dead-end street that ended 16.3px inside the drawn water, which I never would have
spotted by looking. The same instinct produced a check that no settled node's cost
ever changes afterward, which is exactly the property admissibility is supposed to
guarantee, and eventually a sweep of all 4160 start/goal pairs in the city that found
zero failures.

**Anticipating structural problems.** It caught two before they happened. ES modules
are blocked when you open a file directly from disk, so it used plain script tags to
keep "just open index.html" true. And when routes became re-runnable, it reused the
timeline player instead of building a new one, because a new one would have attached a
second keyboard listener and made every arrow key press step twice.

**Reusing what was already there.** Compare mode needed Dijkstra, and rather than
write it a second time it just ran the existing A* with the heuristic weight set to
zero, which is Dijkstra. Then it checked that against the reference implementation
across all 4160 pairs before relying on it. That turned out to explain the idea better
than a separate implementation would have, since both panes are literally running the
same code and the only difference is whether it's allowed to guess.

**The generator's quality gate was the best idea it had.** When I asked for a random
map generator it pointed out, before I'd thought of it, that random maps would make
the demo worse. With no obstacle in the way the heuristic is nearly exact, A* walks
straight to the goal, and Dijkstra looks almost as good. So instead of generating a
map and hoping, it generates a candidate, runs the real A* and the real Dijkstra on
it, scores whether the search is actually interesting, and throws it out if it isn't.
It reused verification code written three phases earlier for a totally different
purpose to do that.

## Where it went wrong

### Code that looks fine and isn't

This was the most common failure by far, and it happened three separate times in the
same shape: code that reads perfectly but rests on an assumption nobody checked.

- Every keyboard shortcut was dead. The handler started with
  `if (ev.target.matches(...))`, but when you press a key with nothing focused,
  `ev.target` is the document, which has no `.matches()` method. The call threw an
  error and killed the handler before it did anything.
- The pseudocode auto-scroll used `element.offsetTop`, which is measured from the
  nearest positioned ancestor. The container wasn't positioned, so the math was
  quietly using page coordinates instead.
- Clicking a button leaves it focused, so pressing space afterward both re-clicked the
  button and fired the global play/pause shortcut. They cancelled each other out.

None of these look wrong. They're all real patterns used correctly in other contexts.
The bug is entirely in an assumption the code doesn't state.

### Its tests passed on broken features

Twice it checked something, got a green result, and the feature was still broken.

For hover behavior it fired a synthetic `mouseover` event and correctly saw the text
update. But a synthetic event doesn't move an actual cursor, so the feedback loop that
made the interface unusable never happened. The test passed and the feature was
broken. I found it in about ten seconds by moving my mouse.

For the auto-scroll, the first line it tested happened to be line 19, which sits near
the bottom of a 25-line listing. The broken code pushed every scroll to the bottom, so
line 19 showed up fine and the panel looked correct. It took a check across all 347
events to reveal that line 6 had been scrolled off the top the whole time.

I don't think this means it tests badly, because it tests more than I would have. The
problem is that its tests are illustrative rather than exhaustive, and an illustrative
test is exactly what plausible-but-wrong code passes.

### Bugs sitting in between good decisions

The worst bug in the project made the interface flicker violently whenever my cursor
got near a node on the map. The narration bar and the map were rows in the same CSS
grid, so hover text with a different number of lines changed the narration height by
40.5px. That resized the map, which rescaled the SVG, which moved the node I was
pointing at by 20.3px, which is more than its 14px hover radius. So the cursor left
the node, the text reset, the bar shrank, and the node slid back under my cursor. Over
and over, at frame rate.

Every single decision involved there was reasonable on its own: a responsive grid, a
narration bar that fits its content, a hover target big enough to hit easily. The bug
only existed in the interaction between them, and reading any one file would never
have shown it.

### It didn't learn the lesson until it failed

This one is almost a controlled experiment. The flickering bug above is a feedback
loop caused by a UI update destroying the thing the cursor is pointing at. Claude
didn't see it coming and shipped it.

Three phases later it was writing a hover handler for the priority queue and
recognized the exact same shape in completely different code. Hovering a row would
have rebuilt that row's HTML underneath my cursor. It split the rendering to avoid it
before shipping anything, and did the same thing again when reusing the timeline
player.

So it did generalize. But only after failing concretely, not from the principle.
Getting shown one real example changed its behavior in a way that just being careful
didn't.

### Conclusions drawn from one measurement

In phase 2 it measured A*'s advantage on the default route, found it settled 18% fewer
intersections than Dijkstra, and reported that as a general property of the demo. It
even flagged it as a possible weakness we should address.

Running the same measurement across all 4160 pairs later gave a true average of 37.7%.
The default route ranks 3703rd out of 4160 for contrast, which puts it in the bottom
11%, because the river forces any search to sweep the west bank no matter what. It had
turned one data point into a headline number, and the number was about half the real
one.

The same thing happened again with the generator. The first working version accepted
the first candidate city that cleared the quality bar, which pinned the quality to the
threshold: 32% average margin, and 2 out of 40 attempts failing to produce anything.
Switching it to screen many candidates and keep the best raised that to 50% and made
all 60 attempts succeed. You couldn't see the flaw by reading the code, which looked
completely sensible. It only showed up once the output was measured in bulk.

Both cases are the same mistake. A design that's defensible in theory and wrong in a
way only aggregate measurement catches.

### The one design call it got wrong

Right at the start it recommended a weighted terrain grid instead of a road network,
and actually rated the road network the weakest of the three options because node-link
layouts are harder to render cleanly. I picked the road network anyway.

That turned out to be the right call, and the reason is the whole point of the
assignment. On a road network the heuristic *is* the straight-line "as the crow flies"
distance, so you can draw it on screen as a dashed line going through buildings and
across water. Admissibility becomes obvious once you see it, because roads bend and
traffic only slows you down, so the straight-line guess is always optimistic. On a
terrain grid the heuristic just stays an abstract formula.

It had optimized for what was easier to build. I optimized for what would actually
teach someone, which is what the assignment asked for. It agreed once I made the call,
and the best moment in the finished demo, watching the heuristic aim the search
straight at a river with no bridge, only exists because of that override.

### Small errors that happened to flatter its own work

Twice it made an off-by-one in its own benchmark, and both times it fell in its favor.
A* returns the moment the goal is popped and never adds it to the closed set, so
`closed.size` undercounts the work by exactly one. It reported "44 vs 55, 20% less
work" when the honest comparison was 45 vs 55, or 18%. It caught that itself on
review, then reintroduced the same error somewhere else a phase later.

The size of the error is trivial. The direction is worth noticing.

### It can't see its own output

Three different times a screenshot looked like it showed a serious bug: an interface
flickering, a layout collapsing with the whole side panel missing, a river drawn as a
short stub. All three times the page was fine and the preview tool was clipping or
caught mid-render.

The first one cost real time. By the third it had the right habit, which was to
measure before believing the image. When the layout looked broken it queried the DOM
and found everything exactly where it belonged. When the river looked cut off it
called `getBBox()` and got the full 740-unit span. If it had trusted the pictures it
would have "fixed" working code three separate times.

Two things stand out to me here. It genuinely can't verify visual work on its own,
which limits what it can finish without someone watching. And the workaround, turning
a visual question into a numeric one, is the same habit that caught the real bugs.

### A bug it found in its own old work

While building the generator it added a check that two roads can't cross without an
intersection between them, since a generator can easily produce that. The check
immediately failed on the hand-authored map. Two roads had been overlapping at a
single point since phase 1, with no junction there, in every screenshot taken since.

Its first fix moved a node and created a different crossing instead. The actual
problem was topological, not positional: a riverside road ran past a bridge head
instead of meeting it, and that only became clear after the second failure.

The part worth noting is that this survived something like a dozen rounds of me and
Claude both looking at that map. It got found by a machine check written for a
completely unrelated reason, which is a decent argument for writing checks even when
nothing seems wrong.

## What all of this has in common

Every real bug in this project lived in the gap between code that's correct in general
and code that's correct *here*. It never wrote nonsense. It wrote plausible,
well-commented, idiomatic things with hidden assumptions it hadn't checked, about the
DOM, about layout, about how far its own measurements generalized.

That has a practical consequence I didn't expect going in. Reviewing AI output by
reading it is nearly useless for this kind of bug, because reading is exactly the test
the output is already optimized to pass. What worked was making the check exhaustive
(all 347 events, all 4160 route pairs, 120,062 sync checks, 5692 routes across
generated cities), or geometric (compare bounding boxes instead of appearances), or
physical (move an actual mouse).

There's a more positive read too. Three separate times, a measurement Claude ran
itself overturned something Claude had already stated confidently: the 18% figure, the
generator's quality distribution, and whether its own auto-scroll worked. So it's not
that the tool can't find its own mistakes. It's that it won't find them with the kind
of checking it reaches for by default.

## How the work split up

I noticed things, it measured and fixed them. Every bug I found, I found by using the
thing, moving a cursor or clicking a button. But once I pointed at a symptom it was
genuinely great at diagnosis. For the flickering bug it went from "something's
flickering" to a measured 40.5px layout shift causing a 20.3px node displacement past
a 14px hover radius, plus a verified fix, in a few minutes. It could never have
noticed that bug. It was very good at explaining it.

I set the goals and it carried them out. The one decision it made about *what* to
build rather than *how* was the domain choice, and that's the one it got wrong.

It was more rigorous than I would have been. On my own I wouldn't have written a
river-crossing geometry test, or replayed an invariant across 347 events, or swept
4160 route pairs. When I asked it to verify something it reached for a stronger check
than I would have, and several real bugs fell out of checks I'd never have thought to
write.

## Conclusion

The tool was most useful as a fast and surprisingly rigorous implementer of decisions
that were already made. It was least reliable exactly where it seemed most confident,
writing fluent code and fluent explanations on top of assumptions it hadn't verified.

That isn't the whole story though, and the later phases complicated it for me. Given a
fixed goal like "let people see a different map," it came up with a design idea I
wouldn't have had on my own: don't generate a map and hope, generate one, run the real
algorithm on it, and throw it away if the search turns out boring. And it reused code
written three phases earlier to do it. So it isn't purely an implementer. It's a poor
judge of what to build, and a good designer of how to build it once that's settled.

The step-by-step process is what made the whole thing work. Approving one phase at a
time meant there was always something real to poke at, and poking at real things is
how every serious bug in this project got found. If I'd asked for the finished app in
one prompt, I'd have gotten something that looked complete, read well, and flickered
whenever I moved my mouse.
