import { themeManager } from '../themeManager.js';
import { layoutConfig } from '../../../config/layout.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { toSmallcaps } from '../../lib/smallcaps.js';

/**
 * Menu template builder.
 *
 * Design rule (2026-09-18 layout pass, owner-directed): command NAMES
 * only, ONE COMMAND PER LINE, grouped by category with UPPERCASE
 * category headers — no descriptions, no inline comma-wrapping. The
 * inline `a, b, c` wrapping read as an unreadable blob on real
 * devices; a per-line directory scans instantly. Detailed help lives
 * in `.help <command>`; the menu is a directory, not documentation.
 *
 * Kept: themed borders, smallcaps typographic identity, per-category
 * section headers with counts, stat header, and the placeholder system.
 */
export const menuTemplate = (menuData) => {
  const borders = themeManager.getBorders();
  const styleName = themeManager.getTheme();
  const bulletIcon = layoutConfig.icons.bullet;

  // Compile dynamic variables
  const now = new Date();
  const replacements = {
    '{botName}': menuData.botName || brand.name,
    '{owner}': menuData.ownerName || owner.ownerName,
    '{runtime}': menuData.runtime || menuData.uptime || '0s',
    '{commands}': menuData.totalCommands || '0',
    '{version}': brand.version,
    '{date}': now.toLocaleDateString(),
    '{time}': now.toLocaleTimeString(),
    '{prefix}': menuData.prefix || '.'
  };

  const parseText = (rawText) => {
    let text = rawText;
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(key, value);
    }
    return text;
  };

  const formattedLines = [];

  // ── Header ───────────────────────────────────────────────────────────
  if (styleName === 'minimal') {
    formattedLines.push(`── {botName} ──`);
    formattedLines.push(` Owner: {owner} · v{version} · Up: {runtime}`);
    formattedLines.push(` Prefix: {prefix} · Commands: {commands}`);
  } else if (styleName === 'classic') {
    formattedLines.push(`┏━━━━━━━━━━━━━━━━━━━━━━━━`);
    formattedLines.push(`┃  ✦ {botName} ✦`);
    formattedLines.push(`┃  {owner} · v{version} · Up: {runtime}`);
    formattedLines.push(`┃  Prefix: {prefix} · Commands: {commands}`);
    formattedLines.push(`┣━━━━━━━━━━━━━━━━━━━━━━━━`);
  } else {
    // Modern — one compact stat block, no double-spacing
    formattedLines.push(`${borders.topLeft}✦ {botName} ✦`);
    formattedLines.push(`${borders.line} Owner: {owner} · v{version} · Up: {runtime}`);
    formattedLines.push(`${borders.line} Prefix: {prefix} · {commands} ${toSmallcaps('commands')}`);
  }

  // ── Categories: header + inline name rows ────────────────────────────
  const sortedCategories = Object.keys(menuData.categories).sort();
  let catIndex = 0;
  for (const cat of sortedCategories) {
    catIndex++;
    const cmds = menuData.categories[cat];
    const names = cmds.map(c => `${menuData.prefix || '.'}${c.name}`);
    const header = cat.toUpperCase();

    if (styleName === 'minimal') {
      formattedLines.push('');
      formattedLines.push(`── ${header} (${cmds.length}) ──`);
      names.forEach(n => formattedLines.push(n));
    } else if (styleName === 'classic') {
      formattedLines.push(`┃  ✦ ${header} · ${cmds.length}`);
      names.forEach(n => formattedLines.push(`${borders.line} ${n}`));
    } else {
      formattedLines.push(`${borders.divider}✦ ${String(catIndex).padStart(2, '0')} · ${header} · ${cmds.length}`);
      names.forEach(n => formattedLines.push(`${borders.line} ${n}`));
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────
  formattedLines.push('');
  if (styleName === 'classic') {
    formattedLines.push(`┃  ${toSmallcaps('Powered by')} ✦ {botName} ✦`);
    formattedLines.push(`┗━━━━━━━━━━━━━━━━━━━━━━━━`);
  } else if (styleName === 'minimal') {
    formattedLines.push(`Powered by ✦ {botName} ✦`);
  } else {
    formattedLines.push(`${borders.bottomLeft}── ${toSmallcaps('Powered by')} ✦ {botName} ✦ ──`);
  }

  // Apply placeholders and clean anti-spam spacing/broken characters
  return parseText(formattedLines.join('\n'));
};

export default menuTemplate;
