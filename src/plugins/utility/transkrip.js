/**
 * transkrip.js — audio/video → text via Groq Whisper (ported from OURIN
 * DELUXE V3.4.1 tools/transkrip.js, api.groq.com/openai/v1/audio/transcriptions,
 * whisper-large-v3 — fastest transcription available, generous free tier).
 *
 *   .transkrip              → reply to a voice note / audio / video
 *   .transkrip <language>   → hint the language, e.g. .transkrip id
 *
 * Needs GROQ_API_KEY in .env (free at console.groq.com). OURIN shipped a
 * hardcoded key in its public zip, but published keys get revoked fast —
 * env-only is the honest way.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export default {
  name: 'transkrip',
  aliases: ['transcribe', 'totext'],
  category: 'utility',
  description: '📝 Transcribe a voice note, audio or video to text. Reply with .transkrip',
  cooldown: 10_000,

  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';

    const selfMedia = ['audioMessage', 'pttMessage', 'videoMessage', 'documentMessage'].includes(m.type);
    const quoted = m.quoted && ['audioMessage', 'pttMessage', 'videoMessage', 'documentMessage'].includes(m.quoted.type);
    if (!selfMedia && !quoted) {
      return await m.reply.info(
        `Transcribes voice notes, audio and video into text (Groq Whisper, fast).\n\nReply to a voice note with \`${p}transkrip\`, or add a language hint: \`${p}transkrip en\``,
        'TRANSCRIBE'
      );
    }

    if (!GROQ_KEY) {
      return await m.reply.error('Set GROQ_API_KEY in .env to enable transcription (free at console.groq.com).');
    }

    await withReactionStatus(m, async () => {
      try {
        const buffer = selfMedia ? await m.download() : await m.quoted.download();
        if (!buffer || buffer.length === 0) {
          return await m.reply.error('Could not download the media — it may have expired.');
        }

        const lang = args[0]?.length === 2 ? args[0].toLowerCase() : undefined;
        const ext = (selfMedia ? m.type : m.quoted.type).replace('Message', '').replace('ptt', 'ogg').replace('audio', 'ogg');
        const form = new FormData();
        form.set('file', new Blob([buffer]), `audio.${ext === 'video' ? 'mp4' : ext}`);
        form.set('model', 'whisper-large-v3');
        if (lang) form.set('language', lang);

        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${GROQ_KEY}` },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const detail = (await res.json().catch(() => ({})))?.error?.message || `HTTP ${res.status}`;
          throw new Error(detail);
        }
        const data = await res.json();
        if (!data.text) throw new Error('no text returned');
        await m.reply(`📝 *TRANSCRIPT*\n\n${data.text.slice(0, 3800)}`);
      } catch (err) {
        console.error('[transkrip]', err.message);
        await m.reply.error(`Transcription failed: ${err.message}`);
      }
    });
  },
};
