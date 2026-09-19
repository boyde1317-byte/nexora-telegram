/**
 * retro.js — 📻 retro logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'retro',
  aliases: ['vintage', 'retrologo'],
  category: 'logomaker',
  description: 'Make a retro logo with your text. Usage: .retro <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'retro', text: args.join(' '), prefix });
  },
};
