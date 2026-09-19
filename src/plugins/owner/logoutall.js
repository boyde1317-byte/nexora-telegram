/**
 * logoutall.js — SUPER OWNER ONLY: log out and remove EVERY paired session
 * at once (.logoutall, aliases .unpairall / .killsessions).
 *
 * Paired-session owners can't use this; neither can regular owners — only
 * numbers in SUPER_OWNER_NUMBERS (defaults to the first OWNER_NUMBERS entry).
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { removeAllSessions } from '../../core/sessionManager.js';

export default {
  name: 'logoutall',
  aliases: ['unpairall', 'killsessions', 'sessionpurge'],
  category: 'owner',
  description: 'SUPER OWNER ONLY — log out and remove every paired session at once.',
  cooldown: 30000,
  permissions: { owner: true },
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    if (!(await m.isSuperOwner)) {
      console.warn(`[CMD-DENY] logoutall: sender is not in SUPER_OWNER_NUMBERS`);
      return await m.reply.error(
        `*Super owner only.* This command requires your number to be in SUPER_OWNER_NUMBERS (currently the main owner's number).`
      );
    }

    return await withReactionStatus(m, async () => {
      const results = await removeAllSessions();
      if (!results.length) {
        return await m.reply.info(`*No paired sessions to remove.*`, 'LOGOUT ALL');
      }
      const ok    = results.filter(r => r.ok);
      const failed = results.filter(r => !r.ok);

      try {
        return await richTableCard(sock, m.from, {
          title: '🚪 ALL SESSIONS LOGGED OUT',
          headers: ['Number', 'Result'],
          rows: results.map(r => [`+${r.phone}`, r.ok ? '✅ Logged out & removed' : `❌ ${r.error}`]),
          footer: `${ok.length} removed • ${failed.length} failed`,
        }, { quoted: m });
      } catch (err) {
        console.warn('[logoutall] table card failed:', err.message);
        return await m.reply(
          `*ALL PAIRED SESSIONS REMOVED (${ok.length}/${results.length})*\n\n` +
          results.map(r => `+${r.phone} — ${r.ok ? '✅ logged out' : `❌ ${r.error}`}`).join('\n')
        );
      }
    });
  },
};
