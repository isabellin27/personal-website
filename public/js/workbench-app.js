/*
 * workbench-app.js
 * Orchestrates the Desk Workbench demo. Each preset request is routed through
 * the six layers (context -> router -> playbook -> tools -> state -> guardrails),
 * the trace renders in the workspace, and the control plane (limits, audit
 * trail) updates live. Reuses the animation primitives in thesis-runtime.js.
 */
(function () {
  'use strict';
  const R = window.Runtime;
  const MANDATE = window.WB_MANDATE;
  const LAYERS = window.WB_LAYERS;
  const SKILLS = window.WB_SKILLS;
  const REQUESTS = window.WB_REQUESTS;
  const el = R.el;

  let running = false;
  let currentId = REQUESTS[0].id;
  const byId = Object.fromEntries(REQUESTS.map((r) => [r.id, r]));
  let refs = {};
  let auditRows = [];

  /* ---------- build the shell ---------- */
  function build(root) {
    root.textContent = '';

    /* request bar */
    const controls = el('div', 'wb-controls');
    const label = el('div', 'wb-controls-label');
    label.appendChild(el('span', 'wb-controls-k', 'Request'));
    label.appendChild(el('span', 'wb-controls-s', 'what you would type to the desk agent'));
    controls.appendChild(label);
    const chips = el('div', 'wb-chips');
    REQUESTS.forEach((r) => {
      const c = el('button', 'wb-chip' + (r.id === currentId ? ' active' : '') + (r.guard.status === 'block' ? ' danger' : ''));
      c.type = 'button';
      c.textContent = r.chip;
      c.dataset.id = r.id;
      c.addEventListener('click', () => {
        if (running) return;
        currentId = r.id;
        chips.querySelectorAll('.wb-chip').forEach((x) => x.classList.toggle('active', x.dataset.id === r.id));
        renderIdle();
      });
      chips.appendChild(c);
    });
    controls.appendChild(chips);
    const runBtn = el('button', 'wb-run');
    runBtn.type = 'button';
    runBtn.innerHTML = '<span class="wb-run-glyph">▶</span> <span class="wb-run-label">Send request</span>';
    runBtn.addEventListener('click', () => run(currentId));
    controls.appendChild(runBtn);
    refs.runBtn = runBtn;
    root.appendChild(controls);

    /* grid: layer rail | trace | control plane */
    const grid = el('div', 'wb-grid');

    /* left: the six layers */
    const rail = el('div', 'wb-rail');
    rail.appendChild(el('div', 'wb-rail-head', 'The six layers'));
    refs.layerEls = {};
    LAYERS.forEach((L) => {
      const row = el('div', 'wb-layer');
      row.dataset.key = L.key;
      const dot = el('span', 'wb-layer-dot');
      const meta = el('div', 'wb-layer-meta');
      const nm = el('div', 'wb-layer-name');
      nm.appendChild(el('span', 'wb-layer-n', L.n));
      nm.appendChild(el('span', null, L.name));
      meta.appendChild(nm);
      meta.appendChild(el('div', 'wb-layer-sub', L.sub));
      row.appendChild(dot);
      row.appendChild(meta);
      rail.appendChild(row);
      refs.layerEls[L.key] = row;
    });
    rail.appendChild(el('div', 'wb-rail-head', 'Skills'));
    const skl = el('div', 'wb-skill-list');
    refs.skillEls = {};
    SKILLS.forEach((s) => {
      const row = el('div', 'wb-skill');
      row.dataset.cmd = s.cmd;
      const cmd = el('span', 'wb-skill-cmd', s.cmd);
      row.appendChild(cmd);
      row.appendChild(el('span', 'wb-skill-sub', s.sub));
      if (s.nested) row.appendChild(el('span', 'wb-skill-nested', '↳ Thesis Tracker'));
      skl.appendChild(row);
      refs.skillEls[s.cmd] = row;
    });
    rail.appendChild(skl);
    grid.appendChild(rail);

    /* center: the trace workspace */
    const ws = el('div', 'wb-workspace');
    refs.workspace = ws;
    grid.appendChild(ws);

    /* right: the control plane */
    const cp = el('div', 'wb-cplane');
    cp.appendChild(el('div', 'wb-rail-head', 'Control plane'));

    const limitsBox = el('div', 'wb-limits');
    limitsBox.appendChild(el('div', 'wb-box-head', 'Limit usage'));
    refs.limitEls = {};
    MANDATE.limits.forEach((L) => {
      const row = el('div', 'wb-limit');
      const top = el('div', 'wb-limit-top');
      top.appendChild(el('span', 'wb-limit-label', L.label));
      const val = el('span', 'wb-limit-val', L.used.toFixed(1) + ' / ' + L.cap.toFixed(1) + L.unit.replace('% NAV', '%'));
      top.appendChild(val);
      row.appendChild(top);
      const track = el('div', 'wb-limit-track');
      const fill = el('div', 'wb-limit-fill');
      fill.style.width = (L.used / L.cap) * 100 + '%';
      track.appendChild(fill);
      const ghost = el('div', 'wb-limit-ghost');
      track.appendChild(ghost);
      row.appendChild(track);
      limitsBox.appendChild(row);
      refs.limitEls[L.key] = { fill, ghost, val, base: L };
    });
    cp.appendChild(limitsBox);

    const ctrlBox = el('div', 'wb-controls-box');
    ctrlBox.appendChild(el('div', 'wb-box-head', 'Standing controls'));
    MANDATE.controls.forEach((c) => {
      const row = el('div', 'wb-ctrl');
      row.appendChild(el('span', 'wb-ctrl-dot', '✓'));
      row.appendChild(el('span', null, c.label));
      ctrlBox.appendChild(row);
    });
    cp.appendChild(ctrlBox);

    const auditBox = el('div', 'wb-audit');
    const ah = el('div', 'wb-box-head wb-audit-head');
    ah.appendChild(el('span', null, 'Audit trail'));
    ah.appendChild(el('span', 'wb-audit-sub', 'append-only'));
    auditBox.appendChild(ah);
    const alist = el('div', 'wb-audit-list');
    refs.auditList = alist;
    auditBox.appendChild(alist);
    cp.appendChild(auditBox);
    grid.appendChild(cp);

    root.appendChild(grid);
    renderIdle();
    renderAudit();
  }

  function setLayer(key, state) {
    const row = refs.layerEls[key];
    if (!row) return;
    row.classList.remove('running', 'done', 'blocked');
    if (state) row.classList.add(state);
  }
  function resetLayers() {
    LAYERS.forEach((L) => setLayer(L.key, null));
    Object.values(refs.skillEls).forEach((x) => x.classList.remove('active'));
  }

  /* ---------- idle ---------- */
  function renderIdle() {
    const r = byId[currentId];
    resetLayers();
    resetLimits();
    const ws = refs.workspace;
    ws.textContent = '';
    const idle = el('div', 'wb-idle');
    idle.appendChild(el('div', 'wb-idle-k', 'Incoming request'));
    idle.appendChild(el('p', 'wb-idle-prompt', '“' + r.prompt + '”'));
    idle.appendChild(el('p', 'wb-idle-hint', 'Press Send. Watch the request pass through all six layers: the mandate loads, the router picks a skill, tools fire, state is read and written, and the guardrails decide whether it ships.'));
    if (r.guard.status === 'block') {
      const warn = el('p', 'wb-idle-warn', 'This one gets refused. That is the point.');
      idle.appendChild(warn);
    }
    ws.appendChild(idle);
  }

  /* ---------- panels ---------- */
  function addPanel(kicker, title, layerKey) {
    const p = el('div', 'wb-panel');
    const head = el('div', 'wb-panel-head');
    head.appendChild(el('span', 'wb-panel-kicker', kicker));
    if (title) head.appendChild(el('span', 'wb-panel-title', title));
    p.appendChild(head);
    const body = el('div', 'wb-panel-body');
    p.appendChild(body);
    refs.workspace.appendChild(p);
    void p.offsetWidth;
    p.classList.add('in');
    p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return body;
  }

  /* ---------- the run ---------- */
  async function run(id) {
    if (running) return;
    const r = byId[id];
    running = true;
    refs.runBtn.disabled = true;
    refs.runBtn.classList.add('is-running');
    refs.runBtn.querySelector('.wb-run-label').textContent = 'Processing…';
    refs.workspace.textContent = '';
    resetLayers();
    resetLimits();

    try {
      /* request echo */
      const echo = addPanel('Request', null);
      const pr = el('p', 'wb-echo');
      echo.appendChild(pr);
      await R.typeInto(pr, '“' + r.prompt + '”', { speed: 12 });
      await R.beat(180);

      /* Layer 1: context */
      setLayer('context', 'running');
      const ctx = addPanel('Layer 01', 'Mandate & context loaded');
      const fl = el('div', 'wb-files');
      ctx.appendChild(fl);
      for (const name of r.context) {
        const f = MANDATE.files.find((x) => x.name === name);
        const chip = el('div', 'wb-file');
        chip.appendChild(el('span', 'wb-file-icon', '▤'));
        const fm = el('div', null);
        fm.appendChild(el('div', 'wb-file-name', name));
        fm.appendChild(el('div', 'wb-file-role', f ? f.role : 'desk record'));
        chip.appendChild(fm);
        fl.appendChild(chip);
        void chip.offsetWidth; chip.classList.add('in');
        await R.beat(260);
      }
      const cnote = el('p', 'wb-note');
      ctx.appendChild(cnote);
      await R.typeInto(cnote, r.contextNote, { speed: 7 });
      setLayer('context', 'done');
      await R.beat(150);

      /* Layer 2: router */
      setLayer('router', 'running');
      const rt = addPanel('Layer 02', 'Router decision');
      const rrow = el('div', 'wb-route');
      rrow.appendChild(el('span', 'wb-route-arrow', '→'));
      const rcmd = el('span', 'wb-route-cmd', r.skill);
      rrow.appendChild(rcmd);
      const conf = el('span', 'wb-route-conf', '');
      rrow.appendChild(conf);
      rt.appendChild(rrow);
      void rrow.offsetWidth; rrow.classList.add('in');
      await R.countUp(conf, r.confidence * 100, { duration: 700, decimals: 0, suffix: '% confidence' });
      const rwhy = el('p', 'wb-note');
      rt.appendChild(rwhy);
      await R.typeInto(rwhy, r.routerWhy, { speed: 7 });
      if (refs.skillEls[r.skill]) refs.skillEls[r.skill].classList.add('active');
      setLayer('router', 'done');
      await R.beat(150);

      /* Layer 3: playbook */
      setLayer('playbook', 'running');
      const pb = addPanel('Layer 03', 'Skill playbook · ' + r.skill);
      const steps = el('div', 'wb-steps');
      pb.appendChild(steps);
      for (let i = 0; i < r.steps.length; i++) {
        const srow = el('div', 'wb-step');
        srow.appendChild(el('span', 'wb-step-n', String(i + 1)));
        srow.appendChild(el('span', null, r.steps[i]));
        steps.appendChild(srow);
        void srow.offsetWidth; srow.classList.add('in');
        await R.beat(240);
      }
      setLayer('playbook', 'done');
      await R.beat(150);

      /* Layer 4: tools (+ nested app for /thesis) */
      setLayer('tools', 'running');
      const tl = addPanel('Layer 04', r.nested ? 'Delegating to a nested app' : 'Tool calls');
      if (r.nested) {
        await renderNested(tl, r);
      } else {
        const tw = el('div', 'wb-toolchips');
        tl.appendChild(tw);
        for (const t of r.tools) {
          const chip = el('span', 'wb-toolchip');
          chip.appendChild(el('span', 'wb-toolchip-spin'));
          chip.appendChild(el('span', null, t));
          tw.appendChild(chip);
          void chip.offsetWidth; chip.classList.add('in');
          await R.beat(300, 0.4);
          chip.classList.add('done');
          chip.querySelector('.wb-toolchip-spin').textContent = '✓';
        }
      }
      setLayer('tools', 'done');
      await R.beat(150);

      /* Layer 5: state */
      setLayer('state', 'running');
      const st = addPanel('Layer 05', 'State: read, then written');
      const sg = el('div', 'wb-state');
      const sr = el('div', 'wb-state-col');
      sr.appendChild(el('div', 'wb-state-h', 'Reads'));
      r.stateReads.forEach((x) => sr.appendChild(el('div', 'wb-state-row read', x)));
      const sw = el('div', 'wb-state-col');
      sw.appendChild(el('div', 'wb-state-h', 'Writes'));
      r.stateWrites.forEach((x) => sw.appendChild(el('div', 'wb-state-row write', x)));
      sg.appendChild(sr); sg.appendChild(sw);
      st.appendChild(sg);
      void sg.offsetWidth; sg.classList.add('in');
      setLayer('state', 'done');
      await R.beat(200);

      /* Layer 6: guardrails */
      const blocked = r.guard.status === 'block';
      setLayer('guardrails', 'running');
      const gd = addPanel('Layer 06', 'Guardrail checks');
      for (const c of r.guard.checks) {
        const row = el('div', 'wb-check ' + (c.ok ? 'ok' : (c.hard ? 'hard' : 'soft')));
        row.appendChild(el('span', 'wb-check-glyph', c.ok ? '✓' : (c.hard ? '✕' : '!')));
        const cm = el('div', null);
        cm.appendChild(el('div', 'wb-check-name', c.name));
        cm.appendChild(el('div', 'wb-check-note', c.note));
        row.appendChild(cm);
        gd.appendChild(row);
        void row.offsetWidth; row.classList.add('in');
        await R.beat(320);
      }
      if (blocked) {
        setLayer('guardrails', 'blocked');
        flashLimits(r);
      } else {
        setLayer('guardrails', 'done');
      }
      await R.beat(220);

      /* Output */
      await renderOutput(r);

      /* Handoff */
      if (r.handoff) {
        const hf = addPanel('Handoff', null);
        const hrow = el('div', 'wb-handoff');
        hrow.appendChild(el('span', 'wb-handoff-k', 'Suggested next'));
        hrow.appendChild(el('span', 'wb-route-cmd', r.handoff.skill));
        hf.appendChild(hrow);
        const hwhy = el('p', 'wb-note');
        hf.appendChild(hwhy);
        void hrow.offsetWidth; hrow.classList.add('in');
        await R.typeInto(hwhy, r.handoff.why, { speed: 7 });
      }

      /* Audit trail */
      pushAudit(r);
    } catch (e) { /* interrupted */ }

    running = false;
    refs.runBtn.disabled = false;
    refs.runBtn.classList.remove('is-running');
    refs.runBtn.querySelector('.wb-run-label').textContent = 'Send again';
  }

  /* ---------- nested Thesis Tracker ---------- */
  async function renderNested(mount, r) {
    const box = el('div', 'wb-nested');
    const bh = el('div', 'wb-nested-head');
    bh.appendChild(el('span', 'wb-nested-badge', 'NESTED APP'));
    bh.appendChild(el('span', 'wb-nested-name', r.nested.app));
    box.appendChild(bh);
    const stages = el('div', 'wb-nested-stages');
    box.appendChild(stages);
    mount.appendChild(box);
    void box.offsetWidth; box.classList.add('in');
    for (const s of r.nested.stages) {
      const chip = el('span', 'wb-nested-stage');
      chip.appendChild(el('span', 'wb-toolchip-spin'));
      chip.appendChild(el('span', null, s));
      stages.appendChild(chip);
      void chip.offsetWidth; chip.classList.add('in');
      await R.beat(360, 0.3);
      chip.classList.add('done');
      chip.querySelector('.wb-toolchip-spin').textContent = '✓';
    }
    const res = el('div', 'wb-nested-result');
    box.appendChild(res);
    await R.typeInto(res, r.nested.result, { speed: 9 });
    const link = el('a', 'wb-nested-link');
    link.href = r.nested.href;
    link.textContent = 'Open the Thesis Tracker and watch this pipeline run in full →';
    box.appendChild(link);
  }

  /* ---------- outputs ---------- */
  async function renderOutput(r) {
    const o = r.output;
    if (o.kind === 'table') {
      const body = addPanel('Output', o.title);
      const tbl = el('div', 'wb-table');
      const hr = el('div', 'wb-tr wb-th');
      o.cols.forEach((c) => hr.appendChild(el('div', 'wb-td', c)));
      tbl.appendChild(hr);
      body.appendChild(tbl);
      for (const row of o.rows) {
        const tr = el('div', 'wb-tr');
        row.forEach((cell, i) => tr.appendChild(el('div', 'wb-td' + (i === 0 ? ' first' : ''), cell)));
        tbl.appendChild(tr);
        void tr.offsetWidth; tr.classList.add('in');
        await R.beat(220);
      }
      if (o.note) {
        const n = el('p', 'wb-note');
        body.appendChild(n);
        await R.typeInto(n, o.note, { speed: 6 });
      }
    } else if (o.kind === 'termsheet') {
      const body = addPanel('Output', o.title);
      const doc = el('div', 'wb-doc');
      const dh = el('div', 'wb-doc-head');
      dh.appendChild(el('span', 'wb-doc-title', o.title));
      dh.appendChild(el('span', 'wb-doc-badge', o.badge));
      doc.appendChild(dh);
      const rows = el('div', 'wb-ts');
      doc.appendChild(rows);
      body.appendChild(doc);
      void doc.offsetWidth; doc.classList.add('in');
      for (const [k, v] of o.rows) {
        const tr = el('div', 'wb-ts-row');
        tr.appendChild(el('span', 'wb-ts-k', k));
        tr.appendChild(el('span', 'wb-ts-v', v));
        rows.appendChild(tr);
        void tr.offsetWidth; tr.classList.add('in');
        await R.beat(160);
      }
      const n = el('p', 'wb-note');
      body.appendChild(n);
      await R.typeInto(n, o.note, { speed: 6 });
    } else if (o.kind === 'memo') {
      const body = addPanel('Output', o.title);
      const doc = el('div', 'wb-doc');
      const dh = el('div', 'wb-doc-head');
      dh.appendChild(el('span', 'wb-doc-title', o.title));
      dh.appendChild(el('span', 'wb-doc-badge', o.badge));
      doc.appendChild(dh);
      const mb = el('div', 'wb-doc-body');
      doc.appendChild(mb);
      body.appendChild(doc);
      void doc.offsetWidth; doc.classList.add('in');
      await R.typeInto(mb, o.body, { speed: 3 });
      const n = el('p', 'wb-note');
      body.appendChild(n);
      await R.typeInto(n, o.note, { speed: 6 });
    } else if (o.kind === 'block') {
      const body = addPanel('Output', o.title);
      const bl = el('div', 'wb-blocked');
      const bh = el('div', 'wb-blocked-head');
      bh.appendChild(el('span', 'wb-blocked-glyph', '✕'));
      bh.appendChild(el('span', null, 'REQUEST REFUSED'));
      bl.appendChild(bh);
      const hl = el('p', 'wb-blocked-line');
      bl.appendChild(hl);
      body.appendChild(bl);
      void bl.offsetWidth; bl.classList.add('in');
      await R.typeInto(hl, o.headline, { speed: 10 });
      const ul = el('div', 'wb-blocked-reasons');
      bl.appendChild(ul);
      for (const reason of o.reasons) {
        const li = el('div', 'wb-blocked-reason');
        li.appendChild(el('span', 'wb-check-glyph', '✕'));
        li.appendChild(el('span', null, reason));
        ul.appendChild(li);
        void li.offsetWidth; li.classList.add('in');
        await R.beat(260);
      }
      const use = el('div', 'wb-useful');
      use.appendChild(el('div', 'wb-useful-h', o.useful.head));
      bl.appendChild(use);
      for (const line of o.useful.lines) {
        const li = el('div', 'wb-useful-line');
        li.appendChild(el('span', 'wb-useful-glyph', '→'));
        const sp = el('span', null);
        li.appendChild(sp);
        use.appendChild(li);
        void li.offsetWidth; li.classList.add('in');
        await R.typeInto(sp, line, { speed: 5 });
      }
      const n = el('p', 'wb-note wb-note-block');
      bl.appendChild(n);
      await R.typeInto(n, o.note, { speed: 7 });
    } else if (o.kind === 'nested') {
      const body = addPanel('Output', o.title);
      const n = el('p', 'wb-note');
      body.appendChild(n);
      await R.typeInto(n, o.note, { speed: 7 });
    }
  }

  /* ---------- control plane ---------- */
  function resetLimits() {
    MANDATE.limits.forEach((L) => {
      const ref = refs.limitEls[L.key];
      if (!ref) return;
      ref.fill.style.width = (L.used / L.cap) * 100 + '%';
      ref.fill.classList.remove('breach');
      ref.ghost.style.width = '0%';
      ref.val.textContent = L.used.toFixed(1) + ' / ' + L.cap.toFixed(1) + '%';
      ref.val.classList.remove('breach');
    });
  }
  function flashLimits(r) {
    /* the blocked request tries to add 5% NVDA: show the attempted breach */
    const attempts = { single: 8.6, sector: 27.4 };
    MANDATE.limits.forEach((L) => {
      const ref = refs.limitEls[L.key];
      const att = attempts[L.key];
      if (!ref || !att) return;
      ref.ghost.style.width = Math.min(100, (att / L.cap) * 100) + '%';
      ref.fill.classList.add('breach');
      ref.val.textContent = att.toFixed(1) + ' / ' + L.cap.toFixed(1) + '%  ✕';
      ref.val.classList.add('breach');
    });
  }
  function pushAudit(r) {
    auditRows.unshift({
      t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: r.audit.action,
      detail: r.audit.detail,
      status: r.audit.status,
      blocked: r.guard.status === 'block',
    });
    renderAudit(true);
  }
  function renderAudit(justPushed) {
    const mount = refs.auditList;
    mount.textContent = '';
    if (!auditRows.length) {
      mount.appendChild(el('div', 'wb-audit-empty', 'No entries yet. Every request lands here, including the refused ones.'));
      return;
    }
    auditRows.forEach((a, i) => {
      const row = el('div', 'wb-audit-row' + (a.blocked ? ' blocked' : '') + (i === 0 && justPushed ? ' just' : ''));
      const top = el('div', 'wb-audit-top');
      top.appendChild(el('span', 'wb-audit-action', a.action));
      top.appendChild(el('span', 'wb-audit-time', a.t));
      row.appendChild(top);
      row.appendChild(el('div', 'wb-audit-detail', a.detail));
      row.appendChild(el('div', 'wb-audit-status', a.status));
      mount.appendChild(row);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    const root = document.getElementById('wb-app');
    if (!root || !REQUESTS.length) return;
    const m = /#run=([a-z-]+)/.exec(location.hash || '');
    if (m && byId[m[1]]) currentId = m[1];
    build(root);
    if (m && byId[m[1]]) setTimeout(() => run(currentId), 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
