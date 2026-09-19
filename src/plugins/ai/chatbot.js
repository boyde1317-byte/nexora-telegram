/**
 * chatbot.js — AI-powered auto-reply toggle.
 *
 * When enabled, the bot will automatically reply to non-command messages
 * using the AI text generator (Gemini). Per-group or per-DM toggle.
 *
 * Owner or group admin can enable/disable.
 */
import { db } from '../../database/db.js';
import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { toSmallcaps } from '../../lib/smallcaps.js';

export default {
  name: 'chatbot',
  aliases: ['autoreply', 'aireply'],
  category: 'ai',
  description: 'Toggle AI auto-reply for non-command messages. Usage: .chatbot on/off',
  cooldown: 3000,
  permissions: { owner: true, admin: true },
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';

    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error(
        'AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env to enable chatbot.'
      );
    }

    const arg = args[0]?.toLowerCase();
    const isGroup = m.isGroup;

    if (!arg || !['on', 'off', 'status'].includes(arg)) {
      const current = isGroup
        ? db.getGroup(m.from)?.chatbot
        : db.getUser(m.sender)?.chatbot;
      return await m.reply(
        asciiBuilder.box('Chatbot', [
          `AI auto-reply is currently: ${current ? '✅ ON' : '❌ OFF'}`,
          `Scope: ${isGroup ? 'This group' : 'Your DM'}`,
          ``,
          `Usage:`,
          `  \`${p}chatbot on\`  — Enable AI auto-reply`,
          `  \`${p}chatbot off\` — Disable AI auto-reply`,
          `  \`${p}chatbot status\` — Check current status`,
        ])
      );
    }

    if (arg === 'status') {
      const current = isGroup
        ? db.getGroup(m.from)?.chatbot
        : db.getUser(m.sender)?.chatbot;
      return await m.reply.info(
        `AI auto-reply is ${current ? '✅ enabled' : '❌ disabled'} for ${isGroup ? 'this group' : 'your DM'}.`,
        'Chatbot Status'
      );
    }

    const enabled = arg === 'on';

    if (isGroup) {
      db.setGroup(m.from, { chatbot: enabled });
    } else {
      db.setUser(m.sender, { chatbot: enabled });
    }

    return await m.reply.success(
      `AI auto-reply ${enabled ? '✅ enabled' : '❌ disabled'} for ${isGroup ? 'this group' : 'your DM'}.`
    );
  },
};
