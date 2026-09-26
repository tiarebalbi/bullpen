// Bullpen — architecture page data. Builds on bullpen.js.
import { ARCH, MOMENTS, NODE_INFO, orderPath, resolveStep, momentDiff, MINUS } from './bullpen.js';
export { ARCH, MOMENTS, NODE_INFO, orderPath, resolveStep, momentDiff, MINUS };

export const PUBLISHED = 4;
export const alive = (x, m) => (x.from ?? 1) <= m && (x.until == null || m < x.until);
export const node = (id) => ARCH.nodes.find((n) => n.id === id);
export const label = (id) => (node(id) || { label: id }).label;

export const TABS = [
  ['overview', 'Overview', 1], ['services', 'Services', 1], ['flows', 'Flows', 1], ['data', 'Data', 3],
  ['decisions', 'Decisions', 1], ['rules', 'Rules', 1], ['changes', 'Changes', 2], ['cost', 'Cost', 1],
];

export const NOT_REACHED = {
  data: { title: 'Data ownership arrives in Part 3', body: 'Until Part 3 every module shares one Postgres database. In Part 3 it splits: each owning service gets its own database, and anyone else learns about that data through events.', shows: ['Each database attached to exactly one service', 'Readers connected through events, never through tables', 'The ownership check and its last CI result'], preview: 3 },
  changes: { title: 'Changes start in Part 2', body: 'Part 1 is the starting point: one service and one database. From Part 2 on, this tab compares each part with the one before it.', shows: ['Added nodes grow in, removed nodes strike and fade', 'A side-by-side compare of the two parts', 'The decision behind every change'], preview: 2 },
  history: { title: 'Nightly history arrives in Part 5', body: 'Charts need candles, and candles need a nightly backfill. Part 5 adds Market history, fed by Massive after the close.', shows: ['A nightly batch pull from Massive', 'Today’s candle closed from the live tick stream', 'Charts reading cached candles'], preview: 5 },
};

