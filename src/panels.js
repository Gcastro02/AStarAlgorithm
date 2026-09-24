/* ============================================================================
 * panels.js — The "intrinsics" layer.
 *
 * The map shows you WHERE the search is. These panels show you WHY it goes
 * there next: the actual queue it sorts, and the actual arithmetic behind one
 * intersection's f value.
 *
 * Like render.js, everything here is a pure function of one event snapshot.
 * ==========================================================================*/

/** Which node the panels should describe, absent an explicit user choice. */
function defaultFocus(event) {
  return event.neighbour || event.current || null;
}

function nodeStateIn(event, id) {
  if (event.path && event.path.includes(id)) return 'path';
  if (event.current === id && !event.path) return 'current';
  if (event.closed.includes(id)) return 'closed';
  if (event.open.some((entry) => entry.id === id)) return 'open';
  return 'unvisited';
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (n) => ORDINAL[n] || `${n}th`;

/* ---------------------------------------------------------------------------
 * Node inspector — one intersection's numbers, spelled out.
 * -------------------------------------------------------------------------*/
function renderInspector(container, city, event, focusId, goalId) {
  if (!focusId || !city.has(focusId)) {
    container.innerHTML =
      '<p class="placeholder">Hover any intersection, or click a row in the queue, ' +
      'to see its numbers.</p>';
    return;
  }

  const nd = city.node(focusId);
  const goal = city.node(goalId);
  const h = euclidean(nd, goal);
  const g = event.g[focusId];
  const known = Number.isFinite(g);
  const f = known ? g + h : null;

  const state = nodeStateIn(event, focusId);
  const rank = event.open.findIndex((entry) => entry.id === focusId);
  const parentId = event.parent[focusId];

  const stateText = {
    path: 'on the final route',
    current: 'being expanded right now',
    closed: 'settled &mdash; its cost is final and cannot improve',
    open: rank === 0
      ? `next out of the queue &mdash; nothing else has a lower f`
      : `in the queue, ${ordinal(rank + 1)} in line of ${event.open.length}`,
    unvisited: 'not discovered yet',
  }[state];

  /* The f = g + h bar. Proportions are the point: on a node near the start, h
     dominates and the estimate is mostly guesswork; near the goal, g dominates
     and the number is mostly fact. */
  const bar = known
    ? `<div class="ghbar" title="g is ${Math.round(g)} of f; h is ${Math.round(h)} of f">
         <span class="ghbar-g" style="width:${(100 * g / f).toFixed(1)}%"></span>
         <span class="ghbar-h" style="width:${(100 * h / f).toFixed(1)}%"></span>
       </div>`
    : `<div class="ghbar ghbar--unknown"><span class="ghbar-h" style="width:100%"></span></div>`;

  const rows = known
    ? `<dt class="sym sym--g">g</dt><dd class="val">${Math.round(g)}</dd>
       <dd class="note">cost already paid to get here</dd>
       <dt class="sym sym--h">h</dt><dd class="val">${Math.round(h)}</dd>
       <dd class="note">straight-line guess for the rest</dd>
       <dt class="sym sym--f">f</dt><dd class="val val--f">${Math.round(f)}</dd>
       <dd class="note">g + h &mdash; the only number the queue sorts on</dd>`
    : `<dt class="sym sym--g">g</dt><dd class="val">&infin;</dd>
       <dd class="note">no route to it found yet</dd>
       <dt class="sym sym--h">h</dt><dd class="val">${Math.round(h)}</dd>
       <dd class="note">what its guess would be</dd>
       <dt class="sym sym--f">f</dt><dd class="val val--f">&infin;</dd>
       <dd class="note">unknown until a route reaches it</dd>`;

  container.innerHTML =
    `<div class="insp-name" title="${nd.name}">${nd.name}</div>
     <div class="insp-state insp-state--${state}">${stateText}</div>
     ${bar}
     <dl class="insp-nums">${rows}</dl>
     <div class="insp-from">${
       parentId
         ? `Best route so far arrives from <strong>${city.node(parentId).name}</strong>`
         : (focusId === city.defaultStart || !known)
           ? '&nbsp;'
           : 'This is the start &mdash; nothing comes before it'
     }</div>`;
}

/* ---------------------------------------------------------------------------
 * Priority queue — the open set, in true pop order.
 *
 * This is the panel that makes "A* always pursues the most promising lead"
 * concrete: the top row IS what comes off next, and you can watch rows
 * overtake each other when a relaxation lowers somebody's f.
 * -------------------------------------------------------------------------*/
/**
 * Update only which row is highlighted, without rebuilding the list.
 *
 * This matters: hovering a row changes the focus, and if that rebuilt the
 * list's innerHTML it would destroy the very element under the cursor and
 * recreate it, risking a mouseover/mouseout feedback loop. Rows are rebuilt
 * only when the algorithm state actually changes.
 */
function updateQueueFocus(container, focusId) {
  for (const row of container.querySelectorAll('.q-row')) {
    row.classList.toggle('is-focused', row.dataset.node === focusId);
  }
}

function renderQueue(container, city, event, focusId) {
  const entries = event.open;

  if (!entries.length) {
    container.innerHTML = event.path
      ? '<p class="placeholder">The search finished. Anything still queued had a ' +
        'higher f than the completed route, so it could never have won.</p>'
      : '<p class="placeholder">The queue is empty.</p>';
    return;
  }

  /* When the search is over, whatever is left in the queue is the proof: every
     remaining f exceeds the completed route, so none of them could have won.
     That is exactly why A* was allowed to stop. */
  const finishedNote = event.path
    ? `<p class="q-note">Search over. Everything still queued has
         <strong>f &gt; ${Math.round(event.cost)}</strong>, the cost of the finished
         route &mdash; so none of them could ever have beaten it. That is why A*
         was allowed to stop.</p>`
    : '';

  container.innerHTML = finishedNote + entries
    .map((entry, index) => {
      const classes = ['q-row'];
      if (index === 0) classes.push('is-next');
      if (entry.id === focusId) classes.push('is-focused');
      /* The node just relaxed moved in the queue on this very step. */
      if (entry.id === event.neighbour && event.type === 'RELAX') classes.push('is-changed');

      return `<button class="${classes.join(' ')}" data-node="${entry.id}" type="button">
        <span class="q-rank">${index + 1}</span>
        <span class="q-name">${city.node(entry.id).name}</span>
        <span class="q-parts">${Math.round(entry.g)}<span class="q-plus">+</span>${Math.round(entry.h)}</span>
        <span class="q-f">${Math.round(entry.f)}</span>
      </button>`;
    })
    .join('');
}

/* ---------------------------------------------------------------------------
 * The map key, built from the same tables the algorithm and renderer use so it
 * can never drift out of sync with what is on screen.
 * -------------------------------------------------------------------------*/
function renderStateKey(container) {
  const states = [
    ['unvisited', 'Not discovered'],
    ['open', 'In the queue (frontier)'],
    ['current', 'Being expanded now'],
    ['closed', 'Settled &mdash; cost is final'],
    ['path', 'The answer'],
  ];
  container.innerHTML = states
    .map(([key, label]) =>
      `<div class="key-row">
         <span class="key-dot key-dot--${key}"></span>
         <span class="key-label">${label}</span>
       </div>`)
    .join('');
}

function renderLegend(container, city) {
  container.innerHTML = Object.entries(city.roadTypes)
    .map(([key, road]) =>
      `<div class="key-row" title="${road.note}">
         <svg class="key-swatch" viewBox="0 0 30 10" aria-hidden="true">
           <line x1="1" y1="5" x2="29" y2="5" class="road road--${key}"
                 stroke-width="${Math.min(road.width, 7)}"/>
         </svg>
         <span class="key-label">${road.label}</span>
         <span class="key-cost">&times;${road.congestion.toFixed(1)}</span>
       </div>`)
    .join('');
}

/* ---------------------------------------------------------------------------
 * Pseudocode panel.
 *
 * Built once, then only classes change. Rebuilding 25 lines on every step
 * would churn the DOM for nothing and would fight the scroll position.
 * -------------------------------------------------------------------------*/

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderPseudocode(container) {
  container.innerHTML = PSEUDOCODE
    .map((text, i) => {
      const n = i + 1;
      return `<div class="pc-line" data-line="${n}">` +
             `<span class="pc-num">${n}</span>` +
             `<code class="pc-text">${escapeHtml(text) || '&nbsp;'}</code>` +
             `<span class="pc-verdict"></span>` +
             `</div>`;
    })
    .join('');
}

/**
 * Light the line (or block of lines) the current event is executing.
 *
 * `verdict` is the detail that earns this panel its place. Lines 8 and 19 are
 * branches, and the same line resolves two opposite ways on different steps:
 * line 19 is RELAX when true and SKIP when false. Labelling the branch
 * outcome turns "here is where we are" into "here is the decision, and here is
 * how it just went".
 */
function highlightPseudocode(container, event) {
  const first = event.line;
  const last = event.lineEnd || event.line;

  for (const row of container.querySelectorAll('.pc-line')) {
    const n = Number(row.dataset.line);
    row.classList.toggle('is-active', n === first);
    row.classList.toggle('is-block', n > first && n <= last);
    const badge = row.querySelector('.pc-verdict');
    if (n === first && event.verdict !== undefined) {
      badge.textContent = event.verdict ? 'true' : 'false';
      badge.className = `pc-verdict is-${event.verdict ? 'true' : 'false'}`;
    } else {
      badge.textContent = '';
      badge.className = 'pc-verdict';
    }
  }

  /* Keep the active line in view WITHOUT scrollIntoView, which would also
     scroll ancestors and can jerk the whole layout. */
  const active = container.querySelector('.pc-line.is-active');
  if (!active) return;
  const target = active.offsetTop - (container.clientHeight - active.offsetHeight) / 2;
  const max = container.scrollHeight - container.clientHeight;
  container.scrollTop = Math.max(0, Math.min(target, max));
}
