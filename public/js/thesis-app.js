/*
 * thesis-app.js
 * Orchestrates the Thesis Tracker demo: builds the UI, runs the staged agent
 * pipeline (Source -> Analyze -> Score -> Brief -> Track), and maintains a
 * persistent watchlist in localStorage so re-runs show conviction drift.
 */
(function () {
  'use strict';
  const R = window.Runtime;
  const DATA = (window.THESIS_DATA || []).slice();
  const byTicker = Object.fromEntries(DATA.map((d) => [d.ticker, d]));
  const LS_KEY = 'tt_watchlist_v2';

  const STAGES = [
    { key: 'source', name: 'Source', sub: 'pull filings, price, news' },
    { key: 'analyze', name: 'Analyze', sub: 'bull · bear · catalyst agents' },
    { key: 'score', name: 'Score', sub: 'weighted conviction model' },
    { key: 'brief', name: 'Brief', sub: 'one-page memo, her voice' },
    { key: 'track', name: 'Track', sub: 'log to watchlist, measure drift' },
  ];

  let running = false;
  let currentTicker = DATA.length ? DATA[0].ticker : null;

  // ---- persistence -------------------------------------------------------
  function loadList() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; }
    catch (e) { return null; }
  }
  function saveList(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function seedIfEmpty() {
    if (loadList()) return;
    // Seed so the tracker reads as a living log, not an empty box.
    const now = Date.now();
    const seed = ['TSM', 'VRT'].map((t, i) => {
      const d = byTicker[t];
      if (!d) return null;
      return {
        ticker: t, name: d.name, direction: d.direction,
        conviction: d.priorConviction, prior: d.priorConviction,
        label: d.convictionLabel, ts: now - (i + 1) * 36e5 * 20,
      };
    }).filter(Boolean);
    saveList(seed);
  }
  function upsert(entry) {
    const list = loadList() || [];
    const existing = list.find((x) => x.ticker === entry.ticker);
    entry.prior = existing ? existing.conviction : entry.prior;
    const next = list.filter((x) => x.ticker !== entry.ticker);
    next.push(entry);
    saveList(next);
    return entry.prior;
  }

  // ---- small helpers -----------------------------------------------------
  const el = R.el;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function jitter(v, amt) { return clamp(+(v + R.rand(-amt, amt)).toFixed(1), 0, 10); }
  function timeAgo(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function driftMark(delta) {
    if (delta > 0.05) return { cls: 'up', glyph: '▲', txt: '+' + delta.toFixed(1) };
    if (delta < -0.05) return { cls: 'down', glyph: '▼', txt: delta.toFixed(1) };
    return { cls: 'flat', glyph: '–', txt: '0.0' };
  }

  // ---- build the shell ---------------------------------------------------
  let refs = {};
  function build(root) {
    root.textContent = '';

    // Controls
    const controls = el('div', 'tt-controls');
    const pickWrap = el('div', 'tt-picker');
    pickWrap.appendChild(el('span', 'tt-picker-label', 'Idea'));
    const chips = el('div', 'tt-chips');
    DATA.forEach((d) => {
      const c = el('button', 'tt-chip' + (d.ticker === currentTicker ? ' active' : ''));
      c.type = 'button';
      c.appendChild(el('span', 'tt-chip-tick', d.ticker));
      c.dataset.ticker = d.ticker;
      c.addEventListener('click', () => {
        if (running) return;
        currentTicker = d.ticker;
        chips.querySelectorAll('.tt-chip').forEach((x) => x.classList.toggle('active', x.dataset.ticker === d.ticker));
        renderIdle();
      });
      chips.appendChild(c);
    });
    pickWrap.appendChild(chips);
    controls.appendChild(pickWrap);

    const runBtn = el('button', 'tt-run');
    runBtn.type = 'button';
    runBtn.innerHTML = '<span class="tt-run-glyph">▶</span> <span class="tt-run-label">Run pipeline</span>';
    runBtn.addEventListener('click', () => run(currentTicker));
    controls.appendChild(runBtn);
    refs.runBtn = runBtn;
    root.appendChild(controls);

    // Grid: rail | workspace | tracker
    const grid = el('div', 'tt-grid');

    const rail = el('div', 'tt-rail');
    const railHead = el('div', 'tt-rail-head', 'Pipeline');
    rail.appendChild(railHead);
    const stageList = el('div', 'tt-stage-list');
    refs.stageEls = {};
    STAGES.forEach((s, i) => {
      const row = el('div', 'tt-stage', null);
      row.dataset.key = s.key;
      const dot = el('span', 'tt-stage-dot');
      const meta = el('div', 'tt-stage-meta');
      const nm = el('div', 'tt-stage-name');
      nm.appendChild(el('span', 'tt-stage-idx', String(i + 1)));
      nm.appendChild(el('span', null, s.name));
      meta.appendChild(nm);
      meta.appendChild(el('div', 'tt-stage-sub', s.sub));
      row.appendChild(dot);
      row.appendChild(meta);
      stageList.appendChild(row);
      refs.stageEls[s.key] = row;
    });
    rail.appendChild(stageList);
    const consoleEl = el('div', 'tt-console');
    rail.appendChild(consoleEl);
    refs.console = R.makeConsole(consoleEl);
    grid.appendChild(rail);

    // Workspace
    const ws = el('div', 'tt-workspace');
    refs.workspace = ws;
    grid.appendChild(ws);

    // Tracker
    const tracker = el('div', 'tt-tracker');
    const th = el('div', 'tt-tracker-head');
    th.appendChild(el('span', null, 'Watchlist'));
    const clr = el('button', 'tt-tracker-clear', 'reset');
    clr.type = 'button';
    clr.addEventListener('click', () => { localStorage.removeItem(LS_KEY); seedIfEmpty(); renderWatchlist(); });
    th.appendChild(clr);
    tracker.appendChild(th);
    const twrap = el('div', 'tt-tracker-list');
    refs.trackerList = twrap;
    tracker.appendChild(twrap);
    tracker.appendChild(el('div', 'tt-tracker-note', 'Persists in your browser. Re-run an idea to see conviction drift.'));
    grid.appendChild(tracker);

    root.appendChild(grid);

    renderIdle();
    renderWatchlist();
  }

  function setStage(key, state) {
    const row = refs.stageEls[key];
    if (!row) return;
    row.classList.remove('running', 'done');
    if (state) row.classList.add(state);
  }
  function resetStages() { STAGES.forEach((s) => setStage(s.key, null)); }

  // ---- idle state --------------------------------------------------------
  function renderIdle() {
    const d = byTicker[currentTicker];
    refs.console.clear();
    refs.console.line('agent runtime · idle', 'head');
    refs.console.line('press Run to dispatch the pipeline', 'info');
    resetStages();
    const ws = refs.workspace;
    ws.textContent = '';
    const idle = el('div', 'tt-idle');
    idle.appendChild(el('div', 'tt-idle-tick', d ? d.ticker : ''));
    idle.appendChild(el('div', 'tt-idle-name', d ? d.name : ''));
    idle.appendChild(el('div', 'tt-idle-sector', d ? d.sector : ''));
    const badge = el('span', 'tt-dir tt-dir-' + (d ? d.direction : 'long'), d ? d.direction.toUpperCase() : '');
    idle.appendChild(badge);
    idle.appendChild(el('p', 'tt-idle-hint', 'Press Run pipeline. Five agents source the data, argue both sides, score conviction, and draft a dated memo in about twenty seconds.'));
    ws.appendChild(idle);
  }

  // ---- the run -----------------------------------------------------------
  async function run(ticker) {
    if (running) return;
    const d = byTicker[ticker];
    if (!d) return;
    running = true;
    refs.runBtn.disabled = true;
    refs.runBtn.classList.add('is-running');
    refs.runBtn.querySelector('.tt-run-label').textContent = 'Running…';
    refs.console.clear();
    resetStages();
    refs.workspace.textContent = '';

    const con = refs.console;
    con.line('agent runtime · session ' + Math.random().toString(36).slice(2, 8), 'head');
    con.line('target ' + d.ticker + ' · ' + d.name, 'info');

    try {
      await stageSource(d, con);
      const scored = await stageAnalyzeAndScore(d, con);
      await stageBrief(d, con);
      await stageTrack(d, con, scored);
      con.line('pipeline complete', 'ok');
    } catch (e) {
      con.line('run interrupted', 'warn');
    }

    running = false;
    refs.runBtn.disabled = false;
    refs.runBtn.classList.remove('is-running');
    refs.runBtn.querySelector('.tt-run-label').textContent = 'Run again';
  }

  // Stage 1: Source
  async function stageSource(d, con) {
    setStage('source', 'running');
    con.line('dispatching source agents', 'run');
    const panel = addPanel('01 · Source', 'documents + market data');
    const chipWrap = el('div', 'tt-toolchips');
    panel.body.appendChild(chipWrap);
    for (const t of d.toolCalls) {
      const chip = el('span', 'tt-toolchip');
      chip.appendChild(el('span', 'tt-toolchip-spin'));
      chip.appendChild(el('span', 'tt-toolchip-txt', t));
      chipWrap.appendChild(chip);
      void chip.offsetWidth; chip.classList.add('in');
      await R.beat(320, 0.4);
      chip.classList.add('done');
      chip.querySelector('.tt-toolchip-spin').textContent = '✓';
      con.line('sourced · ' + t, 'ok');
    }
    // thesis line reveal
    const line = el('p', 'tt-thesisline');
    panel.body.appendChild(line);
    await R.typeInto(line, '“' + d.oneLiner + '”', { speed: 10 });
    setStage('source', 'done');
    await R.beat(200);
  }

  // Stage 2 + 3: Analyze (parallel columns) then Score
  async function stageAnalyzeAndScore(d, con) {
    setStage('analyze', 'running');
    con.line('fanning out 3 analysis agents: bull, bear, catalyst', 'run');
    const panel = addPanel('02 · Analyze', 'three agents, opposing briefs');
    const cols = el('div', 'tt-analyze');
    const specs = [
      { key: 'bull', title: 'Bull', items: d.bull },
      { key: 'bear', title: 'Bear', items: d.bear },
      { key: 'catalyst', title: 'Catalysts', items: d.catalysts },
    ];
    const colBodies = {};
    specs.forEach((s) => {
      const c = el('div', 'tt-col tt-col-' + s.key);
      c.appendChild(el('div', 'tt-col-head', s.title));
      const b = el('div', 'tt-col-body');
      c.appendChild(b);
      cols.appendChild(c);
      colBodies[s.key] = b;
    });
    panel.body.appendChild(cols);

    // stream all three columns in parallel
    await Promise.all(specs.map((s) => streamColumn(colBodies[s.key], s, con)));
    setStage('analyze', 'done');

    // Stage 3: Score
    setStage('score', 'running');
    con.line('scoring · weighted conviction model', 'run');
    const sPanel = addPanel('03 · Score', 'conviction 0 to 10');
    const scored = renderScore(sPanel.body, d);
    await scored.animate();
    con.line('conviction ' + scored.conviction.toFixed(1) + ' / 10 · ' + d.convictionLabel, 'ok');
    setStage('score', 'done');
    await R.beat(200);
    return scored;
  }

  async function streamColumn(body, spec, con) {
    for (let i = 0; i < spec.items.length; i++) {
      const it = spec.items[i];
      const row = el('div', 'tt-point');
      const head = el('div', 'tt-point-head');
      if (it.when) head.appendChild(el('span', 'tt-point-when', it.when));
      head.appendChild(el('span', 'tt-point-title', it.title));
      row.appendChild(head);
      const det = el('div', 'tt-point-detail');
      row.appendChild(det);
      body.appendChild(row);
      void row.offsetWidth; row.classList.add('in');
      await R.typeInto(det, it.detail, { speed: 6 });
      await R.beat(90, 0.5);
    }
    con.line(spec.key + ' brief ready · ' + spec.items.length + ' points', 'ok');
  }

  function renderScore(mount, d) {
    const wrap = el('div', 'tt-score');
    // gauge
    const gauge = el('div', 'tt-gauge');
    const gv = el('div', 'tt-gauge-val', '0.0');
    gauge.appendChild(gv);
    gauge.appendChild(el('div', 'tt-gauge-max', '/ 10'));
    const gring = el('div', 'tt-gauge-ring');
    gauge.appendChild(gring);
    const gLabel = el('div', 'tt-gauge-label', '');
    const gaugeCol = el('div', 'tt-gauge-col');
    gaugeCol.appendChild(gauge);
    gaugeCol.appendChild(gLabel);
    wrap.appendChild(gaugeCol);

    // component bars
    const bars = el('div', 'tt-bars');
    const comps = [
      ['Fundamentals', 'fundamentals'], ['Valuation', 'valuation'],
      ['Catalyst', 'catalyst'], ['Moat', 'moat'], ['Risk (lower is safer)', 'risk'],
    ];
    const jittered = {};
    const barFills = [];
    comps.forEach(([label, key]) => {
      const v = jitter(d.scores[key], 0.3);
      jittered[key] = v;
      const row = el('div', 'tt-bar');
      const top = el('div', 'tt-bar-top');
      top.appendChild(el('span', 'tt-bar-label', label));
      const val = el('span', 'tt-bar-val', '');
      top.appendChild(val);
      row.appendChild(top);
      const track = el('div', 'tt-bar-track');
      const fill = el('div', 'tt-bar-fill' + (key === 'risk' ? ' risk' : ''));
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
      barFills.push({ fill, val, v });
    });
    wrap.appendChild(bars);

    // risk flags
    const flags = el('div', 'tt-flags');
    flags.appendChild(el('div', 'tt-flags-head', 'Risk flags'));
    d.riskFlags.forEach((f) => {
      const fr = el('div', 'tt-flag');
      fr.appendChild(el('span', 'tt-flag-glyph', '!'));
      fr.appendChild(el('span', null, f));
      flags.appendChild(fr);
    });
    wrap.appendChild(flags);
    mount.appendChild(wrap);

    const conviction = jitter(d.conviction, 0.35);
    async function animate() {
      // bars
      await Promise.all(barFills.map(async (b, i) => {
        await R.beat(120 * i, 0.2);
        R.countUp(b.val, b.v, { duration: 700, decimals: 1 });
        return R.growBar(b.fill, b.v, { duration: 720 });
      }));
      // gauge
      gring.style.setProperty('--pct', (conviction / 10) * 100);
      gring.classList.add('lit');
      gauge.classList.add('lit-' + convictionTier(conviction));
      await R.countUp(gv, conviction, { duration: 1000, decimals: 1 });
      gLabel.textContent = d.convictionLabel;
      void gLabel.offsetWidth; gLabel.classList.add('in');
    }
    return { conviction, scores: jittered, animate };
  }

  function convictionTier(v) { return v >= 7.5 ? 'high' : v >= 6 ? 'mid' : 'low'; }

  // Stage 4: Brief
  async function stageBrief(d, con) {
    setStage('brief', 'running');
    con.line('drafting brief · voice: Isabel Lin', 'run');
    const panel = addPanel('04 · Brief', 'dated memo, ready to send');
    const doc = el('div', 'tt-memo');
    const docHead = el('div', 'tt-memo-head');
    docHead.appendChild(el('span', 'tt-memo-tick', d.ticker + ' · ' + d.name));
    docHead.appendChild(el('span', 'tt-memo-tag', 'DRAFT'));
    doc.appendChild(docHead);
    const bodyEl = el('div', 'tt-memo-body');
    doc.appendChild(bodyEl);
    panel.body.appendChild(doc);
    await R.typeInto(bodyEl, d.memo, { speed: 4 });
    // download affordance
    const actions = el('div', 'tt-memo-actions');
    const dl = el('button', 'tt-memo-dl', '↓ Download memo');
    dl.type = 'button';
    dl.addEventListener('click', () => downloadMemo(d));
    actions.appendChild(dl);
    actions.appendChild(el('span', 'tt-memo-foot', 'Warm but serious. Direct. No em dashes. Quantified. Her house style.'));
    panel.body.appendChild(actions);
    con.line('brief drafted · ' + d.memo.split(/\s+/).length + ' words', 'ok');
    setStage('brief', 'done');
    await R.beat(200);
  }

  function downloadMemo(d) {
    const text = d.ticker + ' · ' + d.name + '\nThesis memo (demo, illustrative data)\n\n' + d.memo + '\n';
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = d.ticker + '-thesis-memo.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Stage 5: Track
  async function stageTrack(d, con, scored) {
    setStage('track', 'running');
    con.line('logging to watchlist', 'run');
    const entry = {
      ticker: d.ticker, name: d.name, direction: d.direction,
      conviction: scored.conviction, prior: d.priorConviction,
      label: d.convictionLabel, ts: Date.now(),
    };
    const prior = upsert(entry);
    const delta = scored.conviction - prior;
    renderWatchlist(d.ticker);
    const m = driftMark(delta);
    con.line('tracked ' + d.ticker + ' · conviction ' + scored.conviction.toFixed(1) + ' · drift ' + m.txt + ' since last run', 'ok');
    await R.beat(300);
    setStage('track', 'done');
  }

  // ---- workspace panels --------------------------------------------------
  function addPanel(title, sub) {
    const p = el('div', 'tt-panel');
    const head = el('div', 'tt-panel-head');
    head.appendChild(el('span', 'tt-panel-title', title));
    if (sub) head.appendChild(el('span', 'tt-panel-sub', sub));
    p.appendChild(head);
    const body = el('div', 'tt-panel-body');
    p.appendChild(body);
    refs.workspace.appendChild(p);
    void p.offsetWidth; p.classList.add('in');
    p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return { panel: p, body };
  }

  // ---- watchlist rendering ----------------------------------------------
  function renderWatchlist(justRan) {
    const list = (loadList() || []).slice().sort((a, b) => b.conviction - a.conviction);
    const mount = refs.trackerList;
    mount.textContent = '';
    if (!list.length) {
      mount.appendChild(el('div', 'tt-tracker-empty', 'No ideas tracked yet.'));
      return;
    }
    list.forEach((x) => {
      const delta = x.conviction - x.prior;
      const m = driftMark(delta);
      const row = el('div', 'tt-trow' + (x.ticker === justRan ? ' just' : ''));
      const left = el('div', 'tt-trow-left');
      const tk = el('div', 'tt-trow-tick');
      tk.appendChild(el('span', null, x.ticker));
      tk.appendChild(el('span', 'tt-trow-dir tt-dir-' + x.direction, x.direction));
      left.appendChild(tk);
      left.appendChild(el('div', 'tt-trow-time', timeAgo(x.ts)));
      row.appendChild(left);
      const right = el('div', 'tt-trow-right');
      const conv = el('div', 'tt-trow-conv tier-' + convictionTier(x.conviction), x.conviction.toFixed(1));
      right.appendChild(conv);
      const drift = el('div', 'tt-trow-drift ' + m.cls);
      drift.appendChild(el('span', 'tt-drift-glyph', m.glyph));
      drift.appendChild(el('span', null, m.txt));
      right.appendChild(drift);
      row.appendChild(right);
      mount.appendChild(row);
    });
  }

  // ---- boot --------------------------------------------------------------
  function boot() {
    const root = document.getElementById('tt-app');
    if (!root || !DATA.length) return;
    seedIfEmpty();
    // Deep link: /thesis-tracker#run=NVDA auto-selects and runs that idea.
    const m = /#run=([A-Za-z]+)/.exec(location.hash || '');
    if (m && byTicker[m[1].toUpperCase()]) currentTicker = m[1].toUpperCase();
    build(root);
    if (m && byTicker[m[1].toUpperCase()]) setTimeout(() => run(currentTicker), 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
