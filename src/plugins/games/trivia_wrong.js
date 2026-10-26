/**
 * trivia_wrong.js — Internal callback handler for trivia wrong answers.
 * Loaded by the plugin loader as a hidden command (category: null).
 * Invoked by button tap from trivia.js.
 */
import { consumeTriviaChallenge } from './triviaState.js';

export default {
  name: 'trivia_wrong',
  category: null,
  description: 'Internal — trivia wrong answer callback',
  cooldown: 0,
  execute: async ({ m, args }) => {
    const challenge = consumeTriviaChallenge(args[0], { sender: m.sender, chat: m.from });
    if (!challenge) {
      return await m.reply.warn('This trivia answer is invalid, expired, or has already been used. Start a new question with `.trivia`.');
    }

    const answer = 'your selected option';

    await m.reply.warn(
      `❌ *WRONG!*\n\nYour answer: ${answer}\n\nBetter luck next time! Type \`.trivia\` to try again.`
    );
  }
};
