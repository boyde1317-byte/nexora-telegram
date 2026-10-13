/**
 * .richmode — owner kill-switch for WhatsApp rich-response payloads.
 *
 * Some WhatsApp clients refuse to reveal unsigned rich messages ("can't
 * verify the security of this media — only download if you trust the
 * sender"), and behavior varies by client version: some payloads reveal
 * after tapping Download, others never do. That verdict happens on the
 * receiving device, so the bot cannot know in advance.
 *
 *   .richmode off  → every rich send instantly drops to the proven plain
 *                    tiers (ASCII tables, text cards) — nothing to reveal.
 *   .richmode on   → full rich experience for clients that render it.
 *
 * Toggling is instant (runtime getter on capabilities.richResponse).
 */

import { db } from '../../database/db.js';
import capabilities from '../../core/capabilities.js';

export default {
  name: 'richmode',
  aliases: ['richon', 'richoff'],
  category: 'owner',
  description: 'Toggle rich-response messages globally (on = full rich, off = always-plain fallbacks).',
  permissions: { owner: true },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const opt = (args[0] || '').toLowerCase();
    db.data.settings = db.data.settings || {};

    if (opt === 'on' || opt === 'off') {
      db.data.settings.richMode = opt;
      db.save();
      return m.reply(
        `✅ *Rich mode is now ${opt.toUpperCase()}*\n\n` +
        (opt === 'off'
          ? 'All rich payloads (tables, code cards, galleries) now send as plain-but-guaranteed text layouts. No more "tap to download" placeholders anywhere.'
          : 'Full rich experience restored. Clients that verify media will show it natively; stricter clients may still show the security notice until tapped.'),
      );
    }

    const current = db.data.settings.richMode === 'off' ? 'OFF (always-plain)' : 'ON (full rich)';
    return m.reply(
      `*Rich mode:* ${current}\n\nUsage:\n• \`${p}richmode off\` — guaranteed plain rendering everywhere\n• \`${p}richmode on\` — full rich payloads`,
    );
  },
};
