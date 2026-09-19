import { greetingConfig } from './greetingConfig.js';
import { greetingRenderer } from './greetingRenderer.js';
import { messageFormatter } from '../ui/messageFormatter.js';

export const greetingManager = {
  /**
   * Handle user joined
   */
  async handleJoin(sock, jid, userJid) {
    await greetingRenderer.renderAndSend({ sock, jid, userJid, isWelcome: true });

    // Celebrate membership milestones (10, 50, 100, 500 …)
    try {
      const metadata = await sock.groupMetadata(jid);
      const count    = metadata.participants?.length ?? 0;

      if (count > 0 && (count % 50 === 0 || count === 10 || count === 100 || count === 500)) {
        const title = `🏆 GROUP MILESTONE REACHED`;
        const text  = `Congratulations to *${metadata.subject}*!\n\nWe have reached *${count}* members! 🎉\n\nWelcome our newest member @${userJid.split('@')[0]} for completing this milestone!`;

        await sock.sendMessage(jid, {
          text: messageFormatter.info(text, title),
          mentions: [userJid]
        });
      }
    } catch (err) {
      // Milestone check is non-critical — log and continue
      console.error('[GREETING MANAGER] Milestone check error:', err.message || err);
    }
  },

  /**
   * Handle user left
   */
  async handleLeave(sock, jid, userJid) {
    await greetingRenderer.renderAndSend({ sock, jid, userJid, isWelcome: false });
  },

  /**
   * Handle admin promotions
   */
  async handlePromotion(sock, jid, userJids) {
    try {
      const metadata  = await sock.groupMetadata(jid);
      const groupName = metadata.subject || 'this group';

      for (const userJid of userJids) {
        const userNumber = userJid.split('@')[0];
        const text = `🌟 @${userNumber} has been promoted to *Group Admin* in *${groupName}*!\n\nShow them some respect and follow their guidelines!`;

        await sock.sendMessage(jid, {
          text: messageFormatter.info(text, 'PROMOTION ALERT'),
          mentions: [userJid]
        });
      }
    } catch (err) {
      console.error('[GREETING MANAGER] Promotion handler error:', err.message || err);
    }
  },

  /**
   * Handle admin demotions
   */
  async handleDemotion(sock, jid, userJids) {
    try {
      const metadata  = await sock.groupMetadata(jid);
      const groupName = metadata.subject || 'this group';

      for (const userJid of userJids) {
        const userNumber = userJid.split('@')[0];
        const text = `⚠️ @${userNumber} is no longer a *Group Admin* in *${groupName}*.\n\nThey have returned to being a regular member.`;

        await sock.sendMessage(jid, {
          text: messageFormatter.info(text, 'DEMOTION NOTICE'),
          mentions: [userJid]
        });
      }
    } catch (err) {
      console.error('[GREETING MANAGER] Demotion handler error:', err.message || err);
    }
  }
};

export default greetingManager;
