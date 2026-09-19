/**
 * viewstatus.js — View WhatsApp Status updates from contacts.
 *
 * Usage:
 *   .viewstatus                — List all contacts with recent status updates
 *   .viewstatus @234...        — Fetch status for a specific contact
 *   .viewstatus list           — List contacts with status (compact)
 *
 * Uses sock.fetchStatus() from the baileys fork to retrieve
 * status protocol data for given JIDs.
 *
 * Aliases: .vs, .statuslist, .fetchstatus
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'viewstatus',
  aliases: ['vs', 'statuslist', 'fetchstatus'],
  category: 'owner',
  description: 'Views WhatsApp Status updates from contacts.',
  permissions: { owner: true },
  cooldown: 5000,

  execute: async ({ sock, m, args, prefix, isOwner }) => {
    const p = prefix || '.';

    if (!isOwner) {
      return await m.reply.error('Only the bot owner can view status updates.');
    }

    const input = (args[0] || '').toLowerCase();

    // Parse target JIDs from @mentions
    const jids = [];
    let match;
    const jidPattern = /@(\d{6,})/g;
    while ((match = jidPattern.exec(args.join(' '))) !== null) {
      jids.push(`${match[1]}@s.whatsapp.net`);
    }

    await withReactionStatus(m, async () => {
      try {
        if (input === 'list' || (!input && jids.length === 0)) {
          // List mode — fetch status for recent contacts
          // We can't easily enumerate all contacts with status,
          // but we can show contacts from the store
          const contacts = sock.contacts || {};
          const contactList = Object.entries(contacts)
            .filter(([jid]) => jid.endsWith('@s.whatsapp.net'))
            .slice(0, 20);

          if (contactList.length === 0) {
            return await m.reply.error('No contacts found. Try `.viewstatus @234...` for a specific contact.');
          }

          let text = '*Status Contacts*\n\n';
          for (const [jid, info] of contactList) {
            const name = info?.name || info?.notify || jid.split('@')[0];
            text += `• ${name}\n  ${jid}\n`;
          }
          text += `\nUse \`${p}viewstatus @number\` to fetch status for a specific contact.`;
          await m.reply(text, { contextInfo: buildEnrichedContextInfo() });
        } else if (jids.length > 0) {
          // Fetch status for specific contacts
          const results = await sock.fetchStatus(...jids);

          if (!results || results.length === 0) {
            return await m.reply.error('No status updates found for the given contacts.');
          }

          let text = '*Status Updates*\n\n';
          for (const entry of results) {
            const name = entry?.name || entry?.jid?.split('@')[0] || 'Unknown';
            const status = entry?.status || 'No status set';
            text += `*${name}*\n${status}\n\n`;
          }
          await m.reply(text, { contextInfo: buildEnrichedContextInfo() });
        } else {
          return await m.reply.error(
            `Usage:\n• \`${p}viewstatus\` — List contacts\n• \`${p}viewstatus @234...\` — Fetch specific status`
          );
        }
      } catch (err) {
        await m.reply.error(`Failed to fetch status: ${err.message}`);
      }
    });
  }
};
