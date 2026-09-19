/**
 * paste.js — Upload text to paste.rs and return a shareable link.
 *
 * Fixed: broken template literal in usage message.
 * Improved: copy button for the URL, progress feedback.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'paste',
  aliases: ['pastebin', 'hastebin', 'upload'],
  category: 'utility',
  description: 'Uploads text to paste.rs and returns a shareable link. Reply to a text message or type directly.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let text = '';

    if (m.quoted && m.quoted.body) {
      text = m.quoted.body.trim();
    } else {
      text = args.join(' ').trim();
    }

    if (!text) {
      return await m.reply.info(
        `Usage:\n• \`${p}paste <your text>\` — paste typed text\n• Reply to any message with \`${p}paste\` — paste that message\n\nReturns a shareable link.`,
        'PASTE ONLINE'
      );
    }

    if (text.length > 50000) {
      return await m.reply.error('Text too long. Maximum 50,000 characters.');
    }

    await withReactionStatus(m, async () => {
      try {
        const res = await fetch('https://paste.rs/', {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain' },
          body:    text,
          signal:  AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`Paste service returned ${res.status}.`);
        const url = (await res.text()).trim();
        if (!url.startsWith('http')) throw new Error('Unexpected response from paste service.');

        const preview = text.slice(0, 80).replace(/\n/g, ' ');
        const bodyText = `📋 *PASTED ONLINE*\n\n🔗 Link: ${url}\n📝 Preview: ${preview}${text.length > 80 ? '...' : ''}\n📏 Length: ${text.length} characters`;

        try {
          await copyResultCard(sock, m.from, {
            text:       bodyText,
            footer:     'NEXORA • Paste',
            copyLabel:  '📋 Copy Link',
            copyValue:  url,
          }, { quoted: m });
        } catch (_) {
          await m.reply(bodyText);
        }
      } catch (err) {
        await m.reply.error(`Failed to paste: ${err.message}`);
      }
    });
  }
};
