/**
 * fire.js — 🔥 fire logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'fire',
  aliases: ['firelogo'],
  category: 'logomaker',
  description: 'Make a fire logo with your text. Usage: .fire <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'fire', text: args.join(' '), prefix });
  },
};
