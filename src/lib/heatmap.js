/**
 * @file src/lib/heatmap.js
 *
 * In-memory group activity heatmap — the data layer behind .heatchart.
 *
 * The bot already sees every real message; this just tallies them per
 * group: 24 hourly buckets, 7 weekday buckets, and a per-user counter.
 * Kept deliberately in-memory (no db.json churn): a heatmap is a
 * rolling vibe snapshot, not an accounting system. Buckets are stamped
 * with the last-touched date and rotated lazily — a chat that goes
 * quiet keeps its numbers until someone talks again, then the stale
 * buckets reset so the chart always reflects RECENT activity, not
 * all-time totals from a dead era.
 *
 * Memory bound: one small record per active group; users map capped
 * at 200 entries per group (top talkers stay, drive-bys rotate out).
 */

const MAX_USERS_PER_GROUP = 200;

/** jid -> { dayKey, hours: Int8Array(24), days: Int8Array(7), users: Map } */
const store = new Map();

function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Tally one real message. Call from the message handler's passive-activity
 * block — same place passive XP is granted, so the "what counts as
 * activity" definition stays identical for both.
 */
export function trackActivity(jid, sender, ts = Date.now()) {
  if (!jid || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  try {
    const d = new Date(ts);
    const todayKey = dayKeyOf(ts);

    let rec = store.get(jid);
    if (!rec) {
      rec = { dayKey: todayKey, hours: new Uint32Array(24), days: new Uint32Array(7), users: new Map(), total: 0 };
      store.set(jid, rec);
    }
    // Lazy daily rotation: the first message of a NEW day resets the
    // hourly buckets so .heatchart shows the last ~24h of activity,
    // not yesterday's pattern wearing today's hat.
    if (rec.dayKey !== todayKey) {
      rec.hours.fill(0);
      rec.dayKey = todayKey;
    }

    rec.hours[d.getHours()]++;
    rec.days[d.getDay()]++;
    rec.total++;

    if (sender) {
      rec.users.set(sender, (rec.users.get(sender) || 0) + 1);
      if (rec.users.size > MAX_USERS_PER_GROUP) {
        // Drop the quietest user to bound memory in mega-groups.
        let quiet = null, min = Infinity;
        for (const [u, n] of rec.users) { if (n < min) { min = n; quiet = u; } }
        if (quiet) rec.users.delete(quiet);
      }
    }
  } catch (_) { /* never break message handling for a tally */ }
}

/**
 * Snapshot for a chat: hourly buckets (24), weekday buckets (7),
 * all-time total, and top users sorted by count.
 */
export function getHeat(jid) {
  const rec = store.get(jid);
  if (!rec) return null;
  const top = [...rec.users.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phone, count]) => ({ phone, count }));
  return {
    hours: Array.from(rec.hours),
    days: Array.from(rec.days),
    total: rec.total,
    top,
    activeUsers: rec.users.size,
  };
}
