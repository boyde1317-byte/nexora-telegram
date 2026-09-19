import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'jwt',
  aliases: ['jwtdecode'],
  category: 'developer',
  description: 'Decodes a JSON Web Token (JWT) payload.',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    let token = args.join(' ').trim();
    if (m.quoted && !token) {
      token = m.quoted.text;
    }
    
    if (!token) {
      return await m.reply.info(`Usage: \`${prefix}jwt <token>\` or reply to a token.`, 'JWT DECODER');
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Not a valid JWT format.');
      
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      
      const text = `⚠️ *Note: Signature is NOT verified. Do not trust untrusted tokens.*\n\n🔓 *JWT DECODER*\n\n*HEADER:*\n\`\`\`json\n${JSON.stringify(header, null, 2)}\n\`\`\`\n\n*PAYLOAD:*\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • JWT',
        copyLabel: '📋 Copy Payload JSON',
        copyValue: JSON.stringify(payload, null, 2)
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to decode JWT: ${err.message}`);
    }
  }
};
