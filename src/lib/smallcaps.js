/**
 * Unicode smallcaps converter for menu captions.
 *
 * Converts regular text to Unicode small capitals — stylized lowercase-sized
 * uppercase letters using the Unicode "Phonetic Extensions" block. WhatsApp
 * renders these as-is, giving captions a distinctive refined look.
 *
 * Letters without a Unicode smallcap (Q, X) fall back to lowercase.
 * Non-alphabetic characters pass through unchanged.
 */

const SMALLCAPS_MAP = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ',
  g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ',
  m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'q',  r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x',
  y: 'ʏ', z: 'ᴢ',
};

/**
 * Convert a string to smallcaps.
 * Preserves WhatsApp formatting markers (*bold*, _italic_, `code`),
 * emoji, numbers, and all non-alphabetic characters.
 *
 * @param {string} text
 * @returns {string}
 */
export function toSmallcaps(text) {
  if (!text || typeof text !== 'string') return text;

  let result = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    // Only map a-z; everything else passes through
    if (lower >= 'a' && lower <= 'z') {
      result += SMALLCAPS_MAP[lower] ?? lower;
    } else {
      result += ch;
    }
  }
  return result;
}

export default { toSmallcaps };
