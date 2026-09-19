import { actionCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const TRUTHS = [
  // Personal & reflective
  'What is your biggest fear?',
  'What is a secret you have never told anyone?',
  'What is the biggest mistake you have ever made?',
  'What is the most childish thing you still do?',
  'What is a dream you gave up on? Why?',
  'What is the one thing you would change about yourself?',
  'When was the last time you cried and why?',
  'What is the hardest thing you have ever had to tell someone?',
  'What is something you pretend to like but actually hate?',
  'What is your biggest insecurity?',
  // Digital & social
  'What is the most embarrassing thing in your search history?',
  'If you had to delete one app from your phone forever, what would it be?',
  'Who do you text the most?',
  'What is the most awkward text you have accidentally sent?',
  'Have you ever ghosted someone? Why?',
  'What is a rumor you spread or heard that turned out to be false?',
  'Have you ever practiced kissing in a mirror?',
  'What is the last lie you told on social media?',
  'Have you ever stalked someone online? Who?',
  'What is your most embarrassing screen time report?',
  // Relationships
  'Who was your first crush?',
  'If you could swap lives with someone in this group for a day, who would it be?',
  'Who in this group would you trust with your darkest secret?',
  'Have you ever caught feelings for someone you shouldn\'t have?',
  'What is the cringiest thing you\'ve done to impress a crush?',
  'Have you ever said "I love you" and not meant it?',
  // Wildcards
  'What is the worst habit you have?',
  'What is something you are jealous of about someone in this group?',
  'If your phone could talk, what would expose you with?',
  'What is the pettiest thing you\'ve ever done?',
  'What is the most spontaneous thing you\'ve ever done?',
  'Have you ever pretended to be sick to get out of something?',
  'What is the most money you\'ve ever spent on something completely useless?',
  'What is a controversial opinion you actually hold?',
  'If you could get away with one crime, what would it be?',
  'What is the dumbest thing you\'ve ever believed?',
];

export default {
  name: 'truth',
  aliases: ['truths'],
  category: 'fun',
  description: 'Get a random truth question.',
  cooldown: 2000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    const prompt = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];

    try {
      return await actionCard(sock, m.from, {
        text:   `🤔 *TRUTH*\n\n${prompt}`,
        footer: 'NEXORA • Truth',
      }, [
        { label: '🤔 Another Truth', cmd: `${p}truth` },
        { label: '🔥 Dare Instead',  cmd: `${p}dare` },
        { label: '🎱 8-Ball',        cmd: `${p}8ball Will they tell the truth?` },
      ], { quoted: m });
    } catch (err) {
      return await m.reply(`✦ *TRUTH* ✦\n\n🤔 ${prompt}`);
    }
  }
};
