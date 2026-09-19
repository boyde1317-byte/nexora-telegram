/**
 * levelup.js — toggle the level-up announcement card.
 *
 * .levelup            → status (this group + global default)
 * .levelup on/off     → enable/disable (per-group in a group, global
 *                       default in DM)
 *
 * Only the ANNOUNCEMENT is suppressed — the user still levels up and
 * keeps earning the celebratory coin bonus either way.
 * Precedence: group flag > global flag > XP_ANNOUNCE env default.
 */
import { db } from '../../database/db.js';
import { config } from '../../../config/index.js';

export default {
  name: 'levelup',
  aliases: ['levelannounce', 'lvlup'],
  category: 'owner',
  description: 'Toggle the level-up announcement card (per-group or global). Usage: .levelup on|off',
  permissions: { owner: true },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const opt = args[0] ? args[0].toLowerCase() : null;

    if (!opt || (opt !== 'on' && opt !== 'off')) {
      const envDefault = config.xp.levelUpAnnounce ? 'ON' : 'OFF';
      const globalFlag = db.getSettings().levelUpAnnounce;
      const global = globalFlag === undefined ? `${envDefault} (default)` : globalFlag ? 'ON' : 'OFF';
      let info = `*Level-up Announcement — Global:* ${global}`;

      if (m.isGroup) {
        const groupFlag = db.getGroup(m.from).levelUp;
        info =
          `*This Group:* ${groupFlag === undefined ? `${envDefault} (default)` : groupFlag ? 'ON' : 'OFF'}\n\n` +
          `*Global Default:* ${global}`;
      }

      return await m.reply.info(
        `${info}\n\nUsage:\n• \`${p}levelup on\` — Enable ${m.isGroup ? 'in this group' : 'globally'}\n• \`${p}levelup off\` — Disable ${m.isGroup ? 'in this group' : 'globally'}\n\nIn a group, toggles per-group. In DM, toggles the global default.`,
        'LEVEL-UP CONTROLS'
      );
    }

    const enabled = opt === 'on';

    if (m.isGroup) {
      db.setGroup(m.from, { levelUp: enabled });
      await m.reply.success(
        `🎉 Level-up announcements are now *${enabled ? 'ENABLED' : 'DISABLED'}* in *this group*! Users still level up — just quietly.`
      );
    } else {
      db.setSettings({ levelUpAnnounce: enabled });
      await m.reply.success(
        `🎉 Level-up announcements are now *${enabled ? 'ENABLED' : 'DISABLED'}* *globally* (groups can still override with \`${p}levelup\`)!`
      );
    }
  },
};
