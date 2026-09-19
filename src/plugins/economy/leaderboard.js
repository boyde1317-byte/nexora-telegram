/**
 * leaderboard.js — Top users by XP / Coins, with pagination.
 *
 * Shows 10 users per page. Use `.lb 2` for page 2, `.lb coins 2` for page 2
 * of the coins ranking, etc.
 *
 * Removed follow-up actionCard to prevent double messages — users navigate
 * with `.lb <page>` or `.lb coins <page>` instead of tapping buttons.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { xpToLevel, rankBadge } from '../../economy/leveling.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

const PLACE = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const PAGE_SIZE = 10;

export default {
  name: 'leaderboard',
  aliases: ['lb', 'top', 'topusers', 'ranking'],
  category: 'economy',
  description: 'Shows top users by XP. Use `.lb coins` to rank by coins, `.lb 2` for page 2.',
  cooldown: 5000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p = prefix || '.';

    // Parse args: mode (coins/xp) and page number
    let mode = 'xp';
    let page = 1;
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === 'coins' || lower === 'xp') mode = lower;
      else if (/^\d+$/.test(arg)) page = parseInt(arg, 10);
    }

    const label = mode === 'coins' ? '🪙 Coins' : '✨ XP';

    await withReactionStatus(m, async () => {
      const allUsers = db.data?.users ?? {};
      const entries  = Object.entries(allUsers)
        .map(([jid, data]) => ({
          jid,
          number: jid.split('@')[0].split(':')[0],
          xp:     data.xp    ?? 0,
          coins:  data.coins ?? 0,
          level:  xpToLevel(data.xp ?? 0),
        }))
        .filter(u => u.xp > 0 || u.coins > 0)
        .sort((a, b) => mode === 'coins' ? b.coins - a.coins : b.xp - a.xp);

      if (entries.length === 0) {
        return await m.reply.info(
          `No one has earned ${label} yet. The leaderboard is wide open — claim your spot with \`${p}daily\`! ✦`,
          'LEADERBOARD'
        );
      }

      const totalPages = Math.ceil(entries.length / PAGE_SIZE);
      page = Math.max(1, Math.min(page, totalPages));

      const startIdx = (page - 1) * PAGE_SIZE;
      const pageEntries = entries.slice(startIdx, startIdx + PAGE_SIZE);

      const senderNum  = m.sender.split('@')[0].split(':')[0];
      const senderRank = entries.findIndex(e => e.number === senderNum);

      // ── Tier 1: richTableCard — single message ────────────────────────
      try {
        const rows = pageEntries.map((u, i) => {
          const globalRank = startIdx + i;
          const badge  = rankBadge(u.level);
          const value  = mode === 'coins'
            ? u.coins.toLocaleString()
            : u.xp.toLocaleString();
          const isSelf = u.number === senderNum ? ' ◀' : '';
          const medal  = globalRank < 3 ? PLACE[globalRank] : `#${globalRank + 1}`;
          return [
            medal,
            `+${u.number.slice(-6)}`,
            `${badge} Lv${u.level}`,
            `${value}${isSelf}`,
          ];
        });

        let footer = `Page ${page}/${totalPages} • ${entries.length} users ranked`;
        if (senderRank >= 0) {
          const u     = entries[senderRank];
          const value = mode === 'coins'
            ? u.coins.toLocaleString()
            : u.xp.toLocaleString();
          footer += `\nYour rank: #${senderRank + 1} • ${label}: ${value}`;
        }
        footer += `\nUse \`${p}lb ${mode} <page>\` to navigate`;

        return await richTableCard(sock, m.from, {
          title:   mode === 'coins' ? `🪙 COINS LEADERBOARD — PAGE ${page}` : `✨ XP LEADERBOARD — PAGE ${page}`,
          headers: ['#', 'Number', 'Rank', label],
          rows,
          footer,
        }, { quoted: m });
      } catch (err) {
        console.warn('[leaderboard] richTableCard failed, plain-text fallback:', err.message);
      }

      // ── Tier 2: asciiBuilder fallback ────────────────────────────────────
      const rows = pageEntries.map((u, i) => {
        const globalRank = startIdx + i;
        const badge  = rankBadge(u.level);
        const value  = mode === 'coins' ? u.coins.toLocaleString() : u.xp.toLocaleString();
        const isSelf = u.number === senderNum ? ' ← you' : '';
        const medal  = globalRank < 3 ? PLACE[globalRank] : `${globalRank + 1}.`;
        return `${medal} +${u.number.slice(-6).padStart(6)} ${badge} Lv${u.level}  ${label}: ${value}${isSelf}`;
      });

      if (senderRank >= 0 && (senderRank < startIdx || senderRank >= startIdx + PAGE_SIZE)) {
        const u     = entries[senderRank];
        const value = mode === 'coins' ? u.coins.toLocaleString() : u.xp.toLocaleString();
        rows.push('');
        rows.push(`— Your rank: #${senderRank + 1}  ${label}: ${value}`);
      }

      rows.push('');
      rows.push(`Page ${page}/${totalPages} • Use \`${p}lb ${mode} <page>\` to navigate`);

      const title = mode === 'coins' ? `🪙 COINS — PAGE ${page}` : `✨ XP — PAGE ${page}`;
      await m.reply(asciiBuilder.box(title, rows), { contextInfo: buildEnrichedContextInfo() });
    });
  }
};
