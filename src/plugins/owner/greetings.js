/**
 * greetings.js — toggle BOTH welcome and goodbye messages at once.
 *
 * .greetings            → status of both (this group + global default)
 * .greetings on/off     → enable/disable both (per-group in a group,
 *                         global default in DM)
 *
 * Individual control stays available: .welcome on/off, .goodbye on/off.
 */
import { greetingConfig } from '../../greetings/greetingConfig.js';
import { db } from '../../database/db.js';

export default {
  name: 'greetings',
  aliases: ['greeting', 'greets'],
  category: 'owner',
  description: 'Toggle welcome AND goodbye messages at once (per-group or global). Usage: .greetings on|off',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const opt = args[0] ? args[0].toLowerCase() : null;

    if (!opt || (opt !== 'on' && opt !== 'off')) {
      // Show both per-group and global status
      const globalWelcome = greetingConfig.getEnabled() ? 'ON' : 'OFF';
      const globalGoodbye = greetingConfig.getGoodbyeEnabled() ? 'ON' : 'OFF';
      let info = `*Welcome — Global:* ${globalWelcome}\n*Goodbye — Global:* ${globalGoodbye}`;

      if (m.isGroup) {
        const groupData = db.getGroup(m.from);
        info =
          `*This Group:*\n` +
          `• Welcome: ${groupData.welcome ? 'ON' : 'OFF'}\n` +
          `• Goodbye: ${groupData.goodbye ? 'ON' : 'OFF'}\n\n` +
          `*Global Default:*\n` +
          `• Welcome: ${globalWelcome}\n` +
          `• Goodbye: ${globalGoodbye}`;
      }

      return await m.reply.info(
        `${info}\n\nUsage:\n• \`${p}greetings on\` — Enable BOTH ${m.isGroup ? 'in this group' : 'globally'}\n• \`${p}greetings off\` — Disable BOTH ${m.isGroup ? 'in this group' : 'globally'}\n\nIn a group, toggles per-group. In DM, toggles the global default.\nIndividual: \`${p}welcome\`, \`${p}goodbye\`.`,
        'GREETINGS CONTROLS'
      );
    }

    const enabled = opt === 'on';

    if (m.isGroup) {
      // Per-group toggle — both flags in one write
      db.setGroup(m.from, { welcome: enabled, goodbye: enabled });
      await m.reply.success(
        `👋 Welcome *and* goodbye messages are now *${enabled ? 'ENABLED' : 'DISABLED'}* in *this group*!`
      );
    } else {
      // Global toggle (DM context)
      greetingConfig.setEnabled(enabled);
      greetingConfig.setGoodbyeEnabled(enabled);
      await m.reply.success(
        `👋 Global welcome *and* goodbye notifications are now *${enabled ? 'ENABLED' : 'DISABLED'}*!`
      );
    }
  }
};
