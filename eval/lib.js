/*
 * eval/lib.js
 * Shared plumbing for the evaluation harness: loads the browser data files
 * into a sandbox, and provides the check/report framework.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadBrowserData() {
  const window = {};
  const sandbox = { window };
  vm.createContext(sandbox);
  for (const rel of ['public/js/thesis-data.js', 'public/js/workbench-data.js']) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
  return window;
}

/* Walk every string in an object tree, calling visit(str, jsonPath). */
function walkStrings(node, visit, trail = '$') {
  if (typeof node === 'string') return visit(node, trail);
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, visit, `${trail}[${i}]`));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkStrings(v, visit, `${trail}.${k}`);
  }
}

class Report {
  constructor() { this.results = []; }
  check(group, name, fn) {
    try {
      const detail = fn(); // throw to fail; return optional detail string
      this.results.push({ group, name, pass: true, detail: detail || '' });
    } catch (e) {
      this.results.push({ group, name, pass: false, detail: e.message });
    }
  }
  get failures() { return this.results.filter((r) => !r.pass); }
  print() {
    let lastGroup = null;
    for (const r of this.results) {
      if (r.group !== lastGroup) {
        console.log(`\n== ${r.group} ==`);
        lastGroup = r.group;
      }
      const mark = r.pass ? ' ok ' : 'FAIL';
      console.log(`  [${mark}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    const f = this.failures.length;
    const t = this.results.length;
    console.log(`\n${t - f}/${t} checks passed${f ? `, ${f} FAILED` : ''}`);
    return f === 0;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b} ±${tol})`);
}

module.exports = { ROOT, loadBrowserData, walkStrings, Report, assert, near };
