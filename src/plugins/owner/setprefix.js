/**
 * setprefix.js — Change the command prefix at runtime.
 *
 * Owner-only. Lets the owner set a custom prefix for all commands.
 * Supports setting multiple prefixes: .setprefix ! . /
 * Use "reset" to go back to defaults (!, ., /)
 */
import { db } from '../../database/db.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { config } from '../../../config/index.js';

export default {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'owner',
  description: 'Set custom command prefix(es). Usage: .setprefix <prefix> | .setprefix reset',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m, args }) => {
    if (!args[0]) {
      const current = config.prefix.join(' ');
      return await m.reply(
        asciiBuilder.box('Prefix Settings', [
          `Current prefixes: \`${current}\``,
          ``,
          `Usage:`,
          `  \`.setprefix <prefix>\` — set a single prefix`,
          `  \`.setprefix ! . /\`    — set multiple prefixes (space-separated)`,
          `  \`.setprefix reset\`    — restore defaults (! . /)`,
        ])
      );
    }

    if (args[0].toLowerCase() === 'reset') {
      db.setSettings({ prefix: ['!', '.', '/'] });
      return await m.reply.success('Prefixes reset to defaults: `!`, `.`, `/`');
    }

    // Validate prefixes — must be 1-3 chars, no alphanumeric (to avoid command conflicts)
    const newPrefixes = args.filter(a => a.trim().length > 0);
    const invalid = newPrefixes.filter(p => p.length > 3 || /[a-zA-Z0-9]/.test(p));

    if (invalid.length > 0) {
      return await m.reply.error(
        `Invalid prefix(es): \`${invalid.join(', ')}\`\nPrefixes must be 1-3 characters and contain no letters or numbers.`
      );
    }

    db.setSettings({ prefix: newPrefixes });
    return await m.reply.success(
      `Command prefix(es) updated: \`${newPrefixes.join('`, `')}\``
    );
  },
};
