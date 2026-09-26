// Bullpen trading app — scenarios, order engine, views. Builds on bullpen.js.
import * as B from './bullpen.js';
export { B };
export const EXPO = 'cubic-bezier(0.16,1,0.3,1)';
export const INK = 'oklch(14% 0.048 238)';
export const STEPS = ['Reserve funds', 'Submitted', 'Partially filled', 'Filled', 'Settled'];
export const WATCH = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'SPY', 'BTC-USD', 'ETH-USD', 'SOL-USD'];
export const TFS = ['1D', '1W', '1M', '3M', '1Y'];
export const SCENARIOS = [
  ['live', 'Live market'], ['first', 'First visit'], ['closed', 'Stocks closed'], ['stale', 'Stale price'],
  ['reconnecting', 'Reconnecting'], ['offline', 'Offline'], ['rejected', 'Rejected'], ['partial', 'Partial fill'], ['race', 'Cancel races fill'],
];
export const SCENARIO_NOTE = {
  live: 'Both feeds streaming. Confirm a buy to run it through the timeline and the drawer.',
  first: 'A new player: $100,000 in cash, no positions, and the next step in the empty state.',
  closed: 'Stocks closed for the weekend; the indicator says when they open. Crypto keeps streaming.',
  stale: 'NVDA has not ticked for over 15 s: muted, labeled with its time, and the ticket warns before confirming.',
  reconnecting: 'The quote stream dropped. Prices freeze and are labeled; orders wait for live prices.',
  offline: 'No connection. Retries count down; “Retry now” reconnects.',
  rejected: 'Buy 400 NVDA at market is more than buying power: the shortfall and a one-tap fix.',
  partial: 'A limit order rests with 60 of 100 filled; the rest keeps working.',
  race: 'Cancel is pressed while a fill is in flight: 40 of 100 filled first and settle, not lost.',
};

export const isCrypto = (sym) => sym.endsWith('-USD');
export const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour12: false });
export const ageText = (ms) => (ms < 10000 ? (Math.max(ms, 0) / 1000).toFixed(1) : Math.round(ms / 1000)) + ' s ago';
export const qtyFmt = (sym, q) => (isCrypto(sym) ? String(+q.toFixed(4)) : String(Math.round(q)));
export const roundQ = (sym, q) => (isCrypto(sym) ? Math.round(q * 10000) / 10000 : Math.round(q));
export const money = (v) => '$' + B.fmt(v);
export const sMoney = (v) => (v > 0 ? '+' : v < 0 ? B.MINUS : '') + '$' + B.fmt(Math.abs(v));

export function flags(sc) {
  return {
    sc,
    stocks: sc === 'closed' ? 'closed' : sc === 'reconnecting' ? 'reconnecting' : sc === 'offline' ? 'offline' : 'live',
    crypto: sc === 'reconnecting' ? 'reconnecting' : sc === 'offline' ? 'offline' : 'live',
    frozen: sc === 'reconnecting' || sc === 'offline',
    first: sc === 'first',
  };
}
export function tickPool(f, staleSet) {
  if (f.frozen) return [];
  return WATCH.filter((s) => !(staleSet && staleSet.has(s)) && (isCrypto(s) || f.stocks === 'live'));
}

// ── Connection indicator ───────────────────────────────────
export function conn(kind, st, extra = {}) {
  const lbl = kind === 'stocks' ? 'Stocks' : 'Crypto';
  const v = { live: false, closed: false, recon: false, offline: false };
  if (st === 'closed') return { ...v, closed: true, label: lbl + ' closed', meta: 'opens Mon 9:30 ET' };
  if (st === 'reconnecting') return { ...v, recon: true, label: 'Reconnecting', meta: lbl.toLowerCase() + ' · attempt ' + (extra.attempt || 2) + ' of 5' };
  if (st === 'offline') return { ...v, offline: true, label: lbl + ' offline', meta: 'retry in ' + (extra.retry ?? 8) + ' s' };
  return { ...v, live: true, label: lbl + ' live', meta: extra.age != null ? ageText(extra.age) : '' };
}

