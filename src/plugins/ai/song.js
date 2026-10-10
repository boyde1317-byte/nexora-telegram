import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'song',
  aliases: ['songwriter', 'writeme'],
  category: 'ai',
  description: 'AI writes an original song from your brief. Usage: .song <theme/genre/mood>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }

    const brief = args.join(' ').trim();
    if (!brief) {
      return await m.reply.info(
        `Usage: \`${p}song <what the song is about>\`\n\n` +
        `Examples:\n` +
        `\`${p}song a heartbreak afrobeats tune about Lagos nights\`\n` +
        `\`${p}song an anthem for the Black Stars\`\n` +
        `\`${p}song a happy highlife song about my mother's cooking\``,
        'NEXORA • Songwriter');
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Writing your song');
      try {
        const song = await aiTextGenerator.writeSong(brief);
        await progress.done();

        // ── Rich tier: native markdown rendering of the song ──
        const richSent = await sendAIRichReply(sock, m.from, m, {
          markdown: `## 🎵 YOUR SONG\n*${brief.toUpperCase()}*\n\n${song}\n\n_The stage is yours — tap a button below._`,
          tips:    ['NEXORA • Songwriter'],
          suggest: [`${p}song ${brief}`, `${p}song another version of: ${brief}, different vibe`],
          footer:  'NEXORA • Songwriter',
        });
        if (richSent) return;

        await mixedCard(sock, m.from, {
          text: `🎵 *NEXORA SONGWRITER*\n*${brief}*\n\n${song}\n\n_Like it? Or want another take?_`,
          footer: 'NEXORA • Songwriter',
        }, [
          { kind: 'copy',   label: '📋 Copy Song',        value: song },
          { kind: 'action', label: '🔁 Another Version',  cmd: `${p}song another version of: ${brief}, different vibe` },
          { kind: 'action', label: '🎙️ Same Mood',        cmd: `${p}song ${brief}` },
          { kind: 'action', label: '🤖 Ask AI',           cmd: `${p}ai Suggest chords and a melody style for this song: ${brief}` },
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Failed to write the song: ${err.message}`);
        throw err;
      }
    });
  },
};
