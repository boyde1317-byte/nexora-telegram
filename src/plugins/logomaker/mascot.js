/**
 * mascot.js — 🐺 mascot logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'mascot',
  aliases: ['wolf', 'wolflogo'],
  category: 'logomaker',
  description: 'Make a mascot logo with your text. Usage: .mascot <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'mascot', text: args.join(' '), prefix });
  },
};
