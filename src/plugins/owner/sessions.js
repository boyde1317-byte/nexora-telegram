/**
 * sessions.js — list extra linked bot sessions (.sessions).
 * The presentation helper is exported for .pair list reuse.
 */
import { richTableCard } from '../../lib/interactiveKit.js';
import { listSessions, MAX_EXTRA_SESSIONS } from '../../core/sessionManager.js';

export async function listAndSend(sock, m, prefix) {
  let list = listSessions();

  // Privacy: a paired session's owner only sees their own session — the
  // full roster (every paired number) is for main-socket owners and the
  // super owner.
  if (sock._nexoraExtraSession && !(await m.isSuperOwner)) {
    list = list.filter(s2 => s2.phone === sock._nexoraSessionPhone);
  }
  if (!list.length) {
    return await m.reply.info(
      `*No extra sessions yet.*\n\nLink one with \`${prefix || '.'}pair <number with country code>\`.`,
      'SESSIONS'
    );
  }
  const rows = list.map((s, i) => [
    `${i + 1}. ${s.name || '—'}`,
    `+${s.phone}`,
    s.status === 'online' ? '🟢 Online'
      : s.status === 'awaiting_code' ? '🟡 Awaiting code'
      : s.status === 'reconnecting' ? '🔁 Reconnecting'
      : s.status === 'starting' ? '⏳ Starting'
      : `⚪ ${s.status}${s.lastError ? ` (${s.lastError})` : ''}`,
  ]);
  try {
    return await richTableCard(sock, m.from, {
      title: '🔗 LINKED SESSIONS',
      headers: ['Name', 'Number', 'Status'],
      rows,
      footer: `NEXORA • ${list.length}/${MAX_EXTRA_SESSIONS} sessions`,
    }, { quoted: m });
  } catch (err) {
    console.warn('[sessions] table card failed:', err.message);
    return await m.reply(
      `*LINKED SESSIONS (${list.length}/${MAX_EXTRA_SESSIONS})*\n\n` +
      list.map((s) => `+${s.phone} — ${s.name || '—'} — ${s.status}`).join('\n')
    );
  }
}

export default {
  name: 'sessions',
  aliases: ['listsessions'],
  category: 'owner',
  description: 'List extra linked bot sessions.',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, prefix }) => listAndSend(sock, m, prefix || '.'),
};