const RUNTIME = { vercel: 'Vercel', lambda: 'Rust on AWS Lambda' };
export const SERVICES = [
  { id: 'api', name: 'Bullpen API', rt: 'vercel', owns: 'bullpen_db', ownsNote: 'Shared by every module', rules: ['R2'], adrs: ['ADR-0002', 'ADR-0003'],
    iface: [['in', 'HTTP', 'POST /orders', 'sync'], ['in', 'HTTP', 'GET /quotes/:symbol', 'sync'], ['out', 'SQL', 'bullpen_db', 'sync'], ['out', 'HTTP', 'Alpaca REST · Part 1', 'sync']] },
  { id: 'mdata', name: 'Market data', rt: 'lambda', owns: 'Nothing durable', ownsNote: 'Ticks are transport, not state', rules: ['R2'], adrs: ['ADR-0001', 'ADR-0002'],
    iface: [['in', 'WebSocket', 'Alpaca IEX stream', 'sync'], ['in', 'WebSocket', 'Coinbase ticker', 'sync'], ['out', 'Event', 'QuoteTick', 'async']] },
  { id: 'prices', name: 'Prices', rt: 'vercel', owns: 'quote:* in Redis', ownsNote: 'Ephemeral, rebuilt from ticks', rules: ['R2'], adrs: ['ADR-0002'],
    iface: [['in', 'Event', 'QuoteTick', 'async'], ['in', 'SSE', 'GET /stream', 'sync'], ['in', 'HTTP', 'GET /quotes/:symbol', 'sync']] },
  { id: 'orders', name: 'Orders', rt: 'vercel', owns: 'orders_db', ownsNote: 'Tickets, idempotency keys', rules: ['R2', 'R3'], adrs: ['ADR-0004'],
    iface: [['in', 'HTTP', 'POST /orders', 'sync'], ['in', 'HTTP', 'GET /orders/:id', 'sync'], ['out', 'Redis', 'GET quote:*', 'sync'], ['out', 'RPC', 'ledger.reserveAndFill', 'sync']] },
  { id: 'ledger', name: 'Ledger', rt: 'vercel', owns: 'ledger_db', ownsNote: 'Cash, reservations, positions', rules: ['R1', 'R2'], adrs: ['ADR-0004'],
    iface: [['in', 'RPC', 'reserveAndFill', 'sync'], ['in', 'HTTP', 'GET /portfolio', 'sync'], ['out', 'Event', 'OrderFilled', 'async']] },
  { id: 'leaderboard', name: 'Leaderboard', rt: 'vercel', owns: 'leaderboard_db', ownsNote: 'Ranks and snapshots', rules: ['R2'], adrs: ['ADR-0004'],
    iface: [['in', 'Event', 'OrderFilled', 'async'], ['in', 'HTTP', 'GET /leagues/:id/ranks', 'sync']] },
  { id: 'mhist', name: 'Market history', rt: 'vercel', owns: 'mhist_db', ownsNote: 'Candles per timeframe', rules: ['R2'], adrs: [],
    iface: [['in', 'Batch', 'Massive nightly pull', 'sync'], ['in', 'Event', 'QuoteTick (close)', 'async'], ['in', 'HTTP', 'GET /candles/:symbol', 'sync']] },
  { id: 'leagues', name: 'Leagues', rt: 'vercel', owns: 'leagues_db', ownsNote: 'Leagues, members, plans', rules: ['R2'], adrs: [],
    iface: [['in', 'HTTP', 'GET /leagues/:id', 'sync'], ['in', 'Webhook', 'Stripe invoice.paid', 'async']] },
];
export const INFRA = [
  { id: 'redis', name: 'Redis', meta: 'Hot cache' }, { id: 'queue', name: 'Message queue', meta: 'At-least-once' },
  { id: 'workflow', name: 'Workflow engine', meta: 'Durable' }, { id: 'db', name: 'Postgres', meta: 'Shared' },
];
export const EXTERNAL = [
  { id: 'alpaca', name: 'Alpaca', meta: 'Stocks · IEX' }, { id: 'coinbase', name: 'Coinbase', meta: 'Crypto' },
  { id: 'massive', name: 'Massive', meta: 'History' }, { id: 'stripe', name: 'Stripe', meta: 'Billing' },
];
export function servicesAt(m) {
  return SERVICES.map((s) => {
    const n = node(s.id), x = { ...s, runtime: RUNTIME[s.rt], from: n.from, until: n.until, alive: alive(n, m) };
    if (s.id === 'orders' && m >= 5) x.iface = [['in', 'HTTP', 'POST /orders', 'sync'], ['in', 'HTTP', 'GET /orders/:id', 'sync'], ['out', 'RPC', 'workflow.start', 'sync']];
    if (s.id === 'api' && m >= 2) x.iface = s.iface.filter((i) => !i[2].startsWith('Alpaca')).concat([['out', 'Redis', 'GET quote:*', 'sync']]);
    return x;
  });
}

export const ADR_MAP = { web: ['ADR-0001', 'ADR-0003'], landing: ['ADR-0003'], api: ['ADR-0002', 'ADR-0003'], db: ['ADR-0002'], prices: ['ADR-0002'], redis: ['ADR-0001'], mdata: ['ADR-0001', 'ADR-0002'], orders: ['ADR-0004'], ledger: ['ADR-0004'], queue: ['ADR-0004'], leaderboard: ['ADR-0004'], alpaca: ['ADR-0001'], coinbase: ['ADR-0001'] };

