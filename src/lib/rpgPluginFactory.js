/**
 * @file src/plugins/rpg/_actionPlugin.js
 * Shared factory for the three RPG action commands (hunt/mine/fish).
 * The underscore prefix keeps this file out of the command registry —
 * commandDirectory ignores files starting with _.
 */

import { runRpgAction, cooldownInfo, RPG_COOLDOWN_LABEL } from '../economy/rpg.js';
import { withReactionStatus } from './cosmetics.js';

export function makeActionPlugin(action, emoji, blurb) {
  return {
    name: action,
    category: 'rpg',
    description: `${blurb} Cooldown: ${RPG_COOLDOWN_LABEL}.`,
    cooldown: 3000,
    execute: async ({ m }) => {
      await withReactionStatus(m, async () => {
        try {
          const result = await runRpgAction(m.sender, action);
          const loot = result.item
            ? `\n\n🎒 Bag: +${result.qty} ${result.item}\n✨ +${result.xpGained} XP`
            : `\n\n✨ +${result.xpGained} XP for the effort`;
          await m.reply.success(`${emoji} ${result.message}${loot}`);
        } catch (err) {
          await m.reply.warn(err.message);
        }
      });
    },
  };
}
