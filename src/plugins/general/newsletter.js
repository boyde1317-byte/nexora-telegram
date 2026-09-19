/**
 * channel.js — Full WhatsApp Channel/Newsletter Manager
 *
 * Capabilities:
 *   .channel                       — Send default channel invite card
 *   .channel create <name> | <desc> [—img <url|reply>] — Create with optional picture
 *   .channel info <link|JID>        — Resolve channel link OR JID to metadata
 *   .channel follow <link|JID>     — Follow/subscribe (accepts channel links!)
 *   .channel unfollow <link|JID>   — Unfollow/unsubscribe (accepts channel links!)
 *   .channel mute <link|JID>       — Mute a followed channel
 *   .channel unmute <link|JID>     — Unmute a followed channel
 *   .channel picture <link|JID> —img <url|reply>  — Update channel picture
 *   .channel name <link|JID> <newName>           — Update channel name
 *   .channel desc <link|JID> <newDesc>           — Update channel description
 *   .channel delete <link|JID>                  — Delete channel (owner only)
 *   .channel list                  — List subscribed channels
 *   .channel subscribers <link|JID>             — Get subscriber count
 */
import newsletterManager from '../../newsletter/newsletterManager.js';
import { richTableCard } from '../../lib/interactiveKit.js';

export default {
  name: 'channel',
  aliases: ['newsletter', 'ch'],
  category: 'general',
  description: 'Full WhatsApp Channel/Newsletter Manager — create, follow, info, and more.',
  cooldown: 4000,

  execute: async ({ sock, m, args, prefix, isOwner }) => {
    const action = args[0]?.toLowerCase();
    const p = prefix || '.';

    // ── No action: send invite card ──────────────────────────────────────────
    if (!action) {
      await m.react('⏳');
      try {
        await newsletterManager.sendNewsletterInvite(sock, m.from, { forwardingEnabled: true }, { quoted: m });
      } catch (err) {
        console.error('Failed to send newsletter invite:', err);
        await _sendHelp(m, p);
      }
      return;
    }

    // ── Check fork support ───────────────────────────────────────────────────
    if (typeof sock.newsletterCreate !== 'function') {
      return await m.reply.error('The active socket layer does not support native newsletter operations.');
    }

    try {
      switch (action) {
        // ═══════════════════════════════════════════════════════════════════════
        // CREATE
        // ═══════════════════════════════════════════════════════════════════════
        case 'create': {
          if (!isOwner) return await m.reply.error('Only the bot owner can create channels.');

          const remainingArgs = args.slice(1).join(' ');
          if (!remainingArgs) {
            return await m.reply.error(
              `Usage: \`${p}channel create Channel Name | Description\`\n` +
              `With picture: \`${p}channel create Channel Name | Description —img <URL>\`\n` +
              `Or reply to an image: \`${p}channel create Channel Name | Description —img reply\``
            );
          }

          // Parse —img flag (either —img <url> or —img reply)
          let pictureSource = null;
          let argsWithoutImg = remainingArgs;
          const imgMatch = remainingArgs.match(/—img\s+(\S+)/);
          if (imgMatch) {
            pictureSource = imgMatch[1];
            argsWithoutImg = remainingArgs.replace(/—img\s+\S+/, '').trim();
          }

          // Also check for --img (alternative dash style)
          if (!pictureSource) {
            const imgMatch2 = remainingArgs.match(/--img\s+(\S+)/);
            if (imgMatch2) {
              pictureSource = imgMatch2[1];
              argsWithoutImg = remainingArgs.replace(/--img\s+\S+/, '').trim();
            }
          }

          // Parse name | description
          const parts = argsWithoutImg.split('|').map(s => s.trim());
          const name = parts[0];
          const description = parts[1] || 'No description provided.';

          if (!name) {
            return await m.reply.error('Please provide a valid non-empty channel name.');
          }

          // Resolve picture source
          let pictureBuffer = null;
          if (pictureSource) {
            if (pictureSource.toLowerCase() === 'reply') {
              // Use the replied-to image
              const quoted = m.quoted || m.msg?.contextInfo?.quotedMsg;
              if (!quoted) {
                return await m.reply.error('Reply to an image message with `—img reply` to use it as channel picture.');
              }
              try {
                const buffer = await quoted.download();
                pictureBuffer = buffer;
              } catch (err) {
                return await m.reply.error(`Failed to download replied image: ${err.message}`);
              }
            } else if (pictureSource.startsWith('http://') || pictureSource.startsWith('https://')) {
              // Download from URL
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

          await m.react('⏳');

          const createOptions = pictureBuffer ? { picture: pictureBuffer } : {};
          const metadata = await sock.newsletterCreate(name, description, createOptions);

          await m.react('✅');
          const pic = metadata.picture?.directPath ? '✅' : (pictureBuffer ? '⏳' : '❌');
          try {
            const { db } = await import('../../database/db.js');
            db.setSettings({ channelId: metadata.id, channelName: metadata.name, channelPillOff: false });
          } catch (_) {}
          await m.reply.success(`*${metadata.name}* is live 🎉\n\n• Invite: \`${metadata.invite || '—'}\`\n• Picture: ${pic}\n\n_Subscribe:_ \`${p}channel follow ${metadata.id}\``);
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // INFO — accepts channel links OR JIDs
        // ═══════════════════════════════════════════════════════════════════════
        case 'info': {
          const targetKey = args[1];
          if (!targetKey) {
            return await m.reply.error(`Usage: \`${p}channel info <Channel Link or JID>\``);
          }

          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);

          if (!resolved) {
            return await m.reply.error('Failed to resolve the channel. Check the link or JID and try again.');
          }

          const info = resolved.metadata;
          let infoMsg = '';
          infoMsg += `• *Name:* ${info.name || info.thread_metadata?.name?.text || 'Unknown'}\n`;
          infoMsg += `• *JID:* \`${info.id}\`\n`;
          infoMsg += `• *Subscribers:* ${info.subscribers || info.thread_metadata?.subscribers_count || 0}\n`;
          if (info.creation_time || info.thread_metadata?.creation_time) {
            const ct = info.creation_time || parseInt(info.thread_metadata.creation_time, 10);
            infoMsg += `• *Creation:* ${new Date(ct * 1000).toLocaleString()}\n`;
          }
          infoMsg += `• *Muted:* ${info.mute_state || info.viewer_metadata?.mute ? 'Yes' : 'No'}\n`;
          infoMsg += `• *Description:* _${info.description || info.thread_metadata?.description?.text || 'None'}_\n`;
          infoMsg += `• *Verification:* ${info.verification || info.thread_metadata?.verification || 'Not verified'}\n`;
          await m.reply.info(infoMsg.trim(), `📢 ${info.name || info.thread_metadata?.name?.text || 'CHANNEL'}`);
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // FOLLOW — now accepts channel links!
        // ═══════════════════════════════════════════════════════════════════════
        case 'follow':
        case 'subscribe': {
          const targetKey = args[1];
          if (!targetKey) {
            return await m.reply.error(`Usage: \`${p}channel follow <Channel Link or JID>\``);
          }

          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);

          if (!resolved) {
            return await m.reply.error('Failed to resolve the channel. Check the link or JID and try again.');
          }

          await sock.newsletterFollow(resolved.jid);
          await m.reply.success(`Now following ${resolved.metadata?.name ? `*${resolved.metadata.name}*` : 'the channel'} ✅`);
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // UNFOLLOW
        // ═══════════════════════════════════════════════════════════════════════
        case 'unfollow':
        case 'unsubscribe': {
          const targetKey = args[1];
          if (!targetKey) {
            return await m.reply.error(`Usage: \`${p}channel unfollow <Channel Link or JID>\``);
          }

          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);

          if (!resolved) {
            return await m.reply.error('Failed to resolve the channel. Check the link or JID and try again.');
          }

          await sock.newsletterUnfollow(resolved.jid);
          await m.reply.success('Unfollowed the channel.');
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // MUTE / UNMUTE
        // ═══════════════════════════════════════════════════════════════════════
        case 'mute': {
          const targetKey = args[1];
          if (!targetKey) return await m.reply.error(`Usage: \`${p}channel mute <Channel Link or JID>\``);
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          await sock.newsletterMute(resolved.jid);
          await m.reply.success('Channel muted. 🔇');
          break;
        }

        case 'unmute': {
          const targetKey = args[1];
          if (!targetKey) return await m.reply.error(`Usage: \`${p}channel unmute <Channel Link or JID>\``);
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          await sock.newsletterUnmute(resolved.jid);
          await m.reply.success('Channel unmuted. 🔔');
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PICTURE — update channel picture
        // ═══════════════════════════════════════════════════════════════════════
        case 'picture':
        case 'pic': {
          if (!isOwner) return await m.reply.error('Only the bot owner can update channel picture.');
          const targetKey = args[1];
          if (!targetKey) return await m.reply.error(`Usage: \`${p}channel picture <Link|JID> —img <URL|reply>\``);

          let pictureSource = null;
          const allArgs = args.slice(2).join(' ');
          const imgMatch = allArgs.match(/(?:—img|--img)\s+(\S+)/);
          if (imgMatch) pictureSource = imgMatch[1];

          if (!pictureSource && m.quoted?.imageMessage) {
            pictureSource = 'reply';
          }

          if (!pictureSource) {
            return await m.reply.error('Please provide an image. Use `—img <URL>` or reply to an image with `—img reply`.');
          }

          let pictureBuffer = null;
          if (pictureSource.toLowerCase() === 'reply') {
            const quoted = m.quoted;
            if (!quoted) return await m.reply.error('Reply to an image message.');
            try {
              pictureBuffer = await quoted.download();
            } catch (err) {
              return await m.reply.error(`Failed to download replied image: ${err.message}`);
            }
          } else if (pictureSource.startsWith('http')) {
            try {
              const res = await fetch(pictureSource);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              pictureBuffer = Buffer.from(await res.arrayBuffer());
            } catch (err) {
              return await m.reply.error(`Failed to download image: ${err.message}`);
            }
          } else {
            return await m.reply.error('Invalid image source.');
          }

          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');

          await sock.newsletterUpdatePicture(resolved.jid, pictureBuffer);
          await m.reply.success('Channel picture updated. 🖼️');
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // NAME — update channel name
        // ═══════════════════════════════════════════════════════════════════════
        case 'name': {
          if (!isOwner) return await m.reply.error('Only the bot owner can update channel name.');
          const targetKey = args[1];
          const newName = args.slice(2).join(' ');
          if (!targetKey || !newName) {
            return await m.reply.error(`Usage: \`${p}channel name <Link|JID> <New Name>\``);
          }
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          await sock.newsletterUpdateName(resolved.jid, newName);
          await m.reply.success(`Channel renamed to *${newName}*.`);
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // DESC — update channel description
        // ═══════════════════════════════════════════════════════════════════════
        case 'desc':
        case 'description': {
          if (!isOwner) return await m.reply.error('Only the bot owner can update channel description.');
          const targetKey = args[1];
          const newDesc = args.slice(2).join(' ');
          if (!targetKey || !newDesc) {
            return await m.reply.error(`Usage: \`${p}channel desc <Link|JID> <New Description>\``);
          }
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          await sock.newsletterUpdateDescription(resolved.jid, newDesc);
          await m.reply.success('Channel description updated.');
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // DELETE — delete a channel
        // ═══════════════════════════════════════════════════════════════════════
        case 'delete': {
          if (!isOwner) return await m.reply.error('Only the bot owner can delete channels.');
          const targetKey = args[1];
          if (!targetKey) return await m.reply.error(`Usage: \`${p}channel delete <Link|JID>\``);
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          await sock.newsletterDelete(resolved.jid);
          await m.reply.success('Channel deleted.');
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // LIST — list subscribed channels
        // ═══════════════════════════════════════════════════════════════════════
        case 'list':
        case 'subscribed': {
          await m.react('⏳');
          const result = await sock.newsletterSubscribed();
          if (!result || !result.length) {
            return await m.reply.info('No subscribed channels yet.', 'CHANNELS');
          }
          await richTableCard(sock, m.from, {
            title: `📋 SUBSCRIBED CHANNELS (${result.length})`,
            headers: ['Channel', 'ID', 'Subs'],
            rows: result.slice(0, 20).map((ch) => [
              String(ch.name || ch.thread_metadata?.name?.text || 'Unknown').slice(0, 28),
              String(ch.id || '').split('@')[0].slice(0, 18),
              String(ch.subscribers || ch.thread_metadata?.subscribers_count || '-'),
            ]),
            footer: `${p}channel info <Link|JID> for details`,
          }, { quoted: m });
          break;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SUBSCRIBERS — get subscriber count
        // ═══════════════════════════════════════════════════════════════════════
        case 'subscribers':
        case 'subs': {
          const targetKey = args[1];
          if (!targetKey) return await m.reply.error(`Usage: \`${p}channel subscribers <Link|JID>\``);
          await m.react('⏳');
          const resolved = await _resolveChannel(sock, targetKey);
          if (!resolved) return await m.reply.error('Failed to resolve channel.');
          const result = await sock.newsletterSubscribers(resolved.jid);
          const count = result?.subscribers_count || result?.subscribers || 'Unknown';
          await m.reply.info(`👥 *${count}* subscribers`, 'SUBSCRIBERS');
          break;
        }

        default:
          await _sendHelp(m, p);
          break;
      }
    } catch (err) {
      console.error('Channel operation failed:', err);
      await m.reply.error(`Operation failed: ${err.message || err}`);
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: Resolve channel link/invite/JID to { jid, metadata }
// ═════════════════════════════════════════════════════════════════════════════
async function _resolveChannel(sock, input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  try {
    // Already a JID
    if (trimmed.endsWith('@newsletter')) {
      const metadata = await sock.newsletterMetadata('jid', trimmed);
      return { jid: trimmed, metadata };
    }

    // Channel link or invite code — resolve via newsletterResolve
    if (typeof sock.newsletterResolve === 'function') {
      return await sock.newsletterResolve(trimmed);
    }

    // Fallback: manual extraction + metadata lookup
    const match = trimmed.match(/(?:whatsapp\.com\/channel\/)([A-Za-z0-9]+)/);
    if (match) {
      const inviteCode = match[1];
      const metadata = await sock.newsletterMetadata('INVITE', inviteCode);
      if (metadata && metadata.id) {
        return { jid: metadata.id, metadata };
      }
    } else if (/^[A-Za-z0-9]{15,}$/.test(trimmed)) {
      // Raw invite code
      const metadata = await sock.newsletterMetadata('INVITE', trimmed);
      if (metadata && metadata.id) {
        return { jid: metadata.id, metadata };
      }
    }
  } catch (err) {
    console.error('[channel] _resolveChannel error:', err.message || err);
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: Send help text
// ═════════════════════════════════════════════════════════════════════════════
async function _sendHelp(m, p) {
  const helpText = [
    `📢 *WHATSAPP CHANNEL MANAGER*`,
    ``,
    `*Creation & Setup:*`,
    `• \`${p}channel create Name | Desc\` — Create channel`,
    `• \`${p}channel create Name | Desc —img <URL>\` — Create with picture`,
    `• \`${p}channel create Name | Desc —img reply\` — Create with replied image`,
    ``,
    `*Following & Info:*`,
    `• \`${p}channel follow <Link|JID>\` — Subscribe (accepts channel links!)`,
    `• \`${p}channel unfollow <Link|JID>\` — Unsubscribe`,
    `• \`${p}channel info <Link|JID>\` — View channel info`,
    `• \`${p}channel list\` — List subscribed channels`,
    `• \`${p}channel subscribers <Link|JID>\` — Get subscriber count`,
    ``,
    `*Channel Management:*`,
    `• \`${p}channel name <Link|JID> <New Name>\` — Update name`,
    `• \`${p}channel desc <Link|JID> <New Desc>\` — Update description`,
    `• \`${p}channel picture <Link|JID> —img <URL|reply>\` — Update picture`,
    `• \`${p}channel mute <Link|JID>\` — Mute channel`,
    `• \`${p}channel unmute <Link|JID>\` — Unmute channel`,
    `• \`${p}channel delete <Link|JID>\` — Delete channel`,
    ``,
    `💡 _Channel links and JIDs are both accepted everywhere._`,
  ].join('\n');
  await m.reply.info(helpText, "📢 CHANNEL MANAGER");
}
