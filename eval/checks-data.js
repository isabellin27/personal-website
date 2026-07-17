/*
 * eval/checks-data.js
 * Static accuracy checks over the demo datasets:
 *  - schema and range validation
 *  - voice rules (no em dashes, no filler) across data AND views
 *  - internal arithmetic (limit math, headroom claims, pricing, drift)
 *  - cross-file consistency between the Workbench and the Thesis Tracker
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, walkStrings, assert, near } = require('./lib');

const BANNED = [
  '—',            // em dash
  '&mdash;',
  'I hope this finds you well',
  'leverage synergies',
  'robust tailwinds',
  'well-positioned',
];

function scanStringsForBanned(tree, label, rep) {
  rep.check('Voice', `${label}: no em dashes or banned filler`, () => {
    const hits = [];
    walkStrings(tree, (s, trail) => {
      for (const b of BANNED) {
        if (s.toLowerCase().includes(b.toLowerCase())) hits.push(`${trail}: "${b}"`);
      }
    });
    assert(hits.length === 0, hits.slice(0, 5).join('; '));
    return 'clean';
  });
}

function checkThesis(win, rep) {
  const DATA = win.THESIS_DATA;
  rep.check('Thesis schema', '5 unique tickers', () => {
    assert(Array.isArray(DATA) && DATA.length === 5, `got ${DATA && DATA.length}`);
    assert(new Set(DATA.map((d) => d.ticker)).size === 5, 'duplicate tickers');
    return DATA.map((d) => d.ticker).join(', ');
  });

  for (const d of DATA) {
    rep.check('Thesis schema', `${d.ticker}: required fields + ranges`, () => {
      for (const k of ['ticker', 'name', 'sector', 'direction', 'oneLiner', 'snapshot', 'bull', 'bear', 'catalysts', 'scores', 'conviction', 'convictionLabel', 'priorConviction', 'riskFlags', 'memo', 'toolCalls']) {
        assert(d[k] != null, `missing ${k}`);
      }
      assert(['long', 'short', 'nuanced'].includes(d.direction), `bad direction ${d.direction}`);
      const sk = Object.keys(d.scores).sort().join(',');
      assert(sk === 'catalyst,fundamentals,moat,risk,valuation', `score keys ${sk}`);
      for (const [k, v] of Object.entries(d.scores)) assert(v >= 0 && v <= 10, `${k}=${v} out of 0-10`);
      assert(d.conviction >= 0 && d.conviction <= 10, `conviction ${d.conviction}`);
      assert(d.priorConviction >= 0 && d.priorConviction <= 10, `prior ${d.priorConviction}`);
      assert(d.bull.length >= 3 && d.bull.length <= 4, `bull ${d.bull.length}`);
      assert(d.bear.length >= 3 && d.bear.length <= 4, `bear ${d.bear.length}`);
      assert(d.catalysts.length >= 3 && d.catalysts.length <= 4, `catalysts ${d.catalysts.length}`);
      assert(d.riskFlags.length >= 2 && d.riskFlags.length <= 3, `riskFlags ${d.riskFlags.length}`);
      assert(d.toolCalls.length >= 4 && d.toolCalls.length <= 6, `toolCalls ${d.toolCalls.length}`);
      for (const c of d.catalysts) assert(c.when && c.title && c.detail, 'catalyst missing when/title/detail');
    });
    rep.check('Thesis content', `${d.ticker}: memo dated + length in band`, () => {
      const words = d.memo.trim().split(/\s+/).length;
      assert(d.memo.includes('July 2026'), 'memo not dated July 2026');
      assert(words >= 150 && words <= 270, `memo ${words} words, want 150-270`);
      return `${words} words`;
    });
    rep.check('Thesis content', `${d.ticker}: conviction drift in 0.2-1.5 band`, () => {
      const drift = Math.abs(d.conviction - d.priorConviction);
      assert(drift >= 0.2 - 1e-9 && drift <= 1.5 + 1e-9, `drift ${drift.toFixed(2)}`);
      return `drift ${(d.conviction - d.priorConviction).toFixed(1)}`;
    });
  }
  scanStringsForBanned(DATA, 'thesis-data', rep);
}

function parseBook(MANDATE) {
  const book = MANDATE.files.find((f) => f.name === 'book.csv');
  const positions = {};
  for (const m of book.lines.join(' ').matchAll(/([A-Z]{2,5}) (\d+(?:\.\d+)?)%/g)) {
    positions[m[1]] = parseFloat(m[2]);
  }
  const sectorTotal = parseFloat((book.lines.join(' ').match(/:\s*(\d+(?:\.\d+)?)% of NAV/) || [])[1]);
  return { positions, sectorTotal };
}

function checkWorkbench(win, rep) {
  const M = win.WB_MANDATE;
  const REQ = win.WB_REQUESTS;
  const SKILLS = win.WB_SKILLS.map((s) => s.cmd);
  const FILES = M.files.map((f) => f.name);

  rep.check('Workbench schema', 'mandate: 4 files, 2 limits, 4 controls', () => {
    assert(M.files.length === 4 && M.limits.length === 2 && M.controls.length === 4,
      `${M.files.length}/${M.limits.length}/${M.controls.length}`);
    for (const L of M.limits) assert(L.used < L.cap, `${L.key} used ${L.used} >= cap ${L.cap}`);
  });

  const { positions, sectorTotal } = parseBook(M);
  const single = M.limits.find((l) => l.key === 'single');
  const sector = M.limits.find((l) => l.key === 'sector');

  rep.check('Workbench math', 'book positions consistent with limits', () => {
    near(positions.NVDA, single.used, 1e-9, 'NVDA position vs single-name limit used');
    near(sectorTotal, sector.used, 1e-9, 'book sector total vs sector limit used');
    const listed = Object.values(positions).reduce((a, b) => a + b, 0);
    assert(listed <= sectorTotal, `listed positions ${listed}% exceed sector total ${sectorTotal}%`);
    return `NVDA ${positions.NVDA}%, sector ${sectorTotal}%`;
  });

  rep.check('Workbench schema', '7 unique request ids, valid routing', () => {
    assert(REQ.length === 7, `got ${REQ.length}`);
    assert(new Set(REQ.map((r) => r.id)).size === 7, 'duplicate ids');
    for (const r of REQ) {
      assert(SKILLS.includes(r.skill), `${r.id}: unknown skill ${r.skill}`);
      assert(r.confidence > 0 && r.confidence <= 1, `${r.id}: confidence ${r.confidence}`);
      assert(['pass', 'flag', 'block'].includes(r.guard.status), `${r.id}: guard ${r.guard.status}`);
      assert(r.guard.checks.length >= 2, `${r.id}: too few guard checks`);
      if (r.handoff) assert(SKILLS.includes(r.handoff.skill), `${r.id}: handoff ${r.handoff.skill}`);
      for (const c of r.context) {
        assert(FILES.includes(c) || c === 'decision-log', `${r.id}: unknown context ${c}`);
      }
      assert(r.audit && r.audit.action && r.audit.status, `${r.id}: audit incomplete`);
    }
  });

  /* generic "a% + b% = c%" arithmetic sweep */
  rep.check('Workbench math', 'every "a% + b% = c%" statement adds up', () => {
    let count = 0;
    const bad = [];
    walkStrings(REQ, (s, trail) => {
      for (const m of s.matchAll(/(\d+(?:\.\d+)?)%\s*\+\s*(\d+(?:\.\d+)?)%\s*=\s*(\d+(?:\.\d+)?)%/g)) {
        count++;
        const sum = parseFloat(m[1]) + parseFloat(m[2]);
        if (Math.abs(sum - parseFloat(m[3])) > 0.01) bad.push(`${trail}: ${m[0]}`);
      }
    });
    assert(bad.length === 0, bad.join('; '));
    return `${count} equations verified`;
  });

  /* the blocked request: every number must be derivable from the book */
  const risk = REQ.find((r) => r.id === 'risk');
  rep.check('Workbench math', 'risk block: breach arithmetic from book + limits', () => {
    const add = parseFloat((risk.prompt.match(/Add (\d+(?:\.\d+)?)%/) || [])[1]);
    assert(add > 0, 'could not parse add size from prompt');
    const postSingle = +(single.used + add).toFixed(1);
    const postSector = +(sector.used + add).toFixed(1);
    const breachSingle = +(postSingle - single.cap).toFixed(1);
    const breachSector = +(postSector - sector.cap).toFixed(1);
    const all = JSON.stringify(risk);
    for (const n of [postSingle, breachSingle, postSector, breachSector]) {
      assert(all.includes(`${n}%`), `expected ${n}% somewhere in the risk trace`);
    }
    assert(risk.guard.checks.filter((c) => !c.ok && c.hard).length >= 3, 'want >=3 hard failures');
    assert(risk.guard.checks.some((c) => c.ok && /escalat/i.test(c.name)), 'escalation check missing');
    return `post ${postSingle}%/${postSector}%, breach ${breachSingle}%/${breachSector}%`;
  });
  rep.check('Workbench math', 'risk block: largest-clear add is correct and binding limit named right', () => {
    const singleRoom = +(single.cap - single.used).toFixed(1);
    const sectorRoom = +(sector.cap - sector.used).toFixed(1);
    const maxAdd = Math.min(singleRoom, sectorRoom);
    const lines = risk.output.useful.lines.join(' ');
    assert(lines.includes(`+${maxAdd}%`), `expected +${maxAdd}% as the largest clear add`);
    const bindingIsSingle = singleRoom <= sectorRoom;
    assert(bindingIsSingle === /[Ss]ingle name is the binding/.test(lines),
      `binding-constraint claim contradicts headroom (single ${singleRoom} vs sector ${sectorRoom})`);
    return `max clear add +${maxAdd}%`;
  });

  /* screen table headroom claims per row */
  const screen = REQ.find((r) => r.id === 'screen');
  rep.check('Workbench math', 'screen table: held % and headroom claims match book', () => {
    for (const row of screen.output.rows) {
      const [name, , held, why] = row;
      const pos = positions[name] != null ? positions[name] : 0;
      near(parseFloat(held), pos, 1e-9, `${name} held column`);
      const singleRoom = +(single.cap - pos).toFixed(1);
      for (const m of why.matchAll(/(\d+(?:\.\d+)?)% (?:of (?:single-name )?headroom|from the single-name cap)/g)) {
        near(parseFloat(m[1]), singleRoom, 1e-9, `${name} headroom claim "${m[0]}"`);
      }
    }
    assert(/MSTR/.test(screen.output.note), 'screen note should explain the MSTR exclusion');
  });

  /* price termsheet: premium % x notional = $ figure */
  const price = REQ.find((r) => r.id === 'price');
  rep.check('Workbench math', 'price termsheet: premium % consistent with $ amount', () => {
    const rows = Object.fromEntries(price.output.rows);
    const notional = parseFloat((rows['Notional'].match(/\$(\d+(?:\.\d+)?)bn/) || [])[1]) * 1000;
    const prem = rows['Indicative premium'];
    const pct = parseFloat((prem.match(/(\d+(?:\.\d+)?)%/) || [])[1]);
    const mm = parseFloat((prem.match(/\$(\d+(?:\.\d+)?)mm/) || [])[1]);
    near(notional * pct / 100, mm, 2, 'premium arithmetic');
    assert(/5 year/.test(rows['Tenor']), 'tenor row');
    return `${pct}% of $${notional}mm ≈ $${mm}mm`;
  });

  scanStringsForBanned({ M, REQ }, 'workbench-data', rep);
}