const T = (k, t) => ({ k, t });
export const RULES = [
  { id: 'R1', file: 'rules/ledger-db-owner.rule', title: 'Only Ledger reads the ledger database', from: 3, pass: true, check: 'Postgres grant audit', cadence: 'every deploy', run: '#1284', commit: '9f3c2ab', ago: '2 h ago', at: 'Sep 25, 12:04',
    becomes: 'A grant audit on every deploy. It reads the GRANT statements in every migration and fails if any role other than ledger_svc can read ledger_db.',
    history: 'PPPPPPPPPPPPPPPPPPPP', historyNote: '20 of 20 passed since Part 3',
    lines: [[T('kw', 'rule'), T('str', ' "only Ledger reads the ledger database"')], [T('kw', '  database'), T('id', ' ledger_db')], [T('kw', '    owner'), T('id', '  ledger')], [T('kw', '    allow'), T('id', '  ledger.read, ledger.write')], [T('kw', '    forbid'), T('id', ' any other service'), T('kw', ' reads'), T('id', ' ledger_db')], [T('cm', '  # checked against the GRANTs in every migration')]] },
  { id: 'R2', file: 'rules/public-entry.rule', title: 'Packages import only through their public entry', from: 1, pass: true, check: 'Import-graph lint', cadence: 'every pull request', run: '#1291', commit: 'c41e07d', ago: '38 min ago', at: 'Sep 25, 13:26',
    becomes: 'An import-graph lint on every pull request. It resolves every import under packages/ and fails on any path into another package’s internals.',
    history: 'PPPPPPPPPPPPFPPPPPPP', historyNote: '19 of 20 passed · #1277 fixed in 40 min',
    lines: [[T('kw', 'rule'), T('str', ' "packages import only through their public entry"')], [T('kw', '  for each'), T('id', ' import i'), T('kw', ' in'), T('id', ' packages/*')], [T('kw', '    require'), T('id', ' i.target == i.package.entry')], [T('kw', '    forbid'), T('id', '  i.path'), T('kw', ' matches'), T('str', ' "*/internal/*"')], [T('cm', '  # entry = the package’s index.ts')]] },
  { id: 'R3', file: 'rules/order-path-sync.rule', title: 'The order path makes at most one synchronous call', from: 4, pass: false, check: 'Trace analysis', cadence: 'nightly at 02:00 PT', run: '#1279', commit: '9f3c2ab', ago: '12 h ago', at: 'Sep 25, 02:10',
    becomes: 'A nightly trace analysis. It replays yesterday’s order traces from POST /orders to OrderFilled and counts the synchronous calls Orders makes.',
    history: 'FFFFFFF', historyNote: 'Failing since it was added on Sep 19 · known, fixed by Part 5',
    failure: ['✕ order-path-sync  trace 7f21c9 · Buy 10 NVDA', '  orders → redis   sync  GET quote:NVDA        4 ms', '  orders → ledger  sync  reserveAndFill       38 ms', '  2 synchronous calls, limit is 1', '  next: the workflow engine in Part 5 owns both steps'],
    lines: [[T('kw', 'rule'), T('str', ' "the order path makes at most one synchronous call"')], [T('kw', '  trace'), T('id', '  POST /orders'), T('kw', ' until'), T('id', ' OrderFilled')], [T('kw', '    count'), T('id', '   sync_calls'), T('kw', ' from'), T('id', ' orders')], [T('kw', '    require'), T('id', ' sync_calls <= '), T('num', '1')], [T('cm', '  # asynchronous messages don’t count')]] },
];

export const DECISIONS = [
  { id: 'ADR-0001', slug: 'stack', title: 'Stack', status: 'Accepted', part: 1, date: 'Mar 2, 2026',
    context: 'Bullpen is built by one person, in the evenings, in public. The stack has to be boring enough to maintain alone and cheap enough to run on free tiers, while still leaving room for real trade-offs.',
    decision: 'TypeScript for apps and services, deployed on Vercel. Postgres for durable state, Redis for anything hot and rebuildable. Rust on AWS Lambda only where cost per invocation or latency decides it: the market-data path.',
    easier: ['One language across almost every package', 'Free tiers cover the league at today’s size'], harder: ['Two runtimes to observe: Vercel functions and Lambda', 'Rust is a second toolchain in CI'],
    supersedes: null, supersededBy: null, related: null },
  { id: 'ADR-0002', slug: 'why-distribute', title: 'Why distribute', status: 'Accepted', part: 1, date: 'Mar 2, 2026',
    context: 'A distributed system costs latency, failure modes and operational work. A series about architecture is not a reason to pay that cost on day one.',
    decision: 'Start as a modular monolith. Move a module out only when it has a different scaling, failure or ownership profile from the rest, and write down which one. Market data is expected to leave first.',
    easier: ['Every split has a stated reason you can check', 'Parts 1 and 2 ship with no network calls between modules'], harder: ['Module boundaries must hold inside one process, enforced by rules instead of the network'],
    supersedes: null, supersededBy: null, related: 'Refined by ADR-0004' },
  { id: 'ADR-0003', slug: 'monorepo', title: 'Monorepo', status: 'Accepted', part: 1, date: 'Mar 9, 2026',
    context: 'Services will split over the series, but they share types, contracts and rules. Splitting the repository with them would hide the history the series is about.',
    decision: 'One repository with apps/, services/ and packages/. Each package exposes one public entry, and nothing imports another package’s internals. A rule checks it on every pull request.',
    easier: ['A contract change lands in one pull request', 'The architecture’s history is one git log'], harder: ['CI has to build only what changed to stay fast', 'Boundaries depend on the import rule, not on repository walls'],
    supersedes: null, supersededBy: null, related: 'Enforced by rules/public-entry.rule' },
  { id: 'ADR-0004', slug: 'deploy-topology', title: 'Deploy topology', status: 'Proposed', part: 3, date: 'Jun 3, 2026',
    context: 'Orders and Ledger split from the monolith, each with its own database. They need to deploy independently without breaking an order mid-flight.',
    decision: 'Each owning service deploys on its own, with its own Postgres database and migrations. On the order path, services call each other synchronously at most once; everything else crosses the queue as events. Market data stays on Lambda.',
    easier: ['A ledger migration can’t block an orders deploy', 'Readers of fills never touch the ledger database'], harder: ['Four databases to back up and migrate', 'The order path still makes two synchronous calls, so its rule fails until Part 5'],
    supersedes: null, supersededBy: null, related: 'Refines ADR-0002 · open for comments until Part 5 ships' },
];

