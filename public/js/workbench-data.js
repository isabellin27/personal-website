/*
 * workbench-data.js
 * The Desk Workbench: a six-layer agent operating system for a markets desk.
 * Same architecture as the job-search engine Isabel built (context -> router ->
 * playbook -> tools -> state -> guardrails), pointed at a trading desk.
 *
 * Interactive demo. Illustrative desk, book, and figures.
 */

/* ---------- LAYER 1: the source of truth the agent cannot override ---------- */
window.WB_MANDATE = {
  desk: 'Structured Equity & Markets Desk',
  files: [
    {
      name: 'mandate.md',
      role: 'What this desk is allowed to do',
      lines: [
        'Universe: US-listed AI infrastructure and semiconductors, market cap > $10bn.',
        'Instruments: cash equity, listed options, convertibles, capped-call overlays, margin loans.',
        'Excluded: pre-revenue names, tenor beyond 5 years, anything not in the universe.',
      ],
    },
    {
      name: 'limits.md',
      role: 'Risk limits. Hard stops, not guidance',
      lines: [
        'Single name: 4.0% of NAV.',
        'Sector (semis complex): 25.0% of NAV.',
        'Any breach escalates to the PM. The agent may not size around a limit.',
      ],
    },
    {
      name: 'house-style.md',
      role: 'How this desk writes',
      lines: [
        'Warm but serious. Direct. Short declarative sentences.',
        'No em dashes. No corporate filler. Quantify where it strengthens the point.',
        'Every figure carries a source. If there is no source, it does not ship.',
      ],
    },
    {
      name: 'book.csv',
      role: 'What we own right now. Source of truth over any model',
      lines: [
        'Top AI-complex positions: NVDA 3.6% · TSM 2.1% · VRT 1.2% · MSTR 0.8% · AVGO 0.0%',
        'Semis complex total, including 11 smaller names: 22.4% of NAV.',
      ],
    },
  ],
  limits: [
    { key: 'single', label: 'Single name (NVDA)', used: 3.6, cap: 4.0, unit: '% NAV' },
    { key: 'sector', label: 'Sector (semis complex)', used: 22.4, cap: 25.0, unit: '% NAV' },
  ],
  controls: [
    { label: 'Drafts only. Never executes.', state: 'on' },
    { label: 'Human approval required to send.', state: 'on' },
    { label: 'Every figure cited or flagged.', state: 'on' },
    { label: 'Limits enforced, not negotiated.', state: 'on' },
  ],
};

/* ---------- LAYER 2-6 descriptors ---------- */
window.WB_LAYERS = [
  { key: 'context', n: '01', name: 'Mandate & Context', sub: 'source of truth the agent cannot override' },
  { key: 'router', n: '02', name: 'Router', sub: 'intent to skill, with confidence' },
  { key: 'playbook', n: '03', name: 'Skill Playbook', sub: 'pre-read contract, steps, output rules' },
  { key: 'tools', n: '04', name: 'Tools', sub: 'filings, vol surface, credit, consensus' },
  { key: 'state', n: '05', name: 'State & Record', sub: 'the book, decision log, append-only' },
  { key: 'guardrails', n: '06', name: 'Guardrails', sub: 'the layer that can say no' },
];

/* ---------- The skill roster ---------- */
window.WB_SKILLS = [
  { cmd: '/screen', name: 'Screen', sub: 'surface names that fit the mandate' },
  { cmd: '/thesis', name: 'Thesis', sub: 'form and score a view', nested: true },
  { cmd: '/structure', name: 'Structure', sub: 'how to express the view' },
  { cmd: '/price', name: 'Price', sub: 'indicative pricing off vol and credit' },
  { cmd: '/commentary', name: 'Commentary', sub: 'draft the desk note in house style' },
  { cmd: '/risk', name: 'Risk', sub: 'limits, exposure, escalation' },
  { cmd: '/postmortem', name: 'Postmortem', sub: 'what did we get wrong' },
];

