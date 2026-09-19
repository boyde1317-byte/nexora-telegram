/**
 * antiforeign.js — restrict joins to allowed country codes.
 *
 * When enabled, numbers joining the group whose country code is not on the
 * allow list are auto-removed (with a notice). Subcommands:
 *   .antiforeign on/off/status
 *   .antiforeign allow <cc>       → e.g. .antiforeign allow 233
 *   .antiforeign remove <cc>
 *   .antiforeign list
 *
 * Enforcement lives in handlers/group.js (group-participants.update).
 * The bot's own numbers (main + paired sessions) are always exempt.
 */
import { selectMenu, actionCardWithAd, richTableCard } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

const DEFAULT_ALLOW = ['233']; // Ghana — change per group as needed
const getAllow = (groupData) =>
  (Array.isArray(groupData.antiforeign?.allow) ? groupData.antiforeign.allow : DEFAULT_ALLOW);

export default {
  name: 'antiforeign',
  aliases: ['localonly'],
  category: 'group',
  description: 'Restrict joins to allowed country codes. Usage: .antiforeign on | allow <cc> | remove <cc> | list',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p          = prefix || '.';
    const groupData  = db.getGroup(m.from);
    const sub        = args[0]?.toLowerCase();

    // ── allow / remove <cc> ─────────────────────────────────────────────────
    if (sub === 'allow' || sub === 'remove') {
      const cc = args[1]?.replace(/[^0-9]/g, '');
      if (!cc) {
        return await m.reply.warn(`Usage: \`${p}antiforeign ${sub} <country code>\` — e.g. \`${p}antiforeign ${sub} 233\``);
      }
      const allow    = getAllow(groupData);
      const exists    = allow.includes(cc);
      const nextAllow = sub === 'allow'
        ? (exists ? allow : [...allow, cc])
        : allow.filter((c) => c !== cc);

      if (sub === 'allow' && exists) {
        return await m.reply.warn(`Country code +${cc} is already allowed.`);
      }
      if (sub === 'remove' && !exists) {
        return await m.reply.warn(`Country code +${cc} is not on the allow list.`);
      }

      const on = groupData.antiforeign?.on ?? false;
      db.setGroup(m.from, { antiforeign: { on, allow: nextAllow } });

      const resultText = sub === 'allow'
        ? `🌍 *Country code +${cc} is now ALLOWED*\n\nNumbers starting with +${cc} may join this group.`
        : `🌍 *Country code +${cc} is now BLOCKED*\n\nNumbers starting with +${cc} will be removed on join.`;

      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `${resultText}\n\n_Allowed codes: +${nextAllow.join(', +')}_`,
        footer: `${on ? 'Protection is ON' : '⚠️ Protection is OFF — turn it on with ' + p + 'antiforeign on'}`,
      }, [
        { label: on ? 'Disable Protection' : 'Enable Protection', cmd: `${p}antiforeign ${on ? 'off' : 'on'}` },
        { label: 'Allowed Codes',                                     cmd: `${p}antiforeign list` },
      ], { title: 'ANTI-FOREIGN', body: sub === 'allow' ? 'Code allowed' : 'Code blocked', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const allow = getAllow(groupData);
      return await richTableCard(sock, m.from, {
        title: '🌍 ALLOWED COUNTRY CODES',
        headers: ['#', 'Code', 'Region'],
        rows: allow.map((cc, i) => [String(i + 1), `+${cc}`, { 233: 'Ghana 🇬🇭', 234: 'Nigeria 🇳🇬', 44: 'UK 🇬🇧', 1: 'USA/Canada 🇺🇸' }[cc] || '—']),
        footer: groupData.antiforeign?.on ? 'Protection is ON' : 'Protection is OFF',
      }, { quoted: m });
    }

    // ── picker / status / on / off ─────────────────────────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const on    = groupData.antiforeign?.on ? '✅ ON' : '❌ OFF';
      const allow = getAllow(groupData);
      return await selectMenu(sock, m.from, {
        text: `🌍 *ANTI-FOREIGN (JOIN FILTER)*\n\nStatus: *${on}*\nAllowed codes: *+${allow.join(', +')}*\n\nNumbers from other countries are removed on join.`,
        footer: 'Filters new joins by country code',
      }, `⚙️ Anti-Foreign Settings (${on})`, [
        { title: 'Filter Control', rows: [
          { id: `${p}antiforeign on`,     title: '✅ Enable Filter',  description: 'Remove disallowed country codes on join' },
          { id: `${p}antiforeign off`,    title: '❌ Disable Filter', description: 'Anyone may join' },
          { id: `${p}antiforeign status`, title: '📊 Check Status',   description: 'Show current filter state' },
          { id: `${p}antiforeign list`,   title: '📜 Allowed Codes', description: 'View the country-code allow list' },
        ]},
        { title: 'Manage Codes', rows: [
          { id: `${p}antiforeign allow `,  title: '➕ Allow a Code', description: `Use: ${p}antiforeign allow <cc>` },
          { id: `${p}antiforeign remove `, title: '➖ Remove a Code', description: `Use: ${p}antiforeign remove <cc>` },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const on    = groupData.antiforeign?.on;
      const allow = getAllow(groupData);
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🌍 *ANTI-FOREIGN STATUS*\n\nJoin filter: *${on ? '✅ Enabled' : '❌ Disabled'}*\nAllowed codes: *+${allow.join(', +')}*`,
        footer: on ? 'Disallowed country codes are removed on join.' : 'Anyone may join.',
      }, [
        { label: on ? 'Disable Now' : 'Enable Now', cmd: `${p}antiforeign ${on ? 'off' : 'on'}` },
        { label: 'Allowed Codes',                       cmd: `${p}antiforeign list` },
      ], { title: 'ANTI-FOREIGN', body: on ? 'Enabled' : 'Disabled', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable  = sub === 'on';
    const allow   = getAllow(groupData);
    db.setGroup(m.from, { antiforeign: { on: enable, allow } });

    const resultText = enable
      ? `🔒 *Anti-foreign join filter ENABLED*\n\nOnly numbers starting with +${allow.join(', +')} may join. Everyone else is removed on arrival (the bot's own numbers are exempt).`
      : '🔓 *Anti-foreign join filter DISABLED*\n\nAnyone may join this group.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antiforeign ${enable ? 'off' : 'on'}` },
      { label: 'Allowed Codes',                          cmd: `${p}antiforeign list` },
    ], { title: 'ANTI-FOREIGN', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
