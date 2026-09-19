import { actionCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const DARES = [
  // Physical challenges
  'Do 20 pushups right now.',
  'Do your best dance move and send it as a voice note (sound effects included).',
  'Hold a plank for 60 seconds and send proof.',
  'Do 10 jumping jacks and describe how you feel in a voice note.',
  'Try to lick your elbow. Send a photo proving whether you can.',
  // Digital dares
  'Show the last photo you took.',
  'Change your profile picture to a monkey for 24 hours.',
  'Change your WhatsApp name to something embarrassing for 1 hour.',
  'Send a random emoji to the 5th person in your recent chats.',
  'Send "I know your secret" to a random contact.',
  'Post a selfie right now, no filters allowed.',
  'Read your last 3 sent messages out loud in a dramatic voice note.',
  'Let someone else pick a status for you to post.',
  'Change your about/bio to "I lost a bet" for the rest of the day.',
  // Performance dares
  'Voice note yourself singing the chorus of a random pop song.',
  'Speak in an accent for the next 5 voice notes.',
  'Do an impression of someone in this group. They have to guess who.',
  'Record yourself doing a dramatic reading of the last message you sent.',
  'Send a voice note of you barking like a dog.',
  'Narrate what you\'re doing right now in a movie trailer voice.',
  // Creative dares
  'Draw something blindfolded and send the picture.',
  'Type your next 5 messages with your eyes closed.',
  'Confess something ridiculous in the group.',
  'Make up a 4-line rap about the person who dared you and send it.',
  'Write a love poem about an inanimate object near you and send it.',
  'Send a voice note doing your best evil laugh.',
  // Social dares
  'Compliment everyone in this group individually.',
  'Say something nice about the person who dared you — and mean it.',
  'Share the most wholesome thing that happened to you this week.',
  'Text someone "you matter" right now and screenshot the reply.',
];

export default {
  name: 'dare',
  aliases: ['dares'],
  category: 'fun',
  description: 'Get a random dare challenge.',
  cooldown: 2000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    const prompt = DARES[Math.floor(Math.random() * DARES.length)];

    try {
      return await actionCard(sock, m.from, {
        text:   `🔥 *DARE*\n\n${prompt}`,
        footer: 'NEXORA • Dare',
      }, [
        { label: '🔥 Another Dare', cmd: `${p}dare` },
        { label: '🤔 Truth Instead', cmd: `${p}truth` },
        { label: '🎱 8-Ball', cmd: `${p}8ball Is this dare a bad idea?` },
      ], { quoted: m });
    } catch (err) {
      return await m.reply(`✦ *DARE* ✦\n\n🔥 ${prompt}`);
    }
  }
};
