/**
 * setgcpp.js — Set or remove the group profile picture.
 *
 * Usage:
 *   .setgcpp <URL>       — Set picture from URL
 *   .setgcpp reply       — Set picture from replied image
 *   (reply to image) .setgcpp — Same as reply
 *   .setgcpp remove      — Remove group picture
 *
 * Aliases: .gcpp, .grouppp, .setgroupicon
 * Requires: admin + botAdmin
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'setgcpp',
  aliases: ['gcpp', 'grouppp', 'setgroupicon', 'setgpic', 'gpic'],
  category: 'group',
  description: 'Sets or removes the group profile picture.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const input = args[0]?.toLowerCase() || '';

    // Remove picture
    if (input === 'remove' || input === 'delete' || input === 'reset') {
      try {
        await sock.groupRemovePicture(m.from);
        return await m.reply.success('🗑️ Group profile picture removed.');
      } catch (err) {
        return await m.reply.error(`Failed to remove picture: ${err.message}`);
      }
    }

    let pictureBuffer = null;

    // From replied image
    if (input === 'reply' || (!input && m.quoted?.imageMessage)) {
      const quoted = m.quoted;
      if (!quoted) {
        return await m.reply.error('Reply to an image message or provide a URL.');
      }
      try {
        pictureBuffer = await quoted.download();
      } catch (err) {
        return await m.reply.error(`Failed to download replied image: ${err.message}`);
      }
    } else if (input.startsWith('http://') || input.startsWith('https://')) {
      // From URL
      try {
        const res = await fetch(input);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pictureBuffer = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        return await m.reply.error(`Failed to download image from URL: ${err.message}`);
      }
    } else {
      return await m.reply.error(
        `Usage:\n• \`${p}setgcpp <URL>\` — Set from URL\n• \`${p}setgcpp reply\` — Set from replied image\n• \`${p}setgcpp remove\` — Remove picture`
      );
    }

    await withReactionStatus(m, async () => {
      try {
        await sock.groupUpdatePicture(m.from, pictureBuffer);
        await m.reply.success('🖼️ Group profile picture updated. Fresh look! ✦');
      } catch (err) {
        await m.reply.error(`Failed to update group picture: ${err.message}`);
      }
    });
  }
};
