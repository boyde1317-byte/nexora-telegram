/**
 * anime.js — random anime pictures via nekos.life.
 *
 * Rendering: NIXCODE AIRich combo (image + markdown text + tip + suggest
 * pills), the same device-proven anatomy Moonson ships for .ping/.facebookdl
 * (msping/msfb in .testrich). The previous implementation sent a nativeFlow
 * interactiveMessage with a header image + quick_reply button — the button
 * rendered but taps did nothing on stock WhatsApp clients.
 *
 * The suggest pills ARE the re-roll: tapping one sends its text as a new
 * message from the user, which the command handler dispatches — so
 * "🔄 next neko" is a plain `.anime neko` command disguised as a chip.
 */
import { AIRich } from '../../lib/NIXCODE.js';
import { sendGifCard, sendMultiImageGallery } from '../../lib/richContent.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'anime',
  aliases: ['waifu', 'neko', 'wallpaper'],
  category: 'anime',
  description: 'Anime pics + GIF cards. Usage: .anime [waifu/neko/wallpaper/hug/pat/kiss/cuddle]',
  cooldown: 5000,
  execute: async ({ sock, m, args, prefix, commandName }) => {
    const p = prefix || '.';
    let type = (args[0] || commandName).toLowerCase();
    // Action-GIF types from the same nekos.life API render as native
    // animated dynamic cards; static types stay on the classic card.
    // GIF endpoints verified live on nekos.life (others 500 as of 2026-09-14)
    const GIF_TYPES = ['hug', 'pat', 'kiss', 'cuddle'];
    if (!['waifu', 'neko', 'wallpaper', ...GIF_TYPES].includes(type)) {
      type = 'waifu';
    }

    await withReactionStatus(m, async () => {
      try {
        const res = await fetch(`https://nekos.life/api/v2/img/${type}`);
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();

        const title = type.toUpperCase();
        const others = ['waifu', 'neko', 'wallpaper'].filter(t => t !== type);

        // ── GIF tier: native animated dynamic card ──
        if (String(data.url).endsWith('.gif')) {
          const gifSent = await sendGifCard(sock, m.from, m, {
            gifUrl: data.url,
            headerText: `✧ ${title}`,
            footer: 'NEXORA • Anime • nekos.life',
          });
          if (gifSent) return;
        }

        // ── Wallpaper tier: stacked multi-image gallery (3 walls, one card) ──
        if (type === 'wallpaper') {
          try {
            const walls = await Promise.all(
              [0, 1, 2].map(() => fetch('https://nekos.life/api/v2/img/wallpaper').then(r => r.json()).catch(() => null))
            );
            const urls = walls.map(w => w?.url).filter(Boolean);
            if (urls.length) {
              const gallerySent = await sendMultiImageGallery(sock, m.from, m, {
                images: urls.map((u, i) => ({ imageUrl: u, imageText: `${title} #${i + 1}` })),
                headerText: `✧ ${title} ×${urls.length}`,
                footer: 'NEXORA • Anime • nekos.life',
              });
              if (gallerySent) return;
            }
          } catch (_) { /* fall through to classic card */ }
        }

        await new AIRich(sock)
          .addImage(data.url)
          .addText(
            '## ◈ ' + title + '\n\n' +
            '› Category : **' + type + '**\n' +
            '› Source    : nekos.life\n' +
            '› Tap a pill below for more'
          )
          .addTip('Anime • ' + title)
          .addSuggest([
            p + 'anime ' + type,
            p + 'anime ' + others[0],
            p + 'anime ' + others[1],
          ])
          .setFooter('NEXORA • Anime')
          .send(m.from, { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not fetch image: ${err.message}`);
      }
    });
  },
};
