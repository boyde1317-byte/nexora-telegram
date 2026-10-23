/**
 * readmore.js — WhatsApp "read more" collapsed text (ported from OURIN
 * DELUXE V3.4.1 tools/readmore.js).
 *
 * Inserts the invisible zero-width character WhatsApp uses to collapse
 * long messages behind a "Read more" tap.
 *
 *   .readmore <visible>|<hidden>
 */
const READMORE_CHAR = String.fromCharCode(8206).repeat(4001);

export default {
  name: 'readmore',
  aliases: ['selengkapnya', 'spoiler'],
  category: 'utility',
  description: '📖 Create a "Read more" collapsed message. Usage: .readmore <visible>|<hidden>',
  cooldown: 2000,

  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ');
    if (!text) {
      return await m.reply.info(
        `Splits a message into a visible part and a collapsed part.\n\nExample: \`${p}readmore Hello|This part is hidden behind Read more\``,
        'READ MORE'
      );
    }

    const [visible = '', hidden = ''] = text.split('|');
    await m.reply(`${visible}${READMORE_CHAR}${hidden}`);
  },
};
