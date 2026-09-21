/**
 * wiki.js — Wikipedia lookup rendered in the .testrich V2 rich style:
 * the article's OWN image inline + a facts table + summary text, relayed
 * as a base64 unifiedResponse (Meta AI format), followed by an
 * interactive action card with follow-up buttons.
 *
 * Rich card anatomy (generateInlineImageWithTableV2, same as
 * `.testrich v2imgtable`):
 *   headerText  → 📖 title + italic description + full extract
 *   image       → the article's thumbnail/original image, tapping it
 *                 opens the full Wikipedia article
 *   table       → Info/Details grid (description, last edit, words, read time)
 *   footer      → source line
 */
import { generateWAMessageFromContent, generateInlineImageWithTableV2 } from 'baileys';
import { withReactionStatus, getBrandThumbnail } from '../../lib/cosmetics.js';
import { actionCardWithAd } from '../../lib/interactiveKit.js';
import { wikiRichLookup } from '../../lib/downloader.js';

export default {
  name: 'wiki',
  aliases: ['wikipedia'],
  category: 'utility',
  description: 'Wikipedia article with its image, facts table and summary. Usage: .wiki <topic>',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(
        `Usage: \`${prefix}wiki <topic>\`\n\nExample: \`${prefix}wiki black holes\``,
        'WIKIPEDIA'
      );
    }

    await withReactionStatus(m, async () => {
      let result;
      try {
        result = await wikiRichLookup(query);
      } catch (err) {
        let msg = `\`${prefix}wiki\` stumbled. ${err.message}\n\n_Try rephrasing, or search a related term._`;
        if (err.alternates?.length) {
          msg += `\n\n*Close matches:*\n` + err.alternates.map(t => `• \`${prefix}wiki ${t}\``).join('\n');
        }
        return await m.reply.error(msg);
      }

      const words = result.extract.split(/\s+/).filter(Boolean).length;
      const readMin = Math.max(1, Math.round(words / 200));
      const lastEdit = result.timestamp
        ? new Date(result.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Unknown';

      // Article image — fall back to the brand thumbnail for imageless pages
      const inlineImage = result.thumbnailUrl || await getBrandThumbnail();
      const highRes = result.originalImageUrl || inlineImage;

      // ── V2 inline image + table + text (testrich style, direct relay) ────
      const generated = generateInlineImageWithTableV2(
        {
          image: {
            imageUrl: {
              imagePreviewUrl: inlineImage,
              imageHighResUrl: highRes,
              sourceUrl:       result.url,
            },
            imageText:  result.title,
            alignment:   0,
            tapLinkUrl:  result.url,
          },
          tableHeaders: ['Info', 'Details'],
          tableRows: [
            ['Description', result.description || '—'],
            ['Last edited', lastEdit],
            ['Preview',    `${words} words`],
            ['Read time',  `~${readMin} min`],
          ],
        },
        m,
        {
          primitiveStyle: 'nixcode',
          headerText: `📖 *${result.title}*_\n${result.description ? `\n_${result.description}_\n` : ''}\n${result.extract}`,
          footer: `Read more: ${result.url}\nSource: Wikipedia`,
        },
      );

      try {
        const message = await generateWAMessageFromContent(m.from, generated.message, {
          userJid: sock.user?.id || '0@s.whatsapp.net',
        });
        await sock.relayMessage(m.from, message.message, { messageId: message.key.id });
      } catch (err) {
        console.warn('[wiki] V2 rich relay failed, plain fallback:', err.message);
        await m.reply(`📖 *${result.title}*\n\n${result.extract}\n\n${result.url}`);
      }

      // ── Interactive follow-up card ──────────────────────────────────────
      await actionCardWithAd(sock, m.from, {
        text:   `📖 *${result.title}*\n\n_Want to dig deeper? Pick a follow-up below._`,
        footer: 'NEXORA • Wikipedia',
      }, [
        { label: '🔍 Search Another', cmd: `${prefix}wiki` },
        { label: '🤖 Ask AI More',     cmd: `${prefix}ai Tell me more about ${result.title}` },
        { label: '🌐 Translate',       cmd: `${prefix}translate` },
        ...(result.alternates.length
          ? [{ label: `↩️ ${result.alternates[0].slice(0, 18)}`, cmd: `${prefix}wiki ${result.alternates[0]}` }]
          : []),
      ], {
        title:    `📖 ${result.title}`,
        body:     'Wikipedia Article',
        sourceUrl: result.url,
        thumbnailUrl: inlineImage,
        originalImageUrl: highRes,
        renderLargerThumbnail: true,
      }, { quoted: m });
    });
  }
};
