/**
 * gcstory.js — Send a Group Story (Status to a group).
 *
 * Usage:
 *   .gcstory text <message>    — Text story to current group
 *   .gcstory image <caption>   — Image story (reply to image)
 *   .gcstory video <caption>   — Video story (reply to video)
 *   .gcstory audio             — Audio story (reply to audio)
 *
 * Uses groupStatusMessageV2 protocol via sock.sendGroupStatus.
 * Requires: admin + botAdmin in the group.
 *
 * Aliases: .groupstory, .swgc, .gstatus
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'gcstory',
  aliases: ['groupstory', 'swgc', 'gstatus'],
  category: 'group',
  description: 'Sends a Group Story (status) to the current group.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 8000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const subcommand = (args[0] || '').toLowerCase();
    const restArgs = args.slice(1);
    const cleanText = restArgs.join(' ').trim();

    if (!subcommand) {
      return await m.reply.error(
        `*Group Story Sender*\n\n` +
        `• \`${p}gcstory text <message>\` — Text story\n` +
        `• \`${p}gcstory image <caption>\` — Image story (reply to image)\n` +
        `• \`${p}gcstory video <caption>\` — Video story (reply to video)\n` +
        `• \`${p}gcstory audio\` — Audio story (reply to audio)`
      );
    }

    await withReactionStatus(m, async () => {
      try {
        let content;

        if (subcommand === 'text') {
          if (!cleanText) {
            return await m.reply.error('Provide text. Example: `.gcstory text Hello group!`');
          }
          content = { text: cleanText };
          await sock.sendGroupStatus(m.from, content);
          await m.reply.success(`✅ *Text Group Story Sent*`);
        } else if (subcommand === 'image' || subcommand === 'photo') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.imageMessage && !quoted.message?.imageMessage)) {
            return await m.reply.error('Reply to an image message.');
          }
          const buffer = await quoted.download();
          content = { image: buffer, caption: cleanText || undefined };
          await sock.sendGroupStatus(m.from, content);
          await m.reply.success(`✅ *Image Group Story Sent*\nCaption: ${cleanText || 'None'}`);
        } else if (subcommand === 'video') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.videoMessage && !quoted.message?.videoMessage)) {
            return await m.reply.error('Reply to a video message.');
          }
          const buffer = await quoted.download();
          content = { video: buffer, caption: cleanText || undefined };
          await sock.sendGroupStatus(m.from, content);
          await m.reply.success(`✅ *Video Group Story Sent*\nCaption: ${cleanText || 'None'}`);
        } else if (subcommand === 'audio' || subcommand === 'voice') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.audioMessage && !quoted.message?.audioMessage)) {
            return await m.reply.error('Reply to an audio message.');
          }
          const buffer = await quoted.download();
          content = { audio: buffer, ptt: true };
          await sock.sendGroupStatus(m.from, content);
          await m.reply.success(`✅ *Audio Group Story Sent*`);
        } else {
          return await m.reply.error(
            `Unknown type: \`${subcommand}\`. Use: text, image, video, or audio.`
          );
        }
      } catch (err) {
        await m.reply.error(`Failed to send group story: ${err.message}`);
      }
    });
  }
};
