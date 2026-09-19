import { imageConfig } from '../../images/imageConfig.js';

export default {
  name: 'setimagemode',
  aliases: ['imgmode', 'imode'],
  category: 'owner',
  description: 'Configure the dynamic image selection mode (static, random, or rotate).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const input = args[0] ? args[0].toLowerCase() : null;
    const allowed = ['static', 'random', 'rotate'];

    if (!input || !allowed.includes(input)) {
      const current = imageConfig.getMenuMode();
      let msg = `⚠️ *Usage:* \`${p}setimagemode <static|random|rotate>\`\n\n`;
      msg += `• *static:* Always use the first uploaded image.\n`;
      msg += `• *random:* Dynamically rotate a random image per request.\n`;
      msg += `• *rotate:* Stably cycle through each image sequentially.\n\n`;
      msg += `_Current mode:_ *${current.toUpperCase()}*`;
      return await m.reply(msg);
    }

    imageConfig.setMenuMode(input);
    await m.reply(`✅ *Dynamic image selection mode is now set to:* *${input.toUpperCase()}*`);
  }
};
