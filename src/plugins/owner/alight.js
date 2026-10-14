/**
 * alight.js — Alight Motion Pro account creator via api.jaky.dev.
 *
 * Owner-only: every bulk call deducts API credits (1 per account), so this
 * must never be group-open. Accounts come back pre-activated Pro; the email
 * inbox stays reachable at https://mail.tm with the same credentials.
 *
 *   .alight bulk [n]   → create n accounts (default 1, max 5)
 */
import { jaky } from '../../lib/jakyApi.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'alight',
  aliases: ['alightmotion'],
  category: 'owner',
  description: 'Create Alight Motion Pro accounts. Usage: .alight bulk [n] (owner)',
  cooldown: 30000,
  permissions: { owner: true },

  execute: async ({ m, args }) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub !== 'bulk') {
      return await m.reply.info(
        `*ALIGHT MOTION PRO*\n\n\`.alight bulk [n]\` — create Pro account(s)\n\nEach account costs 1 API credit. Max 5 per call.`,
        'ALIGHT'
      );
    }

    if (!jaky.hasKey()) {
      return await m.reply.error('API key is not configured — set `JAKY_API_KEY` in .env.');
    }

    const count = Math.min(Math.max(parseInt(args[1], 10) || 1, 1), 5);

    await m.react('⏳');
    const res = await jaky.post('/v1/alight-motion/bulk', { count }, 300000);

    const accounts = res.data?.data || (res.data?.email ? [res.data] : null);
    if (!res.ok || !accounts?.length) {
      return await m.reply.error(res.data?.msg || 'Account creation failed.');
    }

    const lines = accounts.map((a, i) =>
      `*${i + 1}. Alight Motion Pro* (cost: ${res.data.costDeducted ?? '—'})\n` +
      `✉️ \`${a.email}\`\n` +
      `🔑 \`${a.password}\``
    );

    // send as a copy card so the credentials are one tap to copy
    return await copyResultCard(sock, m.from, {
      text: lines.join('\n\n'),
      footer: 'Inbox access: https://mail.tm — log in with the email + password above.',
      copyValue: accounts[0]?.password ? `Email: ${accounts[0].email} | Password: ${accounts[0].password}` : undefined,
      icon: '🎬',
    }, { quoted: m });
  },
};
