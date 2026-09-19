import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richCodeCard, mixedCard } from '../../lib/interactiveKit.js';
import { DownloadProgress } from '../../lib/progress.js';

function parseCodeReply(reply) {
  const match = reply.match(/```([a-zA-Z0-9+#.-]*)\n([\s\S]*?)```/);
  if (!match) {
    return { language: 'text', code: reply.trim(), explanation: '' };
  }
  const [full, lang, code] = match;
  const explanation = reply.replace(full, '').trim();
  return { language: lang || 'text', code: code.trim(), explanation };
}

export default {
  name: 'code',
  aliases: ['codegen', 'coder'],
  category: 'ai',
  description: 'Generate code with Nexora AI. Usage: .code <what to build>',
  cooldown: 6000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error(
        'AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env to enable this command.'
      );
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
      return await m.reply.info(
        `Usage: \`${p}code <what to build>\`\n\nExample: \`${p}code a python function to reverse a linked list\``,
        'NEXORA • Code Gen'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Generating code');
      try {
        const reply = await aiTextGenerator.generateCode(prompt);
        await progress.done();
        const { language, code, explanation } = parseCodeReply(reply);

        // ── Rich tier: native code card (proven v1code/v2code) + copy CTA ──
        // Falls back internally to a monospace card with a copy button.
        try {
          const caption = (explanation ? `${explanation}\n\n` : '') +
            `_Bugs? Reply to your prompt with_ \`.debug\` _to fix them._`;
          await richCodeCard(sock, m.from, {
            code, language, caption,
            footer: 'NEXORA • Gemini ✦',
          }, { quoted: m });
        } catch (_) {
          await mixedCard(sock, m.from, {
            text:   (explanation ? `✦ *Nexora Code*\n\n${explanation}\n\n` : '✦ *Nexora Code*\n\n') + `\`\`\`${language}\n${code}\n\`\`\``,
            footer: 'NEXORA • Gemini ✦',
          }, [
            { kind: 'copy',   label: '📋 Copy Code',       value: code },
            { kind: 'action', label: '✏️ Generate Another', cmd: `${p}code` },
          ], { quoted: m });
        }
      } catch (err) {
        await m.reply.error(`I couldn't generate that code: ${err.message}`);
        throw err;
      }
    });
  }
};
