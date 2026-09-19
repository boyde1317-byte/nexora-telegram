import { themeManager } from '../../ui/themeManager.js';

export default {
  name: 'createtheme',
  category: 'owner',
  description: 'Create and register a custom border theme (Owner Only).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    if (args.length < 5) {
      return await m.reply.warn(`Usage: \`${p}createtheme <theme_name> <topLeft> <line> <bottomLeft> <divider>\`\n\nExample: \`${p}createtheme neon ╔ ║ ╚ ╠\``);
    }

    const name = args[0].toLowerCase();
    const topLeft = args[1];
    const line = args[2];
    const bottomLeft = args[3];
    const divider = args[4];

    const customTheme = {
      topLeft: topLeft,
      headerStart: '「 ',
      headerEnd: ' 」',
      line: line,
      divider: divider,
      bulletLine: `${divider} `,
      bottomLeft: bottomLeft
    };

    themeManager.registerTheme(name, customTheme);

    await m.reply.info(
      `Name: \`${name}\`\nTop Left: \`${topLeft}\`\nLine: \`${line}\`\nBottom Left: \`${bottomLeft}\`\nDivider: \`${divider}\`\n\n_Type \`${p}settheme ${name}\` to apply it immediately!_`,
      'THEME CREATED'
    );
  }
};
