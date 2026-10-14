/**
 * paperanimation.js — paper-cut text animation maker via api.jaky.dev.
 * .paper <text> → short animated mp4. Costs API credits.
 */
import { jaky } from '../../lib/jakyApi.js';

export default {
  name: 'paperanimation',
  aliases: ['paper'],
  category: 'media',
  description: 'Make a paper-cut text animation video. Usage: .paper <text>',
  cooldown: 30000,

  execute: async ({ m, sock, args }) => {
    const text = args.join(' ').trim();
    if (!text) return await m.reply.error('Usage: `.paper <text>`');

    if (!jaky.hasKey()) {
      return await m.reply.error('Maker API key is not configured — set `JAKY_API_KEY` in .env.');
    }

    await m.react('⏳');
    const res = await jaky.post('/v1/maker/paperanimation', { text }, 240000);
    const url = res.data?.result?.url || res.data?.url;
    if (!res.ok || !url) {
      return await m.reply.error(res.data?.msg || 'The animation render failed.');
    }

    const buffer = await jaky.download(url);
    if (!buffer) return await m.reply.error('Render succeeded but the download failed — try again.');

    return await sock.sendMessage(m.from, {
      video: buffer,
      caption: `📜 *Paper animation* — "${text.slice(0, 60)}"`,
    }, { quoted: m });
  },
};
