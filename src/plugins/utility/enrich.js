/**
 * enrich.js — interactive message enricher.
 *
 *   .enrich <text>   → single-select picker of rich render styles
 *
 * The text is stashed server-side and the user picks a style from a
 * single_select card; the pick arrives back as `.enrich <style>-<key>` and
 * the stored text is rendered in that style. Styles:
 *
 *   Text formatting          Rich cards
 *   ── ✨ Bold               ── 📇 Contact card (real vcard message)
 *      🌊 Italic                💻 Code card (syntax-highlighted)
 *      🔠 Monospace             📊 Table card (lines → rows, , / | → cols)
 *      🪄 Strikethrough         📋 Copy card (tap-to-copy button)
 *                               🔘 Buttons card (action + copy buttons)
 *                               🧵 Quote strip (self-attributed contact quote)
 */
import {
  selectMenu,
  richCodeCard,
  richTableCard,
  copyResultCard,
  mixedCard,
} from '../../lib/interactiveKit.js';
import { getDisplayName } from '../../lib/displayName.js';

/* ── Pending-text store ────────────────────────────────────────────────────
 * Keyed by sender + short random id. Entries expire after 10 minutes; the
 * map is swept on every touch so it can never grow unbounded. */
const TTL_MS = 10 * 60 * 1000;
const pending = new Map();

function sweep() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.ts > TTL_MS) pending.delete(k);
}
function saveText(sender, text) {
  sweep();
  const key = Math.random().toString(36).slice(2, 7);
  pending.set(`${sender}|${key}`, { text, ts: Date.now() });
  return key;
}
function loadText(sender, key) {
  sweep();
  // Non-consuming: after a render the text stays available so the user can
  // pick another style (or "Pick Another Style" on the buttons card reopens
  // the picker). The TTL sweep is the only cleanup.
  return pending.get(`${sender}|${key}`)?.text || null;
}

/* ── Style helpers ─────────────────────────────────────────────────────── */

function detectLanguage(code) {
  const t = code.trim();
  if (/^[{[]/.test(t)) { try { JSON.parse(t); return 'json'; } catch { /* not json */ } }
  if (/^\s*<([a-z!])/i.test(t)) return 'html';
  if (/\b(def |import |class |elif )\b/.test(t)) return 'python';
  if (/\b(function|const|let|=>|require\()/.test(t)) return 'javascript';
  return 'javascript';
}

function buildVcard(name, number) {
  const tel = number.startsWith('+') ? number : `+${number}`;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${name};;;`,
    `FN:${name}`,
    `item1.TEL;waid=${number.replace(/^\+/, '')}:${tel}`,
    'item1.X-ABLabel:Enriched by NEXORA',
    'END:VCARD',
  ].join('\n');
}

export default {
  name: 'enrich',
  aliases: ['stylish'],
  category: 'utility',
  description: '✨ Render text as a rich message — pick a style interactively. Usage: .enrich <text>',
  cooldown: 3000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const first = (args[0] || '').trim();

    /* ── Picker reply: `.enrich <style>-<key>` ── */
    const pick = first.match(/^(bold|italic|mono|strike|contact|code|table|copy|buttons|quote|redo)-([a-z0-9]{4,8})$/);
    if (pick) {
      const [, style, key] = pick;
      const text = loadText(m.sender, key);
      if (!text) {
        return await m.reply.info(
          'That enrichment expired — picks stay fresh for 10 minutes.\n\nRun the command again with your text.',
          'ENRICH'
        );
      }
      if (style === 'redo') return await showPicker(m, sock, p, text, key);
      return await render(m, sock, style, text, key, p);
    }

    /* ── Fresh request: stash text, show the picker ── */
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(
        `Turn any text into a rich WhatsApp message.\n\nExample: \`${p}enrich hello world\`\nThen pick a style: bold, italic, monospace, strikethrough, contact card, code card, table, copy card, buttons or quote strip.`,
        'ENRICH'
      );
    }
    if (text.length > 3500) {
      return await m.reply.error('Text too long for enrichment (max 3500 characters).');
    }
    const key = saveText(m.sender, text);
    return await showPicker(m, sock, p, text, key);
  },
};

