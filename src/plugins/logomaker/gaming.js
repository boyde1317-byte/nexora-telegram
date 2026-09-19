/**
 * gaming.js — 🎮 gaming logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'gaming',
  aliases: ['esports', 'esportslogo'],
  category: 'logomaker',
  description: 'Make a gaming logo with your text. Usage: .gaming <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'gaming', text: args.join(' '), prefix });
  },
};