// ── Quotes ─────────────────────────────────────────────────
export function quoteRow(q, f, now) {
  const v = B.quoteView(q), age = now - q.at;
  const closed = !v.isCrypto && f.stocks === 'closed';
  const stale = !closed && (age > 15000 || f.frozen);
  return {
    ...v, age, stale, closed, live: !stale && !closed,
    fresh: closed ? 'Close · 16:00 ET' : stale ? 'as of ' + clock(q.at) : ageText(age),
    staleAge: Math.round(age / 1000) + ' s old',
    priceTone: stale ? 'var(--bp-stale)' : 'var(--foreground)',
    badgeBgS: stale ? 'var(--bp-panel-2)' : v.badgeBg, badgeBd: stale ? '1px dashed var(--foreground-muted)' : '0',
    spark: B.sparkD(q.hist, 64, 22),
    sparkTone: stale ? 'var(--bp-stale)' : v.tone, sparkDash: stale ? '2 3' : 'none',
  };
}

// ── Session ────────────────────────────────────────────────
export function createSession(sc) {
  const first = sc === 'first';
  const now = Date.now(), m = (min) => clock(now - min * 60000);
  return {
    cash: first ? 100000 : 61358.12,
    positions: first ? [] : [
      { sym: 'NVDA', qty: 40, avg: 176.2 }, { sym: 'AAPL', qty: 20, avg: 236.1 },
      { sym: 'BTC-USD', qty: 0.25, avg: 108900 }, { sym: 'SOL-USD', qty: 30, avg: 219.4 },
    ],
    fills: first ? [] : [
      { t: m(34), side: 'Buy', qty: '20', sym: 'AAPL', px: '236.10' },
      { t: m(96), side: 'Buy', qty: '30', sym: 'SOL', px: '219.40' },
      { t: m(171), side: 'Buy', qty: '0.25', sym: 'BTC', px: '108,900.00' },
      { t: m(242), side: 'Buy', qty: '40', sym: 'NVDA', px: '176.20' },
    ],
  };
}
export function applyFill(ses, sym, side, n, px) {
  if (!n) return;
  let p = ses.positions.find((x) => x.sym === sym);
  if (side === 'buy') {
    ses.cash -= n * px;
    if (!p) { p = { sym, qty: 0, avg: 0, isNew: Date.now() }; ses.positions.unshift(p); }
    p.avg = (p.avg * p.qty + px * n) / (p.qty + n); p.qty = roundQ(sym, p.qty + n);
  } else if (p) {
    ses.cash += n * px; p.qty = roundQ(sym, p.qty - n);
    if (p.qty <= 0) ses.positions = ses.positions.filter((x) => x !== p);
  }
  ses.fills.unshift({ t: clock(Date.now()), side: side === 'buy' ? 'Buy' : 'Sell', qty: qtyFmt(sym, n), sym: B.mono(sym), px: B.fmt(px) });
  ses.fills = ses.fills.slice(0, 6);
}
export function equity(ses, market) {
  return ses.cash + ses.positions.reduce((a, p) => a + p.qty * market.q[p.sym].price, 0);
}

// ── Orders ─────────────────────────────────────────────────
export function orderTitle(o) {
  return `${o.side === 'buy' ? 'Buy' : 'Sell'} ${qtyFmt(o.sym, o.qty)} ${B.mono(o.sym)} · ${o.type === 'limit' ? 'limit ' + B.fmt(o.limit) : 'market'}`;
}
export function maxQty(sym, cash, px) { const f = isCrypto(sym) ? 10000 : 1; return Math.floor((cash / px) * f) / f; }

