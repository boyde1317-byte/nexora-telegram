import { showMenu } from '../../menu/index.js';

export default {
  name: 'menu',
  aliases: ['?'],
  category: 'general',
  description: 'Shows the interactive command menu in your active presentation style.',
  cooldown: 3000,
  execute: async ({ sock, m, args }) => {
    // If user passed a specific style name/id, show that style as an override, e.g. .menu payment
    const customStyle = args[0] ? args[0].toLowerCase() : null;
    
    // Call our unified presentation engine
    await showMenu(sock, m, customStyle);
  }
};
