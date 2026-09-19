/**
 * math.js — .math <problem> — live showcase of native LaTeX rendering
 * (GenAILatexItem inline entities, fork v0.3.18-r6; aiRichReply now
 * converts $...$ spans to NIXCODE latex markers with codecogs PNGs).
 *
 * Flow: AI (provider-agnostic via aiClient) solves step-by-step with
 * forced $...$ LaTeX -> sendAIRichReply paints equations natively.
 * Fallback: mixed card with plain text.
 */

import { getAiClient, hasApiKey } from '../../assets/aiClient.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';
import { DownloadProgress } from '../../lib/progress.js';

const MATH_SYSTEM_PROMPT =
  'You are Nexora, a sharp math tutor inside WhatsApp. Solve the problem step by step, briefly. ' +
  'Wrap EVERY equation and expression in $...$ LaTeX (inline math only, e.g. $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$). ' +
  'Plain words between steps. Finish with a line starting "Answer:" followed by the final result in $...$. ' +
  'No preamble, no generic AI cliches.';

export default {
  name: 'math',
  aliases: ['solve'],
  category: 'ai',
  description: 'Step-by-step math solver with native LaTeX. Usage: .math <problem>',
  cooldown: 6000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!hasApiKey()) {
      return await m.reply.error(
        'AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env to enable this command.'
      );
    }

    const problem = args.join(' ').trim();
    if (!problem) {
      return await m.reply.info(
        `Usage: \`${p}math <problem>\`\n\nExamples:\n• \`${p}math solve x^2 + 5x + 6 = 0\`\n• \`${p}math integral of x*e^x dx\`\n• \`${p}math 15% of 2400\`\n• \`${p}math prove sin²x + cos²x = 1\``,
        'NEXORA • Math'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Calculating');
      try {
        const ai = getAiClient();
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: { parts: [{ text: problem }] },
          config: { systemInstruction: MATH_SYSTEM_PROMPT },
        });
        const reply = (res?.candidates?.[0]?.content?.parts || [])
          .map((part) => part.text)
          .filter(Boolean)
          .join('\n')
          .trim();
        await progress.done();

        if (!reply) throw new Error('empty response');

        const shortProblem = problem.length > 80 ? problem.slice(0, 77) + '…' : problem;

        // ── Rich tier: native LaTeX + text ──
        const richSent = await sendAIRichReply(sock, m.from, m, {
          markdown: reply,
          suggest: [`.math ${shortProblem}`, '.math', '.menu'],
          footer: 'NEXORA • Math',
        });
        if (richSent) return;

        // ── Fallback: plain interactive card ──
        await mixedCard(sock, m.from, {
          text: reply,
          footer: 'NEXORA • Math',
        }, [
          { kind: 'action', label: '🔁 Another Problem', cmd: `${p}math` },
          { kind: 'action', label: '🧠 Ask AI', cmd: `${p}ai ${shortProblem}` },
          { kind: 'copy', label: '📋 Copy Solution', value: reply },
        ], { quoted: m });
      } catch (err) {
        await progress.done();
        await m.reply.error(`Math error: ${err.message}`);
      }
    });
  },
};
