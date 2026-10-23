/**
 * tts.js — text-to-speech voice note (ported from OURIN DELUXE V3.4.1
 * tts/tts.js, api.nexray.eu.cc gemini-tts keyless endpoint, live-verified —
 * returns a hosted mp3 we send back as an audio message).
 *
 *   .tts <text>   → voice note of the text
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const GEMINI_TTS = 'https://api.nexray.eu.cc/ai/gemini-tts?text=';

export default {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'media',
  description: '🔊 Turn text into a voice note. Usage: .tts <text>',
  cooldown: 6000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(`Sends your text back as audio.\n\nExample: \`${p}tts good morning everyone\``, 'TTS');
    }
    if (text.length > 1000) {
      return await m.reply.warn('Keep it under 1000 characters.');
    }
    await withReactionStatus(m, async () => {
      try {
        const res = await fetch(GEMINI_TTS + encodeURIComponent(text), {
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`tts HTTP ${res.status}`);
        const data = await res.json();
        if (data.status !== true || !data.result) throw new Error(data.error || 'no audio returned');
        await sock.sendMessage(m.from, { audio: { url: data.result }, ptt: false }, { quoted: m });
      } catch (err) {
        console.error('[tts]', err.message);
        await m.reply.error(`Voice synthesis failed: ${err.message}`);
      }
    });
  },
};
