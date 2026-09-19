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
