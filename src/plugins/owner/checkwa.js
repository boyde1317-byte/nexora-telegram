/**
 * checkwa.js — Check WhatsApp ban status for a phone number.
 *
 * Fixed: removed dead 'ban' button (no ban command exists).
 * Fixed: removed nonsensical 'checkwa reply' option (reply isn't a subcommand).
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { checkWhatsApp } from '../../lib/waBanCheck.js';
import { richTableCard, selectMenu } from '../../lib/interactiveKit.js';

export default {
  name: 'checkwa',
  aliases: ['checkban', 'wacheck', 'iswabanned'],
  category: 'owner',
  description: 'Check if a phone number is on WhatsApp and whether it has been banned.',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    let raw = args[0];

    // If no explicit arg, try quoted sender
    if (!raw && m.quoted?.sender) raw = m.quoted.sender;

    if (!raw) {
      return await selectMenu(sock, m.from, {
        text:   '🔎 *WHATSAPP BAN CHECK*\n\nProvide a number to check, or reply to a message and run this command.',
        footer: 'Owner-only command',
      }, '⚙️ Lookup Options', [
        { title: 'Related Commands', rows: [
          { id: `${p}checkchid`,  title: '🆔 Get Chat ID',  description: 'Get JID for current chat' },
          { id: `${p}userinfo`,    title: '👤 User Info',     description: 'Look up user details' },
        ]},
      ], [], { quoted: m });
    }

    const cleaned = raw.replace(/@s\.whatsapp\.net|@g\.us/g, '').replace(/[^\d+]/g, '');
    const jid     = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

    if (jid.length < 6) {
      return await m.reply.error('Could not parse that as a valid phone number. Include the country code, e.g. `6281234567890`.');
    }

    await withReactionStatus(m, async () => {
      // Layer 1 — instant existence check via the connected socket
      let exists = null;
      let resolvedJid = null;
      try {
        const [o] = await sock.onWhatsApp(jid.replace('+', ''));
        exists      = Boolean(o?.exists);
        resolvedJid = o?.jid || null;
      } catch (err) {
        console.warn('[checkwa] onWhatsApp lookup failed:', err.message);
      }

      // Layer 2 — deep ban probe (throttled by WA to ≈1 check/hour)
      let result;
      try {
        result = await checkWhatsApp(jid);
      } catch (err) {
        console.error('[checkwa]', err);
        await m.reply.error(`*Check failed:* ${err.message || err}`);
        throw err;
      }

      const rows = [['Number', result.number]];
      rows.push(['On WhatsApp', exists === null ? 'Unknown (lookup failed)' : exists ? '✅ Yes' : '❌ No']);
      if (resolvedJid) rows.push(['Resolved JID', resolvedJid]);
      let statusLabel;

      if (result.isBanned) {
        statusLabel = '🚫 BANNED';
        rows.push(['Ban Status', statusLabel]);
        if (result.data?.violation_type)           rows.push(['Violation',   result.data.violation_type]);
        if (result.data?.appeal_token)             rows.push(['Appeal Token', result.data.appeal_token]);
        if (result.data?.in_app_ban_appeal != null) {
          rows.push(['In-App Appeal', result.data.in_app_ban_appeal ? 'Available' : 'Not available']);
        }
      } else if (result.isNeedOfficialWa) {
        statusLabel = '⚠️ Restricted (official WA required)';
        rows.push(['Ban Status', statusLabel]);
      } else if (result.status === 'unavailable') {
        const mins = Math.ceil((result.retryAfter || 3600) / 60);
        statusLabel = `⏳ Deep check throttled — try again in ~${mins} min`;
        rows.push(['Ban Status', 'Unknown (probe throttled)']);
      } else if (result.status === 'clean') {
        statusLabel = '✅ Clean — not banned';
        rows.push(['Ban Status', statusLabel]);
      } else {
        statusLabel = `ℹ️ Ban status unverifiable (${result.reason || result.status})`;
        rows.push(['Ban Status', statusLabel]);
      }

      try {
        await richTableCard(sock, m.from, {
          title:   '🔎 WHATSAPP BAN CHECK',
          headers: ['Field', 'Value'],
          rows,
          footer:  'NEXORA • WA Check',
        }, { quoted: m });

        return await selectMenu(sock, m.from, {
          text:   `Check complete for *${result.number}*\n\nStatus: *${statusLabel}*`,
          footer: 'What would you like to do next?',
        }, '⚙️ More Actions', [
          { title: 'Lookup Actions', rows: [
            { id: `${p}checkwa `,     title: '🔁 Check Another Number', description: 'Run a new ban check' },
            { id: `${p}checkchid`,   title: '🆔 Get Chat ID',          description: 'Get current chat JID' },
            { id: `${p}userinfo`,    title: '👤 User Info',              description: 'Look up user details' },
          ]},
        ], [], { quoted: m });
      } catch (err) {
        console.warn('[checkwa] Tier 1 failed:', err.message);
        const { replyTable } = await import('../../lib/cosmetics.js');
        await replyTable(m, sock, {
          caption: '🔎 WHATSAPP BAN CHECK',
          rows,
          footer:  '_NEXORA • WA Check_',
        });
      }
    });
  }
};
