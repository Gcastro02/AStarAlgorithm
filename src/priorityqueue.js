/* ============================================================================
 * priorityqueue.js — A binary min-heap, instrumented for display.
 *
 * Two things make this different from a textbook heap:
 *
 * 1. It supports updating a node's priority in place (add_or_update). A* finds
 *    cheaper routes to nodes it has already discovered, and when that happens
 *    the node's f drops and it must move up the heap. The lazy alternative --
 *    pushing a duplicate entry and ignoring stale pops -- is simpler, but it
 *    would show the viewer the same intersection listed twice in the queue
 *    panel, which is confusing for no benefit at this scale.
 *
 * 2. snapshot() returns the queue's contents in true priority order, so the UI
 *    can show exactly what the algorithm would pop next, next-next, and so on.
 *    Note that heap array order is NOT sorted order -- a heap only guarantees
 *    its root. Reading the raw array would show a subtly wrong queue.
 * ==========================================================================*/

class PriorityQueue {
  /**
   * @param {string} tieBreak  'prefer-larger-g' (default) or 'insertion-order'.
   *   When two nodes have equal f, preferring the larger g favours the node
   *   that is further along a known route rather than one still guessing, which
   *   makes the search visibly straighter. It changes which optimal path is
   *   found when several are tied, never whether the result is optimal.
   */
  constructor(tieBreak = 'prefer-larger-g') {
    this.heap = [];              // array-backed binary heap of entries
    this.positions = new Map();  // node id -> index in this.heap
    this.tieBreak = tieBreak;
    this.sequence = 0;           // insertion counter, for total ordering
  }

  get size() { return this.heap.length; }
  isEmpty() { return this.heap.length === 0; }
  has(id) { return this.positions.has(id); }
  priorityOf(id) {
    const index = this.positions.get(id);
    return index === undefined ? undefined : this.heap[index].f;
  }

  /** Lower comes out first. Must be a strict total order, or pops wobble. */
  compare(a, b) {
    if (a.f !== b.f) return a.f - b.f;
    if (this.tieBreak === 'prefer-larger-g' && a.g !== b.g) return b.g - a.g;
    return a.seq - b.seq;
  }

  /** Insert the node, or move it if it is already queued with a worse f. */
  addOrUpdate(id, f, g, h) {
    const existing = this.positions.get(id);
    if (existing === undefined) {
      const entry = { id, f, g, h, seq: this.sequence++ };
      this.heap.push(entry);
      this.positions.set(id, this.heap.length - 1);
      this.bubbleUp(this.heap.length - 1);
      return 'inserted';
    }
    const entry = this.heap[existing];
    entry.f = f;
    entry.g = g;
    entry.h = h;
    /* f can only ever fall here (we relax to cheaper routes), but sift both
       ways so the heap stays valid even if that assumption is ever broken. */
    this.bubbleUp(existing);
    this.bubbleDown(this.positions.get(id));
    return 'updated';
  }

  pop() {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    this.positions.delete(top.id);
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.positions.set(last.id, 0);
      this.bubbleDown(0);
    }
    return top;
  }

  peek() { return this.heap[0]; }

  /**
   * Contents in true pop order. Copies entries so a caller holding a snapshot
   * cannot be mutated out from under them on the next step -- which matters,
   * because every event keeps one of these forever.
   */
  snapshot() {
    return this.heap
      .map((entry) => ({ ...entry }))
      .sort((a, b) => this.compare(a, b));
  }

  /* -- heap plumbing ----------------------------------------------------- */

  swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.positions.set(this.heap[i].id, i);
    this.positions.set(this.heap[j].id, j);
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.heap[index], this.heap[parent]) >= 0) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  bubbleDown(index) {
    const size = this.heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < size && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  /** Debug assertion: every parent must order before both of its children. */
  checkInvariant() {
    for (let i = 1; i < this.heap.length; i++) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[parent], this.heap[i]) > 0) {
        return `heap property violated at index ${i}`;
      }
      if (this.positions.get(this.heap[i].id) !== i) {
        return `position map stale for ${this.heap[i].id}`;
      }
    }
    return null;
  }
}
