/**
 * aiRichReply.js — Production rich-render for AI replies.
 *
 * Puts the .testrich-proven Moonson/NIXCODE combo (msping/msfb anatomy) to
 * work on real AI traffic: Gemini markdown → AIRich submessages.
 *
 *   markdown text      → addText({ hyperlink, citation, latex: true })
 *     $...$ / $$...$$ math converts to NIXCODE latex markers
 *     [expr|w|h](<codecogs PNG>) — painted natively since baileys r6.
 *   ```code fences```  → addCode(language, code)
 *   | md tables |      → addTable(rows)
 *   footer/meta        → addTip
 *   follow-up pills    → addSuggest
 *
 * EXCLUSIONS (per 2026-09-13 device audit — user decision):
 *   - LaTeX stays OUT of production: every addText call passes
 *     `latex: false`. $...$ math ships as literal text.
 *   - Maps stay OUT: addLocation is never called here.
 *   Both remain available only through the .testrich owner kit as
 *   experimental caption-only types.
 *
 * Every consumer of sendAIRichReply keeps its own plain-text fallback:
 * this helper returns false whenever the rich path is disabled or fails,
 * so callers fall through to their existing mixedCard/text reply.
 */
import { AIRich } from './NIXCODE.js';
import capabilities from '../core/capabilities.js';

const MAX_TABLE_ROWS = 12;   // keep tables readable on device
const MAX_TEXT_BLOCK = 3500; // per-submessage safety cap

/**
 * Split an AI markdown reply into ordered blocks.
 * Recognizes: fenced code blocks, GFM pipe tables, everything else as text.
 */
export function parseAIMarkdown(text) {
  const blocks = [];
  if (!text) return blocks;

  const lines = text.split('\n');
  let buf = [];

  const flushText = () => {
    if (buf.length) {
      const t = buf.join('\n').trim();
      if (t) blocks.push({ type: 'text', text: t });
      buf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────────
    const fence = line.match(/^```([\w+#.-]*)\s*$/);
    if (fence) {
      const language = fence[1] || 'text';
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      flushText();
      if (codeLines.length) {
        blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      }
      continue;
    }

    // ── GFM pipe table (header + separator + rows) ──────────────────
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) &&
      /-/.test(lines[i + 1])
    ) {
      const parseRow = (r) =>
        r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const rows = [parseRow(line)];
      i += 2; // header + separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      flushText();
      if (rows.length > 1) {
        blocks.push({ type: 'table', rows: rows.map(r => r.map(String)).slice(0, MAX_TABLE_ROWS) });
      }
      continue;
    }

    buf.push(line);
    i++;
  }
  flushText();
  return blocks;
}

// codecogs pre-render — devices don't typeset LaTeX, they paint latex_image.url.
const _codecogsUrl = (expr) =>
  'https://latex.codecogs.com/png.image?\\dpi{150}%20' + encodeURIComponent(expr);

// Math heuristic: only $..$ spans that look like math convert, so dollar
// amounts in prose ("$5 and $10") stay literal text.
const _mathHint = /[\\^_{}=]|\d\s*[+\-*/×÷]\s*\d/;
const _exprToMarker = (expr) => {
  const e = expr.trim();
  const w = Math.min(640, Math.max(90, Math.round(e.length * 9)));
  return `[${e}|${w}|50](<${_codecogsUrl(e)}>)`;
};

/**
 * Convert $...$ / $$...$$ math spans to NIXCODE latex markers.
 */
export function toNixLatex(text) {
  if (!text || !text.includes('$')) return text;
  return text
    .replace(/\$\$([^$\n]+?)\$\$/g, (full, expr) => (_mathHint.test(expr) ? _exprToMarker(expr) : full))
    .replace(/\$([^$\n]+?)\$/g, (full, expr) => (_mathHint.test(expr) ? _exprToMarker(expr) : full));
}

/**
 * Send an AI reply as a native rich response (Meta-AI style).
 *
 * @returns {Promise<boolean>} true if the rich send succeeded; false if
 *   disabled or failed — caller should then use its plain fallback.
 */
export async function sendAIRichReply(sock, jid, quoted, { markdown, tips = [], suggest = [], footer } = {}) {
  if (!capabilities.richResponse || !markdown) return false;

  try {
    const blocks = parseAIMarkdown(markdown);
    if (!blocks.length) return false;

    const rich = new AIRich(sock);
    let textCount = 0;
    for (const b of blocks) {
      if (b.type === 'text') {
        rich.addText(toNixLatex(b.text.slice(0, MAX_TEXT_BLOCK)), { latex: true }); // latex: LIVE since r6 (owner go-live 2026-09-14)
        textCount++;
      } else if (b.type === 'code') {
        rich.addCode(b.language, b.code);
      } else if (b.type === 'table') {
        rich.addTable(b.rows);
      }
    }

    // AIRich requires at least one text submessage to anchor the envelope —
    // pure-code replies get a one-line lead-in.
    if (textCount === 0) {
      rich.addText('Here is the code:', { latex: false });
    }

    for (const tip of [].concat(tips)) {
      if (tip) rich.addTip(tip);
    }
    if (footer) rich.setFooter(footer);
    if (suggest.length) rich.addSuggest(suggest);

    await rich.send(jid, { quoted });
    return true;
  } catch (err) {
    console.warn('[aiRichReply] rich send failed, falling back:', err.message);
    return false;
  }
}

export default { parseAIMarkdown, sendAIRichReply, toNixLatex };
