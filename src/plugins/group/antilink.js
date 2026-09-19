/**
 * antilink.js — toggle anti-link protection for a group.
 *
 * Uses selectMenu (single_select) so admins can pick the action from a
 * native WA list rather than remembering subcommand syntax.
 * When called with on/off/status args, performs the action and shows a
 * nativeFlow result card with follow-up group management buttons.
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

const LINK_RE       = /(?:https?:\/\/|www\.)|(?:chat\.whatsapp\.com\/\S+)|(?:t\.me\/\S+)|(?:bit\.ly\/\S+)/i;
const WA_INVITE_RE  = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

export default {
  name: 'antilink',
  aliases: ['antilinks', 'nolink'],
  category: 'group',
  description: 'Toggle anti-link protection. Non-admin links are auto-deleted and warned.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData = db.getGroup(m.from);
    const sub       = args[0]?.toLowerCase();

    // ── No subcommand — show a single_select picker ───────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = groupData.antilink ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `🛡️ *ANTI-LINK PROTECTION*\n\nCurrent status: *${status}*\n\nSelect an action from the list below:`,
        footer: 'Protects against unauthorized link sharing',
      }, `⚙️ Anti-Link Settings (${status})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antilink on`,     title: '✅ Enable Protection',  description: 'Delete links from non-admins + warn sender' },
          { id: `${p}antilink off`,    title: '❌ Disable Protection', description: 'Allow all members to send links' },
          { id: `${p}antilink status`, title: '📊 Check Status',       description: 'Show current protection state' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}groupinfo`,       title: '📋 Group Info',    description: 'View group details and stats' },
          { id: `${p}tagall`,          title: '📢 Announce Rule', description: 'Notify all members of this rule' },
        ]},
      ], [], { quoted: m });
    }

    // ── status ─────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const enabled = groupData.antilink;
      const status  = enabled ? '✅ Enabled' : '❌ Disabled';
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🛡️ *ANTI-LINK STATUS*\n\nAnti-link protection is currently *${status}* in this group.`,
        footer: enabled ? 'Non-admin links are being blocked.' : 'All members can share links freely.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}antilink ${enabled ? 'off' : 'on'}` },
        { label: 'Group Info',                                   cmd: `${p}groupinfo` },
        { label: 'Announce to Group',                            cmd: `${p}tagall Anti-link protection is ${enabled ? 'ON' : 'OFF'}` },
      ], {
        title: 'ANTI-LINK',
        body:  status,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
      }, { quoted: m });
    }

    // ── on / off ───────────────────────────────────────────────────────────
    const enable = sub === 'on';
    db.setGroup(m.from, { antilink: enable });

    const resultText = enable
      ? '🔒 *Anti-link protection ENABLED*\n\nLinks sent by non-admins will be deleted and the sender warned.'
      : '🔓 *Anti-link protection DISABLED*\n\nAll members may now share links freely.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: `Setting saved for this group`,
    }, [
      { label: enable ? 'Disable Again'   : 'Re-enable',    cmd: `${p}antilink ${enable ? 'off' : 'on'}` },
      { label: 'Announce to Group',                              cmd: `${p}tagall Anti-link is now ${enable ? 'ON' : 'OFF'}` },
      { label: 'Group Info',                                    cmd: `${p}groupinfo` },
    ], {
      title: 'ANTI-LINK',
      body:  'Setting saved',
      thumbnailUrl,
      originalImageUrl: thumbnailUrl,
    }, { quoted: m });
  },

  // ── Message handler: called by the message router to enforce the rule ────
  onMessage: async ({ sock, m, db }) => {
    if (!m.isGroup) return;
    const groupData = db.getGroup(m.from);
    if (!groupData.antilink) return;

    const body = m.body || '';
    if (!LINK_RE.test(body)) return;

    const isAdmin = await m.isAdmin();
    if (isAdmin) return;

    try {
      await sock.sendMessage(m.from, { delete: m.key });
    } catch (_) {}

    const userData   = db.getUser(m.sender);
    const warnings   = (userData.warnings ?? 0) + 1;
    const isWaInvite = WA_INVITE_RE.test(body);
    db.setUser(m.sender, { warnings });

    await sock.sendMessage(m.from, {
      text: `⚠️ @${m.sender.split('@')[0]}, links are not allowed in this group.\n\n🚨 *Warning ${warnings}/3*${isWaInvite ? '\n\n_Invite links are strictly prohibited._' : ''}`,
      mentions: [m.sender],
    });

    if (warnings >= 3) {
      try {
        await sock.groupParticipantsUpdate(m.from, [m.sender], 'remove');
        db.setUser(m.sender, { warnings: 0 });
        await sock.sendMessage(m.from, { text: `🚫 @${m.sender.split('@')[0]} has been removed after 3 link warnings.`, mentions: [m.sender] });
      } catch (_) {}
    }
  },
};
