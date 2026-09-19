/**
 * metallic.js — 🪙 metallic logo (logomaker category shortcut).
 * Engine + prompt live in lib/logoMaker.js — this is a thin entry point.
 */
import { sendLogo } from '../../lib/logoMaker.js';

export default {
  name: 'metallic',
  aliases: ['3d', 'threed', 'chrome'],
  category: 'logomaker',
  description: 'Make a metallic logo with your text. Usage: .metallic <text>',
  cooldown: 15000,
  execute: async ({ m, sock, args, prefix }) => {
    await sendLogo({ m, sock, styleId: 'metallic', text: args.join(' '), prefix });
  },
};
