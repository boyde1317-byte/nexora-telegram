/**
 * share.js — turn any text into a tappable copy-card.
 *
 * .share <text>
 *
 * For the things people mistype when re-typing: wallet addresses,
 * WiFi passwords, meeting links, account numbers, invite codes.
 * Renders the text in a card with a native cta_copy button — one tap
 * and it's on the clipboard, zero typos. Falls back to a plain quote
 * of the text when rich responses are unavailable.
 */
import { mixedCard } from '../../lib/interactiveKit.js';
import capabilities from '../../core/capabilities.js';

export default {
  name: 'share',
  category: 'utility',
  description: 'Make any text tappable-copyable: .share <text>',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(
        `Send me the text to share and I'll return it as a copy-card:\n\n\`${p}share 0x71C7656EC7ab88b098defB751B5405B23f4b9A02\`\n\`${p}share WiFi: nexora5g / pass: hunter2\``,
        '📤 SHARE',
      );
    }

    const body =
      `📤 *SHARE*\n\n${text}\n\n` +
      `_Tap copy and it's on your clipboard — no re-typing, no typos._`;

    try {
      return await mixedCard(sock, m.from, { text: body, footer: 'NEXORA Share' }, [
        { kind: 'copy', label: '📋 Copy', value: text },
      ], { quoted: m });
    } catch (err) {
      if (!capabilities.richResponse) throw err; // plain fallback below only for rich failures
      console.warn('[share] rich card failed, plain fallback:', err.message);
      return await m.reply(body);
    }
  },
};
