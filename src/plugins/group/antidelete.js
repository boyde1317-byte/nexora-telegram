/**
 * antidelete.js — toggle anti-delete (snitch mode) for a group.
 *
 * When enabled, deleted messages are reposted by the bot with the original
 * sender named. Text is reposted verbatim; media deletions get a notice
 * (the content itself can't be recovered from WA's revoke, only reported).
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'antidelete',
  aliases: ['snitch', 'antidelt'],
  category: 'group',
  description: 'Toggle snitch mode. Deleted messages are reposted with the sender named.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData = db.getGroup(m.from);
    const sub       = args[0]?.toLowerCase();

    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antidelete ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `🛡️ *ANTI-DELETE (SNITCH MODE)*\n\nCurrent status: *${status}*\n\nWhen someone deletes a message, the bot reposts what they tried to hide.`,
        footer: 'Nothing gets quietly deleted',
      }, `⚙️ Anti-Delete Settings (${status})`, [
        { title: 'Mode Control', rows: [
          { id: `${p}antidelete on`,     title: '✅ Enable Snitch Mode',  description: 'Repost deleted messages with the sender named' },
          { id: `${p}antidelete off`,    title: '❌ Disable Snitch Mode', description: 'Let deletions pass silently' },
          { id: `${p}antidelete status`, title: '📊 Check Status',       description: 'Show current mode' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}antiviewonce`, title: '👁️ Anti-View-Once', description: 'Auto-save view-once media' },
          { id: `${p}groupinfo`,    title: '📋 Group Info',       description: 'View group details' },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const enabled = groupData.antidelete;
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🛡️ *ANTI-DELETE STATUS*\n\nSnitch mode is currently *${enabled ? '✅ Enabled' : '❌ Disabled'}* in this group.`,
        footer: enabled ? 'Deleted messages are being reposted.' : 'Deletions pass silently.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antidelete ${enabled ? 'off' : 'on'}` },
        { label: 'Group Info',                               cmd: `${p}groupinfo` },
      ], { title: 'ANTI-DELETE', body: enabled ? 'Enabled' : 'Disabled', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable = sub === 'on';
    db.setGroup(m.from, { antidelete: enable });

    const resultText = enable
      ? '🔒 *Snitch mode ENABLED*\n\nDeleted messages will be reposted with the original sender named. Text is preserved verbatim.'
      : '🔓 *Snitch mode DISABLED*\n\nMembers can delete messages quietly again.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antidelete ${enable ? 'off' : 'on'}` },
      { label: 'Anti-View-Once Settings',               cmd: `${p}antiviewonce` },
    ], { title: 'ANTI-DELETE', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
