import { mediaConfig } from '../../media/mediaConfig.js';
import { mediaManager } from '../../media/mediaManager.js';

export default {
  name: 'setthumbnail',
  aliases: ['thumbnail', 'thumb'],
  category: 'owner',
  description: 'Enable/disable menu thumbnails or save the replied image as the menu thumbnail.',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    // If user is replying to an image, update the thumbnail file
    if (m.quoted) {
      const qType = m.quoted.type;
      const isImage = qType === 'imageMessage' || m.quoted.message?.imageMessage;
      
      if (!isImage) {
        return await m.reply.error('The replied message is not an image. Please reply to an image to set it as a thumbnail.');
      }

      await m.reply('⏳ _Downloading and updating menu thumbnail..._');
      try {
        const buffer = await m.quoted.download();
        if (!buffer) {
          return await m.reply.error('Failed to download replied image buffer.');
        }

        const relativePath = await mediaManager.saveRepliedMedia('thumbnail', buffer, 'image/jpeg');
        return await m.reply(`✅ *Menu thumbnail updated successfully!*\nSaved to: \`${relativePath}\``);
      } catch (err) {
        console.error('Failed to set thumbnail from replied image:', err);
        return await m.reply.error(`Error setting thumbnail: ${err.message}`);
      }
    }

    // Otherwise, handle the toggle setting (on/off)
    const input = args[0] ? args[0].toLowerCase() : null;

    if (!input || (input !== 'on' && input !== 'off')) {
      const current = mediaConfig.get('menuThumbnail') ? 'ON' : 'OFF';
      return await m.reply(`⚠️ *Usage:* \`${p}setthumbnail on/off\` or reply to an image to set it as the menu thumbnail.\n\n_Current setting:_ *${current}*`);
    }

    const value = input === 'on';
    mediaConfig.set('menuThumbnail', value);

    await m.reply(`✅ *Menu thumbnail display is now turned ${value ? 'ON 🖼️' : 'OFF 📭'}*`);
  }
};
