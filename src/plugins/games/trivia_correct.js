/**
 * trivia_correct.js — Internal callback handler for trivia correct answers.
 * Loaded by the plugin loader as a hidden command (category: null).
 * Invoked by button tap from trivia.js.
 */
import { grantXp } from '../../economy/leveling.js';

const REWARD_COINS = 50;
const REWARD_XP    = 25;

export default {
  name: 'trivia_correct',
  category: null,
  description: 'Internal — trivia correct answer callback',
  cooldown: 0,
  execute: async ({ m, args, db }) => {
    const expectedSender = args[1];
    if (expectedSender !== m.sender) {
      return;
    }

    const answer = Buffer.from(args[0], 'base64').toString('utf-8');
    const userData = db.getUser(m.sender);
    const coins = (userData.coins ?? 0) + REWARD_COINS;

    grantXp(db, m.sender, { xp: REWARD_XP, coins: REWARD_COINS });

    await m.reply.success(
      `✅ *CORRECT!*\n\nAnswer: *${answer}*\n\nReward:\n🪙 +${REWARD_COINS} coins (${coins.toLocaleString()} total)\n✨ +${REWARD_XP} XP\n\nType \`.trivia\` for another question!`
    );
  }
};
