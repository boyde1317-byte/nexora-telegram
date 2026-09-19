import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'debug',
  aliases: ['fixcode'],
  category: 'ai',
  description: 'Analyzes code for bugs and provides a fix. Usage: .debug <code> or reply to code.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }
    
    let code = args.join(' ').trim();
    if (m.quoted && !code) {
      code = m.quoted.text;
    }
    
    if (!code) {
      return await m.reply.info(`Usage: \`${p}debug <code>\` or reply to a message containing code.`, 'NEXORA • Debug');
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Debugging code');
      try {
        const reply = await aiTextGenerator.debugCode(code);
        await progress.done();

        await mixedCard(sock, m.from, {
          text: `🐛 *CODE DEBUGGER*\n\n${reply}`,
          footer: 'NEXORA • Bug Hunter',
        }, [
          { kind: 'copy',   label: '📋 Copy Response',    value: reply },
          { kind: 'action', label: '✏️ Generate Code',    cmd: `${p}code` },
          { kind: 'action', label: '📝 Proofread Text',   cmd: `${p}proofread` },
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Failed to debug code: ${err.message}`);
        throw err;
      }
    });
  }
};
