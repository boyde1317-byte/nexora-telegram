/**
 * commandDirectory.js — shared helpers for the native command directory
 * (.menu commandDirectory type + the .help category/command drill-down).
 *
 * Single source of truth for the category emoji map and the grouping of
 * the live plugin registry by category, so the menu picker and the
 * .help views never drift apart.
 */

import { client } from '../core/client.js';
import { config } from '../../config/index.js';

export const CATEGORY_EMOJI = {
  general: '⚙️', download: '⬇️', ai: '🧠', web: '🌐', economy: '💰',
  fun: '🎲', group: '👥', media: '🖼️', owner: '👑', utility: '🔧',
  anime: '🌸', sticker: '✨', greetings: '👋', newsletter: '📰',
};

export const categoryEmoji = (cat) => CATEGORY_EMOJI[String(cat).toLowerCase()] || '📦';

export const titleize = (cat) => {
  const c = String(cat).toLowerCase();
  return c.charAt(0).toUpperCase() + c.slice(1);
};

/**
 * Group the live command registry by category.
 * Returns a Map: category → Array<{ name, description, aliases, category }>,
 * sorted by category name, commands alphabetical within a category.
 */
export function buildCategoryIndex() {
  const byCat = new Map();
  for (const [name, plugin] of client.commands) {
    const cat = (plugin?.category || 'other').toLowerCase();
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({
      name,
      description: plugin.description || '',
      aliases: plugin.aliases || [],
      category: cat,
    });
  }
  for (const [cat, list] of byCat) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    byCat.set(cat, list);
  }
  return new Map([...byCat.entries()].sort((a, b) => b[1].length - a[1].length));
}

/** Resolve a user-typed token to a category name (case-insensitive), or null. */
export function matchCategory(token, byCat) {
  if (!token) return null;
  const t = String(token).toLowerCase();
  for (const cat of byCat.keys()) {
    if (cat.toLowerCase() === t) return cat;
  }
  return null;
}


/** Full resolver: strips the bot prefix, then matches name or alias. */
export function resolveCommand(token) {
  if (!token) return null;
  const p = config.prefix?.[0] || '.';
  let t = String(token).trim().toLowerCase();
  for (const pref of (Array.isArray(config.prefix) ? config.prefix : [p])) {
    if (t.startsWith(pref)) t = t.slice(pref.length);
  }
  if (!t) return null;
  if (client.commands.has(t)) return client.commands.get(t);
  for (const plugin of client.commands.values()) {
    if ((plugin.aliases || []).some(a => String(a).toLowerCase() === t)) {
      return plugin;
    }
  }
  return null;
}
