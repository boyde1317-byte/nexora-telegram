/**
 * logo.js — Main command of the logomaker category.
 *
 *   .logo <text>            → minimalist professional logo
 *   .logo <text> <style>    → themed logo (neon, gaming, fire, glass,
 *                              metallic, mascot, retro, minimalist)
 *   .logo styles            → menu of all styles
 *
 * Themed shortcuts (.neon, .gaming, .fire, .glass, .metallic, .mascot,
 * .retro) live in this folder and share the logoMaker engine.
 */
import { STYLES, sendLogo } from '../../lib/logoMaker.js';
import { richTableCard } from '../../lib/interactiveKit.js';

export default {
  name: 'logo',
  aliases: ['logomaker', 'makelogo'],
  category: 'logomaker',
  description: 'AI logo maker. Usage: .logo <text> [style] — .logo styles to list styles',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    // ── style menu ───────────────────────────────────────────────────────
    if (!args.length || args[0]?.toLowerCase() === 'styles') {
      return await richTableCard(sock, m.from, {
        title: '🎨 LOGO MAKER',
        headers: ['Style', 'Looks like'],
        rows: Object.entries(STYLES).map(([id, s]) => [`${s.emoji} ${s.label}`, s.hint]),
        footer: `${p}logo <text> [style]  •  e.g. ${p}logo NEXORA neon`,
      }, { quoted: m });
    }

    // ── <text> [style] — last word wins if it names a style ───────────────
    const words = args.slice();
    let styleId = 'minimalist';
    const last = words[words.length - 1]?.toLowerCase();
    if (last && STYLES[last] && words.length > 1) {
      styleId = last;
      words.pop();
    } else if (args[0]?.toLowerCase() === 'style' && STYLES[args[1]?.toLowerCase()]) {
      styleId = args[1].toLowerCase();
      words.shift(); words.shift();
    }

    await sendLogo({ m, sock, styleId, text: words.join(' '), prefix: p });
  },
};
