import { actionCard } from '../../lib/interactiveKit.js';

export default {
  name: 'mute',
  aliases: ['closegroup'],
  category: 'group',
  description: 'Mutes the group so only admins can send messages.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    try {
      await sock.groupSettingUpdate(m.from, 'announcement');
      try {
        await actionCard(sock, m.from, {
          text:   '🔇 Group muted. Only admins can talk now. Silence is golden. 🤫',
          footer: 'NEXORA • Muted',
        }, [
          { label: '🔔 Unmute Group', cmd: `${p}unmute` },
        ], { quoted: m });
      } catch (_) {
        await m.reply.success('🔇 Group muted. Only admins can send messages now.');
      }
    } catch (err) {
      await m.reply.error(`Failed to mute group: ${err.message}`);
    }
  }
};
