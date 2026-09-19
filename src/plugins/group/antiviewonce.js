/**
 * antiviewonce.js — toggle anti-view-once rescue for a group.
 *
 * When enabled, every view-once photo/video/voice note sent in the group is
 * auto-saved by the bot and reposted with a "rescued" caption, so the
 * content survives the tap-to-view expiry. Never punishes anyone.
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'antiviewonce',
  aliases: ['antivo', 'noviewonce'],
  category: 'group',
  description: 'Toggle view-once rescue. View-once media is auto-saved and reposted by the bot.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData = db.getGroup(m.from);
    const sub       = args[0]?.toLowerCase();

    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antiviewonce ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `👁️ *ANTI-VIEW-ONCE RESCUE*\n\nCurrent status: *${status}*\n\nView-once photos, videos and voice notes sent here are auto-saved and reposted — nothing disappears.`,
        footer: 'Rescues expiring media',
      }, `⚙️ Anti-View-Once Settings (${status})`, [
        { title: 'Mode Control', rows: [
          { id: `${p}antiviewonce on`,     title: '✅ Enable Rescue',  description: 'Auto-save and repost view-once media' },
          { id: `${p}antiviewonce off`,    title: '❌ Disable Rescue', description: 'Let view-once media expire normally' },
          { id: `${p}antiviewonce status`, title: '📊 Check Status',   description: 'Show current mode' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}antidelete`, title: '🗑️ Anti-Delete', description: 'Snitch deleted messages' },
          { id: `${p}groupinfo`,  title: '📋 Group Info',   description: 'View group details' },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const enabled = groupData.antiviewonce;
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `👁️ *ANTI-VIEW-ONCE STATUS*\n\nView-once rescue is currently *${enabled ? '✅ Enabled' : '❌ Disabled'}* in this group.`,
        footer: enabled ? 'View-once media is being rescued.' : 'View-once media expires normally.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antiviewonce ${enabled ? 'off' : 'on'}` },
        { label: 'Group Info',                               cmd: `${p}groupinfo` },
      ], { title: 'ANTI-VIEW-ONCE', body: enabled ? 'Enabled' : 'Disabled', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable = sub === 'on';
    db.setGroup(m.from, { antiviewonce: enable });

    const resultText = enable
      ? '👁️ *View-once rescue ENABLED*\n\nEvery view-once photo, video and voice note will be saved and reposted with the sender named.'
      : '👁️ *View-once rescue DISABLED*\n\nView-once media will disappear as WhatsApp intended.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antiviewonce ${enable ? 'off' : 'on'}` },
      { label: 'Anti-Delete Settings',                   cmd: `${p}antidelete` },
    ], { title: 'ANTI-VIEW-ONCE', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
