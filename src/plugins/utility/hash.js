import crypto from 'crypto';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'hash',
  aliases: ['md5', 'sha1', 'sha256'],
  category: 'developer',
  description: 'Generates a hash for the given text.',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    let text = args.join(' ').trim();
    if (m.quoted && !text) {
      text = m.quoted.text;
    }
    
    if (!text) {
      return await m.reply.info(`Usage: \`${prefix}hash <text>\` or reply to a message.`, 'HASH GENERATOR');
    }

    const md5 = crypto.createHash('md5').update(text).digest('hex');
    const sha1 = crypto.createHash('sha1').update(text).digest('hex');
    const sha256 = crypto.createHash('sha256').update(text).digest('hex');

    const resultText = `🔐 *HASH GENERATOR*\n\nInput: \`${text.length > 60 ? text.slice(0, 57) + '...' : text}\`\n\n*MD5:*\n${md5}\n\n*SHA1:*\n${sha1}\n\n*SHA256:*\n${sha256}`;

    await copyResultCard(sock, m.from, {
      text: resultText,
      footer: 'NEXORA • Hash',
      copyLabel: '📋 Copy SHA256',
      copyValue: sha256
    }, { quoted: m });
  }
};
