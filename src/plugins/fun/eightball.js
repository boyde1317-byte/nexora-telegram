/**
 * eightball.js — classic Magic 8-Ball fun command.
 *
 * Answer set is an original English list grouped by sentiment, picked
 * uniformly at random. Nothing here is copied from another bot's plugin.
 *
 * Delivered via actionCard with an "Ask Again" quick_reply, matching the
 * interactive follow-up styling used by the rest of the fun category
 * (see quoter.js).
 */
import { actionCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const ANSWERS = [
  // Definitive yes
  'It is certain.',
  'Without a doubt.',
  'Yes, definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Signs point to yes.',
  'Yes.',
  'Absolutely. No question.',
  // Uncertain
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Hmm... the vibes are mixed on this one.',
  'I genuinely cannot decide. Ask me differently.',
  // Definitive no
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
  'Absolutely not.',
  'Hard no on that one.',
  'Not in a million years.',
];

export default {
  name: 'eightball',
  aliases: ['8ball', '8b'],
  category: 'fun',
  description: 'Ask the magic 8-ball a yes/no question.',
  cooldown: 2000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const question = args.join(' ').trim();

    if (!question) {
      return await m.reply.info(`Usage: \`${p}8ball <your question>\``, '🎱 MAGIC 8-BALL');
    }

    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    try {
      return await actionCard(sock, m.from, {
        text:   `🎱 *MAGIC 8-BALL*\n\nQ: ${question}\nA: ${answer}`,
        footer: 'Ask another question anytime',
      }, [
        { label: 'Ask Again',     cmd: `${p}8ball ${question}` },
        { label: 'Truth',        cmd: `${p}truth` },
        { label: 'Dare',          cmd: `${p}dare` },
      ], { quoted: m });
    } catch (err) {
      console.warn('[eightball] actionCardWithAd failed, using styled fallback:', err.message);
      return await m.reply(asciiBuilder.box('🎱 MAGIC 8-BALL', [
        `Q: ${question}`,
        `A: ${answer}`,
      ]));
    }
  }
};
