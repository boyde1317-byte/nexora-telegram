/**
 * fancyFonts.js — Unicode font styles for text enrichment.
 *
 * WhatsApp has no font selector, but the Mathematical Alphanumeric
 * Symbols block (plus Fullwidth and Enclosed Alphanumerics) renders
 * "fonts" on every device without any formatting marks. Each style is a
 * plain character mapping, so the output can be copied anywhere.
 *
 * All alphabets are GENERATED from Unicode base offsets (with the few
 * historical exceptions the blocks require) rather than hand-typed
 * strings, so a missing/mistyped letter is impossible.
 */

/* Build a 26-char alphabet from a base codepoint, applying exceptions. */
function alphabet(base, exceptions = {}) {
  let out = '';
  for (let i = 0; i < 26; i++) {
    out += String.fromCodePoint(exceptions[i] ?? base + i);
  }
  return out;
}

/* Digit strings: pass-through when no digit alphabet exists. */
const PLAIN_DIGITS = '0123456789';

/* Digit sets for the math blocks (all continuous). */
function digitsFrom(start, count = 10) {
  return Array.from({ length: count }, (_, i) => String.fromCodePoint(start + i)).join('');
}

/* ── Alphabets ─────────────────────────────────────────────────────────── */

const BOLD = {
  upper: alphabet(0x1d400),
  lower: alphabet(0x1d41a),
  digits: digitsFrom(0x1d7ce),
};

const SERIF_ITALIC = {
  upper: alphabet(0x1d434),
  lower: alphabet(0x1d44e, { 7: 0x210e }), // italic h → U+210E PLANCK
  digits: PLAIN_DIGITS,
};

const BOLD_SANS = {
  upper: alphabet(0x1d5d4),
  lower: alphabet(0x1d5ee),
  digits: digitsFrom(0x1d7ec),
};

const BOLD_SCRIPT = {
  upper: alphabet(0x1d4d0),
  lower: alphabet(0x1d4ea),
  digits: PLAIN_DIGITS,
};

const BOLD_FRAKTUR = {
  upper: alphabet(0x1d56c),
  lower: alphabet(0x1d586),
  digits: PLAIN_DIGITS,
};

const DOUBLE_STRUCK = {
  upper: alphabet(0x1d538, { 2: 0x2102, 7: 0x210d, 13: 0x2115, 15: 0x2119, 16: 0x211d, 17: 0x211a, 25: 0x2124 }),
  lower: alphabet(0x1d552),
  digits: digitsFrom(0x1d7d8),
};

const MONOSPACE = {
  upper: alphabet(0x1d670),
  lower: alphabet(0x1d68a),
  digits: digitsFrom(0x1d7f6),
};

const FULLWIDTH = {
  upper: alphabet(0xff21),
  lower: alphabet(0xff41),
  digits: digitsFrom(0xff10),
};

const CIRCLED = {
  upper: alphabet(0x24b6),
  lower: alphabet(0x24d0),
  digits: '⓪①②③④⑤⑥⑦⑧⑨',
};

/* Negative squared: uppercase only — lowercase maps up first. */
const OUTLINED = {
  upper: alphabet(0x1f170),
  lower: alphabet(0x1f170), // applied after uppercasing
  digits: PLAIN_DIGITS,
  upperOnly: true,
};

/* Small caps: no Unicode block — curated table (missing letters pass
 * through as plain lowercase, which reads fine at WhatsApp sizes). */
const SMALL_CAPS = {
  upper: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ',
  lower: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ',
  digits: PLAIN_DIGITS,
};

/* ── Style registry ────────────────────────────────────────────────────── */

export const FANCY_FONTS = [
  { id: 'serif',    label: 'Bold Serif',   emoji: '🅱️', alpha: BOLD },
  { id: 'sans',     label: 'Bold Sans',    emoji: '🖊️', alpha: BOLD_SANS },
  { id: 'italics',  label: 'Serif Italic', emoji: '🌊', alpha: SERIF_ITALIC },
  { id: 'script',   label: 'Script',       emoji: '✒️', alpha: BOLD_SCRIPT },
  { id: 'gothic',   label: 'Gothic',       emoji: '⛓️', alpha: BOLD_FRAKTUR },
  { id: 'double',   label: 'Double-Struck', emoji: '🏛️', alpha: DOUBLE_STRUCK },
  { id: 'fmono',    label: 'Tech Mono',    emoji: '⌨️', alpha: MONOSPACE },
  { id: 'smallcaps', label: 'Small Caps',  emoji: '🔬', alpha: SMALL_CAPS },
  { id: 'fullwidth', label: 'Fullwidth',   emoji: '🀄', alpha: FULLWIDTH },
  { id: 'circled',  label: 'Circled',      emoji: '⭕', alpha: CIRCLED },
  { id: 'outlined', label: 'Outlined',     emoji: '🆔', alpha: OUTLINED },
];

const byId = Object.fromEntries(FANCY_FONTS.map((f) => [f.id, f.alpha]));

/**
 * Convert text to a fancy font. Unknown characters (emoji, punctuation,
 * non-Latin scripts) pass through unchanged.
 * @param {string} styleId  one of FANCY_FONTS[].id
 * @param {string} text
 * @returns {string}
 */
export function toFancy(styleId, text) {
  const alpha = byId[styleId];
  if (!alpha) return text;
  // Spread first: the math-block letters are astral (surrogate pairs), and
  // plain str[i] indexing would split them in half at the UTF-16 seam.
  const U = [...alpha.upper], L = [...alpha.lower], D = [...alpha.digits];
  let upperMap = {}, lowerMap = {}, digitMap = {};
  for (let i = 0; i < 26; i++) {
    upperMap[String.fromCharCode(65 + i)] = U[i];
    lowerMap[String.fromCharCode(97 + i)] = L[i];
  }
  for (let i = 0; i < 10; i++) digitMap[String(i)] = D[i];

  return [...text].map((ch) => {
    if (digitMap[ch]) return digitMap[ch];
    if (lowerMap[ch]) return lowerMap[ch];
    if (upperMap[ch]) return upperMap[ch];
    return ch;
  }).join('');
}
