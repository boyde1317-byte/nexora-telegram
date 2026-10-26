/**
 * trivia_correct.js — Internal callback handler for trivia correct answers.
 * Loaded by the plugin loader as a hidden command (category: null).
 * Invoked by button tap from trivia.js.
 */
import { grantXp } from '../../economy/leveling.js';
import { consumeTriviaChallenge } from './triviaState.js';

const REWARD_COINS = 50;
const REWARD_XP    = 25;

export default {
  name: 'trivia_correct',
  category: null,
  description: 'Internal — trivia correct answer callback',
  cooldown: 0,
  execute: async ({ m, args, db }) => {
    const challenge = consumeTriviaChallenge(args[0], { sender: m.sender, chat: m.from });
    if (!challenge) {
      return await m.reply.warn('This trivia answer is invalid, expired, or has already been used. Start a new question with `.trivia`.');
    }

    const answer = challenge.correctAnswer;
    const userData = db.getUser(m.sender);
    const coins = (userData.coins ?? 0) + REWARD_COINS;

    grantXp(db, m.sender, { xp: REWARD_XP, coins: REWARD_COINS });

    await m.reply.success(
      `✅ *CORRECT!*\n\nAnswer: *${answer}*\n\nReward:\n🪙 +${REWARD_COINS} coins (${coins.toLocaleString()} total)\n✨ +${REWARD_XP} XP\n\nType \`.trivia\` for another question!`
    );
  }
};