export function orderFrames(o, px, cash, hold) {
  const q = o.qty, mono = B.mono(o.sym), fq = (n) => qtyFmt(o.sym, n), lim = o.type === 'limit';
  const ref = lim ? o.limit : px, cost = q * ref, t = clock(Date.now());
  const F = (step, fills, status, detail, x = {}) => ({ step, fills, status, detail, ...x });
  const base = { title: orderTitle(o), of: q, order: o };
  if (o.side === 'buy' && cost > cash) {
    const max = maxQty(o.sym, cash, ref);
    return { ...base, frames: [
      F(0, [], `Reserving ${money(cost)}`, 'Checking buying power.'),
      F(0, [], 'Rejected · not enough buying power', `This order needs ${money(cost)} and you have ${money(cash)}: ${money(cost - cash)} short. Nothing was reserved.`, { end: 'rejected', fixQty: max, fix: `Buy ${fq(max)} instead` }),
    ] };
  }
  if (o.side === 'sell' && q > hold) {
    return { ...base, frames: [F(0, [], `Rejected · you hold ${fq(hold)} ${mono}`, `Sell ${fq(hold)} or fewer. Nothing was reserved.`, { end: 'rejected', fixQty: hold, fix: `Sell ${fq(hold)} instead` })] };
  }
  const rests = o.rest != null ? o.rest : lim && (o.side === 'buy' ? o.limit < px : o.limit > px);
  const a = roundQ(o.sym, q * 0.6), b = roundQ(o.sym, q - a);
  if (rests) {
    return { ...base, frames: [
      F(0, [], `Reserving ${money(cost)}`, 'Funds are held at your limit price.'),
      F(1, [], `Submitted · resting at ${B.fmt(o.limit)}`, `Fills when ${mono} trades at ${B.fmt(o.limit)} or ${o.side === 'buy' ? 'lower' : 'higher'}.`),
      F(2, [a], `${fq(a)} of ${fq(q)} filled at ${B.fmt(o.limit)}`, 'Working.', { px: [o.limit] }),
      F(2, [a], `${fq(a)} of ${fq(q)} filled · the rest working`, `The remaining ${fq(b)} rest at ${B.fmt(o.limit)} until the price comes back or you cancel.`, { end: 'open', px: [o.limit] }),
    ] };
  }
  const p2 = Math.round((px + (o.side === 'buy' ? 0.02 : -0.02) * (px / 100)) * 100) / 100, avg = (a * px + b * p2) / q, total = a * px + b * p2;
  return { ...base, frames: [
    F(0, [], o.side === 'buy' ? `Reserving ${money(cost)}` : `Locking ${fq(q)} ${mono}`, o.side === 'buy' ? 'Funds are held so nothing else can spend them.' : 'Shares are held so nothing else can sell them.'),
    F(1, [], 'Submitted', `${lim ? 'Limit' : 'Market'} order sent at ${t}.`),
    F(2, [a], `${fq(a)} of ${fq(q)} filled at ${B.fmt(px)}`, 'Filling in pieces is normal. The rest is working.', { px: [px] }),
    F(3, [a, b], `${fq(q)} of ${fq(q)} filled · avg ${B.fmt(avg)}`, 'Settling with the ledger.', { px: [px, p2] }),
    F(4, [a, b], 'Settled', o.side === 'buy' ? `Position updated. ${money(total)} moved from cash to ${mono}.` : `${money(total)} moved from ${mono} to cash.`, { end: 'settled', px: [px, p2] }),
  ] };
}
export function cancelFrames(run, fr, race) {
  const o = run.order, q = o.qty, fq = (n) => qtyFmt(o.sym, n), f0 = fr.fills.reduce((a, b) => a + b, 0);
  const extra = race ? roundQ(o.sym, (q - f0) * 0.4) : 0, fills = extra ? [...fr.fills, extra] : fr.fills, n = f0 + extra;
  const px = [...(fr.px || []), ...(extra ? [o.limit] : [])];
  const back = money((q - n) * o.limit);
  const head = race ? `Cancel requested — ${fq(n)} of ${fq(q)} filled first` : `Cancelled · ${fq(n)} of ${fq(q)} filled`;
  const detail = n ? `${fq(n)} settled at ${B.fmt(o.limit)} and are in your positions. The other ${fq(q - n)} are cancelled; ${back} is back in buying power.` : `Nothing filled. ${back} is back in buying power.`;
  const out = [{ ...fr, end: undefined, cancelReq: true, status: 'Cancel requested…', detail: 'Waiting for the fill engine to confirm.' }];
  if (race) out.push({ step: 2, fills, px, cancelReq: true, status: head, detail: 'A fill landed before the cancel did. Settling the filled part.' });
  out.push({ step: 4, fills, px, end: 'cancelled', status: head, detail, filledN: n });
  return out;
}

