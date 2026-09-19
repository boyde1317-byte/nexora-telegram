import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'roll',
  aliases: ['dice', 'rolldice'],
  category: 'fun',
  description: 'Roll a dice. Usage: .roll [sides]',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    let sides = 6;
    if (args[0] && !isNaN(args[0])) {
      sides = parseInt(args[0], 10);
    }
    if (sides < 2 || sides > 1000) {
      return await m.reply.error('Sides must be between 2 and 1000.');
    }
    
    const result = Math.floor(Math.random() * sides) + 1;

    // Commentary based on roll quality
    let comment;
    if (sides <= 6) {
      if (result === 1)        comment = 'Oof. Natural one. The dice are cruel. 🪐';
      else if (result === sides) comment = `Max roll! Critical hit. ⚡`;
      else if (result >= sides - 1) comment = 'So close to the top. ✦';
      else                     comment = 'A perfectly average roll. ☕';
    } else {
      if (result === 1)        comment = 'Lowest possible. Rough. 🪐';
      else if (result === sides) comment = `Max roll on a d${sides}! Impossible luck. ⚡`;
      else if (result >= Math.floor(sides * 0.8)) comment = 'Solid roll. ✦';
      else                     comment = 'The dice have spoken. ∘';
    }
    
    await mixedCard(sock, m.from, {
      text: `✦ *DICE ROLL* ✦\n\n🎲 You rolled a *${result}* (1-${sides})\n${comment}`,
      footer: 'NEXORA • Dice Roll'
    }, [
      { kind: 'action', label: '🔄 Roll Again', cmd: `${prefix}roll ${sides}` }
    ], { quoted: m });
  }
};
