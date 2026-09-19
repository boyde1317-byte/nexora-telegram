/**
 * chanreact.js — Channel (newsletter) reaction management.
 *
 * Reacts to a WhatsApp *Channel* post from the bot's account, or removes
 * an existing reaction. Channel chats don't reach the command pipeline
 * (@newsletter traffic is skipped), so this works from anywhere using
 * the post's link:
 *
 *   .chanreact <channel post link> <emoji>   → react
 *   .chanreact off <channel post link>        → remove the reaction
 *
 * Post links look like https://whatsapp.com/channel/<code>/<serverMsgId>
 * — the trailing number is the post id reactions attach to.
 */
import { actionCardWithAd } from '../../lib/interactiveKit.js';

const parseLink = (raw) => {
  const s = String(raw || '').trim();
  // channel post link (with optional trailing post id)
  const m = s.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?/i);
  if (m) return { code: m[1], postId: m[2] || null };
  // raw "code/postId" shorthand
  const s2 = s.match(/^([A-Za-z0-9_-]{10,})(?:\/(\d+))?$/);
  if (s2) return { code: s2[1], postId: s2[2] || null };
  return null;
};

const looksEmoji = (s) => {
  const t = String(s || '').trim();
  if (!t || t.length > 16 || /\s/.test(t)) return false;
  // accept emoji (any) plus optional variation selectors / ZWJ sequences
  return /\p{Extended_Pictographic}/u.test(t);
};

export default {
  name: 'chanreact',
  aliases: ['chreact', 'creact', 'chanreaction'],
  category: 'channel',
  description: 'React to a Channel post (or remove the reaction). Usage: .chanreact <channel post link> <emoji> | .chanreact off <link>',
  permissions: { owner: true },
  cooldown: 4000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!(await m.isOwner)) {
      return await m.reply.warn('Only the owner can manage channel reactions from my account.');
    }

    const remove = (args[0]?.toLowerCase() === 'off');
    const rest    = remove ? args.slice(1) : args;

    const linkArg = rest.find((a) => parseLink(a));
    const emojiArg = rest.find((a) => a !== linkArg && looksEmoji(a));

    if (!linkArg) {
      return await m.reply.info(
        `Usage: \`${p}chanreact <channel post link> <emoji>\`\n\`${p}chanreact off <channel post link>\`\n\nPost links look like \`https://whatsapp.com/channel/xxxxx/123\` — open a channel post → Share → Copy link.`,
        'CHANNEL REACTIONS'
      );
    }

    const { code, postId } = parseLink(linkArg);
    if (!postId) {
      return await m.reply.warn('That link has no post id. Copy the link *from a specific post* (Share → Copy link) — it ends with a number.');
    }
    if (!remove && !emojiArg) {
      return await m.reply.warn(`Which emoji? Example: \`${p}chanreact ${linkArg} 🔥\``);
    }

    await m.react('⏳');

    // resolve the invite code → channel JID + metadata
    let resolved = null;
    try {
      resolved = await sock.newsletterResolve(linkArg) || await sock.newsletterResolve(code);
    } catch (_) { /* fall through to metadata */ }
    if (!resolved?.jid) {
      try {
        const meta = await sock.newsletterMetadata('invite', code);
        resolved = { jid: meta?.id, metadata: meta };
      } catch (_) { /* handled below */ }
    }
    if (!resolved?.jid) {
      return await m.reply.error('Could not resolve that channel link — it may be invalid or the channel was deleted.');
    }

    try {
      await sock.newsletterReactMessage(resolved.jid, postId, remove ? '' : emojiArg);
      await m.react(remove ? '🗑️' : emojiArg || '✅');

      return await actionCardWithAd(sock, m.from, {
        text: `${remove ? '🗑️' : emojiArg} *${remove ? 'REACTION REMOVED' : 'REACTION SENT'}*\n\n📢 ${resolved.metadata?.name ? `*${String(resolved.metadata.name).slice(0, 40)}*` : 'Channel'}\n#${postId}${remove ? '' : `\n\n${emojiArg} now shows on that post.`}`,
        footer: '© NEXORA-MD by Aizen',
      }, [
        { label: 'My Channels', cmd: `${p}channels` },
      ], { title: 'CHANNEL REACTIONS', body: remove ? 'removed' : 'sent' }, { quoted: m });
    } catch (err) {
      await m.react('❌');
      return await m.reply.error(`Channel reaction failed: ${err.message}. The bot may need to follow the channel first, or the post id is wrong.`);
    }
  },
};
