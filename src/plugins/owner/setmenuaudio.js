import { mediaConfig } from '../../media/mediaConfig.js';

export default {
  name: 'setmenuaudio',
  aliases: ['menuaudio', 'maudio'],
  category: 'owner',
  description: 'Enable or disable the background menu audio message playback.',
  permissions: {
    owner: true
  },
  cooldown: 2000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const input = args[0] ? args[0].toLowerCase() : null;

    if (!input || (input !== 'on' && input !== 'off')) {
      const current = mediaConfig.get('menuAudio') ? 'ON' : 'OFF';
      return await m.reply(`⚠️ *Usage:* \`${p}setmenuaudio on/off\`\n\n_Current setting:_ *${current}*`);
    }

    const value = input === 'on';
    mediaConfig.set('menuAudio', value);

    await m.reply(`✅ *Menu audio playback is now turned ${value ? 'ON 🔊' : 'OFF 🔇'}*`);
  }
};
