/**
 * neon.js — 💡 neon logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'neon',
  aliases: ['neonlogo'],
  category: 'logomaker',
  description: 'Make a neon logo with your text. Usage: .neon <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'neon', text: args.join(' '), prefix });
  },
};