/* ── Picker ─────────────────────────────────────────────────────────────── */
async function showPicker(m, sock, p, text, key) {
  const preview = text.length > 80 ? text.slice(0, 77) + '…' : text;
  return await selectMenu(sock, m.from, {
    text: `Choose a rich style for:\n\n" ${preview} "`,
    title: '✨ Message Enricher',
    subtitle: `${text.length} characters`,
    footer: '✦ NEXORA Enrich — picks expire in 10 minutes',
  }, '🎨 Pick a style', [
    {
      title: '📝 Text formatting',
      rows: [
        { id: `${p}enrich bold-${key}`,    title: '✨ Bold',          description: 'Bold the whole text' },
        { id: `${p}enrich italic-${key}`,  title: '🌊 Italic',        description: 'Italic the whole text' },
        { id: `${p}enrich mono-${key}`,    title: '🔠 Monospace',     description: 'Fixed-width font block' },
        { id: `${p}enrich strike-${key}`,  title: '🪄 Strikethrough', description: 'Struck-through text' },
      ],
    },
    {
      title: '🃏 Rich cards',
      rows: [
        { id: `${p}enrich contact-${key}`, title: '📇 Contact Card',  description: 'Send it as a real contact' },
        { id: `${p}enrich code-${key}`,    title: '💻 Code Card',     description: 'Syntax-highlighted code block' },
        { id: `${p}enrich table-${key}`,   title: '📊 Table Card',    description: 'Lines → rows, commas/pipes → columns' },
        { id: `${p}enrich copy-${key}`,    title: '📋 Copy Card',    description: 'One-tap copy-to-clipboard button' },
        { id: `${p}enrich buttons-${key}`, title: '🔘 Buttons Card', description: 'Action buttons + copy button' },
        { id: `${p}enrich quote-${key}`,   title: '🧵 Quote Strip',   description: 'Sent as a contact-card quote of you' },
      ],
    },
  ], [], { quoted: m });
}

/* ── Renderers ──────────────────────────────────────────────────────────── */
async function render(m, sock, style, text, key, p) {
  switch (style) {
    case 'bold':
      return await m.reply(`*${text}*`);

    case 'italic':
      return await m.reply(`_${text}_`);

    case 'mono':
      return await m.reply('```\n' + text + '\n```');

    case 'strike':
      return await m.reply(`~${text}~`);

    case 'contact': {
      // First phone-looking token in the text becomes the TEL; the rest is
      // the contact's display name. No number → the sender's own number.
      const phoneMatch = text.match(/\+?\d[\d\s\-]{6,}\d/);
      const phone = (phoneMatch ? phoneMatch[0] : (m.sender || '').split('@')[0]).replace(/[\s\-]/g, '');
      const name = (phoneMatch ? text.replace(phoneMatch[0], '') : text).trim().slice(0, 60) || 'Enriched Contact';
      const vcard = buildVcard(name, phone);
      await sock.sendMessage(m.from, {
        contacts: { displayName: name, contacts: [{ displayName: name, vcard }] },
      }, { quoted: m });
      return;
    }

    case 'code':
      return await richCodeCard(sock, m.from, {
        code: text,
        language: detectLanguage(text),
        caption: '💻 Enriched code block',
        footer: '✦ NEXORA Enrich',
      }, { quoted: m });

    case 'table': {
      const rows = text
        .split(/\n|;\s*/)
        .map((line) => line.trim().split(/\s*[|,]\s*/).map((c) => c.trim()))
        .filter((r) => r.length && r.some(Boolean));
      if (!rows.length) return await m.reply.error('Could not build a table from that text.');
      return await richTableCard(sock, m.from, {
        title: '📊 Enriched Table',
        rows,
        footer: '✦ NEXORA Enrich',
      }, { quoted: m });
    }

    case 'copy':
      return await copyResultCard(sock, m.from, {
        text: 'Your enriched message is ready — tap below to copy it:',
        copyLabel: '📋 Copy Text',
        copyValue: text,
        footer: '✦ NEXORA Enrich',
      }, { quoted: m });

    case 'buttons':
      return await mixedCard(sock, m.from, {
        text,
        title: '✨ Enriched',
        footer: '✦ NEXORA Enrich',
      }, [
        { kind: 'action', label: '🎛️ Pick Another Style', cmd: `${p}enrich redo-${key}` },
        { kind: 'copy',   label: '📋 Copy Text',          value: text },
      ], { quoted: m });

    case 'quote': {
      // Send the text as a self-attributed contact-card quote: the vcard
      // waid is the sender's own number, so their avatar renders on the
      // strip — like their past self said it. Same proto shape the
      // aiQuoted strips use (proven on every device).
      const selfNum = (m.sender || '').split('@')[0];
      let name = selfNum;
      try { name = await getDisplayName(sock, m.sender); } catch { /* number fallback */ }
      name = String(name).slice(0, 60);
      return await m.reply(text, {
        quoted: {
          key: { participant: '0@s.whatsapp.net', remoteJid: 'status@broadcast' },
          message: {
            contactMessage: {
              displayName: `✨ ${name}`,
              vcard: buildVcard(name, selfNum),
            },
          },
        },
      });
    }

    default:
      return await m.reply.error(`Unknown enrichment style "${style}".`);
  }
}
