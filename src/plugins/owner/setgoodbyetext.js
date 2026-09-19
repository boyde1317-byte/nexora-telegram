import { greetingConfig } from '../../greetings/greetingConfig.js';

export default {
  name: 'setgoodbyetext',
  aliases: ['setgbtext', 'gbtext'],
  category: 'owner',
  description: 'Set custom text for goodbye notifications. Supports placeholders.',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ');
    if (!text) {
      const current = greetingConfig.getGoodbyeText();
      let info = `*Placeholders:*\n`;
      info += `• \`{user}\` - Mentions the user\n`;
      info += `• \`{group}\` - Group name\n`;
      info += `• \`{memberCount}\` - Member count\n`;
      info += `• \`{date}\` - Current date\n`;
      info += `• \`{time}\` - Current time\n`;
      info += `• \`{botName}\` - Name of the bot\n\n`;
      info += `_Current text:_\n${current}`;
      return await m.reply.info(info, 'GOODBYE TEXT SETTINGS');
    }

    greetingConfig.setGoodbyeText(text);
    await m.reply.success(`Successfully configured goodbye text layout!\n\n_New layout:_\n${text}`);
  }
};
