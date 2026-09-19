import { greetingConfig } from '../../greetings/greetingConfig.js';

export default {
  name: 'setwelcometext',
  aliases: ['setwctext', 'wctext'],
  category: 'owner',
  description: 'Set custom text for welcome notifications. Supports placeholders.',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ');
    if (!text) {
      const current = greetingConfig.getWelcomeText();
      let info = `*Placeholders:*\n`;
      info += `• \`{user}\` - Mentions the user\n`;
      info += `• \`{group}\` - Group name\n`;
      info += `• \`{memberCount}\` - Member count\n`;
      info += `• \`{date}\` - Current date\n`;
      info += `• \`{time}\` - Current time\n`;
      info += `• \`{botName}\` - Name of the bot\n\n`;
      info += `_Current text:_\n${current}`;
      return await m.reply.info(info, 'WELCOME TEXT SETTINGS');
    }

    greetingConfig.setWelcomeText(text);
    await m.reply.success(`Successfully configured welcome text layout!\n\n_New layout:_\n${text}`);
  }
};