export function tlView(fr, of, reduced) {
  const filled = fr.fills.reduce((a, b) => a + b, 0);
  const steps = STEPS.map((label, k) => {
    let st = k < fr.step ? 'done' : k === fr.step ? 'current' : 'pending', sub = '';
    if (fr.end === 'settled') st = 'done';
    if (fr.end === 'rejected') st = k === 0 ? 'failed' : 'skipped';
    if (fr.end === 'cancelled') st = k === 3 ? 'cancelled' : k === 2 && !filled ? 'skipped' : 'done';
    if (fr.end === 'open') st = k < 2 ? 'done' : k === 2 ? 'current' : 'pending';
    if (k === 2 && filled) sub = `${+filled.toFixed(4)} of ${+(+of).toFixed(4)}`;
    if (k === 2 && fr.cancelReq && !fr.end) sub = 'cancel requested';
    if (k === 3 && fr.end === 'cancelled') sub = `${+(of - filled).toFixed(4)} cancelled`;
    const lbl = st === 'failed' ? 'Rejected' : st === 'cancelled' ? 'Cancelled' : label;
    const V = {
      done: { bg: 'var(--foreground)', fg: 'var(--background)', bd: '0', glyph: '✓', lc: 'var(--foreground)', op: 1, glow: 'none' },
      current: { bg: 'var(--bp-panel)', fg: 'var(--bp-accent-text)', bd: '2px solid var(--ember)', glyph: String(k + 1), lc: 'var(--foreground)', op: 1, glow: '0 0 14px color-mix(in oklch, var(--ember) 45%, transparent)' },
      pending: { bg: 'var(--bp-panel)', fg: 'var(--foreground-muted)', bd: '1.5px solid var(--bp-hair)', glyph: String(k + 1), lc: 'var(--foreground-muted)', op: 1, glow: 'none' },
      failed: { bg: 'var(--destructive)', fg: 'oklch(98% 0.005 238)', bd: '0', glyph: '✕', lc: 'var(--destructive)', op: 1, glow: 'none' },
      cancelled: { bg: 'var(--bp-panel)', fg: 'var(--foreground)', bd: '1.5px dashed var(--foreground-muted)', glyph: '–', lc: 'var(--foreground)', op: 1, glow: 'none' },
      skipped: { bg: 'var(--bp-panel)', fg: 'var(--foreground-muted)', bd: '1.5px dashed var(--bp-hair)', glyph: String(k + 1), lc: 'var(--foreground-muted)', op: 0.45, glow: 'none' },
    }[st];
    return { label: lbl, sub, ...V };
  });
  const reach = fr.end === 'settled' || fr.end === 'cancelled' ? 4 : fr.end === 'rejected' ? 0 : fr.step;
  const w = (n) => (n / of) * 100;
  const segs = [0, 1, 2].map((i) => { const n = fr.fills[i] || 0, left = w(fr.fills.slice(0, i).reduce((a, b) => a + b, 0)); return { left: left + '%', width: (n ? w(n) : 0.01) + '%', bg: 'var(--ember)', scale: n ? 'scaleX(1)' : 'scaleX(0)' }; });
  segs.push({ left: w(filled) + '%', width: (100 - w(filled)) + '%', bg: 'repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 28%, transparent) 0 3px, transparent 3px 7px)', scale: fr.end === 'cancelled' ? 'scaleX(1)' : 'scaleX(0)' });
  const endTone = fr.end === 'rejected' ? 'var(--destructive)' : fr.end === 'cancelled' ? 'var(--foreground-muted)' : fr.end === 'settled' ? 'var(--bp-gain)' : 'var(--bp-accent-text)';
  const working = !fr.end || fr.end === 'open';
  return {
    steps, segs, status: fr.status, detail: fr.detail, filled, working, rejected: fr.end === 'rejected', settled: fr.end === 'settled',
    line: `scaleX(${(reach / 4).toFixed(3)})`, lineTone: fr.end === 'rejected' ? 'var(--destructive)' : 'var(--ember)', lineTr: reduced ? 'none' : `transform 480ms ${EXPO}`,
    filledText: `${+filled.toFixed(4)} of ${+(+of).toFixed(4)}${fr.end === 'cancelled' ? ' · ' + +(of - filled).toFixed(4) + ' cancelled' : ''}`,
    pct: (filled / of) * 100,
    msgGlyph: fr.end === 'rejected' ? '✕' : fr.end === 'settled' ? '✓' : fr.end === 'cancelled' ? '–' : '●',
    msgTone: endTone, msgBg: fr.end === 'rejected' ? 'color-mix(in oklch, var(--destructive) 12%, transparent)' : 'var(--surface-sunken)',
    short: fr.end === 'rejected' ? 'Rejected' : fr.end === 'settled' ? 'Filled' : fr.end === 'cancelled' ? 'Cancelled' : fr.end === 'open' ? 'Working' : fr.cancelReq ? 'Cancel requested' : STEPS[fr.step],
  };
}

