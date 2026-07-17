#!/usr/bin/env node
/*
 * eval/run.js — evaluation harness entry point.
 *
 *   node eval/run.js                 # data checks + behavioral e2e vs golden
 *   node eval/run.js --data-only     # static accuracy checks only (no browser)
 *   node eval/run.js --update-golden # regenerate golden fixtures from data
 *
 * Exit code 0 only if every check passes.
 */
'use strict';
const { loadBrowserData, Report } = require('./lib');
const runDataChecks = require('./checks-data');
const { runE2E, writeGolden } = require('./checks-e2e');

(async () => {
  const args = process.argv.slice(2);
  const win = loadBrowserData();

  if (args.includes('--update-golden')) {
    const n = writeGolden(win);
    console.log(`golden fixtures regenerated: ${n} files in eval/golden/`);
    return;
  }

  const rep = new Report();
  runDataChecks(win, rep);
  if (!args.includes('--data-only')) await runE2E(win, rep);

  const ok = rep.print();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('harness error:', e.message);
  process.exit(1);
});
