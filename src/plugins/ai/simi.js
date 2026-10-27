/**
 * simi.js — SimiSimi-style chat.
 *
 * Originally backed by a keyless third-party endpoint (api.nexray.eu.cc)
 * which degraded into returning random garbage ("d", "Ror", unrelated song
 * lyrics, Indonesian slang for "nonsense"). Live-tested 2026-10-26: the
 * endpoint still answers 200 OK but with incoherent output, so it can't
 * be trusted. Now backed by the bot's own shared AI provider chain
 * (Gemini → Groq → Mistral → OpenRouter → Venice, auto-fallback) with a
 * Simi persona prompt — same single-key source of truth as every other
 * AI feature (see src/assets/aiClient.js).
 *
 *   .simi <text>   → sassy AI reply
 */
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getHistory, pushTurn, forget, geminiContents } from '../../lib/chatMemory.js';

/** Simi's brain: per-user thread key (persona-scoped, LID-safe label). */
const memKey = (sender) => `simi:${sender}`;

const SIMI_SYSTEM_PROMPT =
  'You are Simi, the sassy yellow bird from the SimSimi chat app. ' +
  'You are playful, cheeky, quick-witted and full of personality — a little dramatic, never boring. ' +
  'Reply to what the user says the way a funny, sharp-tongued friend would: ' +
  'SHORT (one or two sentences, max ~40 words), casual, expressive. ' +
  'Always respond in the same language the user writes in. ' +
  'You remember earlier parts of this conversation — refer back to them naturally when relevant. '
  'Never say you are an AI or a language model. ' +
  'No preamble, no repeating the question, no explaining — just the reply.';

export default {
  name: 'simi',
  aliases: ['simisimi'],
  category: 'ai',
  description: '💬 SimiSimi-style casual AI chat. Usage: .simi <text>',
  cooldown: 4000,

  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();
    if (sub === 'reset' || sub === 'clear') {
      forget(memKey(m.sender));
      return await m.reply.success('🧽 Memory wiped. Fresh start — who are you again? 👀');
    }
    const text = args.join(' ').trim();
    if (!text) {
      const turns = getHistory(memKey(m.sender)).length;
      return await m.reply.info(
        `Chat with Simi, the sassy yellow bird.\n\nExample: \`${p}simi how are you?\`` +
        (turns ? `\n\n🧠 She remembers your last ${turns} exchange${turns !== 1 ? 's' : ''}. \`${p}simi reset\` to wipe.` : ''),
        'SIMI');
    }
    if (!hasApiKey()) {
      return await m.reply.error(
        'Simi has no voice right now — no AI provider key is configured on the bot.\n\n' +
        'Set one of GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY or VENICE_API_KEY to wake her up.'
      );
    }
    await withReactionStatus(m, async () => {
      try {
        const ai = getAiClient();
        const key = memKey(m.sender);
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          // full remembered thread + this message — no more goldfish
          contents: geminiContents(key, text),
          config: {
            systemInstruction: SIMI_SYSTEM_PROMPT,
            temperature: 1.1,
            maxOutputTokens: 200,
          },
        });
        const reply = (res?.candidates?.[0]?.content?.parts || [])
          .map((part) => part.text)
          .filter(Boolean)
          .join('\n')
          .trim();
        if (!reply) throw new Error('empty response');
        pushTurn(key, 'user', text);
        pushTurn(key, 'assistant', reply);
        await m.reply(reply);
      } catch (err) {
        console.error('[simi]', err.message);
        await m.reply.error(`Simi is silent: ${err.message}`);
      }
    });
  },
};