// ── Under the hood ─────────────────────────────────────────
export const TRACE = {
  nodes: [
    { id: 'web', label: 'Trading app', mono: 'TA', kind: 'app', meta: 'Edge', x: 100, y: 120, q: 'apps', from: 1 },
    { id: 'orders', label: 'Orders', mono: 'OR', kind: 'service', meta: 'Tickets', x: 330, y: 120, q: 'trading', from: 1 },
    { id: 'ledger', label: 'Ledger', mono: 'LE', kind: 'service', meta: 'Cash · positions', x: 560, y: 120, q: 'trading', from: 1 },
    { id: 'redis', label: 'Redis', mono: 'R', kind: 'data', meta: 'Hot quotes', x: 330, y: 256, q: 'market', from: 1 },
    { id: 'queue', label: 'Message queue', mono: 'MQ', kind: 'data', meta: 'At-least-once', x: 560, y: 256, from: 1 },
    { id: 'leaderboard', label: 'Leaderboard', mono: 'LB', kind: 'service', meta: 'Ranks', x: 790, y: 256, q: 'social', from: 1 },
  ],
  edges: [
    { id: 'e10', a: 'web', b: 'orders', type: 'sync', from: 1 },
    { id: 'e12', a: 'orders', b: 'redis', type: 'sync', from: 1 },
    { id: 'e11', a: 'orders', b: 'ledger', type: 'sync', from: 1 },
    { id: 'e13', a: 'ledger', b: 'queue', type: 'async', from: 1 },
    { id: 'e14', a: 'queue', b: 'leaderboard', type: 'async', from: 1 },
  ],
};
export function traceSteps(title, sym, rejected) {
  const S = (edge, caption, detail) => ({ edge, caption, detail });
  const p = [S('e10', 'Submit', title + ' from the ticket'), S('e12', 'Price', `${B.mono(sym)} quote read from Redis, 0.3 s old`)];
  if (rejected) { p.push(S('e11', 'Reserve', 'The ledger refused: not enough buying power. Nothing else ran.')); return p; }
  p.push(S('e11', 'Reserve, fill, settle', 'One synchronous call into the ledger'), S('e13', 'Publish', 'OrderFilled on the queue'), S('e14', 'Rank', 'Leaderboard re-ranks you within 2 s'));
  return p;
}

