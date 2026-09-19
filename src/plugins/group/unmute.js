import { actionCard } from '../../lib/interactiveKit.js';

export default {
  name: 'unmute',
  aliases: ['opengroup'],
  category: 'group',
  description: 'Unmutes the group so all participants can send messages.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    try {
      await sock.groupSettingUpdate(m.from, 'not_announcement');
      try {
        await actionCard(sock, m.from, {
          text:   '🔔 Group unmuted. All participants can send messages now.',
          footer: 'Tap below to re-mute',
        }, [
          { label: '🔇 Mute Group', cmd: `${p}mute` },
        ], { quoted: m });
      } catch (_) {
        await m.reply.success('Group unmuted. All participants can send messages now.');
      }
    } catch (err) {
      await m.reply.error(`Failed to unmute group: ${err.message}`);
    }
  }
};
