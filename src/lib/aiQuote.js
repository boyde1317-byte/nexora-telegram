/**
 * aiQuote.js — rotating AI-persona quote strip for rich replies.
 *
 * Uses the Yuzuki "verified quote" pattern: instead of quoting a
 * participant JID (which only shows a saved contact's name), the synthetic
 * quote is a contactMessage vcard — WhatsApp renders the vcard's
 * displayName directly in the quote header, so the persona name shows on
 * every device with zero contact setup.
 *
 * Rotation is round-robin: every call advances to the next persona, so
 * consecutive replies show a different assistant (Meta AI → ChatGPT →
 * Perplexity → …).
 *
 * Numbers:
 *   Meta AI     +1 (313) 555-0002 (waid 13135550002) — override with
 *               META_AI_NUMBER in .env if you prefer another.
 *   ChatGPT     +1 800 242 8478   — official OpenAI WhatsApp number
 *   Perplexity  +1 833 436 3285   — official Perplexity WhatsApp number
 *
 * Usage: the serializer's replyFn and interactiveKit call aiQuoted()
 * automatically — plugins get the rotating persona by default. Override
 * with your own `quoted` in the reply options when a real quote is needed.
 */

const PERSONAS = [
  {
    name: 'Meta AI',
    emoji: '🤖',
    waid: process.env.META_AI_NUMBER || '13135550002',
    tel: `+1 (${(process.env.META_AI_NUMBER || '13135550002').slice(1, 4)}) ${(process.env.META_AI_NUMBER || '13135550002').slice(4, 7)}-${(process.env.META_AI_NUMBER || '13135550002').slice(7)}`,
    label: 'Ponsel',
  },
  {
    name: 'ChatGPT',
    emoji: '💬',
    waid: '18002428478',
    tel: '+1 (800) 242-8478',
    label: 'Ponsel',
  },
  {
    name: 'Perplexity',
    emoji: '🔎',
    waid: '18334363285',
    tel: '+1 (833) 436-3285',
    label: 'Ponsel',
  },
];

let cursor = 0;

/** Round-robin persona — every call advances to the next one. */
function nextPersona() {
  const persona = PERSONAS[cursor % PERSONAS.length];
  cursor += 1;
  return persona;
}

/**
 * Build a synthetic `quoted` — a verified-style contact card attributed to
 * the next AI persona. The `m` argument is accepted for call-site
 * compatibility but unused: the strip renders the vcard displayName.
 */
export function aiQuoted(m) {
  const persona = nextPersona();
  return {
    key: {
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
    },
    message: {
      contactMessage: {
        displayName: `${persona.emoji} ${persona.name}`,
        vcard: [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:;${persona.name};;;`,
          `FN:${persona.name}`,
          `item1.TEL;waid=${persona.waid}:${persona.tel}`,
          `item1.X-ABLabel:${persona.label}`,
          'END:VCARD',
        ].join('\n'),
      },
    },
  };
}
