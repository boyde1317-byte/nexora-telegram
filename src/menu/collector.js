import { client } from '../core/client.js';
import { db } from '../database/db.js';
import { getChannelPill } from '../lib/menuContext.js';
import { config } from '../../config/index.js';
import brand from '../../config/brand.js';
import owner from '../../config/owner.js';
import { formatUptime } from '../lib/utils.js';

/**
 * Scans the plugin system and database stats to compile a global menu data object
 */
export const collectMenuData = (sock) => {
  const totalCommands = client.commands.size;
  
  // Group commands by category
  const categories = {};
  client.commands.forEach((cmd) => {
    // Skip hidden commands (category: null) from menu listings
    if (!cmd.category) return;
    const cat = cmd.category.toLowerCase();
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push({
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description || 'No description provided',
      permissions: cmd.permissions || {}
    });
  });

  // Sort commands inside each category alphabetically
  Object.keys(categories).forEach(cat => {
    categories[cat].sort((a, b) => a.name.localeCompare(b.name));
  });

  const dbData = db.data;
  const totalUsers = Object.keys(dbData.users || {}).length;
  const totalGroups = Object.keys(dbData.groups || {}).length;
  
  const stats = dbData.stats || {};
  const commandsUsed = stats.commandsUsed || {};

  const uptimeSeconds = process.uptime();

  return {
    botName: brand.name,
    ownerName: owner.ownerName,
    ownerNumber: (config.owner[0] || '').replace(/[^0-9]/g, ''),
    prefix: config.prefix[0] || '!',
    uptime: formatUptime(uptimeSeconds),
    runtime: formatUptime(uptimeSeconds),
    users: Math.max(totalUsers, 1),
    groups: totalGroups,
    totalCommands,
    categories,
    statistics: commandsUsed,
    // channelJid: required by the newsletter menu for admin invite cards.
    // Set CHANNEL_JID in .env (e.g. 123456789@newsletter) to enable that tier.
    channelJid: process.env.CHANNEL_JID || config.channelJid || null,
    // Channel pill (top of menu card): set via .channel create or .setchannel
    channelPill: getChannelPill(),
  };
};

export default collectMenuData;
