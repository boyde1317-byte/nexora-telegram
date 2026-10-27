import { layoutConfig } from '../../../config/layout.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { getGreeting } from '../../menu/formatter.js';

/**
 * Menu template builder — ANYA/OURIN-inspired layout pass (2026-10).
 *
 * What changed vs. the old flat directory: the menu now opens with the
 * brand panel, greets the caller by name, and shows their live NEXORA
 * profile (level, badge, XP, coins, streak, global rank position) in a
 * boxed panel — the layout language users loved in ANYA-MD and OURIN MD:
 *
 *   ╭─「 ✦ header 」─⬣
 *   │ ✦ key : value
 *   ╰─⬣
 *
 * Preserved from the 2026-09-18 design rule: command NAMES only, ONE
 * COMMAND PER LINE, UPPERCASE category headers. The menu is a directory,
 * not documentation — detailed help stays in `.help <command>`.
 */

/** Per-category emoji identity (OURIN-style visual anchors). */
const CATEGORY_EMOJI = {
  owner: '👑', general: '🏠', utility: '🔧', group: '👥',
  economy: '💰', rpg: '⚔️', games: '🎯', fun: '🎮',
  ai: '🤖', media: '🎬', download: '📥', web: '🌐',
  anime: '🍥', channel: '📣', logomaker: '🎨', nsfw: '🔞',
  greetings: '👋', newsletter: '📰', info: 'ℹ️', unknown: '✦',
};

const emojiFor = (cat) => CATEGORY_EMOJI[cat] || CATEGORY_EMOJI.unknown;

/** Aligned key : value row for the info panels. */
const row = (key, value) => {
  const k = toSmallcaps(key).padEnd(10, ' ');
  return `│ ✦ ${k}: *${value}*`;
};

/** A boxed panel: ╭─「 title 」─⬣ … ╰─⬣ */
const box = (title, lines) => {
  const out = [`╭─「 ${title}」─⬣`];
  out.push(...lines);
  out.push('╰─⬣');
  return out;
};

export const menuTemplate = (menuData) => {
  const bulletIcon = layoutConfig.icons.bullet;

  const now = new Date();
  const replacements = {
    '{botName}': menuData.botName || brand.name,
    '{owner}': menuData.ownerName || owner.ownerName,
    '{runtime}': menuData.runtime || menuData.uptime || '0s',
    '{commands}': menuData.totalCommands || '0',
    '{version}': brand.version,
    '{date}': now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    '{time}': now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    '{prefix}': menuData.prefix || '.',
  };

  const parseText = (rawText) => {
    let text = rawText;
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(key, value);
    }
    return text;
  };

  const lines = [];

  // ── Brand + greeting ─────────────────────────────────────────────────
  lines.push(`✦ *${toSmallcaps(menuData.botName || '{botName}')}* ✦`);
  const greeting = getGreeting();
  const userName = menuData.userInfo?.name || 'Commander';
  lines.push(`${greeting}, *${userName}* — pick your category below.`);

  // ── BOT INFO panel ───────────────────────────────────────────────────
  lines.push('');
  lines.push(...box('🤖 *ʙᴏᴛ ɪɴꜰᴏ*', [
    row('Version', `v{version}`),
    row('Prefix', `[ {prefix} ]`),
    row('Uptime', '{runtime}'),
    row('Commands', `{commands} ${toSmallcaps('total')}`),
    row('Users', (menuData.users || 1).toLocaleString()),
    row('Owner', '{owner}'),
  ]));

  // ── USER INFO panel (personal, ANYA-style) ──────────────────────────
  const u = menuData.userInfo;
  if (u) {
    lines.push('');
    const userRows = [
      row('Level', `${u.level} ${u.badge ? `(${u.badge})` : ''}`),
      row('XP', `${u.xp.toLocaleString()} · ${u.xpToNext.toLocaleString()} ${toSmallcaps('to next')}`),
      row('Coins', `${(u.coins || 0).toLocaleString()} 🪙`),
    ];
    if (u.streak) userRows.push(row('Streak', `${u.streak} ${toSmallcaps('day')}${u.streak !== 1 ? 's' : ''} 🔥`));
    if (u.position) userRows.push(row('Rank', `#${u.position} ${toSmallcaps('global')}`));
    userRows.push(row('Date', '{date} · {time}'));
    lines.push(...box('👤 *ᴜsᴇʀ ɪɴꜰᴏ*', userRows));
  }

  // ── Category directory (one command per line, per design rule) ───────
  const sortedCategories = Object.keys(menuData.categories).sort();
  let catIndex = 0;
  for (const cat of sortedCategories) {
    catIndex++;
    const cmds = menuData.categories[cat];
    const header = `${emojiFor(cat)} *${cat.toUpperCase()}* · ${cmds.length}`;
    lines.push('');
    lines.push(`╭─「 ${header}」─⬣`);
    cmds.forEach((c) => lines.push(`│ ${bulletIcon} {prefix}${c.name}`));
    lines.push('╰─⬣');
  }

  // ── Footer ───────────────────────────────────────────────────────────
  lines.push('');
  lines.push(`╰─ 👑 ${toSmallcaps('Inner Circle')}: {prefix}channel ─⬣`);
  lines.push(`╰─ ${toSmallcaps('Powered by')} ✦ *${toSmallcaps(menuData.botName || brand.name)}* ✦ ─⬣`);
  lines.push(`_Detailed help: {prefix}help <command> · Style picker: {prefix}setmenu_`);

  // Apply placeholders and clean anti-spam spacing/broken characters
  return parseText(lines.join('\n'));
};

export default menuTemplate;