// ── Chart ──────────────────────────────────────────────────
const cache = {};
const TFN = { '1W': 50, '1M': 44, '3M': 64, '1Y': 52 };
const DRIFT = { '1W': 0.035, '1M': 0.08, '3M': 0.15, '1Y': 0.34 };
export function series(market, sym, tf) {
  const q = market.q[sym];
  if (tf === '1D') return q.hist;
  const key = sym + tf;
  if (!cache[key]) {
    let h = 7; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
    const r = B.rng(h), n = TFN[tf], end = q.prev, start = end * (1 - DRIFT[tf] * (r() * 1.4 - 0.3));
    const w = [0]; for (let i = 1; i < n; i++) w.push(w[i - 1] + (r() - 0.5));
    const sc = (end * DRIFT[tf]) / 3.2;
    cache[key] = w.map((x, i) => start + (end - start) * (i / (n - 1)) + (x - w[n - 1] * (i / (n - 1))) * sc);
  }
  return [...cache[key], q.price];
}
export const XLABELS = {
  '1D': { stock: ['9:30', '11:00', '12:30', '14:00', '15:30'], crypto: ['00:00', '06:00', '12:00', '18:00', 'Now'] },
  '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], '1M': ['Aug 26', 'Sep 2', 'Sep 9', 'Sep 16', 'Sep 23'],
  '3M': ['Jul 1', 'Jul 29', 'Aug 26', 'Sep 23', ''], '1Y': ['Oct ’25', 'Jan', 'Apr', 'Jul', 'Sep'],
};
export function chartView(pts, W, H, o = {}) {
  const pad = 18, all = o.prev != null ? [...pts, o.prev] : pts;
  let min = Math.min(...all), max = Math.max(...all); const r0 = max - min || 1; min -= r0 * 0.08; max += r0 * 0.08;
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - min) / (max - min)), step = (W - (o.right || 0)) / (pts.length - 1);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const lx = ((pts.length - 1) * step).toFixed(1);
  const area = line + `L${lx} ${H}L0 ${H}Z`;
  const raw = (max - min) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), nice = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) || raw;
  const grid = []; for (let v = Math.ceil(min / nice) * nice; v <= max; v += nice) grid.push({ y: y(v).toFixed(1), label: B.fmt(v, v >= 1000 ? 0 : 2) });
  const last = pts[pts.length - 1];
  return { line, area, grid, lastX: lx, lastY: y(last).toFixed(1), prevY: o.prev != null ? y(o.prev).toFixed(1) : '-100', lastLabel: B.fmt(last) };
}

// ── Odometer ───────────────────────────────────────────────
export function chars(s, anim) {
  const n = s.length;
  return s.split('').map((ch, i) => { const d = /\d/.test(ch); return { ch, digit: d, sep: !d, y: `translateY(-${d ? +ch * 10 : 0}%)`, tr: anim ? `transform 560ms ${EXPO} ${(n - 1 - i) * 30}ms` : 'none' }; });
}

export function seg(opts, cur, set, activeBg) {
  return opts.map(([v, l]) => ({ label: l, value: v, pressed: cur === v ? 'true' : 'false', bg: cur === v ? (activeBg || 'var(--bp-panel-2)') : 'transparent', fg: cur === v ? 'var(--foreground)' : 'var(--foreground-muted)', onClick: () => set(v) }));
}
export function solidChips(opts, cur, set) {
  return opts.map(([v, l]) => ({ label: l, value: v, pressed: cur === v ? 'true' : 'false', bg: cur === v ? 'var(--foreground)' : 'var(--bp-panel-2)', fg: cur === v ? 'var(--background)' : 'var(--foreground)', onClick: () => set(v) }));
}
