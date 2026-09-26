// Bullpen — shared sample data, simulations and the architecture diagram renderer.
export const MINUS = '\u2212';
export const SYMBOLS = [
  { sym: 'AAPL', name: 'Apple', kind: 'stock', price: 241.18, prev: 238.62, vol: 0.0009, hue: 238 },
  { sym: 'MSFT', name: 'Microsoft', kind: 'stock', price: 512.44, prev: 515.90, vol: 0.0008, hue: 200 },
  { sym: 'NVDA', name: 'NVIDIA', kind: 'stock', price: 182.43, prev: 177.95, vol: 0.0015, hue: 150 },
  { sym: 'TSLA', name: 'Tesla', kind: 'stock', price: 348.10, prev: 356.72, vol: 0.0018, hue: 25 },
  { sym: 'SPY', name: 'S&P 500 ETF', kind: 'stock', price: 668.27, prev: 666.03, vol: 0.0005, hue: 285 },
  { sym: 'BTC-USD', name: 'Bitcoin', kind: 'crypto', price: 112431.52, prev: 110870.10, vol: 0.0012, hue: 65 },
  { sym: 'ETH-USD', name: 'Ether', kind: 'crypto', price: 4182.66, prev: 4260.35, vol: 0.0016, hue: 265 },
  { sym: 'SOL-USD', name: 'Solana', kind: 'crypto', price: 212.37, prev: 204.81, vol: 0.002, hue: 320 },
];

export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fmt = (v, dp = 2) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const signed = (v, dp = 2, pre = '', suf = '') => (v > 0 ? '+' : v < 0 ? MINUS : '') + pre + fmt(Math.abs(v), dp) + suf;
export const mono = (sym) => sym.replace('-USD', '');
export const badgeBg = (hue) => `color-mix(in oklch, var(--surface-elevated) 80%, oklch(66% 0.12 ${hue}))`;

