/**
 * jsonformat.js — Formats and validates JSON strings.
 *
 * Rich tier: native V2 code block card (GenAICodeBlockUXPrimitive via
 * baileysBridge.sendRichCode — the .testrich "v2code" pattern) with the
 * pretty-printed JSON syntax-highlighted inside the card. Falls back to
 * the classic copyResultCard (copy button) when the device can't render
 * rich responses.
 */
import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'jsonformat',
  aliases: ['json', 'prettyjson'],
  category: 'developer',
  description: 'Formats and validates JSON string.',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    let text = args.join(' ').trim();
    if (m.quoted && !text) {
      text = m.quoted.text;
    }

    if (!text) {
      return await m.reply.info(`Usage: \`${prefix}json <json string>\` or reply to a message.`, 'JSON FORMATTER');
    }

    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);

      // ── Rich tier: native code block card (sendRichCode) ──────────────
      if (capabilities.richResponse) {
        try {
          await baileysBridge.sendRichCode(sock, m.from, {
            code: formatted,
            language: 'json',
            caption: '✅ Valid JSON',
            footer: 'NEXORA • Rich Code V2',
          }, { quoted: m });
          return;
        } catch (err) {
          console.warn('[jsonformat] rich code card failed, button fallback:', err.message);
        }
      }

      await copyResultCard(sock, m.from, {
        text: `✅ *VALID JSON*\n\n\`\`\`json\n${formatted}\n\`\`\``,
        footer: 'NEXORA • JSON',
        copyLabel: '📋 Copy Formatted JSON',
        copyValue: formatted
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Invalid JSON: ${err.message}`);
    }
  }
};
