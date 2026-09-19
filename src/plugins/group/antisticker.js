/**
 * antisticker.js — toggle anti-sticker protection for a group.
 *
 * Non-admin stickers are auto-deleted and struck (shared 3-strike counter
 * with antilink/antitag — see lib/antiGuard.js). Same card UX as antilink:
 * selectMenu picker when bare, nativeFlow result cards for on/off/status.
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'antisticker',
  aliases: ['nosticker'],
  category: 'group',
  description: 'Toggle anti-sticker protection. Non-admin stickers are auto-deleted and warned.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData = db.getGroup(m.from);
    const sub       = args[0]?.toLowerCase();

    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antisticker ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `🛡️ *ANTI-STICKER PROTECTION*\n\nCurrent status: *${status}*\n\nSelect an action from the list below:`,
        footer: 'Protects against sticker spam from non-admins',
      }, `⚙️ Anti-Sticker Settings (${status})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antisticker on`,     title: '✅ Enable Protection',  description: 'Delete stickers from non-admins + warn sender' },
          { id: `${p}antisticker off`,    title: '❌ Disable Protection', description: 'Allow all members to send stickers' },
          { id: `${p}antisticker status`, title: '📊 Check Status',       description: 'Show current protection state' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}antilink`,  title: '🔗 Anti-Link',    description: 'Link protection settings' },
          { id: `${p}groupinfo`, title: '📋 Group Info',   description: 'View group details and stats' },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const enabled = groupData.antisticker;
      const status  = enabled ? '✅ Enabled' : '❌ Disabled';
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🛡️ *ANTI-STICKER STATUS*\n\nAnti-sticker protection is currently *${status}* in this group.`,
        footer: enabled ? 'Non-admin stickers are being deleted.' : 'All members can send stickers freely.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antisticker ${enabled ? 'off' : 'on'}` },
        { label: 'Group Info',                               cmd: `${p}groupinfo` },
      ], { title: 'ANTI-STICKER', body: status, thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable = sub === 'on';
    db.setGroup(m.from, { antisticker: enable });

    const resultText = enable
      ? '🔒 *Anti-sticker protection ENABLED*\n\nStickers sent by non-admins will be deleted and the sender warned. 3 warnings = removal.'
      : '🔓 *Anti-sticker protection DISABLED*\n\nAll members may now send stickers freely.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antisticker ${enable ? 'off' : 'on'}` },
      { label: 'Anti-Link Settings',                   cmd: `${p}antilink` },
      { label: 'Group Info',                           cmd: `${p}groupinfo` },
    ], { title: 'ANTI-STICKER', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
