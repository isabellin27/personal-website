/*
 * eval/checks-e2e.js
 * Behavioral evaluation: drives every deep-link run of both apps in headless
 * Chrome (virtual time), extracts a normalized end-state trace from the DOM,
 * and compares it against the committed golden fixtures in eval/golden/.
 *
 * Golden fixtures are the frozen behavioral contract. Regenerate them
 * deliberately with `node eval/run.js --update-golden` after a data change.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ROOT, assert } = require('./lib');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const BASE = 'http://localhost:8081';

function chromeBin() {
  const cand = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return fs.existsSync(cand) ? cand : null;
}

async function ensureServer() {
  const up = async () => {
    try { const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) }); return r.ok; }
    catch { return false; }
  };
  if (await up()) return null;
  const child = spawn('node', ['index.js'], { cwd: ROOT, stdio: 'ignore', detached: false });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await up()) return child;
  }
  child.kill();
  throw new Error('could not start the site server on :8081');
}

function dumpDom(chrome, url) {
  const out = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=90000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  assert(out.status === 0 && out.stdout.length > 1000, `chrome dump failed for ${url}`);
  return out.stdout;
}

/* ---------- extractors: DOM -> normalized trace ---------- */
function extractTracker(html, ticker) {
  const count = (re) => (html.match(re) || []).length;
  const first = (re) => { const m = html.match(re); return m ? m[1] : null; };
  return {
    stagesDone: count(/class="tt-stage [^"]*done"/g),
    complete: /pipeline complete/.test(html),
    bars: count(/tt-bar-val">\d/g),
    gauge: parseFloat(first(/tt-gauge-val">([\d.]+)/)),
    memoStart: (first(/tt-memo-body">([^<]{1,60})/) || '').slice(0, 40),
    watchlistHasTicker: new RegExp('tt-trow-tick"><span>' + ticker + '<').test(html),
  };
}

function extractWorkbench(html) {
  const count = (re) => (html.match(re) || []).length;
  const first = (re) => { const m = html.match(re); return m ? m[1] : null; };
  return {
    layersDone: count(/class="wb-layer done"/g),
    layersBlocked: count(/class="wb-layer blocked"/g),
    refused: /REQUEST REFUSED/.test(html),
    outputPanels: count(/wb-panel-kicker">Output/g),
    auditAction: first(/wb-audit-action">([a-z]+)</),
    auditStatus: (first(/wb-audit-status">([^<]+)</) || '').trim(),
    handoff: first(/wb-handoff-k">Suggested next<\/span><span class="wb-route-cmd">([^<]+)</) || null,
    nested: /NESTED APP/.test(html),
  };
}

/* ---------- golden derivation (the behavioral contract) ---------- */
function goldenForTracker(d) {
  return {
    stagesDone: 5,
    complete: true,
    bars: 5,
    gauge: { near: d.conviction, tol: 0.45 }, // the app applies deliberate jitter of <=0.35 + rounding
    memoStart: d.memo.slice(0, 40),
    watchlistHasTicker: true,
  };
}
function goldenForWorkbench(r) {
  const blocked = r.guard.status === 'block';
  return {
    layersDone: blocked ? 5 : 6,
    layersBlocked: blocked ? 1 : 0,
    refused: blocked,
    outputPanels: 1,
    auditAction: r.audit.action,
    auditStatus: r.audit.status,
    handoff: r.handoff ? r.handoff.skill : null,
    nested: !!r.nested,
  };
}

function writeGolden(win) {
  fs.mkdirSync(path.join(GOLDEN_DIR, 'thesis'), { recursive: true });
  fs.mkdirSync(path.join(GOLDEN_DIR, 'workbench'), { recursive: true });
  for (const d of win.THESIS_DATA) {
    fs.writeFileSync(path.join(GOLDEN_DIR, 'thesis', d.ticker + '.json'),
      JSON.stringify(goldenForTracker(d), null, 2) + '\n');
  }
  for (const r of win.WB_REQUESTS) {
    fs.writeFileSync(path.join(GOLDEN_DIR, 'workbench', r.id + '.json'),
      JSON.stringify(goldenForWorkbench(r), null, 2) + '\n');
  }
  return win.THESIS_DATA.length + win.WB_REQUESTS.length;
}

function compare(actual, golden) {
  const diffs = [];
  for (const [k, want] of Object.entries(golden)) {
    const got = actual[k];
    if (want && typeof want === 'object' && 'near' in want) {
      if (typeof got !== 'number' || Math.abs(got - want.near) > want.tol) {
        diffs.push(`${k}: got ${got}, want ${want.near} ±${want.tol}`);
      }
    } else if (got !== want) {
      diffs.push(`${k}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }
  return diffs;
}

async function runE2E(win, rep) {
  const chrome = chromeBin();
  if (!chrome) {
    rep.check('E2E', 'headless Chrome available', () => {
      throw new Error('Chrome not found; set CHROME_BIN or run with --data-only');
    });
    return;
  }
  const server = await ensureServer();
  try {
    for (const d of win.THESIS_DATA) {
      rep.check('E2E · Thesis Tracker', `run ${d.ticker} matches golden`, () => {
        const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'thesis', d.ticker + '.json'), 'utf8'));
        const html = dumpDom(chrome, `${BASE}/thesis-tracker#run=${d.ticker}`);
        const actual = extractTracker(html, d.ticker);
        const diffs = compare(actual, golden);
        assert(diffs.length === 0, diffs.join('; '));
        return `conviction ${actual.gauge}`;
      });
    }
    for (const r of win.WB_REQUESTS) {
      rep.check('E2E · Desk Workbench', `run ${r.id} matches golden`, () => {
        const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'workbench', r.id + '.json'), 'utf8'));
        const html = dumpDom(chrome, `${BASE}/workbench#run=${r.id}`);
        const actual = extractWorkbench(html);
        const diffs = compare(actual, golden);
        assert(diffs.length === 0, diffs.join('; '));
        return r.guard.status === 'block' ? 'refused as designed' : 'completed';
      });
    }
  } finally {
    if (server) server.kill();
  }
}

module.exports = { runE2E, writeGolden };
