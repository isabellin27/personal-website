/*
 * thesis-runtime.js
 * A tiny front-end "agent runtime": the primitives that let the Thesis Tracker
 * play back a real multi-stage agent pipeline in the browser. No dependencies.
 * These are the same moves a live agent loop makes (dispatch, stream, tool-call,
 * score, persist), rendered so a visitor can watch the system think.
 */
(function () {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // jitter around a base delay so timings feel organic, not scripted
  const beat = (base, spread = 0.35) => {
    const d = base * (1 + (Math.random() * 2 - 1) * spread);
    return sleep(Math.max(40, d));
  };

  const rand = (min, max) => min + Math.random() * (max - min);

  // Type text into an element, word by word, with a soft cursor.
  async function typeInto(el, text, opts = {}) {
    const speed = opts.speed || 18;      // ms per token
    const chunk = opts.chunk || 'word';  // 'word' | 'char'
    el.classList.add('is-typing');
    const tokens = chunk === 'char' ? text.split('') : text.split(/(\s+)/);
    el.textContent = '';
    for (let i = 0; i < tokens.length; i++) {
      el.textContent += tokens[i];
      if (opts.onTick) opts.onTick();
      // punctuation gets a longer beat, whitespace a shorter one
      const t = tokens[i];
      let mult = 1;
      if (/[.,;:]$/.test(t)) mult = 4.5;
      else if (/\s+/.test(t)) mult = 0.4;
      await sleep(speed * mult * rand(0.6, 1.4));
    }
    el.classList.remove('is-typing');
  }

  // Reveal a list of items one at a time (used for bull/bear/catalyst bullets).
  async function revealItems(container, items, buildFn, gap = 220) {
    for (let i = 0; i < items.length; i++) {
      const node = buildFn(items[i], i);
      container.appendChild(node);
      // force reflow then animate in
      void node.offsetWidth;
      node.classList.add('in');
      await beat(gap);
    }
  }

  // Animate a number counting up to a target.
  // Completion is driven by setTimeout (always fires) so the pipeline never
  // hangs; requestAnimationFrame just paints the in-between frames when available.
  function countUp(el, to, opts = {}) {
    return new Promise((resolve) => {
      const dur = opts.duration || 900;
      const decimals = opts.decimals != null ? opts.decimals : 1;
      const from = opts.from || 0;
      const suffix = opts.suffix || '';
      const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const start = now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        el.textContent = to.toFixed(decimals) + suffix;
        resolve();
      };
      function frame() {
        if (finished) return;
        const p = Math.min(1, (now() - start) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = (from + (to - from) * e).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      setTimeout(finish, dur + 30); // guaranteed resolve
    });
  }

  // Grow a horizontal bar to a 0-10 score.
  function growBar(fillEl, score, opts = {}) {
    return new Promise((resolve) => {
      const pct = Math.max(0, Math.min(100, (score / 10) * 100));
      fillEl.style.transition = `width ${opts.duration || 800}ms cubic-bezier(.22,.61,.36,1)`;
      requestAnimationFrame(() => { fillEl.style.width = pct + '%'; });
      setTimeout(resolve, (opts.duration || 800) + 40);
    });
  }

  // A small helper to build DOM without innerHTML soup.
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Console: prints agent-style status lines with a leading glyph.
  function makeConsole(mountEl) {
    return {
      line(text, kind = 'info') {
        const row = el('div', 'tt-console-line tt-console-' + kind);
        const glyph = { info: '›', ok: '✓', run: '•', warn: '!', head: '»' }[kind] || '›';
        row.appendChild(el('span', 'tt-console-glyph', glyph));
        row.appendChild(el('span', 'tt-console-text', text));
        mountEl.appendChild(row);
        void row.offsetWidth;
        row.classList.add('in');
        mountEl.scrollTop = mountEl.scrollHeight;
        return row;
      },
      clear() { mountEl.textContent = ''; },
    };
  }

  window.Runtime = {
    sleep, beat, rand, typeInto, revealItems, countUp, growBar, el, makeConsole,
  };
})();
