/**
 * math.js — renders LaTeX expressions as native Meta AI math cards.
 *
 * Uses baileysBridge.sendRichLatex (GenAILatexUXPrimitive — the .testrich
 * "v2latex" pattern): the expression is typeset inside the message card,
 * exactly like a Meta AI math reply. Falls back to a plain monospace
 * reply when the device can't render rich responses.
 *
 * Usage:
 *   .math x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}
 *   .math \int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
 *   .math E=mc^2
 */
import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';

export default {
  name: 'math',
  aliases: ['latex', 'tex'],
  category: 'utility',
  description: '📐 Renders LaTeX as a native math card. Usage: .math <latex expression>',
  cooldown: 5000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const latex = args.join(' ').trim();

    if (!latex) {
      return await m.reply.info(
        `Usage: \`${p}math <latex>\`\n\n` +
        `Example: \`${p}math x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\`\n` +
        `Quadratic formula, integrals, matrices — anything LaTeX can typeset.`,
        'NEXORA MATH'
      );
    }
    if (latex.length > 400) {
      return await m.reply.warn('Expression too long (max 400 characters).');
    }

    // ── Rich tier: native LaTeX card (sendRichLatex) ────────────────────
    if (capabilities.richResponse) {
      try {
        await baileysBridge.sendRichLatex(sock, m.from, {
          latex,
          headerText: '📐 NEXORA Math',
          footer: 'NEXORA • Rich LaTeX V2',
        }, { quoted: m });
        return;
      } catch (err) {
        console.warn('[math] rich latex card failed, text fallback:', err.message);
      }
    }

    // Fallback: monospace text
    await m.reply(`\`\`\`${latex}\`\`\``);
  },
};
