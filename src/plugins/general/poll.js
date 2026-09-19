export default {
  name: 'poll',
  aliases: ['vote', 'survey'],
  category: 'general',
  description: 'Creates a custom interactive poll in the chat.',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ');
    if (!text || !text.includes('|')) {
      return await m.reply.error(`Invalid format. Usage: \`${p}poll Question | Option1 | Option2 | ...\``);
    }

    const parts = text.split('|').map(s => s.trim());
    const question = parts[0];
    const options = parts.slice(1);

    if (options.length < 2) {
      return await m.reply.error('You must provide at least two voting options.');
    }

    if (options.length > 12) {
      return await m.reply.error('Maximum 12 voting options allowed.');
    }

    try {
      await sock.sendMessage(m.from, {
        poll: {
          name: question,
          values: options,
          selectableCount: 1,
        }
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to send poll: ${err.message}`);
    }
  }
};
