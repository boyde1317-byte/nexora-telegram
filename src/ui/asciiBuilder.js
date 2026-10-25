import { toSmallcaps } from '../lib/smallcaps.js';

/**
 * ASCII box builder for structured text output.
 *
 * Uses smallcaps for titles to match the menu system's visual identity.
 * Accent symbol ✦ wraps every title for brand consistency.
 *
 * Enhanced with panels, stat rows, progress bars, and visual dividers
 * for richer in-chat info cards.
 */
/**
 * Menu-identity slim box — the same thin-walled card style the galaxy
 * menu buttons and the startup credits use:
 *
 *   ╭─「 ᴛɪᴛʟᴇ 」
 *   │ line
 *   ╰────────────────────────╯
 *
 * This is THE reply framing style; the thick ━━━ panel look was retired
 * per owner direction. Blank lines render as a bare wall (credits card
 * style).
 */
const slimBox = (title, lines = [], opts = {}) => {
  const accent = opts.accent || '';
  const label = title ? `${accent} ${toSmallcaps(title)} ${accent}`.trim() : '';
  const out = [];
  out.push(title ? `╭─「 ${label} 」` : '╭────────────────────────╮');
  for (const line of lines) {
    const s = String(line);
    out.push(s.trim().length ? `│ ${s}` : '│');
  }
  out.push('╰────────────────────────╯');
  return out.join('\n');
};

export const asciiBuilder = {
  box(title, lines = []) {
    return slimBox(title, lines);
  },

  list(title, items = []) {
    return slimBox(title, items.map((item) => `✦ ${item}`));
  },

  card(title, entries = []) {
    return slimBox(title, entries.map((entry) => `• ${entry}`));
  },

  /**
   * Builds a visually striking panel with a titled header bar and body content.
   * Uses Unicode box-drawing characters for a polished card look.
   *
   * @param {string} title   Panel header text
   * @param {string[]} lines  Body lines
   * @param {object} [opts]
   * @param {string} [opts.accent='✦']  Accent symbol flanking the title
   * @returns {string}
   */
  panel(title, lines = [], opts = {}) {
    return slimBox(title, lines, opts);
  },

  /**
   * Auto-frames a raw reply in the menu-identity box. Used by the
   * serializer so every non-trivial reply carries the box identity,
   * without touching each plugin.
   *
   * Skips framing when:
   *   - the text is not a string
   *   - it's too small (below `minLength` — short confirmations stay plain)
   *   - it already contains panel dividers (menus, stat panels, .box calls)
   *
   * @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.minLength=100] Replies shorter than this stay plain
   * @param {string} [opts.title='']   Optional ✦ smallcaps header (command name)
   * @returns {string}
   */
  autoBox(text, { minLength = 100, title = '' } = {}) {
    if (typeof text !== 'string') return text;
    const trimmed = text.trim();
    if (trimmed.length < minLength) return text;
    // Already styled: slim box frames, thick panel dividers, or a
    // ✦/✶ smallcaps title header — never double-frame.
    if (/[╭┌]/.test(trimmed) || trimmed.includes('━━━━') || trimmed.startsWith('✦ *') || trimmed.startsWith('✶ *')) {
      return text;
    }
    return slimBox(title, trimmed.split('\n'));
  },

  /**
   * Builds a stat row with a label and value, aligned visually.
   *
   * @param {string} label
   * @param {string|number} value
   * @param {string} [icon='▸']  Bullet/icon prefix
   * @returns {string}
   */
  statRow(label, value, icon = '▸') {
    return `${icon} *${toSmallcaps(label)}:* ${value}`;
  },

  /**
   * Builds an ASCII progress bar.
   *
   * @param {number} percent  0-100
   * @param {number} [width=12]  Bar width in characters
   * @param {string} [label]  Optional label before the bar
   * @returns {string}
   */
  progressBar(percent, width = 12, label = '') {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    const bar = `\u2588`.repeat(filled) + `\u2591`.repeat(empty);
    const prefix = label ? `${toSmallcaps(label)} ` : '';
    return `${prefix}[${bar}] ${Math.round(clamped)}%`;
  },

  /**
   * Builds a visual divider line with optional center label.
   *
   * @param {string} [label]  Optional text centered in the divider
   * @param {string} [char='\u2500']  Divider character
   * @param {number} [width=25]  Total width
   * @returns {string}
   */
  divider(label, char = '\u2500', width = 25) {
    if (!label) return char.repeat(width);
    const labelStr = ` ${label} `;
    const sideWidth = Math.max(0, Math.floor((width - labelStr.length) / 2));
    const left = char.repeat(sideWidth);
    const right = char.repeat(width - sideWidth - labelStr.length);
    return `${left}${labelStr}${right}`;
  },

  /**
   * Builds a multi-section info card with titled subsections.
   * Each section gets its own mini-panel with a header bar.
   *
   * @param {string} title     Main card title
   * @param {Array<{heading: string, lines: string[]}>} sections
   * @param {object} [opts]
   * @param {string} [opts.accent='\u2706']  Accent symbol (default ✦)
   * @returns {string}
   */
  sections(title, sections = [], opts = {}) {
    const accent = opts.accent || '\u2706';
    const formatted = [];
    if (title) {
      formatted.push(`${accent} *${toSmallcaps(title)}* ${accent}`);
      formatted.push('');
    }
    for (const section of sections) {
      formatted.push(slimBox(section.heading || '', section.lines || []));
      formatted.push('');
    }
    return formatted.join('\n').trimEnd();
  },

  /**
   * Builds a badge/tag line — a short labeled chip for status indicators.
   *
   * @param {string} label
   * @param {string} value
   * @returns {string}
   */
  badge(label, value) {
    return `\u27E6 ${toSmallcaps(label)}: ${value} \u27E7`;
  },
};

export default asciiBuilder;
