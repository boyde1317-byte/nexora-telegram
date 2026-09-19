import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'brainstorm',
  aliases: ['ideas', 'ideate'],
  category: 'ai',
  description: 'Generates creative ideas on a topic. Usage: .brainstorm <topic>',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }
    
    const topic = args.join(' ').trim();
    if (!topic) {
      return await m.reply.info(`Usage: \`${p}brainstorm <topic>\`\n\nExample: \`${p}brainstorm app ideas for college students\``, 'NEXORA • Brainstorm');
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Brainstorming');
      try {
        const reply = await aiTextGenerator.brainstormIdeas(topic);
        await progress.done();

        // ── Rich tier: native markdown rendering of the idea list ──
        const richSent = await sendAIRichReply(sock, m.from, m, {
          markdown: `## 💡 BRAINSTORM: ${topic.toUpperCase()}\n\n${reply}\n\n_Need more? Tap a suggestion below for another round._`,
          tips:    ['NEXORA • Think Tank'],
          suggest: [`${p}brainstorm ${topic}`, `${p}ai Tell me more about: ${topic}`],
          footer:  'NEXORA • Think Tank',
        });
        if (richSent) return;

        await mixedCard(sock, m.from, {
          text: `💡 *BRAINSTORM: ${topic.toUpperCase()}*\n\n${reply}\n\n_Need more? Hit 'More Ideas' for another round._`,
          footer: 'NEXORA • Think Tank',
        }, [
          { kind: 'copy',   label: '📋 Copy Ideas',      value: reply },
          { kind: 'action', label: '💡 More Ideas',      cmd: `${p}brainstorm ${topic}` },
          { kind: 'action', label: '🤖 Ask AI',         cmd: `${p}ai Tell me more about: ${topic}` },
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Failed to brainstorm: ${err.message}`);
        throw err;
      }
    });
  }
};
