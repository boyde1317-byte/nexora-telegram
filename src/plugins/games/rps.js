import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'rps',
  aliases: ['rockpaperscissors'],
  category: 'games',
  description: 'Play Rock Paper Scissors. Usage: .rps [rock/paper/scissors]',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    
    if (!args[0] || !choices.includes(args[0].toLowerCase())) {
      return await mixedCard(sock, m.from, {
        text: `✦ *ROCK PAPER SCISSORS* ✦\n\nChoose your weapon. I promise not to cheat. ⚡`,
        footer: 'NEXORA • Rock Paper Scissors'
      }, [
        { kind: 'action', label: '🪨 Rock', cmd: `${p}rps rock` },
        { kind: 'action', label: '📄 Paper', cmd: `${p}rps paper` },
        { kind: 'action', label: '✂️ Scissors', cmd: `${p}rps scissors` }
      ], { quoted: m });
    }
    
    const userChoice = args[0].toLowerCase();
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    
    let result = '';
    if (userChoice === botChoice) result = 'It\'s a tie! 🤝';
    else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      result = 'You win! Got me there. 🎉';
    } else {
      result = 'I win! Better luck next round. 😈';
    }
    
    await mixedCard(sock, m.from, {
      text: `✦ *ROCK PAPER SCISSORS* ✦\n\nYou chose: ${emojis[userChoice]}\nI chose: ${emojis[botChoice]}\n\n*${result}*`,
      footer: 'NEXORA • Rock Paper Scissors'
    }, [
      { kind: 'action', label: '🪨 Rock',     cmd: `${p}rps rock` },
      { kind: 'action', label: '📄 Paper',    cmd: `${p}rps paper` },
      { kind: 'action', label: '✂️ Scissors',  cmd: `${p}rps scissors` }
    ], { quoted: m });
  }
};