export function sparkD(h, w, H, pad = 2) {
  const min = Math.min(...h), max = Math.max(...h), r = max - min || 1, step = w / (h.length - 1);
  return h.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(pad + (H - 2 * pad) * (1 - (v - min) / r)).toFixed(1)}`).join('');
}

export function createMarket(seed = 7) {
  const r = rng(seed), q = {};
  SYMBOLS.forEach((s) => {
    const hist = [];
    for (let i = 0; i < 40; i++) {
      const f = i / 39;
      hist.push(s.prev + (s.price - s.prev) * f + (r() - 0.5) * s.price * s.vol * 14 * Math.sin(f * Math.PI));
    }
    hist[39] = s.price;
    q[s.sym] = { ...s, hist, dir: 0, at: Date.now() };
  });
  return {
    q, r,
    tick(n = 3, only) {
      const pool = only || SYMBOLS.map((s) => s.sym), out = [];
      for (let k = 0; k < n; k++) {
        const sym = pool[Math.floor(r() * pool.length)], s = q[sym];
        const g = r() + r() + r() - 1.5;
        const np = Math.round(Math.max(0.01, s.price * (1 + g * s.vol * 2.2)) * 100) / 100;
        const dir = np > s.price ? 1 : np < s.price ? -1 : 0;
        s.price = np; s.dir = dir; s.at = Date.now();
        s.hist = [...s.hist.slice(1), np];
        out.push({ sym, dir });
      }
      return out;
    },
  };
}

export function quoteView(s) {
  const ch = s.price - s.prev, pct = (ch / s.prev) * 100, up = ch >= 0;
  return {
    sym: s.sym, mono: mono(s.sym), name: s.name, kind: s.kind, isCrypto: s.kind === 'crypto',
    price: fmt(s.price), change: signed(ch), pct: signed(pct, 2, '', '%'),
    arrow: up ? '\u25B2' : '\u25BC', up, tone: up ? 'var(--bp-gain)' : 'var(--bp-loss)',
    badgeBg: badgeBg(s.hue), badgeRadius: s.kind === 'crypto' ? '9999px' : '8px',
  };
}

// ── League / leaderboard ────────────────────────────────────
export const PLAYERS = [
  ['p1', 'Priya N.', 'PN', 118420], ['p2', 'Marcus O.', 'MO', 116905], ['p3', 'Lena V.', 'LV', 114230],
  ['p4', 'Dev K.', 'DK', 112870], ['p5', 'Sofia M.', 'SM', 111940], ['p6', 'Kenji T.', 'KT', 110615],
  ['p7', 'Amara E.', 'AE', 109880], ['p8', 'Noah B.', 'NB', 108410], ['me', 'You · tbalbi', 'TB', 107960],
  ['p9', 'Ines C.', 'IC', 107200], ['p10', 'Rafael S.', 'RS', 106350], ['p11', 'Hana L.', 'HL', 104990],
  ['p12', 'Owen P.', 'OP', 103420], ['p13', 'Zara Q.', 'ZQ', 101880],
];

export function createLeague(seed = 11) {
  const r = rng(seed);
  const ps = PLAYERS.map(([id, name, mono, eq], i) => {
    const hist = [];
    for (let k = 0; k < 16; k++) hist.push(100000 + (eq - 100000) * (k / 15) + (r() - 0.5) * 1800 * Math.sin((k / 15) * Math.PI));
    hist[15] = eq;
    return { id, name, mono, eq, hist, rank: i + 1, prevRank: i + 1, delta: 0, changedAt: 0, me: id === 'me', hue: (i * 47) % 360 };
  });
  const rankAll = (now) => {
    [...ps].sort((a, b) => b.eq - a.eq).forEach((p, i) => {
      p.prevRank = p.rank; p.rank = i + 1; p.delta = p.prevRank - p.rank;
      if (p.delta) p.changedAt = now;
    });
  };
  return {
    ps,
    tick() {
      const now = Date.now();
      for (let k = 0; k < 4; k++) {
        const p = ps[Math.floor(r() * ps.length)];
        p.eq = Math.round(p.eq * (1 + (r() - 0.5) * 0.024) * 100) / 100;
        p.hist = [...p.hist.slice(1), p.eq];
      }
      const me = ps.find((p) => p.me);
      me.eq = Math.round(me.eq * (1 + (r() - 0.46) * 0.02) * 100) / 100; me.hist = [...me.hist.slice(1), me.eq];
      rankAll(now);
    },
  };
}

// ── Architecture ────────────────────────────────────────────
export const MOMENTS = [
  { part: 1, title: 'Start with a modular monolith', status: 'published', date: 'Mar 2026', change: 'One service, one database', summary: 'One deployable and one shared database. Orders, ledger and prices live as modules inside a single API that talks to Alpaca.' },
  { part: 2, title: 'Market data at the edge', status: 'published', date: 'Apr 2026', change: 'Rust on Lambda, pushed quotes', summary: 'Quotes move out of the monolith. A Rust function on AWS Lambda normalizes Alpaca and Coinbase ticks, and Prices serves them from Redis.' },
  { part: 3, title: 'One database per service', status: 'published', date: 'Jun 2026', change: 'Orders and Ledger split; a queue', summary: 'The monolith splits into Orders and Ledger, each with its own Postgres. The ledger publishes fills to a message queue.' },
  { part: 4, title: 'A live leaderboard', status: 'published', date: 'Aug 2026', change: 'Async fill events drive ranks', summary: 'Leaderboard consumes fill events asynchronously and ranks players within two seconds. The landing page reads its snapshots.' },
  { part: 5, title: 'Durable order workflows', status: 'next', date: 'Oct 2026', change: 'A workflow engine owns the order lifecycle', summary: 'Orders hand each order to a workflow engine that reserves funds, fills and settles, and survives deploys mid-order. Market history arrives for charts.' },
  { part: 6, title: 'Leagues and billing', status: 'planned', date: 'Planned', change: 'Tenant-scoped leagues, Stripe', summary: 'Leagues become the tenant boundary, with plans billed through Stripe. The leaderboard is scoped per league.' },
];

export const ARCH = {
  nodes: [
    { id: 'web', label: 'Trading app', mono: 'TA', kind: 'app', meta: 'Edge', x: 110, y: 300, q: 'apps', from: 1 },
    { id: 'landing', label: 'Landing', mono: 'LA', kind: 'app', meta: 'Static', x: 110, y: 560, q: 'apps', from: 4 },
    { id: 'api', label: 'Bullpen API', mono: 'API', kind: 'service', meta: 'Monolith', x: 390, y: 340, q: 'mono', from: 1, until: 3, changed: [2] },
    { id: 'db', label: 'Postgres', mono: 'PG', kind: 'data', meta: 'Shared', x: 390, y: 470, q: 'mono', from: 1, until: 3 },
    { id: 'prices', label: 'Prices', mono: 'PR', kind: 'service', meta: 'Quotes', x: 390, y: 110, q: 'market', from: 2 },
    { id: 'redis', label: 'Redis', mono: 'R', kind: 'data', meta: 'Hot cache', x: 390, y: 210, q: 'market', from: 2 },
    { id: 'mdata', label: 'Market data', mono: 'MD', kind: 'service', meta: 'Rust · Lambda', x: 670, y: 110, q: 'market', from: 2 },
    { id: 'mhist', label: 'Market history', mono: 'MH', kind: 'service', meta: 'Candles', x: 670, y: 210, q: 'market', from: 5, db: true },
    { id: 'orders', label: 'Orders', mono: 'OR', kind: 'service', meta: 'Tickets', x: 390, y: 340, q: 'trading', from: 3, changed: [5], db: true },
    { id: 'workflow', label: 'Workflow engine', mono: 'WF', kind: 'infra', meta: 'Durable', x: 670, y: 340, q: 'trading', from: 5 },
    { id: 'ledger', label: 'Ledger', mono: 'LE', kind: 'service', meta: 'Cash · positions', x: 670, y: 440, q: 'trading', from: 3, db: true },
    { id: 'queue', label: 'Message queue', mono: 'MQ', kind: 'data', meta: 'At-least-once', x: 670, y: 540, from: 3 },
    { id: 'leaderboard', label: 'Leaderboard', mono: 'LB', kind: 'service', meta: 'Ranks', x: 390, y: 480, q: 'social', from: 4, changed: [6], db: true },
    { id: 'leagues', label: 'Leagues', mono: 'LG', kind: 'service', meta: 'Tenants', x: 390, y: 600, q: 'social', from: 6, db: true },
    { id: 'alpaca', label: 'Alpaca', mono: 'AL', kind: 'ext', meta: 'Stocks', x: 1060, y: 70, from: 1 },
    { id: 'coinbase', label: 'Coinbase', mono: 'CB', kind: 'ext', meta: 'Crypto', x: 1060, y: 150, from: 2 },
    { id: 'massive', label: 'Massive', mono: 'MS', kind: 'ext', meta: 'History', x: 1060, y: 230, from: 5 },
    { id: 'stripe', label: 'Stripe', mono: 'ST', kind: 'ext', meta: 'Billing', x: 1060, y: 600, from: 6 },
  ],
  edges: [
    { id: 'e1', a: 'web', b: 'api', type: 'sync', from: 1, until: 3 },
    { id: 'e2', a: 'api', b: 'db', type: 'sync', from: 1, until: 3 },
    { id: 'e3', a: 'api', b: 'alpaca', type: 'sync', from: 1, until: 2 },
    { id: 'e4', a: 'alpaca', b: 'mdata', type: 'sync', from: 2 },
    { id: 'e5', a: 'coinbase', b: 'mdata', type: 'sync', from: 2 },
    { id: 'e6', a: 'mdata', b: 'prices', type: 'async', from: 2 },
    { id: 'e7', a: 'prices', b: 'redis', type: 'sync', from: 2 },
    { id: 'e8', a: 'web', b: 'prices', type: 'sync', from: 2 },
    { id: 'e9', a: 'api', b: 'redis', type: 'sync', from: 2, until: 3 },
    { id: 'e10', a: 'web', b: 'orders', type: 'sync', from: 3 },
    { id: 'e11', a: 'orders', b: 'ledger', type: 'sync', from: 3, until: 5 },
    { id: 'e12', a: 'orders', b: 'redis', type: 'sync', from: 3, until: 5 },
    { id: 'e13', a: 'ledger', b: 'queue', type: 'async', from: 3 },
    { id: 'e14', a: 'queue', b: 'leaderboard', type: 'async', from: 4 },
    { id: 'e15', a: 'web', b: 'leaderboard', type: 'sync', from: 4 },
    { id: 'e16', a: 'landing', b: 'leaderboard', type: 'sync', from: 4 },
    { id: 'e17', a: 'orders', b: 'workflow', type: 'sync', from: 5 },
    { id: 'e18', a: 'workflow', b: 'ledger', type: 'sync', from: 5 },
    { id: 'e19', a: 'workflow', b: 'prices', type: 'sync', from: 5 },
    { id: 'e20', a: 'massive', b: 'mhist', type: 'sync', from: 5 },
    { id: 'e21', a: 'prices', b: 'mhist', type: 'sync', from: 5 },
    { id: 'e22', a: 'web', b: 'leagues', type: 'sync', from: 6 },
    { id: 'e23', a: 'leagues', b: 'stripe', type: 'sync', from: 6 },
  ],
};

export const QUANTA = { apps: 'Apps', mono: 'Monolith', market: 'Market data quantum', trading: 'Trading quantum', social: 'League quantum' };

export const NODE_INFO = {
  web: { purpose: 'Where players trade: watchlist, terminal, portfolio and the leaderboard.', traits: ['Streams quotes over one SSE connection', 'Holds no state it can\u2019t rebuild from services'], rules: [['Calls services through public APIs only', true], ['Never reads a database directly', true]], adrs: ['ADR-004'], cost: '$0.00', costNote: 'Hosting free tier' },
  landing: { purpose: 'The public window into the project: the series, this explorer, decisions and costs.', traits: ['Static, rebuilt on every publish', 'Reads leaderboard snapshots, never live orders'], rules: [['No authenticated calls', true]], adrs: ['ADR-007'], cost: '$0.00', costNote: 'Hosting free tier' },
  api: { purpose: 'One deployable holding orders, ledger and prices as modules.', traits: ['Modules talk through in-process interfaces', 'One schema shared by every module'], rules: [['Modules don\u2019t import each other\u2019s internals', true], ['No table written by two modules', false]], adrs: ['ADR-001'], cost: '$0.00', costNote: 'Single container, free tier' },
  db: { purpose: 'The single database behind the monolith.', traits: ['One schema, one connection pool'], rules: [['One owner per table', false]], adrs: ['ADR-001'], cost: '$0.00', costNote: '0.4 GB of 3 GB' },
  prices: { purpose: 'Serves the latest quote per symbol and flags anything stale.', traits: ['Reads hot quotes from Redis', 'Marks a quote stale after 15 s without a tick'], rules: [['Never returns a quote without its age', true], ['Owns no durable data', true]], adrs: ['ADR-004'], cost: '$0.00', costNote: 'Free tier' },
  redis: { purpose: 'Hot quote cache and leaderboard sorted sets.', traits: ['Ephemeral: rebuildable from the tick stream'], rules: [['Holds nothing that can\u2019t be rebuilt', true]], adrs: ['ADR-004'], cost: '$0.00', costNote: '18 MB of 30 MB' },
  mdata: { purpose: 'Normalizes quotes from Alpaca and Coinbase into one tick stream.', traits: ['Rust on AWS Lambda', 'Every tick carries a source timestamp and sequence'], rules: [['Transport only, no business logic', true], ['Ticks are timestamped at source', true]], adrs: ['ADR-003'], cost: '$0.00', costNote: '812k of 1M invocations' },
  mhist: { purpose: 'Candles for charts, backfilled from Massive.', traits: ['Read-heavy, cached per timeframe'], rules: [['Owns its database', true]], adrs: ['ADR-003'], cost: '$0.00', costNote: 'Planned' },
  orders: { purpose: 'Accepts, validates and tracks orders from ticket to fill.', traits: ['Idempotency key per order', 'Owns orders_db'], rules: [['Owns its database', true], ['No synchronous chain over two hops', true]], adrs: ['ADR-005', 'ADR-008'], cost: '$0.00', costNote: 'Free tier' },
  workflow: { purpose: 'Runs each order\u2019s lifecycle as a durable, resumable workflow.', traits: ['Retries with backoff', 'Survives deploys mid-order'], rules: [['Every step is replay-safe', true]], adrs: ['ADR-008'], cost: '$0.00', costNote: 'Planned' },
  ledger: { purpose: 'Source of truth for cash, reservations and positions.', traits: ['Double-entry, append-only', 'Publishes OrderFilled events'], rules: [['Writes are idempotent', true], ['Owns its database', true]], adrs: ['ADR-006'], cost: '$0.00', costNote: 'Free tier' },
  queue: { purpose: 'Carries fill events from the ledger to every consumer.', traits: ['At-least-once delivery', 'Consumers deduplicate by event id'], rules: [['Every consumer is idempotent', true]], adrs: ['ADR-007'], cost: '$0.00', costNote: '0.41M of 1M messages' },
  leaderboard: { purpose: 'Ranks players from fill events, per league.', traits: ['Eventually consistent, target \u2264 2 s', 'Rebuilds from the ledger on demand'], rules: [['Rank lag p95 under 2 s', false], ['Owns its database', true]], adrs: ['ADR-007'], cost: '$0.00', costNote: 'Free tier' },
  leagues: { purpose: 'Leagues, members, schedules and plans.', traits: ['Tenant boundary for every other service'], rules: [['Tenant id on every row', true]], adrs: ['ADR-009'], cost: '$0.00', costNote: 'Planned' },
  alpaca: { purpose: 'US stock quotes from the IEX feed.', traits: ['Market hours only, 9:30\u201316:00 ET'], rules: [], adrs: ['ADR-003'], cost: '$0.00', costNote: 'Free IEX feed' },
  coinbase: { purpose: 'Crypto quotes, around the clock.', traits: ['Public WebSocket feed'], rules: [], adrs: ['ADR-003'], cost: '$0.00', costNote: 'Public feed' },
  massive: { purpose: 'Historical candles for chart backfill.', traits: ['Batch pulls, nightly'], rules: [], adrs: ['ADR-003'], cost: '$0.00', costNote: 'Free tier' },
  stripe: { purpose: 'League plans and invoices.', traits: ['Webhooks into Leagues'], rules: [], adrs: ['ADR-009'], cost: '2.9% + 30\u00A2', costNote: 'Per paid league' },
};

export const DECISIONS = [
  { id: 'ADR-001', title: 'Start as a modular monolith', status: 'Superseded', part: 1, note: 'Superseded by ADR-005' },
  { id: 'ADR-002', title: 'Play money only, never brokerage accounts', status: 'Accepted', part: 1 },
  { id: 'ADR-003', title: 'Market data in Rust on AWS Lambda', status: 'Accepted', part: 2 },
  { id: 'ADR-004', title: 'Quotes are pushed to clients, never polled', status: 'Accepted', part: 2 },
  { id: 'ADR-005', title: 'One Postgres database per service', status: 'Accepted', part: 3 },
  { id: 'ADR-006', title: 'The ledger is the source of truth for cash', status: 'Accepted', part: 3 },
  { id: 'ADR-007', title: 'The leaderboard may lag fills by up to 2 s', status: 'Accepted', part: 4 },
  { id: 'ADR-008', title: 'Model the order lifecycle as a durable workflow', status: 'Proposed', part: 5 },
  { id: 'ADR-009', title: 'Bill per league, not per player', status: 'Draft', part: 6 },
];

const T = (k, t) => ({ k, t });
export const RULES = [
  { file: 'rules/services-own-their-data.rule', check: 'Schema grant audit · every deploy', pass: true, when: '2 h ago', lines: [
    [T('kw', 'rule'), T('str', ' "services own their data"')],
    [T('kw', '  for each'), T('id', ' service s')],
    [T('kw', '    forbid'), T('id', ' s.reads(db)')],
    [T('kw', '      where'), T('id', ' db.owner != s')],
    [T('cm', '  # grants are scanned from migrations')],
  ] },
  { file: 'rules/quotes-carry-their-age.rule', check: 'Contract test · every PR', pass: true, when: '41 min ago', lines: [
    [T('kw', 'rule'), T('str', ' "every quote carries its age"')],
    [T('kw', '  for each'), T('id', ' response r'), T('kw', ' from'), T('id', ' prices')],
    [T('kw', '    require'), T('id', ' r.source_ts'), T('kw', ' and'), T('id', ' r.age_ms')],
  ] },
  { file: 'rules/sync-depth.rule', check: 'Trace analysis · nightly', pass: true, when: '9 h ago', lines: [
    [T('kw', 'rule'), T('str', ' "short synchronous chains"')],
    [T('kw', '  for each'), T('id', ' trace t'), T('kw', ' starting at'), T('id', ' app')],
    [T('kw', '    require'), T('id', ' t.sync_hops <= 2')],
  ] },
  { file: 'rules/leaderboard-lag.rule', check: 'SLO probe · every 5 min', pass: false, when: '18:02', result: 'p95 2.4 s, target 2.0 s', lines: [
    [T('kw', 'rule'), T('str', ' "ranks follow fills quickly"')],
    [T('kw', '  measure'), T('id', ' fill.at \u2192 rank.updated_at')],
    [T('kw', '    require'), T('id', ' p95 < 2s'), T('kw', ' over'), T('id', ' 1h')],
  ] },
];

export const COSTS = [
  { name: 'Market data', what: 'Lambda invocations', used: 812, cap: 1000, unit: 'k' },
  { name: 'Postgres', what: 'Storage across 4 databases', used: 2.1, cap: 3, unit: ' GB' },
  { name: 'Message queue', what: 'Messages this month', used: 410, cap: 1000, unit: 'k' },
  { name: 'Redis', what: 'Memory', used: 18, cap: 30, unit: ' MB' },
  { name: 'Apps hosting', what: 'Bandwidth', used: 38, cap: 100, unit: ' GB' },
];

// Order path per moment: each step follows one edge.
export function orderPath(m) {
  const S = (edge, caption, detail, reverse) => ({ edge, caption, detail, reverse: !!reverse });
  if (m >= 5) return [
    S('e10', 'Submit', 'Buy 10 NVDA at market from the ticket'),
    S('e17', 'Start workflow', 'Order #4812 accepted with an idempotency key'),
    S('e18', 'Reserve funds', '$1,824.30 held against buying power'),
    S('e19', 'Price', 'NVDA 182.43, 0.3 s old'),
    S('e18', 'Fill and settle', '10 of 10 filled at 182.43, reservation released'),
    S('e13', 'Publish', 'OrderFilled on the queue'),
    S('e14', 'Rank', 'Leaderboard moves you from #12 to #9'),
  ];
  if (m >= 3) {
    const p = [
      S('e10', 'Submit', 'Buy 10 NVDA at market from the ticket'),
      S('e12', 'Price', 'Hot quote read from Redis, 0.3 s old'),
      S('e11', 'Reserve, fill, settle', 'One synchronous call into the ledger'),
      S('e13', 'Publish', m >= 4 ? 'OrderFilled on the queue' : 'OrderFilled waits in the queue, no consumer until Part 4'),
    ];
    if (m >= 4) p.push(S('e14', 'Rank', 'Leaderboard moves you from #12 to #9'));
    return p;
  }
  if (m === 2) return [S('e1', 'Submit', 'Buy 10 NVDA at market'), S('e9', 'Price', 'Hot quote read from Redis'), S('e2', 'Reserve, fill, settle', 'One transaction in the shared database')];
  return [S('e1', 'Submit', 'Buy 10 NVDA at market'), S('e3', 'Price', 'Quote fetched from Alpaca on every order'), S('e2', 'Reserve, fill, settle', 'One transaction in the shared database')];
}

const alive = (x, m) => (x.from ?? 1) <= m && (x.until == null || m < x.until);

export function momentDiff(m) {
  const lab = (id) => ARCH.nodes.find((n) => n.id === id).label;
  const added = ARCH.nodes.filter((n) => alive(n, m) && !alive(n, m - 1)).map((n) => n.label);
  const removed = ARCH.nodes.filter((n) => !alive(n, m) && alive(n, m - 1)).map((n) => n.label);
  const changed = ARCH.nodes.filter((n) => (n.changed || []).includes(m)).map((n) => n.label);
  return { added, removed, changed, lab };
}

// ── Diagram renderer (React.createElement) ──────────────────
export const NODE_SIZE = { blueprint: [156, 52], tile: [168, 44], port: [152, 44] };
const KIND = { app: 'App', service: 'Service', data: 'Data', infra: 'Infra', ext: 'External' };
const LINE = 'color-mix(in oklch, var(--foreground) 32%, transparent)';
const GHOST = 'color-mix(in oklch, var(--foreground) 16%, transparent)';

export function edgeGeom(A, B, st) {
  const [w, h] = NODE_SIZE[st];
  const dx = B.x - A.x, dy = B.y - A.y, horiz = Math.abs(dx) > Math.abs(dy) * 0.5;
  let sx, sy, tx, ty, d;
  if (horiz) { sx = A.x + Math.sign(dx) * w / 2; sy = A.y; tx = B.x - Math.sign(dx) * w / 2; ty = B.y; }
  else { sx = A.x; sy = A.y + Math.sign(dy) * h / 2; tx = B.x; ty = B.y - Math.sign(dy) * h / 2; }
  if (st === 'tile') d = `M${sx} ${sy}L${tx} ${ty}`;
  else if (st === 'port') {
    if (horiz) { const mx = Math.round((sx + tx) / 2); d = sy === ty ? `M${sx} ${sy}H${tx}` : `M${sx} ${sy}H${mx}V${ty}H${tx}`; }
    else { const my = Math.round((sy + ty) / 2); d = sx === tx ? `M${sx} ${sy}V${ty}` : `M${sx} ${sy}V${my}H${tx}V${ty}`; }
  } else if (horiz) { const mx = (sx + tx) / 2; d = `M${sx} ${sy}C${mx} ${sy} ${mx} ${ty} ${tx} ${ty}`; }
  else { const my = (sy + ty) / 2; d = `M${sx} ${sy}C${sx} ${my} ${tx} ${my} ${tx} ${ty}`; }
  return { d, sx, sy, tx, ty };
}

export function renderDiagram(h, o) {
  const st = o.style || 'blueprint', [W, H] = NODE_SIZE[st], uid = o.uid || 'dg';
  const m = o.moment ?? 6, pm = o.prev ?? m, rd = !!o.reduced;
  const srcN = o.nodes || ARCH.nodes, srcE = o.edges || ARCH.edges;
  const nodes = [], nm = {};
  for (const n of srcN) {
    const now = alive(n, m), before = alive(n, pm);
    if (!now && !before) continue;
    let state = now && !before ? 'added' : !now && before ? 'removed' : (n.changed || []).includes(m) && pm < m ? 'changed' : 'same';
    if (o.states && o.states[n.id]) state = o.states[n.id];
    const nn = { ...n, state }; nodes.push(nn); nm[n.id] = nn;
  }
  const edges = [];
  for (const e of srcE) {
    const now = alive(e, m), before = alive(e, pm);
    if ((!now && !before) || !nm[e.a] || !nm[e.b]) continue;
    edges.push({ ...e, state: now && !before ? 'added' : !now && before ? 'removed' : 'same', g: edgeGeom(nm[e.a], nm[e.b], st) });
  }
  const step = o.step || null, touched = o.touched || new Set();
  const kids = [];
  kids.push(h('defs', { key: 'defs' },
    h('marker', { id: uid + '-ar', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' },
      h('path', { d: 'M0 0L8 4L0 8z', style: { fill: LINE } }))));

  // quanta containers
  if (o.quanta !== false) {
    const groups = {};
    nodes.forEach((n) => { if (n.q && n.state !== 'removed') (groups[n.q] = groups[n.q] || []).push(n); });
    Object.entries(groups).forEach(([q, ns]) => {
      const pad = 18, x0 = Math.min(...ns.map((n) => n.x - W / 2)) - pad, y0 = Math.min(...ns.map((n) => n.y - H / 2)) - pad - 16;
      const x1 = Math.max(...ns.map((n) => n.x + W / 2)) + pad, y1 = Math.max(...ns.map((n) => n.y + H / 2)) + pad + (o.data ? 26 : 0);
      const label = (o.quantaLabels || QUANTA)[q] || q, w = x1 - x0, hh = y1 - y0, parts = [];
      if (st === 'port') {
        const c = 12, s = { stroke: 'color-mix(in oklch, var(--foreground) 38%, transparent)', strokeWidth: 1, fill: 'none' };
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, sx, sy], i) =>
          parts.push(h('path', { key: 'c' + i, d: `M${x} ${y + sy * c}V${y}H${x + sx * c}`, style: s })));
      } else {
        parts.push(h('rect', { key: 'r', x: x0, y: y0, width: w, height: hh, rx: st === 'tile' ? 24 : 18,
          style: st === 'tile' ? { fill: 'color-mix(in oklch, var(--foreground) 5%, transparent)' }
            : { fill: 'color-mix(in oklch, var(--foreground) 3%, transparent)', stroke: GHOST, strokeDasharray: '3 5' } }));
      }
      parts.push(h('text', { key: 't', x: x0 + 14, y: y0 + 17, style: { fill: 'var(--foreground-muted)', fontSize: 9.5, letterSpacing: '0.18em', fontFamily: st === 'port' ? 'var(--font-mono)' : 'var(--font-body)', fontWeight: 600, textTransform: 'uppercase' } }, label.toUpperCase()));
      kids.push(h('g', { key: 'q-' + q, style: { transition: 'opacity 300ms' } }, parts));
    });
  }

  // edges
  edges.forEach((e) => {
    const onPath = step && step.edge === e.id, dim = step && !onPath;
    const showType = o.sync !== false, async = e.type === 'async' && showType, gone = e.state === 'removed';
    const parts = [h('path', { key: 'b', d: e.g.d, 'data-e': uid + e.id, markerEnd: `url(#${uid}-ar)`,
      style: { fill: 'none', stroke: onPath ? 'var(--ember)' : LINE, strokeWidth: onPath ? 1.75 : 1.25, strokeDasharray: async ? '4 5' : undefined, transition: 'stroke 200ms' } })];
    const eg = o.ghostFrom && (e.from ?? 1) >= o.ghostFrom;
    if (!rd && !gone && !eg && showType && e.type === 'sync' && o.flow !== false)
      parts.push(h('path', { key: 'f', d: e.g.d, style: { fill: 'none', stroke: 'var(--ember)', strokeWidth: 1.5, strokeLinecap: 'round', strokeDasharray: '1.5 22.5', opacity: 0.85, animation: 'bp-flow 1.4s linear infinite' } }));
    if (!rd && !gone && !eg && async && o.flow !== false) {
      [0, 1, 2].forEach((i) => {
        const s = 0.04 + 0.12 * i, r = 0.6 + 0.07 * i, q = (0.54 - 0.05 * i).toFixed(2);
        const kt = `0;${s.toFixed(2)};${(s + 0.24).toFixed(2)};${r.toFixed(2)};${Math.min(r + 0.2, 0.99).toFixed(2)};1`;
        parts.push(h('circle', { key: 'd' + i, r: 2.8, style: { fill: 'var(--ember)' } },
          h('animateMotion', { dur: '4.2s', repeatCount: 'indefinite', path: e.g.d, keyPoints: `0;0;${q};${q};1;1`, keyTimes: kt, calcMode: 'linear' }),
          h('animate', { attributeName: 'opacity', dur: '4.2s', repeatCount: 'indefinite', values: '0;1;1;1;1;0', keyTimes: kt })));
      });
    }
    kids.push(h('g', { key: e.id, style: { opacity: dim ? 0.22 : (o.ghostFrom && (e.from ?? 1) >= o.ghostFrom) ? 0.4 : 1, transition: 'opacity 240ms',
      animation: rd ? undefined : e.state === 'added' ? 'bp-fade-in 500ms 320ms both' : gone ? 'bp-fade-out 600ms both' : undefined } }, parts));
  });

  // nodes
  nodes.forEach((n) => {
    const sel = o.selected === n.id, act = step && (step.a === n.id || step.b === n.id), lit = touched.has(n.id);
    const dim = step && !act && !lit, gone = n.state === 'removed', ext = n.kind === 'ext', data = n.kind === 'data' || n.kind === 'infra';
    const hot = sel || act, gh = !!o.ghostFrom && (n.from ?? 1) >= o.ghostFrom && !gone;
    const rx = st === 'tile' ? 22 : st === 'port' ? 3 : data ? 26 : 10;
    const c = [];
    c.push(h('rect', { key: 'bg', x: 0, y: 0, width: W, height: H, rx,
      style: { fill: ext ? 'var(--background)' : hot ? 'color-mix(in oklch, var(--ember) 14%, var(--surface-elevated))' : 'var(--surface-elevated)',
        stroke: hot ? 'var(--ember)' : lit ? 'color-mix(in oklch, var(--ember) 60%, transparent)' : GHOST, strokeWidth: hot ? 1.5 : 1, strokeDasharray: ext ? '3 4' : gh ? '4 3' : undefined, transition: 'fill 200ms, stroke 200ms' } }));
    if (gh && o.ghostLabel !== false) c.push(h('text', { key: 'pl', x: W, y: -6, textAnchor: 'end', style: { fill: 'var(--foreground-muted)', fontSize: 8.5, letterSpacing: '0.16em', fontFamily: 'var(--font-body)', fontWeight: 700 } }, 'PLANNED'));
    if (st === 'blueprint') {
      c.push(h('text', { key: 'k', x: 14, y: 20, style: { fill: 'var(--foreground-muted)', fontSize: 9, letterSpacing: '0.16em', fontFamily: 'var(--font-body)', fontWeight: 600 } }, `${KIND[n.kind]} · ${n.meta}`.toUpperCase()));
      c.push(h('text', { key: 'l', x: 14, y: 39, style: { fill: 'var(--foreground)', fontSize: 14.5, fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '-0.01em' } }, n.label));
    } else if (st === 'tile') {
      c.push(h('rect', { key: 'm', x: 6, y: 6, width: 32, height: 32, rx: 16, style: { fill: ext ? 'transparent' : 'var(--surface-sunken)', stroke: ext ? GHOST : 'none' } }));
      c.push(h('text', { key: 'mt', x: 22, y: 25.5, textAnchor: 'middle', style: { fill: 'var(--foreground)', fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 600 } }, n.mono));
      c.push(h('text', { key: 'l', x: 46, y: 21, style: { fill: 'var(--foreground)', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 700 } }, n.label));
      c.push(h('text', { key: 'k', x: 46, y: 34, style: { fill: 'var(--foreground-muted)', fontSize: 10, fontFamily: 'var(--font-body)' } }, n.meta));
    } else {
      c.push(h('circle', { key: 'dot', cx: 14, cy: H / 2, r: 3.5, style: { fill: n.kind === 'service' ? 'var(--ember)' : n.kind === 'app' ? 'var(--foreground)' : 'none', stroke: 'var(--foreground-muted)', strokeWidth: n.kind === 'service' || n.kind === 'app' ? 0 : 1 } }));
      c.push(h('text', { key: 'l', x: 26, y: H / 2 + 4, style: { fill: 'var(--foreground)', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.06em' } }, n.label.toUpperCase()));
      [[-3, H / 2 - 3], [W - 3, H / 2 - 3]].forEach(([x, y], i) => c.push(h('rect', { key: 'p' + i, x, y, width: 6, height: 6, style: { fill: 'var(--background)', stroke: LINE } })));
    }
    if (o.data && n.db && !gone) {
      c.push(h('path', { key: 'dbl', d: `M${W / 2} ${H}V${H + 8}`, style: { stroke: GHOST } }));
      c.push(h('rect', { key: 'db', x: W / 2 - 34, y: H + 8, width: 68, height: 18, rx: 9, style: { fill: 'var(--surface-sunken)', stroke: GHOST } }));
      c.push(h('text', { key: 'dbt', x: W / 2, y: H + 20.5, textAnchor: 'middle', style: { fill: 'var(--foreground-muted)', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' } }, n.id + '_db'));
    }
    if (n.state === 'changed' && !rd)
      c.push(h('rect', { key: 'ring', x: -4, y: -4, width: W + 8, height: H + 8, rx: rx + 4, style: { fill: 'none', stroke: 'var(--ember)', strokeWidth: 1.5, transformBox: 'fill-box', transformOrigin: 'center', animation: 'bp-ring 900ms 2 var(--ease-out) both' } }));
    if (n.state === 'changed' && rd)
      c.push(h('rect', { key: 'ring', x: -4, y: -4, width: W + 8, height: H + 8, rx: rx + 4, style: { fill: 'none', stroke: 'var(--ember)', strokeWidth: 1.5, strokeDasharray: '2 3' } }));
    if (gone) c.push(h('line', { key: 'strike', x1: 8, y1: H / 2, x2: W - 8, y2: H / 2, style: { stroke: 'var(--foreground)', strokeWidth: 1.5, transformBox: 'fill-box', transformOrigin: 'left center', animation: rd ? undefined : 'bp-strike 320ms var(--ease-out) both' } }));
    const anim = rd ? (gone ? (o.holdRemoved ? 'bp-gone-hold 400ms both' : 'bp-fade-out 400ms both') : n.state === 'added' ? 'bp-fade-in 400ms both' : undefined)
      : n.state === 'added' ? 'bp-grow 560ms 260ms both var(--ease-out-expo)' : gone ? (o.holdRemoved ? 'bp-gone-hold 900ms both' : 'bp-gone 900ms both') : undefined;
    kids.push(h('g', { key: n.id, transform: `translate(${n.x - W / 2} ${n.y - H / 2})`,
      style: { cursor: o.onSelect && !gone ? 'pointer' : 'default', opacity: dim ? 0.38 : gh ? 0.55 : 1, transition: 'opacity 240ms', pointerEvents: gone ? 'none' : 'auto', outline: 'none' },
      tabIndex: o.onSelect && !gone ? 0 : undefined, role: o.onSelect ? 'button' : undefined, 'aria-label': `${n.label}, ${KIND[n.kind]}`,
      onClick: o.onSelect ? () => o.onSelect(n.id) : undefined,
      onKeyDown: o.onSelect ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); o.onSelect(n.id); } } : undefined },
      h('g', { style: { animation: anim, transformBox: 'fill-box', transformOrigin: 'center' } }, c)));
  });

  // packet
  if (step) {
    const e = edges.find((x) => x.id === step.edge);
    if (e) {
      if (rd) {
        const p = step.reverse ? [e.g.sx, e.g.sy] : [e.g.tx, e.g.ty];
        kids.push(h('circle', { key: 'pk', cx: p[0], cy: p[1], r: 6, style: { fill: 'var(--ember)' } }));
      } else {
        const start = step.reverse ? [e.g.tx, e.g.ty] : [e.g.sx, e.g.sy];
        kids.push(h('circle', { key: 'pk' + o.stepKey, r: 6, cx: start[0], cy: start[1], style: { fill: 'var(--ember)', filter: 'drop-shadow(0 0 6px var(--ember))' },
          ref: (el) => {
            if (!el || el.__bp) return; el.__bp = 1;
            const svg = el.ownerSVGElement, p = svg && svg.querySelector(`[data-e="${uid + e.id}"]`); if (!p) return;
            const L = p.getTotalLength(), t0 = performance.now(), D = 1100;
            const fr = (now) => {
              if (!el.isConnected) return;
              if (svg.__paused) { requestAnimationFrame(fr); return; }
              const k = Math.min(1, (now - t0) / D), ez = 1 - Math.pow(1 - k, 4), at = p.getPointAtLength(L * (step.reverse ? 1 - ez : ez));
              el.setAttribute('cx', at.x); el.setAttribute('cy', at.y);
              if (k < 1) requestAnimationFrame(fr);
            };
            requestAnimationFrame(fr);
          } }));
      }
    }
  }
  return h('svg', { key: uid, ref: o.svgRef, viewBox: o.viewBox || '0 0 1160 660', width: '100%', style: { display: 'block', overflow: 'visible', fontFeatureSettings: '"tnum"' }, role: 'img', 'aria-label': o.ariaLabel || 'Architecture diagram' }, kids);
}

// Resolve a step's endpoint ids for highlighting.
export function resolveStep(step) {
  if (!step) return null;
  const e = ARCH.edges.find((x) => x.id === step.edge);
  return e ? { ...step, a: step.reverse ? e.b : e.a, b: step.reverse ? e.a : e.b } : step;
}
