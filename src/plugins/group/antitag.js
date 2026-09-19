/**
 * antitag.js — toggle mass-mention ("tag everyone") protection for a group.
 *
 * Styled after antilink.js: a selectMenu (single_select) picker when called
 * with no subcommand, and an actionCard with follow-up group-management
 * buttons after a status check or on/off change.
 *
 * When enabled, a non-admin message that mentions more participants than
 * MASS_MENTION_THRESHOLD in one go is treated as tag-spam: the message is
 * deleted and the sender is warned (reusing the same warnings/3-strike
 * counter as antilink), then auto-kicked at 3 warnings.
 *
 * Enforcement is wired into src/handlers/message.js next to the existing
 * anti-link block, since this codebase dispatches passive protections
 * directly in the handler rather than through a generic onMessage hook.
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export const MASS_MENTION_THRESHOLD = 5;

export default {
  name: 'antitag',
  aliases: ['antimention', 'notag'],
  category: 'group',
  description: 'Toggle protection against mass-mention ("tag everyone") spam by non-admins.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p          = prefix || '.';
    const groupData  = db.getGroup(m.from);
    const sub        = args[0]?.toLowerCase();

    // ── No subcommand — show a single_select picker ───────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antitag ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `🏷️ *ANTI-TAG PROTECTION*\n\nCurrent status: *${status}*\n\nSelect an action from the list below:`,
        footer: `Blocks mass-mentions of ${MASS_MENTION_THRESHOLD}+ members by non-admins`,
      }, `⚙️ Anti-Tag Settings (${status})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antitag on`,     title: '✅ Enable Protection',  description: `Delete + warn mass-mentions of ${MASS_MENTION_THRESHOLD}+ members` },
          { id: `${p}antitag off`,    title: '❌ Disable Protection', description: 'Allow all members to mention freely' },
          { id: `${p}antitag status`, title: '📊 Check Status',       description: 'Show current protection state' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}antilink`,      title: '🛡️ Anti-Link',    description: 'Toggle link protection' },
          { id: `${p}groupinfo`,     title: '📋 Group Info',    description: 'View group details and stats' },
        ]},
      ], [], { quoted: m });
    }

    // ── status ─────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const enabled = groupData.antitag;
      const status  = enabled ? '✅ Enabled' : '❌ Disabled';
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🏷️ *ANTI-TAG STATUS*\n\nAnti-tag protection is currently *${status}* in this group.`,
        footer: enabled ? `Mass-mentions of ${MASS_MENTION_THRESHOLD}+ members are being blocked.` : 'All members can mention freely.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antitag ${enabled ? 'off' : 'on'}` },
        { label: '🛡️ Anti-Link Settings',                      cmd: `${p}antilink` },
        { label: '📋 Group Info',                               cmd: `${p}groupinfo` },
      ], {
        title: '🏷️ ANTI-TAG',
        body:  status,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
      }, { quoted: m });
    }

    // ── on / off ───────────────────────────────────────────────────────────
    const enable = sub === 'on';
    db.setGroup(m.from, { antitag: enable });

    const resultText = enable
      ? `🏷️ *Anti-tag protection ENABLED*\n\nNon-admins mentioning ${MASS_MENTION_THRESHOLD}+ members at once will have the message deleted and be warned.`
      : '🏷️ *Anti-tag protection DISABLED*\n\nAll members may mention freely.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? '❌ Disable Again' : '✅ Re-enable', cmd: `${p}antitag ${enable ? 'off' : 'on'}` },
      { label: '🛡️ Anti-Link Settings',                      cmd: `${p}antilink` },
      { label: '📋 Group Info',                               cmd: `${p}groupinfo` },
    ], {
      title: '🏷️ ANTI-TAG',
      body:  'Setting saved',
      thumbnailUrl,
      originalImageUrl: thumbnailUrl,
    }, { quoted: m });
  },
};
