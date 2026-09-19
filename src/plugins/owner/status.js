/**
 * status.js — Send WhatsApp Status (Story) to contacts or groups.
 *
 * Usage:
 *   .status text Hello world!              — Text status to all contacts
 *   .status text Hello @234... @233...      — Text status to specific contacts/groups
 *   .status image caption here             — Image status (reply to image)
 *   .status video caption here             — Video status (reply to video)
 *   .status audio                           — Audio status (reply to audio)
 *
 * Text statuses get random font + background color automatically.
 * You can override with —font <0-8> —bg <#hex> —color <#hex>.
 *
 * Aliases: .story, .sendstatus, .broadcaststatus
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'status',
  aliases: ['story', 'sendstatus', 'broadcaststatus'],
  category: 'owner',
  description: 'Sends a WhatsApp Status (Story) to contacts or groups.',
  permissions: { owner: true },
  cooldown: 10000,

  execute: async ({ sock, m, args, prefix, isOwner }) => {
    const p = prefix || '.';

    if (!isOwner) {
      return await m.reply.error('Only the bot owner can send status.');
    }

    const subcommand = (args[0] || '').toLowerCase();
    const restArgs = args.slice(1);
    const rawText = restArgs.join(' ');

    // Parse optional flags
    const fontMatch = rawText.match(/—font\s+(\d+)/);
    const bgMatch = rawText.match(/—bg\s+(#[0-9a-fA-F]{3,8})/);
    const colorMatch = rawText.match(/—color\s+(#[0-9a-fA-F]{3,8})/);
    const delayMatch = rawText.match(/—delay\s+(\d+)/);

    // Extract JID mentions (numbers starting with @)
    const jids = [];
    let match;
    const jidPattern = /@(\d{6,})/g;
    while ((match = jidPattern.exec(rawText)) !== null) {
      jids.push(`${match[1]}@s.whatsapp.net`);
    }
    const groupJidPattern = /@([\d-]+@g\.us)/g;
    while ((match = groupJidPattern.exec(rawText)) !== null) {
      jids.push(match[1]);
    }

    // Clean text of flags and JID mentions
    let cleanText = rawText
      .replace(/—font\s+\d+/g, '')
      .replace(/—bg\s+#[0-9a-fA-F]{3,8}/g, '')
      .replace(/—color\s+#[0-9a-fA-F]{3,8}/g, '')
      .replace(/—delay\s+\d+/g, '')
      .replace(/@\d{6,}/g, '')
      .replace(/@[\d-]+@g\.us/g, '')
      .trim();

    if (!subcommand) {
      return await m.reply.error(
        `*Status Sender*\n\n` +
        `• \`${p}status text <message>\` — Text status\n` +
        `• \`${p}status text <msg> @234...\` — To specific contacts\n` +
        `• \`${p}status image <caption>\` — Image status (reply to image)\n` +
        `• \`${p}status video <caption>\` — Video status (reply to video)\n` +
        `• \`${p}status audio\` — Audio status (reply to audio)\n\n` +
        `Flags: —font <0-8> —bg <#hex> —color <#hex> —delay <ms>`
      );
    }

    const options = {};
    if (fontMatch) options.font = parseInt(fontMatch[1]);
    if (bgMatch) options.backgroundColor = bgMatch[1];
    if (colorMatch) options.textColor = colorMatch[1];
    if (delayMatch) options.delayMs = parseInt(delayMatch[1]);

    await withReactionStatus(m, async () => {
      try {
        let content;

        if (subcommand === 'text') {
          if (!cleanText) {
            return await m.reply.error('Provide text for the status. Example: `.status text Hello world!`');
          }
          content = { text: cleanText, ...options };
          await sock.sendStatusMention(content, jids, options);
          await m.reply.success(
            `✅ *Text Status Sent*\n` +
            `Recipients: ${jids.length > 0 ? jids.length + ' specific' : 'all contacts'}`
          );
        } else if (subcommand === 'image' || subcommand === 'photo') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.imageMessage && !quoted.message?.imageMessage)) {
            return await m.reply.error('Reply to an image message to send as status.');
          }
          const buffer = await quoted.download();
          content = { image: buffer, caption: cleanText || undefined };
          await sock.sendStatusMention(content, jids, options);
          await m.reply.success(
            `✅ *Image Status Sent*\n` +
            `Caption: ${cleanText || 'None'}\n` +
            `Recipients: ${jids.length > 0 ? jids.length + ' specific' : 'all contacts'}`
          );
        } else if (subcommand === 'video') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.videoMessage && !quoted.message?.videoMessage)) {
            return await m.reply.error('Reply to a video message to send as status.');
          }
          const buffer = await quoted.download();
          content = { video: buffer, caption: cleanText || undefined };
          await sock.sendStatusMention(content, jids, options);
          await m.reply.success(
            `✅ *Video Status Sent*\n` +
            `Caption: ${cleanText || 'None'}\n` +
            `Recipients: ${jids.length > 0 ? jids.length + ' specific' : 'all contacts'}`
          );
        } else if (subcommand === 'audio' || subcommand === 'voice') {
          const quoted = m.quoted;
          if (!quoted || (!quoted.audioMessage && !quoted.message?.audioMessage)) {
            return await m.reply.error('Reply to an audio message to send as status.');
          }
          const buffer = await quoted.download();
          content = { audio: buffer, ptt: true };
          await sock.sendStatusMention(content, jids, options);
          await m.reply.success(
            `✅ *Audio Status Sent*\n` +
            `Recipients: ${jids.length > 0 ? jids.length + ' specific' : 'all contacts'}`
          );
        } else {
          return await m.reply.error(
            `Unknown type: \`${subcommand}\`. Use: text, image, video, or audio.`
          );
        }
      } catch (err) {
        await m.reply.error(`Failed to send status: ${err.message}`);
      }
    });
  }
};