/* ---------- The preset requests ---------- */
window.WB_REQUESTS = [
  /* 1 ------------------------------------------------------------------ */
  {
    id: 'screen',
    chip: 'Screen the universe',
    prompt: 'Find AI infrastructure names that fit the mandate and we do not already own.',
    skill: '/screen',
    confidence: 0.94,
    routerWhy: 'Asks to surface candidates against mandate criteria. No pricing, no execution. Routes to /screen.',
    context: ['mandate.md', 'limits.md', 'book.csv'],
    contextNote: 'Universe and hard filters come from mandate.md. book.csv tells it what we already hold.',
    steps: [
      'Load the universe and hard filters from mandate.md',
      'Drop anything failing a hard filter (cap, pre-revenue, out of universe)',
      'Cross-check book.csv, flag names already held and their size',
      'Rank on fit to the mandate, not on how good the story sounds',
    ],
    tools: ['Universe scan', 'EDGAR: filings', 'Consensus estimates', 'Price + vol feed'],
    stateReads: ['book.csv: 5 positions, semis 22.4% NAV'],
    stateWrites: ['decision-log: screen run, 4 candidates surfaced'],
    guard: {
      status: 'pass',
      checks: [
        { ok: true, name: 'Universe compliance', note: 'All 4 names inside mandate universe.' },
        { ok: true, name: 'No execution implied', note: 'Screen is read-only. Nothing sized, nothing traded.' },
        { ok: true, name: 'Sourcing', note: 'Every figure tied to a filing or feed.' },
      ],
    },
    output: {
      kind: 'table',
      title: 'Screen results, ranked by mandate fit',
      cols: ['Name', 'Fit', 'Held', 'Why it clears'],
      rows: [
        ['AVGO', '9.1', '0.0%', 'Custom AI silicon plus networking. In universe, unheld, room under both limits.'],
        ['VRT', '7.8', '1.2%', 'Power and thermal layer. Held small, 2.8% of headroom left.'],
        ['TSM', '7.4', '2.1%', 'Foundry choke point. Held, 1.9% of single-name headroom left and that is the binding constraint.'],
        ['NVDA', '7.0', '3.6%', 'In universe but 0.4% from the single-name cap. Effectively full.'],
      ],
      note: 'MSTR excluded: fails the universe test in mandate.md. It is a bitcoin treasury, not AI infrastructure.',
    },
    handoff: { skill: '/thesis', why: 'AVGO is unheld and ranks first. Build a view before sizing anything.' },
    audit: { action: 'screen', detail: '4 candidates surfaced, 1 excluded on mandate', status: 'logged' },
  },

  /* 2 ------------------------------------------------------------------ */
  {
    id: 'thesis',
    chip: 'Build a view (nested app)',
    prompt: 'Build me a view on NVDA before earnings.',
    skill: '/thesis',
    confidence: 0.97,
    routerWhy: 'Asks to form and score a view on a single name. Routes to /thesis, which runs the Thesis Tracker pipeline.',
    context: ['mandate.md', 'house-style.md', 'decision-log'],
    contextNote: 'house-style.md sets the memo voice. decision-log carries the prior conviction so drift is measurable.',
    steps: [
      'Read the prior thesis and conviction from decision-log',
      'Hand off to the /thesis pipeline: Source, Analyze, Score, Brief, Track',
      'Return conviction and drift to the workbench record',
    ],
    tools: ['Thesis Tracker pipeline (5 agents)'],
    stateReads: ['decision-log: NVDA prior conviction 8.0, logged 3 weeks ago'],
    stateWrites: ['decision-log: NVDA conviction 8.6, drift +0.6'],
    nested: {
      app: 'Thesis Tracker',
      href: '/thesis-tracker#run=NVDA',
      stages: ['Source', 'Analyze', 'Score', 'Brief', 'Track'],
      result: 'Conviction 8.6 / 10 · High conviction long · drift +0.6 since last run',
    },
    guard: {
      status: 'pass',
      checks: [
        { ok: true, name: 'Voice compliance', note: 'Memo drafted against house-style.md. No em dashes.' },
        { ok: true, name: 'No execution implied', note: 'A view is not a trade. Sizing is /risk, and a human decides.' },
        { ok: true, name: 'Drift recorded', note: 'Prior conviction preserved so we can be held to it.' },
      ],
    },
    output: {
      kind: 'nested',
      title: '/thesis delegated to the Thesis Tracker',
      note: 'This is the composition point. The Thesis Tracker is not a separate demo, it is the skill this workbench calls. One system, two levels.',
    },
    handoff: { skill: '/structure', why: 'View is high conviction but the name is 0.4% from its cap. Ask how else to express it.' },
    audit: { action: 'thesis', detail: 'NVDA conviction 8.6, drift +0.6 vs prior', status: 'logged' },
  },

  /* 3 ------------------------------------------------------------------ */
  {
    id: 'structure',
    chip: 'Express the view',
    prompt: 'How would we express a long NVDA view with downside protection, given we are near the cap?',
    skill: '/structure',
    confidence: 0.91,
    routerWhy: 'Asks how to express an existing view under a constraint. Structuring question, not a pricing request yet.',
    context: ['mandate.md', 'limits.md', 'book.csv'],
    contextNote: 'mandate.md permits convertibles, capped calls and margin loans. limits.md is why cash equity is nearly out of room.',
    steps: [
      'Restate the constraint: NVDA cash is 0.4% from the single-name cap',
      'Enumerate permitted structures from mandate.md',
      'Score each on cost, protection, carry, and limit treatment',
      'Recommend one, and say plainly what it costs',
    ],
    tools: ['Vol surface: skew + term', 'Credit spreads', 'Convertible database', 'Listed options chain'],
    stateReads: ['book.csv: NVDA 3.6% cash, no derivative overlay'],
    stateWrites: ['decision-log: 3 structures compared, capped-call overlay recommended'],
    guard: {
      status: 'flag',
      checks: [
        { ok: true, name: 'Instrument permission', note: 'All 3 structures permitted under mandate.md.' },
        { ok: false, name: 'Indicative only', note: 'Structures are illustrative. Not a recommendation to trade and not a quote.' },
        { ok: true, name: 'Limit treatment stated', note: 'Each structure shows how it consumes the single-name limit.' },
      ],
    },
    output: {
      kind: 'table',
      title: 'Three permitted ways to express it',
      cols: ['Structure', 'Protection', 'Cost / carry', 'Limit treatment'],
      rows: [
        ['Capped-call overlay', 'Caps upside above +25%, funds the put', 'Near zero premium, gives up tail upside', 'Delta-adjusted, frees roughly 1.1% of cap'],
        ['Convertible (new issue)', 'Bond floor plus equity option', 'Yield give-up, credit exposure', 'Counts on delta, not notional'],
        ['Collar, 6 month', 'Floor at -10%, cap at +18%', 'Zero cost at current skew', 'Delta-adjusted, smallest limit use'],
      ],
      note: 'Recommendation: capped-call overlay. It keeps the view, buys the downside, and the delta adjustment is what actually creates room under the cap. The honest cost is the tail. If NVDA runs past the cap strike, we do not participate.',
    },
    handoff: { skill: '/price', why: 'Structure agreed in principle. Next question is what it actually costs.' },
    audit: { action: 'structure', detail: '3 structures compared, capped-call recommended', status: 'logged' },
  },

  /* 4 ------------------------------------------------------------------ */
  {
    id: 'price',
    chip: 'Price it',
    prompt: 'Price a 5-year capped call on a $2bn convertible.',
    skill: '/price',
    confidence: 0.96,
    routerWhy: 'Explicit pricing request with an instrument, tenor and size. Routes to /price.',
    context: ['mandate.md', 'limits.md'],
    contextNote: 'mandate.md caps tenor at 5 years. This request sits exactly on the boundary, so the check matters.',
    steps: [
      'Pull the vol surface, interpolate to strike and 5y tenor',
      'Pull the issuer credit spread and the discount curve',
      'Solve the premium, then the greeks at inception',
      'Build the indicative term sheet. Mark it indicative, everywhere',
    ],
    tools: ['Vol surface: 5y skew', 'Credit spread: issuer curve', 'Rates: SOFR discount', 'Convertible database'],
    stateReads: ['convert-db: 600+ securities, 12 comparable capped-call structures'],
    stateWrites: ['decision-log: indicative pricing produced, not sent'],
    guard: {
      status: 'flag',
      checks: [
        { ok: true, name: 'Tenor check', note: '5y is at the mandate ceiling. Permitted, flagged as at-limit.' },
        { ok: false, name: 'INDICATIVE ONLY', note: 'This is not a quote and not a commitment to trade. Levels move.' },
        { ok: false, name: 'Client-facing block', note: 'Nothing goes to a client without desk and compliance sign-off. The agent cannot send this.' },
        { ok: true, name: 'Inputs cited', note: 'Every input tied to a feed and timestamped.' },
      ],
    },
    output: {
      kind: 'termsheet',
      title: 'Indicative term sheet',
      badge: 'INDICATIVE',
      rows: [
        ['Structure', 'Capped call overlay on convertible'],
        ['Notional', '$2.0bn'],
        ['Tenor', '5 years (at mandate ceiling)'],
        ['Lower strike', '100% of spot'],
        ['Cap strike', '125% of spot'],
        ['Implied vol used', '41.2 vol at 5y, skew-adjusted'],
        ['Credit spread', '162bp, issuer curve'],
        ['Indicative premium', '~4.85% of notional, roughly $97mm'],
        ['Delta at inception', '0.38'],
        ['Vega', '$2.1mm per vol point'],
      ],
      note: 'Levels are indicative and move with spot, vol and credit. This sheet is a draft for the desk, not a quote for a client.',
    },
    handoff: { skill: '/risk', why: 'Before this goes anywhere, check what it does to the book.' },
    audit: { action: 'price', detail: 'Indicative capped call, $2bn 5y, premium ~4.85%', status: 'logged · not sent' },
  },

  /* 5 ------------------------------------------------------------------ */
  {
    id: 'commentary',
    chip: 'Draft the desk note',
    prompt: 'Draft the morning note on the AI infrastructure complex.',
    skill: '/commentary',
    confidence: 0.93,
    routerWhy: 'Asks for a written desk deliverable. Routes to /commentary, which is bound to house-style.md.',
    context: ['house-style.md', 'book.csv', 'decision-log'],
    contextNote: 'This is the layer that makes it sound like the desk and not like a model. house-style.md is the voice contract.',
    steps: [
      'Pull overnight moves and the last 24 hours of news',
      'Pick the two things that actually matter. Cut the rest',
      'Draft against house-style.md: direct, quantified, no em dashes',
      'Attach a source to every figure. Unsourced figures do not ship',
    ],
    tools: ['Price + vol feed: overnight', 'News: last 24h', 'Consensus estimates', 'Book: exposure'],
    stateReads: ['decision-log: NVDA 8.6 conviction, AVGO screened in'],
    stateWrites: ['decision-log: morning note drafted, awaiting sign-off'],
    guard: {
      status: 'flag',
      checks: [
        { ok: true, name: 'Voice compliance', note: 'Checked against house-style.md. No em dashes, no filler.' },
        { ok: true, name: 'Every figure cited', note: '6 figures, 6 sources.' },
        { ok: false, name: 'Distribution blocked', note: 'Client-facing. Requires desk and compliance sign-off. The agent drafts, it does not send.' },
      ],
    },
    output: {
      kind: 'memo',
      title: 'Morning note · AI infrastructure',
      badge: 'DRAFT',
      body: 'July 2026. Two things matter this morning.\n\nFirst, the capex bid is still there. Hyperscaler 2026 guidance sits near $725bn and nobody cut it last night. That is the whole floor under this complex. NVDA is bid 1.2% pre-market on no news, which tells you positioning is still short into the print, not that anything changed.\n\nSecond, the custom silicon story is getting real, and that is the one to watch. AVGO guided AI semis near $16bn for the quarter, up from $10.8bn. That is not a threat to NVDA this year. It is a threat to the terminal multiple, and the market has not decided which one it is pricing.\n\nWhat we are doing. Nothing today. We are 3.6% NVDA against a 4.0% cap, so the cash position is effectively full. If you want more of this view, it comes through the overlay, not the stock. Desk has indicative levels on a 5y capped call.\n\nThe risk to all of this. One capex guide comes down and the floor moves. Watch the cloud prints, not the chip prints.',
      note: 'Drafted in house style. Six figures, six sources. Blocked from distribution until a human signs off.',
    },
    handoff: null,
    audit: { action: 'commentary', detail: 'Morning note drafted, 6 figures cited', status: 'logged · blocked from send' },
  },

  /* 6 ------------------------------------------------------------------ */
  {
    id: 'risk',
    chip: '⚠ Add 5% NVDA to the book',
    prompt: 'Add 5% NVDA to the book before the print.',
    skill: '/risk',
    confidence: 0.89,
    routerWhy: 'This is an execution instruction. The workbench has no execution authority, so it routes to /risk for a limit check instead of doing what it was told.',
    context: ['mandate.md', 'limits.md', 'book.csv'],
    contextNote: 'This is the request the mandate exists for. The agent was told to do something. It checks whether it is allowed first.',
    steps: [
      'Compute post-trade exposure against the current book',
      'Test every limit in limits.md, not just the obvious one',
      'Test execution authority',
      'If blocked, say so plainly, then be useful anyway',
    ],
    tools: ['Book: current exposure', 'Limits: mandate ceilings', 'Price feed: spot'],
    stateReads: ['book.csv: NVDA 3.6%, semis complex 22.4%'],
    stateWrites: ['decision-log: request BLOCKED, escalated to PM'],
    guard: {
      status: 'block',
      checks: [
        { ok: false, name: 'Single-name limit', note: '3.6% + 5.0% = 8.6% against a 4.0% cap. Breach of 4.6%.', hard: true },
        { ok: false, name: 'Sector limit', note: 'Semis 22.4% + 5.0% = 27.4% against a 25.0% cap. Breach of 2.4%.', hard: true },
        { ok: false, name: 'Execution authority', note: 'This workbench drafts. It does not execute. No agent path to the market exists.', hard: true },
        { ok: true, name: 'Escalation', note: 'Request logged and routed to the PM for a human decision.' },
      ],
    },
    output: {
      kind: 'block',
      title: 'Request refused',
      headline: 'I am not going to do this, and I would not do it even if the limits cleared.',
      reasons: [
        'It breaches the single-name cap by 4.6% of NAV.',
        'It breaches the sector cap by 2.4% of NAV.',
        'I have no execution authority. Nothing here reaches a market.',
      ],
      useful: {
        head: 'What I can do instead',
        lines: [
          'The largest NVDA add that clears both limits is +0.4% of NAV. Single name is the binding constraint, not sector.',
          'If you want the full 5% of exposure, it does not come from stock. A capped-call overlay is delta-adjusted and frees roughly 1.1% of the cap. Desk has indicative levels.',
          'I have drafted the limit-breach escalation to the PM with the numbers above. You send it, not me.',
        ],
      },
      note: 'An agent that cannot say no is not deployable on a desk. This is the layer that makes the rest of it safe.',
    },
    handoff: { skill: '/structure', why: 'The view is fine. The expression is wrong. Structure it instead of sizing it.' },
    audit: { action: 'risk', detail: 'BLOCKED: 2 limit breaches + no execution authority. Escalated to PM.', status: 'blocked · escalated' },
  },

  /* 7 ------------------------------------------------------------------ */
  {
    id: 'postmortem',
    chip: 'What did we get wrong',
    prompt: 'What did we get wrong on MSTR?',
    skill: '/postmortem',
    confidence: 0.92,
    routerWhy: 'Asks to review a past decision against what actually happened. Routes to /postmortem, which reads the decision log, not the news.',
    context: ['decision-log', 'book.csv'],
    contextNote: 'This only works because every prior decision was logged with a date and a reason. The append-only record is what makes accountability possible.',
    steps: [
      'Pull every logged decision on the name, in order',
      'Compare what we said would happen against what happened',
      'Name the error type, not just the outcome',
      'Write the rule that would have caught it',
    ],
    tools: ['Decision log: full history', 'Price feed: realised', 'Convertible database'],
    stateReads: ['decision-log: MSTR 4 entries, conviction 6.2 -> 5.3'],
    stateWrites: ['decision-log: postmortem filed, 1 rule proposed'],
    guard: {
      status: 'pass',
      checks: [
        { ok: true, name: 'No hindsight rewriting', note: 'Prior entries are append-only. The agent cannot edit what we said before.' },
        { ok: true, name: 'Error named honestly', note: 'Reports a process error, not just a bad outcome.' },
      ],
    },
    output: {
      kind: 'memo',
      title: 'Postmortem · MSTR',
      badge: 'FILED',
      body: 'What we said. In the first entry we called MSTR a leveraged bitcoin call financed by cheap converts, and we scored it 6.2. The logic was that the converts are near-zero coupon and struck out of the money, so the financing was close to free.\n\nWhat happened. The financing stopped being the story. The mNAV premium compressed from roughly 1.8x to near parity, and the preferred stack kept demanding cash regardless. The company began selling bitcoin to service preferred coupons.\n\nThe error, named honestly. We analysed the converts and ignored the preferreds. That is not a bad outcome, it is an incomplete analysis. We modelled the cheap financing and never modelled the expensive financing sitting next to it.\n\nThe rule that would have caught it. For any financed-treasury structure, model the full capital stack and its cash obligations before scoring the cheap tranche. If any tranche demands cash the operating business cannot cover, the flywheel is a liability, not an asset.\n\nStatus. Conviction cut 6.2 to 5.3. Rule proposed for the mandate. Position held at 0.8%, sized small, which is the one thing we got right.',
      note: 'The prior entries were not edited. That is the point of an append-only log.',
    },
    handoff: null,
    audit: { action: 'postmortem', detail: 'MSTR error named: incomplete capital-stack analysis. 1 rule proposed.', status: 'filed' },
  },
];
