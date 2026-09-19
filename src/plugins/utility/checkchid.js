/**
 * checkchid.js — retrieve JID and metadata for current chat or a channel link.
 *
 * Results are shown in a richResponse table with actionCard follow-up buttons
 * for related lookup and group management commands.
 */
import { withReactionStatus} from '../../lib/cosmetics.js';
import { richTableCard, actionCard} from '../../lib/interactiveKit.js';
import { asciiBuilder} from '../../ui/asciiBuilder.js';

const CHANNEL_RE = /(?:whatsapp\.com\/channel\/|newsletter\/)([\w-]+)/i;

export default {
  name: 'checkchid',
  aliases: ['channelid', 'chid', 'chatid'],
  category: 'utility',
  description: 'Get JID and metadata for current chat or a WhatsApp Channel link.',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      const link = args[0];

      // ── Channel / newsletter link ────────────────────────────────────────
      if (link && CHANNEL_RE.test(link)) {
        let meta;
        try {
          meta = await sock.getNewsletterInfo(link);
        } catch (err) {
          return await m.reply.error(`Could not fetch channel info: ${err.message}`);
        }

        const rows = [
          ['Channel Name', meta.name || 'Unknown'],
          ['Channel JID',  meta.id || 'N/A'],
          ['Subscribers',  meta.subscriberCount != null ? String(meta.subscriberCount) : 'N/A'],
          ['Verified',     meta.verification === 'VERIFIED' ? '✅ Yes' : '❌ No'],
          ['Created',      meta.creationTime ? new Date(meta.creationTime * 1000).toDateString() : 'N/A'],
        ];

        try {
          await richTableCard(sock, m.from, {
            title:   '📡 CHANNEL METADATA',
            headers: ['Field', 'Value'],
            rows,
            footer:  `JID: ${meta.id}`,
          }, { quoted: m });

                    return;
        } catch (err) {
          console.warn('[checkchid] Tier 1 (channel) failed:', err.message);
          const { replyTable } = await import('../lib/cosmetics.js');
          return await replyTable(m, sock, { caption: '📡 CHANNEL METADATA', rows, footer: `JID: ${meta.id}` });
        }
      }

      // ── Current chat ID info ─────────────────────────────────────────────
      const jid      = m.from;
      const chatType = jid.endsWith('@g.us')      ? 'Group'
                     : jid.endsWith('@newsletter') ? 'Channel / Newsletter'
                     : jid.endsWith('@broadcast')  ? 'Broadcast List'
                     :                               'Private / DM';

      const senderJid = m.sender;
      const senderNum = senderJid.split('@')[0].split(':')[0];

      const rows = [
        ['Chat Type',   chatType],
        ['Chat JID',    jid],
        ['Your JID',    senderJid],
        ['Your Number', `+${senderNum}`],
      ];

      if (jid.endsWith('@g.us')) {
        rows.push(['Group ID', jid.split('@')[0]]);
        try {
          const gMeta = await sock.groupMetadata(jid);
          if (gMeta?.subject) rows.push(['Group Name', gMeta.subject]);
          if (gMeta?.participants) rows.push(['Members', String(gMeta.participants.length)]);
        } catch (_) {}
      }

      if (jid.endsWith('@newsletter')) {
        try {
          const nMeta = await sock.getNewsletterInfo(jid);
          if (nMeta?.name)            rows.push(['Channel Name',  nMeta.name]);
          if (nMeta?.subscriberCount) rows.push(['Subscribers',   String(nMeta.subscriberCount)]);
        } catch (_) {}
      }

      // ── Tier 1: richResponse table + copy/action card ────────────────────
      try {
        await richTableCard(sock, m.from, {
          title:   '🆔 CHAT ID INFO',
          headers: ['Field', 'Value'],
          rows,
          footer:  chatType,
        }, { quoted: m });

        return;
      } catch (err) {
        console.warn('[checkchid] Tier 1 failed:', err.message);
        const text = asciiBuilder.box('🆔 CHAT ID INFO', rows.map(([k, v]) => `${k.padEnd(12)}: ${v}`));
        await m.reply(text);
      }
    });
  },
};
