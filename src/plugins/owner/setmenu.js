import { menuManager } from '../../menu/manager.js';

export default {
  name: 'setmenu',
  aliases: ['changestyle', 'setmenustyle'],
  category: 'owner',
  description: 'Changes the global active menu presentation style (Owner Only).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    if (!args[0]) {
      return await m.reply(`⚠️ *Usage:* \`${p}setmenu <style_name_or_id>\`\n\n_Example:_ \`${p}setmenu nativeflow\` or \`${p}setmenu 4\`\n_Type \`${p}menulist\` to view all styles._`);
    }

    const input = args[0].toLowerCase();
    const updated = menuManager.setActiveMenu(input, m.senderNumber);

    if (!updated) {
      return await m.reply.error(`Invalid menu style: *"${args[0]}"*.\nType \`${p}menulist\` to view all available presentation styles.`);
    }

    const response = `✅ *MENU STYLE UPDATED!*\n\n` +
                     `• *Active Style:* _${updated.name}_\n` +
                     `• *Style ID:* \`${updated.id}\`\n` +
                     `• *Description:* _${updated.description}_\n\n` +
                     `_Type \`${p}menu\` now to view your newly configured layout!_`;

    await m.reply(response);
  }
};
