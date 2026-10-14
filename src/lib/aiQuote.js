/**
 * aiQuote.js — rotating AI-persona quote strip for rich replies.
 *
 * By default every reply quotes the invoker's own message, so WhatsApp
 * renders the quote header as "You" (the "You • Status" strip). Pass
 * { quoted: aiQuoted(m) } instead to attribute the strip to a well-known
 * AI assistant number — any device that has the number saved as a contact
 * shows the persona's name in the header (e.g. "ChatGPT"), which reads
 * far richer than quoting the command back at the user.
 *
 * Rotation is round-robin: every call advances to the next persona, so
 * consecutive replies show a different assistant (Meta AI → ChatGPT →
 * Perplexity → …).
 *
 * Numbers:
 *   ChatGPT     +1 800 242 8478   — official OpenAI WhatsApp number
 *   Perplexity  +1 833 436 3285   — official Perplexity WhatsApp number
 *   Meta AI     — Meta AI has NO public WhatsApp number (it's a built-in
 *     service, not a saveable contact). The entry below defaults to
 *     1-800-638-2244 ("1-800-META-AI" on a keypad) as a placeholder ONLY.
 *     Save whichever number you prefer as your "Meta AI" contact and set
 *     META_AI_NUMBER=<digits> in .env to pin it.
 *
 * Usage (any plugin):
 *   import { aiQuoted } from '../lib/aiQuote.js';
 *   await m.reply.info(text, 'TITLE', { quoted: aiQuoted(m) });
 */

const PERSONAS = [
  {
    name: 'Meta AI',
    jid: `${process.env.META_AI_NUMBER || '18006382244'}@s.whatsapp.net`,
    quote: 'Ask me anything — I can help you plan, create, and explore. ✨',
  },
  {
    name: 'ChatGPT',
    jid: '18002428478@s.whatsapp.net',
    quote: 'How can I help you today? 💬',
  },
  {
    name: 'Perplexity',
    jid: '18334363285@s.whatsapp.net',
    quote: 'Ask anything — answers with sources, fast. 🔎',
  },
];

let cursor = 0;

/** Round-robin persona — every call advances to the next one. */
function nextPersona() {
  const persona = PERSONAS[cursor % PERSONAS.length];
  cursor += 1;
  return persona;
}

/** Message id in the same shape Baileys generates. */
function fakeMessageId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Build a synthetic `quoted` attributed to the next AI persona.
 *
 * @param {object}  m     The message being replied to (provides the chat JID).
 * @param {string} [text] Optional quote text — defaults to the persona's line.
 */
export function aiQuoted(m, text) {
  const persona = nextPersona();
  return {
    key: {
      remoteJid: m?.from || m?.key?.remoteJid,
      fromMe: false,
      id: fakeMessageId(),
      participant: persona.jid,
    },
    message: { conversation: text || persona.quote },
  };
}
