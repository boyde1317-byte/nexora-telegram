import { greetingConfig } from '../../greetings/greetingConfig.js';
import { db } from '../../database/db.js';

export default {
  name: 'goodbye',
  aliases: ['gb'],
  category: 'owner',
  description: 'Toggle goodbye messages on or off (per-group or global).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const opt = args[0] ? args[0].toLowerCase() : null;

    if (!opt || (opt !== 'on' && opt !== 'off')) {
      // Show both per-group and global status
      const globalStatus = greetingConfig.getGoodbyeEnabled() ? 'ON' : 'OFF';
      let info = `*Global:* ${globalStatus}`;

      if (m.isGroup) {
        const groupData = db.getGroup(m.from);
        const groupStatus = groupData.goodbye ? 'ON' : 'OFF';
        info = `*This Group:* ${groupStatus}\n*Global Default:* ${globalStatus}`;
      }

      return await m.reply.info(
        `${info}\n\nUsage:\n• \`${p}goodbye on\` — Enable ${m.isGroup ? 'in this group' : 'globally'}\n• \`${p}goodbye off\` — Disable ${m.isGroup ? 'in this group' : 'globally'}\n\nIn a group, toggles per-group. In DM, toggles the global default.`,
        'GOODBYE CONTROLS'
      );
    }

    const enabled = opt === 'on';

    if (m.isGroup) {
      // Per-group toggle
      db.setGroup(m.from, { goodbye: enabled });
      await m.reply.success(`👋 Goodbye messages are now *${enabled ? 'ENABLED' : 'DISABLED'}* in *this group*!`);
    } else {
      // Global toggle (DM context)
      greetingConfig.setGoodbyeEnabled(enabled);
      await m.reply.success(`👋 Global goodbye notifications are now *${enabled ? 'ENABLED' : 'DISABLED'}*!`);
    }
  }
};
