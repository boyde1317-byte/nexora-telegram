import { greetingConfig } from '../../greetings/greetingConfig.js';
import fs from 'node:fs';
import path from 'node:path';

export default {
  name: 'setwelcomeimage',
  aliases: ['setwcimg', 'wcimg'],
  category: 'owner',
  description: 'Set custom background image for welcome cards (image or URL).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    if (m.quoted) {
      const qType = m.quoted.type;
      const msgObj = m.quoted.msg || {};
      const mimetype = msgObj.mimetype || '';

      const isImage = qType === 'imageMessage' || mimetype.startsWith('image/');
      if (isImage) {
        await m.reply.loading('Downloading custom welcome image...');
        try {
          const buffer = await m.quoted.download();
          if (!buffer) return await m.reply.error('Failed to download image buffer.');

          const ext = mimetype.includes('png') ? '.png' : '.jpg';
          const filename = `welcome_bg_${Date.now()}${ext}`;
          const savePath = path.join(process.cwd(), 'media', 'greetings', 'welcome');
          
          if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
          }

          const fileFullPath = path.join(savePath, filename);
          fs.writeFileSync(fileFullPath, buffer);

          greetingConfig.setWelcomeImage(fileFullPath);
          return await m.reply.success(`Successfully saved welcome card image on disk!`);
        } catch (err) {
          return await m.reply.error(`Error saving image: ${err.message}`);
        }
      }
    }

    if (args[0] && (args[0].startsWith('http://') || args[0].startsWith('https://'))) {
      greetingConfig.setWelcomeImage(args[0]);
      return await m.reply.success(`Successfully configured custom welcome image URL!`);
    }

    return await m.reply.warn(`Please reply to an image or supply a valid image URL with \`${p}setwelcomeimage\`.`);
  }
};