// Flows: sequence steps { a, b, type, caption, detail }
export function flowsAt(m) {
  const typeOf = (id) => (ARCH.edges.find((e) => e.id === id) || {}).type || 'sync';
  const order = orderPath(m).map((p) => { const r = resolveStep(p); return { a: r.a, b: r.b, type: typeOf(p.edge), caption: p.caption, detail: p.detail }; });
  const prices = m >= 2 ? [
    { a: 'alpaca', b: 'mdata', type: 'sync', caption: 'Stream ticks', detail: 'IEX trades over WebSocket, market hours only' },
    { a: 'coinbase', b: 'mdata', type: 'sync', caption: 'Stream ticks', detail: 'Crypto ticker, around the clock' },
    { a: 'mdata', b: 'prices', type: 'async', caption: 'Publish QuoteTick', detail: 'Normalized, stamped with source time and a sequence number' },
    { a: 'prices', b: 'redis', type: 'sync', caption: 'Write the hot quote', detail: 'quote:NVDA = 182.43, 0.3 s old' },
    { a: 'prices', b: 'web', type: 'sync', caption: 'Push to every screen', detail: 'One SSE stream per tab; marked stale after 15 s without a tick' },
  ] : [
    { a: 'web', b: 'api', type: 'sync', caption: 'Ask for a quote', detail: 'Every screen polls every 5 s' },
    { a: 'api', b: 'alpaca', type: 'sync', caption: 'Fetch the quote', detail: 'One REST call per poll, 180–400 ms' },
    { a: 'api', b: 'web', type: 'sync', caption: 'Return the quote', detail: 'Up to 5 s old by the time it renders' },
  ];
  const history = [
    { a: 'massive', b: 'mhist', type: 'sync', caption: 'Pull yesterday’s bars', detail: '02:00 ET, 1-minute bars for every listed symbol' },
    { a: 'prices', b: 'mhist', type: 'async', caption: 'Close today’s candle', detail: 'The session’s last tick becomes the close' },
    { a: 'web', b: 'mhist', type: 'sync', caption: 'Charts read candles', detail: 'Cached per timeframe for 60 s' },
  ];
  return [
    { id: 'order', slug: 'place-an-order', name: 'Place an order', from: 1, steps: order },
    { id: 'prices', slug: 'prices-to-every-screen', name: 'Prices to every screen', from: 1, steps: prices },
    { id: 'history', slug: 'nightly-history', name: 'Nightly history', from: 5, steps: history, nr: 'history' },
  ];
}

export const EVENTS = [
  { name: 'QuoteTick', from: 'mdata', to: ['prices'], via: 'Async invoke', part: 2 },
  { name: 'OrderFilled', from: 'ledger', to: ['leaderboard'], via: 'Message queue', part: 4 },
  { name: 'QuoteTick (close)', from: 'prices', to: ['mhist'], via: 'Message queue', part: 5 },
];

