/**
 * channels.js — List the channels (newsletters) this bot follows.
 *
 * Companion to .chanreact — shows name, JID and subscriber count for
 * every channel in the bot's followed list, so owners can grab context
 * before reacting to a post.
 */
import { richTableCard } from '../../lib/interactiveKit.js';

/** WMex responses wrap data several layers deep — find the newsletter array. */
function deepFindNewsletters(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    const hits = node.filter((x) => x && typeof x === 'object' &&
      (String(x.id || x.newsletter_id || '').endsWith('@newsletter') ||
       ('name' in x && ('subscribers' in x || 'state' in x))));
    if (hits.length) return node;
    for (const x of node.slice(0, 5)) { const r = deepFindNewsletters(x, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof node === 'object') {
    for (const k of ['newsletters', 'data', 'xwa2_newsletter_subscribed', 'threads']) {
      const r = deepFindNewsletters(node[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

export default {
  name: 'channels',
  aliases: ['chan', 'chans', 'mychannels', 'newsletters'],
  category: 'channel',
  description: 'List the WhatsApp channels this bot follows. Usage: .channels',
  permissions: { owner: true },
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';

    if (!(await m.isOwner)) {
      return await m.reply.warn('Only the owner can see my channel list.');
    }

    await m.react('⏳');
    let raw;
    try {
      raw = await sock.newsletterSubscribed();
    } catch (err) {
      return await m.reply.error(`Could not fetch the channel list: ${err.message}`);
    }

    const list = deepFindNewsletters(raw) || [];
    if (!list.length) {
      return await m.reply.info(
        `I'm not following any channels yet. Follow one from your WhatsApp Channels tab, then react to posts with \`${p}chanreact <post link> <emoji>\`.`,
        'MY CHANNELS'
      );
    }

    const rows = list.slice(0, 25).map((c) => [
      String(c.name || c.threadName || 'Unnamed').slice(0, 30),
      String(c.id || c.newsletter_id || '').split('@')[0],
      c.subscribers ? String(c.subscribers) : '-',
    ]);

    return await richTableCard(sock, m.from, {
      title: `📢 MY CHANNELS (${list.length})`,
      headers: ['Channel', 'ID', 'Subs'],
      rows,
      footer: `React to a post: ${p}chanreact <post link> <emoji>`,
    }, { quoted: m });
  },
};
