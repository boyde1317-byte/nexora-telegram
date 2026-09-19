import { actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

/**
 * Switches the bot into public mode: anyone can run non-owner-restricted
 * commands. Persisted to the database so the mode survives restarts, and
 * takes priority over config.publicMode's static default (see
 * src/handlers/message.js's private-mode guard).
 */
export default {
  name: 'public',
  aliases: [],
  category: 'owner',
  description: 'Allows everyone to use the bot (public mode).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';
    db.setSettings({ publicMode: true });

    // Single message: branded externalAdReply thumbnail + quick-reply buttons
    // together, same visual as tagall.js's thumbnail but with actions attached.
    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   '🌐 *Public mode enabled.*\n\nEveryone can now use commands.',
      footer: 'Setting saved',
    }, [
      { label: '🔒 Switch to Self', cmd: `${p}self` },
      { label: '📵 Anti-Call',      cmd: `${p}anticall` },
    ], {
      title: '🌐 PUBLIC MODE',
      body:  'Setting saved',
      thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
    }, { quoted: m });
  }
};
