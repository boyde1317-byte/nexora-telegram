import { footerManager } from '../../core/footer.js';

export default {
  name: 'setfooter',
  aliases: ['footerstyle', 'footer'],
  category: 'owner',
  description: 'Changes the global active bot message footer style (Owner Only).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const active = footerManager.getStyle();

    if (!args[0]) {
      return await m.reply(`⚠️ *Usage:* \`${p}setfooter <clean|minimal|professional>\`\n\n_Current footer style:_ *${active.toUpperCase()}*\n\n*Examples:*\n• *clean:* NEXORA MD • By Aizen\n• *minimal:* Nexora\n• *professional:* © Nexora MD Framework`);
    }

    const input = args[0].toLowerCase();
    if (!['clean', 'minimal', 'professional'].includes(input)) {
      return await m.reply.error(`Invalid style: *"${args[0]}"*.\nAvailable options: \`clean\`, \`minimal\`, \`professional\`.`);
    }

    footerManager.setStyle(input);
    const sample = footerManager.getFooter(input);

    await m.reply(`✅ *BOT MESSAGE FOOTER STYLE UPDATED!*\n\n• *Active Style:* _${input.toUpperCase()}_\n• *Preview:* _${sample}_`);
  }
};
