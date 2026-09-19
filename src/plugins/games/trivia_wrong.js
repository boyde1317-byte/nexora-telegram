/**
 * trivia_wrong.js — Internal callback handler for trivia wrong answers.
 * Loaded by the plugin loader as a hidden command (category: null).
 * Invoked by button tap from trivia.js.
 */
export default {
  name: 'trivia_wrong',
  category: null,
  description: 'Internal — trivia wrong answer callback',
  cooldown: 0,
  execute: async ({ m, args }) => {
    const expectedSender = args[1];
    if (expectedSender !== m.sender) {
      return;
    }

    const answer = Buffer.from(args[0], 'base64').toString('utf-8');

    await m.reply.warn(
      `❌ *WRONG!*\n\nYour answer: ${answer}\n\nBetter luck next time! Type \`.trivia\` to try again.`
    );
  }
};
