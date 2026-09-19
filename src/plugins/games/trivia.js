/**
 * trivia.js — Trivia game with multiple choice and economy rewards.
 *
 * Pulls questions from the Open Trivia Database (opentdb.com) free API.
 * Awards coins for correct answers. Uses nativeFlow buttons for answer
 * selection, with a plain-text fallback.
 *
 * Usage:
 *   .trivia              — random question (any category)
 *   .trivia science      — random question from a category
 *
 * Categories: general, science, history, geography, entertainment, sports
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const CATEGORY_MAP = {
  general:       9,
  books:         10,
  film:          11,
  music:         12,
  tv:            14,
  videoGames:    15,
  boardGames:    16,
  science:       17,
  computers:     18,
  math:          19,
  mythology:     20,
  sports:        21,
  geography:     22,
  history:       23,
  politics:      24,
  art:           25,
  celebrities:   26,
  animals:       27,
  vehicles:      28,
  comics:        29,
  gadgets:       30,
  anime:         31,
  cartoons:      32,
};

function decodeHtml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export default {
  name: 'trivia',
  aliases: ['quiz', 'question'],
  category: 'games',
  description: 'Answer a trivia question for coins and XP. Usage: .trivia [category]',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    await withReactionStatus(m, async () => {
      let url = 'https://opentdb.com/api.php?amount=1&type=multiple';
      const catInput = args[0]?.toLowerCase();
      if (catInput && CATEGORY_MAP[catInput]) {
        url += `&category=${CATEGORY_MAP[catInput]}`;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!data.results?.[0]) {
        return await m.reply.error('Could not fetch a trivia question. Try again in a moment.');
      }

      const q = data.results[0];
      const question  = decodeHtml(q.question);
      const correct   = decodeHtml(q.correct_answer);
      const incorrect  = q.incorrect_answers.map(decodeHtml);
      const category  = q.category;

      const allAnswers = [correct, ...incorrect].sort(() => Math.random() - 0.5);
      const correctIdx = allAnswers.indexOf(correct);

      const labels = ['🅰️', '🅱️', '🅲', '🅳'];

      const difficulty = q.difficulty ? q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1) : 'Mixed';

      try {
        return await actionCard(sock, m.from, {
          text: `🧠 *TRIVIA* — ${category}\n\n${question}\n\n${allAnswers.map((a, i) => `${labels[i]} ${a}`).join('\n')}`,
          footer: `Difficulty: ${difficulty} • Tap to answer!`,
        }, allAnswers.map((a, i) => ({
          label: `${labels[i]} ${a.slice(0, 20)}${a.length > 20 ? '…' : ''}`,
          cmd: i === correctIdx
            ? `${p}trivia_correct ${Buffer.from(correct).toString('base64')} ${m.sender}`
            : `${p}trivia_wrong ${Buffer.from(a).toString('base64')} ${m.sender}`,
        })), { quoted: m });
      } catch (err) {
        console.warn('[trivia] actionCard failed, text fallback:', err.message);
        return await m.reply(asciiBuilder.box('🧠 TRIVIA', [
          `Category: ${category} • ${difficulty}`,
          '',
          question,
          '',
          ...allAnswers.map((a, i) => `${labels[i]} ${a}`),
          '',
          `Reply with A, B, C, or D to answer!`,
        ]));
      }
    });
  }
};
