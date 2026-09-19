import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'proofread',
  aliases: ['grammar', 'fixtext'],
  category: 'ai',
  description: 'Proofreads and corrects grammar/spelling. Usage: .proofread <text> or reply to a message.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }
    
    let text = args.join(' ').trim();
    if (m.quoted && !text) {
      text = m.quoted.text;
    }
    
    if (!text) {
      return await m.reply.info(`Usage: \`${p}proofread <text>\` or reply to a message with \`${p}proofread\``, 'NEXORA • Proofread');
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Proofreading');
      try {
        const reply = await aiTextGenerator.proofreadText(text);
        await progress.done();

        await mixedCard(sock, m.from, {
          text: `✅ *PROOFREAD TEXT*\n\n${reply}\n\n_Polished. Ready to send._`,
          footer: 'NEXORA • Red Pen',
        }, [
          { kind: 'copy',   label: '📋 Copy Fixed Text',  value: reply },
          { kind: 'action', label: '🔄 Proofread Again',   cmd: `${p}proofread` },
          { kind: 'action', label: '🌐 Translate It',      cmd: `${p}translate` },
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Failed to proofread: ${err.message}`);
        throw err;
      }
    });
  }
};
