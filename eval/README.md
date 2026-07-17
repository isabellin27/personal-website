# eval/ — evaluation harness for the AI Lab demos

Automated accuracy checks for the two live systems on this site (the Thesis
Tracker and the Desk Workbench). Same discipline I apply evaluating frontier
models at Handshake AI: rubrics, golden fixtures, and failure modes, pointed
at my own work.

## What it checks

**Data checks** (`checks-data.js`, no browser needed)
- Schema and ranges: tickers, scores 0-10, conviction bands, list lengths.
- Voice rules: no em dashes and no corporate filler anywhere in the datasets,
  the views, or the app JS. House style is a hard contract, not a preference.
- Internal arithmetic: every `a% + b% = c%` statement in the Workbench must
  add up; the risk block's breach math must derive exactly from `book.csv`
  plus `limits.md`; headroom claims in the screen table must match the book;
  the term sheet's premium in dollars must equal premium % times notional.
- Cross-file consistency: the Workbench's `/thesis` trace must mirror the
  Thesis Tracker's NVDA conviction and drift; the postmortem must mirror the
  Tracker's MSTR numbers; watchlist seeds must exist in the dataset.

**Behavioral checks** (`checks-e2e.js`, headless Chrome)
- Drives all 12 deep-link runs (5 Tracker tickers + 7 Workbench requests)
  with Chrome virtual time, extracts a normalized end-state trace from the
  DOM, and diffs it against the golden fixtures in `golden/`.
- The blocked request must actually block: guardrail layer red, REQUEST
  REFUSED rendered, audit row logged as escalated.

## Running

```
npm test            # data checks only (fast, CI-safe)
npm run eval        # data checks + behavioral runs vs golden fixtures
npm run eval:golden # regenerate golden fixtures after a deliberate data change
```

`eval` needs Chrome (`CHROME_BIN` overrides the default macOS path) and will
start the site server itself if :8081 is not already up.

## Golden fixtures

`golden/` is the frozen behavioral contract: one JSON per run with the
expected end state (stages completed, refusal fired, audit entry, handoff,
conviction within jitter tolerance). If a data edit changes intended
behavior, regenerate deliberately and review the diff in git.
