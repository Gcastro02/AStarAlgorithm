/* ============================================================================
 * controls.js — Driving the timeline.
 *
 * The search already ran. This is a cursor over a fixed list of states, which
 * is why stepping backward is exactly as simple as stepping forward: there is
 * no state to undo, only an index to move.
 * ==========================================================================*/

function createPlayer(events, onChange) {
  let index = 0;
  let timer = null;
  let interval = 550;

  const clamp = (i) => Math.max(0, Math.min(events.length - 1, i));
  const atEnd = () => index >= events.length - 1;

  const notify = () => onChange(events[index], index, api);

  const api = {
    get index() { return index; },
    get length() { return events.length; },
    get event() { return events[index]; },
    get playing() { return timer !== null; },
    get atEnd() { return atEnd(); },

    goTo(i) {
      const next = clamp(i);
      if (next === index) { notify(); return; }
      index = next;
      notify();
    },

    step() {
      if (atEnd()) { api.pause(); return; }
      api.goTo(index + 1);
    },

    back() {
      api.pause();
      api.goTo(index - 1);
    },

    reset() {
      api.pause();
      api.goTo(0);
    },

    end() {
      api.pause();
      api.goTo(events.length - 1);
    },

    /** Jump to the next event of a given type -- used by "next expansion". */
    nextOfType(type) {
      api.pause();
      for (let i = index + 1; i < events.length; i++) {
        if (events[i].type === type) { api.goTo(i); return; }
      }
      api.end();
    },

    prevOfType(type) {
      api.pause();
      for (let i = index - 1; i >= 0; i--) {
        if (events[i].type === type) { api.goTo(i); return; }
      }
      api.reset();
    },

    play() {
      if (timer) return;
      if (atEnd()) api.goTo(0);
      timer = setInterval(() => {
        if (atEnd()) { api.pause(); return; }
        index = index + 1;
        notify();
      }, interval);
      notify();
    },

    pause() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      notify();
    },

    toggle() { timer ? api.pause() : api.play(); },

    setInterval(ms) {
      interval = ms;
      if (timer) { clearInterval(timer); timer = null; api.play(); }
    },
  };

  return api;
}

/**
 * Wire the DOM controls to a player. Kept separate from createPlayer so the
 * timeline logic can be reasoned about (and tested) without a document.
 */
function bindControls(player, elements) {
  const { back, step, nextPop, play, reset, end, scrub, speed } = elements;

  /* Blur after activating. A clicked button keeps keyboard focus, so a
     subsequent space bar would both re-activate that button AND hit the global
     play/pause shortcut below -- toggling twice and appearing to do nothing. */
  const onClick = (button, action) => {
    button.addEventListener('click', (ev) => {
      action();
      ev.currentTarget.blur();
    });
  };

  onClick(back, () => player.back());
  onClick(step, () => { player.pause(); player.step(); });
  onClick(nextPop, () => player.nextOfType('POP'));
  onClick(play, () => player.toggle());
  onClick(reset, () => player.reset());
  onClick(end, () => player.end());

  scrub.max = String(player.length - 1);
  scrub.addEventListener('input', () => {
    player.pause();
    player.goTo(Number(scrub.value));
  });

  speed.addEventListener('input', () => {
    /* Slider reads left-to-right as slow-to-fast, so invert it. */
    player.setInterval(1150 - Number(speed.value));
  });

  /* Keyboard: the natural way to step through something like this. */
  document.addEventListener('keydown', (ev) => {
    /* ev.target is not always an Element -- a keydown with nothing focused
       targets the document itself, which has no .matches(). Calling it
       unguarded throws and silently kills every keyboard shortcut. */
    const target = ev.target;
    if (target instanceof Element && target.matches('input, textarea, select')) return;
    switch (ev.key) {
      case 'ArrowRight': ev.preventDefault(); player.pause(); player.step(); break;
      case 'ArrowLeft':  ev.preventDefault(); player.back(); break;
      case ' ':          ev.preventDefault(); player.toggle(); break;
      case 'Home':       ev.preventDefault(); player.reset(); break;
      case 'End':        ev.preventDefault(); player.end(); break;
      case 'n': case 'N': ev.preventDefault(); player.nextOfType('POP'); break;
      default: break;
    }
  });
}
