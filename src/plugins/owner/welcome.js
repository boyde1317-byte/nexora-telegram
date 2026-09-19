import { greetingConfig } from '../../greetings/greetingConfig.js';
import { db } from '../../database/db.js';

export default {
  name: 'welcome',
  aliases: [],
  category: 'owner',
  description: 'Toggle welcome messages on or off (per-group or global).',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const opt = args[0] ? args[0].toLowerCase() : null;

    if (!opt || (opt !== 'on' && opt !== 'off')) {
      // Show both per-group and global status
      const globalStatus = greetingConfig.getEnabled() ? 'ON' : 'OFF';
      let info = `*Global:* ${globalStatus}`;

      if (m.isGroup) {
        const groupData = db.getGroup(m.from);
        const groupStatus = groupData.welcome ? 'ON' : 'OFF';
        info = `*This Group:* ${groupStatus}\n*Global Default:* ${globalStatus}`;
      }

      return await m.reply.info(
        `${info}\n\nUsage:\n• \`${p}welcome on\` — Enable ${m.isGroup ? 'in this group' : 'globally'}\n• \`${p}welcome off\` — Disable ${m.isGroup ? 'in this group' : 'globally'}\n\nIn a group, toggles per-group. In DM, toggles the global default.`,
        'WELCOME CONTROLS'
      );
    }

    const enabled = opt === 'on';

    if (m.isGroup) {
      // Per-group toggle
      db.setGroup(m.from, { welcome: enabled });
      await m.reply.success(`👋 Welcome messages are now *${enabled ? 'ENABLED' : 'DISABLED'}* in *this group*!`);
    } else {
      // Global toggle (DM context)
      greetingConfig.setEnabled(enabled);
      await m.reply.success(`👋 Global welcome notifications are now *${enabled ? 'ENABLED' : 'DISABLED'}*!`);
    }
  }
};
