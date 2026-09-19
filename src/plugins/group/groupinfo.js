import { withReactionStatus, replyTable } from '../../lib/cosmetics.js';

export default {
  name: 'groupinfo',
  aliases: ['ginfo', 'gcinfo', 'groupdetails'],
  category: 'group',
  description: 'Shows detailed metadata for the current group.',
  permissions: { groupOnly: true },
  cooldown: 5000,
  execute: async ({ m, sock }) => {
    await withReactionStatus(m, async () => {
      const meta = await sock.groupMetadata(m.from);
      if (!meta) throw new Error('Could not retrieve group metadata.');

      const admins    = meta.participants.filter(p => p.admin).map(p => `+${p.id.split('@')[0]}`);
      const total     = meta.participants.length;
      const adminCount = admins.length;
      const createdAt = meta.creation
        ? new Date(meta.creation * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Unknown';

      const restrict = meta.restrict ? '🔒 Admins only' : '🌐 All members';
      const announce = meta.announce ? '🔒 Admins only' : '🌐 All members';

      const regularMembers = total - adminCount;
      const groupAge = meta.creation
        ? (() => {
            const days = Math.floor((Date.now() - meta.creation * 1000) / 86400000);
            if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
            if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''}`;
            return `${Math.floor(days / 365)} year${Math.floor(days / 365) !== 1 ? 's' : ''}`;
          })()
        : 'Unknown';

      const rows = [
        ['Group Name',   meta.subject],
        ['Group ID',     m.from],
        ['Created',      `${createdAt} (${groupAge} old)`],
        ['Description',  (meta.desc || 'None').slice(0, 60)],
        ['Members',      `${total} (${regularMembers} regular, ${adminCount} admin${adminCount !== 1 ? 's' : ''})`],
        ['Admins',       `${adminCount} (${admins.slice(0, 3).join(', ')}${adminCount > 3 ? '...' : ''})`],
        ['Send Messages', announce],
        ['Edit Info',    restrict],
        ['Ephemeral',    meta.ephemeralDuration ? `${meta.ephemeralDuration / 86400}d` : 'Off'],
      ];

      await replyTable(m, sock, {
        caption: `📋 GROUP INFO`,
        rows,
        footer: meta.inviteCode ? `🔗 Invite: https://chat.whatsapp.com/${meta.inviteCode}` : undefined,
      });
    });
  }
};
