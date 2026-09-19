import { menuManager } from '../../menu/manager.js';
import { imageManager } from '../../images/imageManager.js';

export default {
  name: 'setmenuimage',
  aliases: ['setimage', 'setimg'],
  category: 'owner',
  description: 'Saves the replied image as background/banner for the currently active menu style.',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, prefix }) => {
    const p = prefix || '.';
    if (!m.quoted) {
      const activeStyle = menuManager.getActiveMenu();
      return await m.reply.error(`Please reply to an image to save it for the active style (*${activeStyle.name}*).`);
    }

    const qType = m.quoted.type;
    const msgObj = m.quoted.msg || {};
    const mimetype = msgObj.mimetype || '';
    const isImage = qType === 'imageMessage' || mimetype.startsWith('image/');

    if (!isImage) {
      return await m.reply.error('The replied message is not an image file.');
    }

    const activeStyle = menuManager.getActiveMenu();
    const styleId = activeStyle.id;

    await m.reply.loading(`Registering image for Style ${styleId}...`);

    try {
      const buffer = await m.quoted.download();
      if (!buffer) {
        return await m.reply.error('Failed to download image buffer.');
      }

      const relativePath = await imageManager.saveRepliedImage(styleId, buffer, mimetype);
      return await m.reply.success(`Saved image to active style *${activeStyle.name}*.`);
    } catch (err) {
      console.error('Failed to save menu style image:', err);
      return await m.reply.error(`Error saving image asset: ${err.message}`);
    }
  }
};
