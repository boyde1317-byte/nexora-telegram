import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'qr',
  aliases: ['qrcode', 'makeqr', 'genqr'],
  category: 'utility',
  description: 'Generates a QR code image from any text or URL.',
  cooldown: 4000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(
        `Usage: \`${p}qr <text or URL>\`\n\nExamples:\n• \`${p}qr https://github.com\`\n• \`${p}qr Hello World\`\n• \`${p}qr +233597514499\``,
        'QR CODE GENERATOR'
      );
    }

    if (text.length > 900) {
      return await m.reply.error('Text too long. Max 900 characters for QR codes.');
    }

    await withReactionStatus(m, async () => {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=20&color=000000&bgcolor=ffffff&data=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('QR code service unavailable.');

      const buffer = Buffer.from(await res.arrayBuffer());
      await sock.sendMessage(m.from, {
        image: buffer,
        caption: `✅ *QR Code Generated*\n\n📄 Content: ${text.length > 80 ? text.slice(0, 77) + '...' : text}`,
      }, { quoted: m });

      try {
        await mixedCard(sock, m.from, {
          text: `✅ QR code ready. Scan away. ✦`,
          footer: 'NEXORA • QR Studio',
        }, [
          { kind: 'action', label: '🔄 Another QR',  cmd: `${p}qr` },
          { kind: 'action', label: '🔗 Shorten URL',  cmd: `${p}tinyurl` },
        ], { quoted: m });
      } catch (_) {}
    });
  }
};
