// Bullpen — blog embeds, post heroes and share cards. Builds on bullpen.js.
export const DATES = { 1: 'Mar 17, 2026', 2: 'Apr 21, 2026', 3: 'Jun 9, 2026', 4: 'Aug 18, 2026', 5: 'Oct 2026, planned', 6: 'Planned' };

// What each part changes, as a highlight set on the blueprint diagram.
export const HL = {
  1: { nodes: ['api', 'db'], edges: ['e1', 'e2', 'e3'], note: 'One service · one database', crop: [300, 390, 1] },
  2: { nodes: ['mdata', 'prices', 'redis'], edges: ['e4', 'e5', 'e6', 'e7', 'e8', 'e9'], note: 'Alpaca · Coinbase → QuoteTick', crop: [560, 230, 0.95] },
  3: { nodes: ['orders', 'ledger', 'queue'], edges: ['e11', 'e13'], note: 'orders_db · ledger_db · queue', crop: [530, 420, 0.95], data: true },
  4: { nodes: ['web', 'orders', 'redis', 'ledger', 'queue', 'leaderboard'], edges: ['e10', 'e12', 'e11', 'e13', 'e14'], note: 'Submit → fill → rank', crop: [410, 380, 0.72] },
  5: { nodes: ['prices', 'web', 'workflow', 'mhist', 'redis'], edges: ['e6', 'e7', 'e8', 'e19', 'e21'], note: 'Price fan-out · 4 readers', crop: [470, 250, 0.72] },
  6: { nodes: ['leagues', 'stripe', 'leaderboard'], edges: ['e22', 'e23'], note: 'Tenant boundary · Stripe', crop: [560, 500, 0.85] },
};

// 360-wide embeds show only what the part changed.
export const NARROW_CROP = {
  1: '20 250 470 270', 2: '290 44 470 215', 3: '285 262 490 320', 4: '285 176 490 440', 5: '285 40 490 330', 6: '285 420 490 220',
};
export const ORDER_CROP = { 1: '20 40 1140 480', 2: '20 60 780 460', 3: '20 170 770 440', 4: '20 170 770 440', 5: '20 60 780 560', 6: '20 60 780 560' };

export function cropBox(part, w, h) {
  const [cx, cy, s] = HL[part].crop, vw = w / s, vh = h / s;
  return `${Math.round(cx - vw / 2)} ${Math.round(cy - vh / 2)} ${Math.round(vw)} ${Math.round(vh)}`;
}

export const USAGE_NOTE = 'resets Oct 1';
