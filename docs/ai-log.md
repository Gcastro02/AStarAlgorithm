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