export const CHANGE_WHY = {
  2: [['+', 'Market data', ['ADR-0001', 'ADR-0002'], 'Ticks scale differently from orders, so they leave first, in Rust on Lambda.'], ['+', 'Prices and Redis', ['ADR-0002'], 'Quotes are pushed from a hot cache instead of fetched per order.'], ['+', 'Coinbase', ['ADR-0001'], 'Crypto trades around the clock; stocks only in market hours.'], ['~', 'Bullpen API', ['ADR-0002'], 'Stops calling Alpaca and reads quotes from Redis.']],
  3: [['+', 'Orders', ['ADR-0004'], 'Owns orders_db and deploys on its own.'], ['+', 'Ledger', ['ADR-0004'], 'Owns cash and positions in ledger_db.'], ['+', 'Message queue', ['ADR-0004'], 'Fills leave the ledger as events.'], ['−', 'Bullpen API', ['ADR-0002'], 'The monolith is gone once its last module moves out.'], ['−', 'Shared Postgres', ['ADR-0004'], 'One database per owning service.']],
  4: [['+', 'Leaderboard', ['ADR-0004'], 'Consumes OrderFilled and ranks within 2 s.'], ['+', 'Landing', ['ADR-0003'], 'A new app in the same repository, reading snapshots.']],
  5: [['+', 'Workflow engine', [], 'Owns the order lifecycle so a deploy can’t strand an order.'], ['+', 'Market history', [], 'Candles for charts.'], ['+', 'Massive', [], 'Nightly backfill source.'], ['~', 'Orders', [], 'Hands each order to the workflow engine: one synchronous call.']],
  6: [['+', 'Leagues', [], 'Leagues become the tenant boundary.'], ['+', 'Stripe', [], 'Plans billed per league.'], ['~', 'Leaderboard', [], 'Scoped per league.']],
};

// Cost (est. — placeholders until the cost model exists)
export const COST_ROWS = [
  { id: 'hosting', name: 'Apps hosting', provider: 'Vercel', driver: 'Bandwidth, builds', from: 1, k: 0.10 },
  { id: 'api', name: 'Bullpen API', provider: 'Vercel', driver: 'Function time', from: 1, until: 3, k: 0.61 },
  { id: 'db', name: 'Shared Postgres', provider: 'Postgres', driver: 'Storage, compute', from: 1, until: 3, k: 0.30 },
  { id: 'mdata', name: 'Market data', provider: 'AWS Lambda', driver: 'Invocations', from: 2, k: 0.31 },
  { id: 'prices', name: 'Prices', provider: 'Vercel', driver: 'Streaming time', from: 2, k: 0.22 },
  { id: 'redis', name: 'Redis', provider: 'Redis', driver: 'Commands, memory', from: 2, k: 0.12 },
  { id: 'orders', name: 'Orders', provider: 'Vercel', driver: 'Function time', from: 3, k: 0.18 },
  { id: 'ledger', name: 'Ledger', provider: 'Vercel', driver: 'Function time', from: 3, k: 0.25 },
  { id: 'pg', name: 'Postgres, per service', provider: 'Postgres', driver: 'Storage, compute', from: 3, k: 0.38 },
  { id: 'queue', name: 'Message queue', provider: 'Queue', driver: 'Messages', from: 3, k: 0.08 },
  { id: 'leaderboard', name: 'Leaderboard', provider: 'Vercel', driver: 'Function time', from: 4, k: 0.20 },
  { id: 'mhist', name: 'Market history', provider: 'Vercel', driver: 'Function time', from: 5, k: 0.09 },
  { id: 'workflow', name: 'Workflow engine', provider: 'Workflow', driver: 'Workflow steps', from: 5, k: 0.35 },
  { id: 'leagues', name: 'Leagues', provider: 'Vercel', driver: 'Function time', from: 6, k: 0.10 },
];
export const USAGE = [
  { name: 'Market data', what: 'Lambda invocations', used: 812, cap: 1000, unit: 'k', from: 2, resets: 'Resets Oct 1' },
  { name: 'Postgres', what: 'Storage across databases', used: 2.1, cap: 3, unit: ' GB', from: 1, resets: 'Storage, doesn’t reset' },
  { name: 'Message queue', what: 'Messages this month', used: 410, cap: 1000, unit: 'k', from: 3, resets: 'Resets Oct 1' },
  { name: 'Redis', what: 'Memory', used: 18, cap: 30, unit: ' MB', from: 2, resets: 'Peak, resets Oct 1' },
  { name: 'Apps hosting', what: 'Bandwidth', used: 38, cap: 100, unit: ' GB', from: 1, resets: 'Resets Oct 1' },
];
export const FREE_PLAYERS = 1200;
