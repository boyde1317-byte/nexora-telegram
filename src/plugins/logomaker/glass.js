/**
 * glass.js — 🔷 glass logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'glass',
  aliases: ['glasslogo'],
  category: 'logomaker',
  description: 'Make a glass logo with your text. Usage: .glass <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'glass', text: args.join(' '), prefix });
  },
};
