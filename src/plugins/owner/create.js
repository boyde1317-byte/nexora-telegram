/**
 * create.js — Create a new WhatsApp group with optional picture.
 *
 * Usage:
 *   .create Group Name                    — Create with just a name
 *   .create Group Name | Description      — Create with name + description
 *   .create Group Name —img <URL>          — Create with picture from URL
 *   .create Group Name | Desc —img reply   — Create with replied image
 *   .create Group Name @234... @233...     — Create with participants
 *
 * After creation, sets description if provided, and optionally sets picture.
 * Returns the group JID, invite link, and metadata.
 *
 * Aliases: .newgroup, .creategroup
 */
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'create',
  aliases: ['newgroup', 'creategroup', 'gc'],
  category: 'owner',
  description: 'Creates a new WhatsApp group with optional picture and description.',
  permissions: { owner: true },
  cooldown: 8000,

  execute: async ({ sock, m, args, prefix, isOwner }) => {
    const p = prefix || '.';

    if (!isOwner) {
      return await m.reply.error('Only the bot owner can create groups.');
    }

    const remainingArgs = args.join(' ');
    if (!remainingArgs) {
      return await m.reply.error(
        `Usage: \`${p}create Group Name\`\n` +
        `With description: \`${p}create Group Name | Description\`\n` +
        `With picture: \`${p}create Group Name | Desc —img <URL>\`\n` +
        `With picture (reply): \`${p}create Group Name | Desc —img reply\`\n` +
        `With participants: \`${p}create Group Name @234... @233...\``
      );
    }

    // Parse —img flag
    let pictureSource = null;
    let argsWithoutImg = remainingArgs;
    const imgMatch = remainingArgs.match(/(?:—img|--img)\s+(\S+)/);
    if (imgMatch) {
      pictureSource = imgMatch[1];
      argsWithoutImg = remainingArgs.replace(/(?:—img|--img)\s+\S+/, '').trim();
    }

    // Also use replied image if no —img flag but replying to an image
    if (!pictureSource && m.quoted?.imageMessage) {
      pictureSource = 'reply';
    }

    // Extract participant JIDs from mentions or @number patterns
    const participantJids = [];
    // From mentioned JIDs
    if (m.mentionedJid && m.mentionedJid.length > 0) {
      participantJids.push(...m.mentionedJid);
    }
    // From @number patterns in text
    const numberMatches = argsWithoutImg.match(/@(\d{6,})/g);
    if (numberMatches) {
      for (const match of numberMatches) {
        const number = match.replace('@', '');
        const jid = `${number}@s.whatsapp.net`;
        if (!participantJids.includes(jid)) {
          participantJids.push(jid);
        }
      }
    }
    // Remove the @number patterns from the name/description text
    argsWithoutImg = argsWithoutImg.replace(/@(\d{6,})/g, '').trim();

    // Parse name | description
    const parts = argsWithoutImg.split('|').map(s => s.trim());
    const name = parts[0];
    const description = parts[1] || null;

    if (!name) {
      return await m.reply.error('Please provide a valid non-empty group name.');
    }

    // Resolve picture source
    let pictureBuffer = null;
    if (pictureSource) {
      if (pictureSource.toLowerCase() === 'reply') {
        const quoted = m.quoted;
        if (!quoted) {
          return await m.reply.error('Reply to an image message to use it as group picture.');
        }
        try {
          pictureBuffer = await quoted.download();
        } catch (err) {
          return await m.reply.error(`Failed to download replied image: ${err.message}`);
        }
      } else if (pictureSource.startsWith('http://') || pictureSource.startsWith('https://')) {
        try {
          const res = await fetch(pictureSource);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          pictureBuffer = Buffer.from(await res.arrayBuffer());
        } catch (err) {
          return await m.reply.error(`Failed to download image from URL: ${err.message}`);
        }
      } else {
        return await m.reply.error('Invalid image source. Use `—img <URL>` or `—img reply`.');
      }
    }

    await m.reply('⏳ _Creating group..._');

    // Create the group
    let metadata;
    try {
      metadata = await sock.groupCreate(name, participantJids);
    } catch (err) {
      return await m.reply.error(`Failed to create group: ${err.message || err}`);
    }

    const groupJid = metadata.id;

    // Set description if provided
    if (description) {
      try {
        await sock.groupUpdateDescription(groupJid, description);
      } catch (err) {
        console.warn('[create] Failed to set description:', err.message);
      }
    }

    // Set picture if provided
    let pictureStatus = '❌ Not set';
    if (pictureBuffer) {
      try {
        await sock.groupUpdatePicture(groupJid, pictureBuffer);
        pictureStatus = '✅ Set';
      } catch (err) {
        console.warn('[create] Failed to set picture:', err.message);
        pictureStatus = '⚠️ Failed (group created without picture)';
      }
    }

    // Get invite code
    let inviteLink = null;
    try {
      const code = await sock.groupInviteCode(groupJid);
      if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
    } catch (err) {
      console.warn('[create] Failed to get invite code:', err.message);
    }

    let successMsg = `✅ *Group Created Successfully!*\n\n`;
    successMsg += `• *Name:* ${name}\n`;
    successMsg += `• *JID:* \`${groupJid}\`\n`;
    successMsg += `• *Participants:* ${metadata.size || participantJids.length + 1}\n`;
    if (description) successMsg += `• *Description:* ${description}\n`;
    successMsg += `• *Picture:* ${pictureStatus}\n`;
    if (inviteLink) successMsg += `• *Invite Link:* ${inviteLink}\n`;
    successMsg += `\n_Use \`${p}setname\`, \`${p}setdesc\`, or \`${p}setgcpp\` to update the group._`;

    try {
      await mixedCard(sock, m.from, { text: successMsg }, [
        { kind: 'url',    label: '🔗 Invite Link', url: inviteLink || '' },
        { kind: 'copy',   label: '📋 Copy JID',    value: groupJid },
        { kind: 'action', label: '📋 Group Info',  cmd: `${p}groupinfo` },
      ], { quoted: m });
    } catch (_) {
      await m.reply(successMsg, { contextInfo: buildEnrichedContextInfo() });
    }
  }
};
