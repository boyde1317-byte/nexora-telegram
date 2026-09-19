/**
 * @file src/lib/orderStore.js
 *
 * Server-order queue behind .order / .orderapprove / .orderdeny.
 *
 * Mirrors the .pair request flow: a Map keyed by order id with TTL
 * pruning, one pending order per requester, and a modest global cap.
 * Orders auto-expire after 24h (nobody wants to approve a stale plan
 * request from yesterday's price mood).
 */

const ORDER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING = 25;

/** id -> { id, plan, price, note, buyerJid, buyerName, chatJid, ts } */
const orders = new Map();
let seq = 0;

function prune() {
  const now = Date.now();
  for (const [id, o] of orders) {
    if (now - o.ts > ORDER_TTL_MS) orders.delete(id);
  }
}

export function fileOrder({ plan, price, note, buyerJid, buyerName, chatJid }) {
  prune();
  const mine = [...orders.values()].find(o => o.buyerJid === buyerJid);
  if (mine) {
    throw new Error(`You already have a pending order (*${mine.plan}*) — it must be approved, denied, or expire before you file another.`);
  }
  if (orders.size >= MAX_PENDING) {
    throw new Error('Order queue is full — the owner needs to clear it first.');
  }
  const id = `O${String(++seq).padStart(3, '0')}`;
  const order = { id, plan, price, note, buyerJid, buyerName, chatJid, ts: Date.now() };
  orders.set(id, order);
  return order;
}

export function listOrders() {
  prune();
  return [...orders.values()].sort((a, b) => b.ts - a.ts);
}

export function peekOrder(idOrPlan) {
  prune();
  const key = String(idOrPlan || '').toLowerCase().replace(/\s+/g, '');
  // Order ids are stored uppercase ("O001") — normalize BOTH ways so
  // ".orderapprove o001" works as naturally as the card's ".orderapprove O001".
  const byId = orders.get(key) || orders.get(key.toUpperCase()) || null;
  if (byId) return byId;
  return [...orders.values()].find(o => o.plan.toLowerCase().replace(/\s+/g, '') === key) || null;
}

export function takeOrder(idOrPlan) {
  const o = peekOrder(idOrPlan);
  if (o) orders.delete(o.id);
  return o;
}

export const ORDER_TTL_LABEL = '~24 hours';
