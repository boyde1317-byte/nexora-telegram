import { animateReveal } from '../../lib/cosmetics.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { mixedCard } from '../../lib/interactiveKit.js';

/**
 * .darkweb is a pure easter-egg / roleplay command — it never touches Tor,
 * .onion addresses, or any real network beyond the bot's own process. It
 * exists purely for the "hacker terminal" fun factor.
 */

const FAKE_FACTS = [
  'a marketplace selling nothing but rubber ducks with fake mustaches',
  'a forum where hackers argue about pineapple on pizza for 400 pages',
  'a leaked database of everyone\'s grandma\'s cookie recipes',
  'a livestream of someone slowly reorganizing a sock drawer',
  'an auction for the "world\'s most average rock"',
  'a chatroom entirely dedicated to correcting people\'s Wordle guesses',
];

function randomHex(len) {
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default {
  name: 'darkweb',
  aliases: ['tor', 'onion'],
  category: 'fun',
  description: 'A purely-for-fun "dark web terminal" roleplay. No real Tor/dark-web access.',
  cooldown: 10000,
  execute: async ({ m, sock, prefix }) => {
    const fakeAddress = `${randomHex(16)}.onion`;
    const fakeFact = FAKE_FACTS[Math.floor(Math.random() * FAKE_FACTS.length)];

    await animateReveal(sock, m.from, [
      '🌐 Initializing anonymous relay...',
      '🌐 Initializing anonymous relay...\n🔐 Bouncing through 3 fake nodes...',
      '🌐 Initializing anonymous relay...\n🔐 Bouncing through 3 fake nodes...\n🕸️ Connecting to the "dark web"...',
      asciiBuilder.box('DARKWEB TERMINAL', [
        `Connected to: ${fakeAddress}`,
        '',
        `You found: ${fakeFact}.`,
        '',
        '⚠️ This is 100% fake — for laughs only.',
        'NEXORA-MD never accesses Tor or the real dark web.',
      ]),
    ], { quoted: m }, { delayMs: 500 });

    await mixedCard(sock, m.from, {
      text: 'Curious for real information instead?',
      footer: 'NEXORA-MD • Just for fun',
    }, [
      { kind: 'action', label: '🔎 Real Web Search', cmd: `${prefix}search ` },
    ], { quoted: m });
  }
};