function checkCross(win, rep) {
  const T = Object.fromEntries(win.THESIS_DATA.map((d) => [d.ticker, d]));
  const REQ = win.WB_REQUESTS;
  const thesis = REQ.find((r) => r.id === 'thesis');
  const post = REQ.find((r) => r.id === 'postmortem');

  rep.check('Cross-consistency', 'workbench /thesis mirrors Tracker NVDA numbers', () => {
    const d = T.NVDA;
    const drift = +(d.conviction - d.priorConviction).toFixed(1);
    const blob = JSON.stringify(thesis);
    assert(blob.includes(`${d.conviction}`), `NVDA conviction ${d.conviction} not referenced`);
    assert(blob.includes(`+${drift}`), `drift +${drift} not referenced`);
    assert(blob.includes(`${d.priorConviction}`), `prior ${d.priorConviction} not referenced`);
    assert(thesis.nested.href.includes('run=NVDA'), 'nested link should deep-run NVDA');
    return `conviction ${d.conviction}, drift +${drift}`;
  });

  rep.check('Cross-consistency', 'workbench postmortem mirrors Tracker MSTR numbers', () => {
    const d = T.MSTR;
    const blob = JSON.stringify(post);
    assert(blob.includes(`${d.priorConviction}`) && blob.includes(`${d.conviction}`),
      `want ${d.priorConviction} -> ${d.conviction} in postmortem`);
    assert(post.output.body.includes(`${d.priorConviction} to ${d.conviction}`), 'memo should state the cut plainly');
  });

  rep.check('Cross-consistency', 'tracker watchlist seeds exist in dataset', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/thesis-app.js'), 'utf8');
    const m = src.match(/\[(['"][A-Z]+['"](?:,\s*['"][A-Z]+['"])*)\]\.map/);
    assert(m, 'seed list not found in thesis-app.js');
    const seeds = m[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
    for (const s of seeds) assert(T[s], `seed ${s} missing from THESIS_DATA`);
    return seeds.join(', ');
  });

  rep.check('Voice', 'views + app JS: no em dashes in user-facing files', () => {
    const files = [];
    for (const dir of ['views', 'views/partials', 'public/js']) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (/\.(ejs|js)$/.test(f)) files.push(path.join(dir, f));
      }
    }
    const hits = files.filter((f) => {
      const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return txt.includes('—') || txt.includes('&mdash;');
    });
    assert(hits.length === 0, `em dash in: ${hits.join(', ')}`);
    return `${files.length} files scanned`;
  });
}

module.exports = function runDataChecks(win, rep) {
  checkThesis(win, rep);
  checkWorkbench(win, rep);
  checkCross(win, rep);
};
