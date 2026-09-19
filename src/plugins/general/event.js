/**
 * event.js — Create a WhatsApp native event card.
 *
 * Fixed: broken template literal in selectMenu text (backticks inside
 *   single quotes — ${p} was never interpolated).
 * Fixed: hardcoded '!event' in footer example → uses ${p}.
 * Fixed: wrong relative import path ('../lib' → '../../lib').
 */
import { actionCardWithAd, selectMenu } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'event',
  aliases: ['createevent', 'meet'],
  category: 'general',
  description: 'Generates a WhatsApp native event card in the chat.',
  cooldown: 4000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const input = args.join(' ');
    if (!input || !input.includes('|')) {
      try {
        return await selectMenu(sock, m.from, {
          text:   `📅 *CREATE EVENT*\n\nFormat: \`${p}event Title | Description | MinutesFromNow | Link\``,
          footer: `Example: ${p}event Team Meeting | Sprint review | 60 | https://call.whatsapp.com/...`,
        }, '📋 Quick Templates', [
          { title: 'Common Meetings', rows: [
            { id: `${p}event Team Standup | Daily standup | 30 | https://call.whatsapp.com/video/ai-studio`,   title: '☀️ 30-min Standup',   description: 'Daily team standup in 30 min' },
            { id: `${p}event Team Sync | Weekly sync | 60 | https://call.whatsapp.com/video/ai-studio`,        title: '📋 1-hour Sync',       description: 'Weekly team sync in 1 hour' },
            { id: `${p}event Community Call | Community update | 1440 | https://call.whatsapp.com/video/ai-studio`, title: '🌐 Tomorrow Community', description: 'Community call tomorrow' },
          ]},
        ], [], { quoted: m });
      } catch (_) {}
      return await m.reply.error(`Formatting error. Usage:\n\`${p}event Title | Description | MinutesFromNow | MeetingLink\``);
    }

    const parts         = input.split('|').map(s => s.trim());
    const name          = parts[0];
    const description   = parts[1] || 'No description provided';
    const minutesAhead  = parseInt(parts[2] || '30', 10);
    const joinLink      = parts[3] || 'https://call.whatsapp.com/video/ai-studio';
    const startTimeUnix = Math.floor(Date.now() / 1000) + (minutesAhead * 60);

    try {
      const { baileysBridge } = await import('../../core/baileysBridge.js');
      await baileysBridge.sendEvent(sock, m.from, {
        name,
        description,
        startTime:          startTimeUnix,
        joinLink,
      }, { quoted: m });

      const timeLabel = minutesAhead < 60
        ? `${minutesAhead} minute${minutesAhead !== 1 ? 's' : ''}`
        : `${Math.floor(minutesAhead / 60)}h ${minutesAhead % 60}m`;

      const thumbnailUrl = await getBrandThumbnail();
      await actionCardWithAd(sock, m.from, {
        text:   `✅ *Event created!*\n\n📅 *${name}*\n⏰ Starts in ${timeLabel}\n🔗 Join: ${joinLink}`,
        footer: 'NEXORA • Events',
      }, [
        { label: '📅 Create Another Event', cmd: `${p}event` },
        { label: '📋 Copy Join Link',       cmd: `${p}copylink` },
      ], {
        title: '📅 EVENT CREATED',
        body:  name,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
      }, { quoted: m });

    } catch (err) {
      await m.reply.error(`Failed to send event: ${err.message}`);
    }
  }
};
