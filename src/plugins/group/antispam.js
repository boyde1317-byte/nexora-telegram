/**
 * antispam.js — toggle anti-spam (flood) protection for a group.
 *
 * Flood control: more than 5 messages from a non-admin within 8 seconds
 * is a strike (shared 3-strike counter — see lib/antiGuard.js).
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'antispam',
  aliases: ['antiflood', 'noflood'],
  category: 'group',
  description: 'Toggle flood protection. More than 5 messages in 8 seconds from a non-admin is warned.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData = db.getGroup(m.from);
    const sub       = args[0]?.toLowerCase();

    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antispam ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `🛡️ *ANTI-SPAM PROTECTION*\n\nCurrent status: *${status}*\n\nDetects message flooding (more than 5 messages in 8 seconds from non-admins).`,
        footer: 'Protects against flood spam',
      }, `⚙️ Anti-Spam Settings (${status})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antispam on`,     title: '✅ Enable Protection',  description: 'Strike flooders: delete + warn, 3 strikes = removal' },
          { id: `${p}antispam off`,    title: '❌ Disable Protection', description: 'Allow unlimited message rate' },
          { id: `${p}antispam status`, title: '📊 Check Status',       description: 'Show current protection state' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}antilink`,     title: '🔗 Anti-Link',   description: 'Link protection settings' },
          { id: `${p}antisticker`,  title: '🖼️ Anti-Sticker', description: 'Sticker protection settings' },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const enabled = groupData.antispam;
      const status  = enabled ? '✅ Enabled' : '❌ Disabled';
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🛡️ *ANTI-SPAM STATUS*\n\nAnti-spam protection is currently *${status}* in this group.\n\n_Rule: more than 5 messages in 8 seconds from a non-admin → delete + warning._`,
        footer: enabled ? 'Flooding non-admins are being struck.' : 'No flood limits in place.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antispam ${enabled ? 'off' : 'on'}` },
        { label: 'Group Info',                               cmd: `${p}groupinfo` },
      ], { title: 'ANTI-SPAM', body: status, thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable = sub === 'on';
    db.setGroup(m.from, { antispam: enable });

    const resultText = enable
      ? '🔒 *Anti-spam protection ENABLED*\n\nNon-admins sending more than 5 messages in 8 seconds will be warned. 3 warnings = removal.'
      : '🔓 *Anti-spam protection DISABLED*\n\nMembers may message at any rate.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antispam ${enable ? 'off' : 'on'}` },
      { label: 'Anti-Sticker Settings',                 cmd: `${p}antisticker` },
      { label: 'Group Info',                           cmd: `${p}groupinfo` },
    ], { title: 'ANTI-SPAM', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
