/**
 * poll.js — Quick "would you rather" and this-or-that poll generator.
 *
 * Not a real poll with voting — generates a fun either/or question that
 * sparks group conversation. Users reply with their choice.
 *
 * .wouldyourather       — random question
 * .wouldyourather nsfw  — (filtered out, same as clean)
 *
 * This is a lightweight fun command — for actual polls use .poll.
 */
import { mixedCard } from '../../lib/interactiveKit.js';

const QUESTIONS = [
  'Have superpowers but everyone knows, or be a secret vigilante with no powers?',
  'Never use social media again, or never watch another movie/TV show?',
  'Always be 10 minutes late, or always be 20 minutes early?',
  'Have the ability to fly, or be invisible?',
  'Never have to sleep again, or never have to eat again?',
  'Know how you\'ll die, or when you\'ll die?',
  'Speak every language fluently, or play every instrument?',
  'Be the funniest person in the room, or the smartest?',
  'Have unlimited money but can\'t travel, or be broke but travel the world?',
  'Live without music, or live without movies?',
  'Always have to say what\'s on your mind, or never speak again?',
  'Be able to talk to animals, or speak every human language?',
  'Live in a big city or a small countryside town?',
  'Have the perfect job but terrible pay, or terrible job but perfect pay?',
  'Time travel to the past or the future?',
  'Be famous but hated, or unknown but loved by those close to you?',
  'Have free coffee for life or free food for life?',
  'Be a master of every sport or every video game?',
  'Never feel pain, or never feel sadness?',
  'Have a personal chef or a personal driver?',
];

export default {
  name: 'wouldyourather',
  aliases: ['wyr', 'thisorthat'],
  category: 'fun',
  description: 'Get a random "Would You Rather" question to spark group discussion.',
  cooldown: 3000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

    await mixedCard(sock, m.from, {
      text: `🤔 *WOULD YOU RATHER*\n\n${question}`,
      footer: 'NEXORA • Would You Rather',
    }, [
      { kind: 'action', label: '🔄 Another', cmd: `${p}wyr` },
      { kind: 'action', label: '🎱 8-Ball', cmd: `${p}8ball Should I pick option A?` },
      { kind: 'action', label: '🤔 Truth', cmd: `${p}truth` },
    ], { quoted: m });
  }
};
