/**
 * reload.js — Hot-reload plugins without restarting the bot.
 *
 * Owner-only command that reloads a single plugin, a category, or all plugins.
 * Uses the upgraded client lifecycle system to properly unload/load plugins.
 *
 * Usage:
 *   .reload <plugin>     — reload a single plugin by name
 *   .reload <category>   — reload all plugins in a category
 *   .reload all          — reload every plugin
 *   .reload              — show usage
 */
import { client } from '../../core/client.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { toSmallcaps } from '../../lib/smallcaps.js';

export default {
  name: 'reload',
  aliases: ['rl', 'hotreload'],
  category: 'owner',
  description: 'Hot-reload plugins without restarting the bot. Usage: .reload <plugin|category|all>',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';

    if (!args[0]) {
      return await m.reply(
        asciiBuilder.box('Plugin Reload', [
          `Usage:`,
          `  \`${p}reload <plugin>\`  — reload a single plugin`,
          `  \`${p}reload <category>\` — reload a category`,
          `  \`${p}reload all\`      — reload everything`,
          ``,
          `Available categories:`,
          ...['ai', 'anime', 'download', 'economy', 'fun', 'games', 'general', 'group', 'media', 'owner', 'utility', 'web']
            .map(c => `  • ${c} (${client.commandsCount?.() || client.commands.size} commands)`),
        ])
      );
    }

    const target = args[0].toLowerCase();

    try {
      if (target === 'all') {
        const before = client.commands.size;
        await client.loadPlugins();
        const after = client.commands.size;
        return await m.reply.success(
          `Reloaded all plugins — ${after} commands loaded (was ${before}).`
        );
      }

      // Try single plugin first
      if (client.commands.has(target)) {
        const result = await client.reloadPlugin(target);
        if (result) {
          return await m.reply.success(`Plugin \`${target}\` reloaded successfully.`);
        }
        return await m.reply.error(`Failed to reload plugin \`${target}\`.`);
      }

      // Try as alias
      const resolved = client.aliases.get(target);
      if (resolved && client.commands.has(resolved)) {
        const result = await client.reloadPlugin(resolved);
        if (result) {
          return await m.reply.success(`Plugin \`${resolved}\` (alias \`${target}\`) reloaded successfully.`);
        }
        return await m.reply.error(`Failed to reload plugin \`${resolved}\`.`);
      }

      // Try as category
      const categoryPlugins = [];
      client.commands.forEach((cmd, name) => {
        if (cmd.category === target) categoryPlugins.push(name);
      });

      if (categoryPlugins.length > 0) {
        const results = { success: 0, fail: 0 };
        for (const name of categoryPlugins) {
          try {
            const r = await client.reloadPlugin(name);
            if (r) results.success++;
            else results.fail++;
          } catch {
            results.fail++;
          }
        }
        return await m.reply.success(
          `Reloaded category \`${toSmallcaps(target)}\` — ${results.success}/${categoryPlugins.length} succeeded${results.fail > 0 ? `, ${results.fail} failed` : ''}.`
        );
      }

      return await m.reply.error(
        `No plugin, alias, or category named \`${target}\` found.\nUse \`${p}reload\` to see available options.`
      );
    } catch (err) {
      return await m.reply.error(`Reload failed: ${err.message}`);
    }
  },
};
