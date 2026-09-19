/**
 * stats.js — Comprehensive bot statistics dashboard.
 *
 * Shows connection health, message counts, plugin stats, memory usage,
 * uptime, and top commands — all in a rich ASCII dashboard.
 */
import { client} from '../../core/client.js';
import { db} from '../../database/db.js';
import { asciiBuilder} from '../../ui/asciiBuilder.js';
import { formatUptime} from '../../lib/utils.js';
import brand from '../../../config/brand.js';


import { buildEnrichedContextInfo} from '../../lib/enrichContext.js';

export default {
  name: 'stats',
  aliases: ['botstats', 'sysstats'],
  category: 'general',
  description: 'Shows comprehensive bot statistics — uptime, memory, commands, and health.',
  cooldown: 3000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    const mem = process.memoryUsage();
    const uptime = formatUptime(process.uptime());
    const pluginsLoaded = client.commands.size;
    const aliasesCount = client.aliases.size;

    // Plugin stats
    const pluginStats = client.getPluginStats ? client.getPluginStats() : {};
    const totalExecutions = Object.values(pluginStats).reduce((sum, s) => sum + (s.executions || 0), 0);
    const totalErrors = Object.values(pluginStats).reduce((sum, s) => sum + (s.errors || 0), 0);
    const topCommands = Object.entries(pluginStats)
      .sort((a, b) => (b[1].executions || 0) - (a[1].executions || 0))
      .slice(0, 5)
      .filter(([, s]) => s.executions > 0);

    // DB stats
    const users = Object.keys(db.data?.users || {}).length;
    const groups = Object.keys(db.data?.groups || {}).length;
    const bannedUsers = Object.values(db.data?.users || {}).filter(u => u.banned).length;
    const premiumUsers = Object.values(db.data?.users || {}).filter(u => u.premium).length;

    // Connection state
    const connected = client.socket?.user ? true : false;
    const botName = client.socket?.user?.name || brand.name;
    const botNumber = client.socket?.user?.id?.split(':')[0] || 'N/A';

    // Memory percentages
    const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    const rssMb = Math.round(mem.rss / 1024 / 1024);

    const sections = [
      {
        heading: 'Connection',
        lines: [
          `▸ Status     : ${connected ? '✅ Online' : '❌ Disconnected'}`,
          `▸ Bot Name   : ${botName}`,
          `▸ Bot Number : ${botNumber}`,
          `▸ Uptime     : ${uptime}`,
        ],
      },
      {
        heading: 'Performance',
        lines: [
          asciiBuilder.progressBar(heapPct, 20, 'Heap'),
          `▸ RSS Memory : ${rssMb} MB`,
          `▸ Heap Used  : ${Math.round(mem.heapUsed / 1024 / 1024)} / ${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
          `▸ External   : ${Math.round(mem.external / 1024 / 1024)} MB`,
        ],
      },
      {
        heading: 'Plugins & Commands',
        lines: [
          `▸ Loaded     : ${pluginsLoaded} commands, ${aliasesCount} aliases`,
          `▸ Executions : ${totalExecutions.toLocaleString()} total`,
          `▸ Errors     : ${totalErrors} total`,
          ...(topCommands.length > 0
            ? ['', '  Top Commands:']
            : []),
          ...topCommands.map(([name, s], i) =>
            `  ${i + 1}. ${name} — ${s.executions} uses${s.errors > 0 ? ` (${s.errors} errors)` : ''}`
          ),
        ],
      },
      {
        heading: 'Database',
        lines: [
          `▸ Users      : ${users.toLocaleString()}`,
          `▸ Groups     : ${groups.toLocaleString()}`,
          `▸ Banned     : ${bannedUsers}`,
          `▸ Premium    : ${premiumUsers}`,
        ],
      },
      {
        heading: 'Version',
        lines: [
          `▸ Framework  : ${brand.name} v${brand.version}`,
          `▸ Core       : ${brand.core}`,
          `▸ Node.js    : ${process.version}`,
          `▸ Platform   : ${process.platform} ${process.arch}`,
        ],
      },
    ];

    const text = asciiBuilder.sections(`${brand.name} Statistics`, sections);

    await m.reply(text, { contextInfo: buildEnrichedContextInfo() });
  },
};
