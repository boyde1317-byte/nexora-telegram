import { actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

/**
 * Switches the bot into private/self mode: only the owner (and other
 * numbers in config.owner) may run commands. Persisted to the database so
 * the mode survives restarts, and takes priority over config.publicMode's
 * static default (see src/handlers/message.js's private-mode guard).
 */
export default {
  name: 'self',
  aliases: ['private'],
  category: 'owner',
  description: 'Restricts the bot to owner-only use (private mode).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';
    db.setSettings({ publicMode: false });

    // Single message: branded externalAdReply thumbnail + quick-reply buttons
    // together, same visual as tagall.js's thumbnail but with actions attached.
    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   '🔒 *Self mode enabled.*\n\nOnly the owner can use commands until you switch back.',
      footer: 'Setting saved',
    }, [
      { label: '🌐 Switch to Public', cmd: `${p}public` },
      { label: '📵 Anti-Call',        cmd: `${p}anticall` },
    ], {
      title: '🔒 SELF MODE',
      body:  'Setting saved',
      thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
    }, { quoted: m });
  }
};
