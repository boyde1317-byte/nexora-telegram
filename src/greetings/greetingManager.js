import { greetingConfig } from './greetingConfig.js';
import { greetingRenderer } from './greetingRenderer.js';
import { messageFormatter } from '../ui/messageFormatter.js';
import { mentionLabel, resolveMentionJid } from '../lib/mentionJid.js';

export const greetingManager = {
  async handleJoin(sock, jid, userJid) {
    await greetingRenderer.renderAndSend({ sock, jid, userJid, isWelcome: true });

    if (!greetingRenderer._isGreetingEnabled(jid, true)) return;
    try {
      const metadata = await sock.groupMetadata(jid);
      const count = metadata.participants?.length ?? 0;
      if (count > 0 && (count % 50 === 0 || count === 10 || count === 100 || count === 500)) {
        const resolvedJid = await resolveMentionJid(sock, userJid, jid);
        const title = '🏆 GROUP MILESTONE REACHED';
        const text = `Congratulations to *${metadata.subject}*!\n\nWe have reached *${count}* members! 🎉\n\nWelcome our newest member ${mentionLabel(resolvedJid)} for completing this milestone!`;
        await sock.sendMessage(jid, { text: messageFormatter.info(text, title), mentions: [resolvedJid] });
      }
    } catch (err) {
      console.error('[GREETING MANAGER] Milestone check error:', err.message || err);
    }
  },

  async handleLeave(sock, jid, userJid) {
    await greetingRenderer.renderAndSend({ sock, jid, userJid, isWelcome: false });
  },

  async handlePromotion(sock, jid, userJids) {
    try {
      const metadata = await sock.groupMetadata(jid);
      const groupName = metadata.subject || 'this group';
      for (const userJid of userJids) {
        const resolvedJid = await resolveMentionJid(sock, userJid, jid);
        const text = `🌟 ${mentionLabel(resolvedJid)} has been promoted to *Group Admin* in *${groupName}*!\n\nShow them some respect and follow their guidelines!`;
        await sock.sendMessage(jid, { text: messageFormatter.info(text, 'PROMOTION ALERT'), mentions: [resolvedJid] });
      }
    } catch (err) {
      console.error('[GREETING MANAGER] Promotion handler error:', err.message || err);
    }
  },

  async handleDemotion(sock, jid, userJids) {
    try {
      const metadata = await sock.groupMetadata(jid);
      const groupName = metadata.subject || 'this group';
      for (const userJid of userJids) {
        const resolvedJid = await resolveMentionJid(sock, userJid, jid);
        const text = `⚠️ ${mentionLabel(resolvedJid)} is no longer a *Group Admin* in *${groupName}*.\n\nThey have returned to being a regular member.`;
        await sock.sendMessage(jid, { text: messageFormatter.info(text, 'DEMOTION NOTICE'), mentions: [resolvedJid] });
      }
    } catch (err) {
      console.error('[GREETING MANAGER] Demotion handler error:', err.message || err);
    }
  }
};

export default greetingManager;
