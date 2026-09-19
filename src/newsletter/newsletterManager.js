import { newsletterBuilder } from './newsletterBuilder.js';
import { baileysBridge } from '../core/baileysBridge.js';
import brand from '../../config/brand.js';
import db from '../database/db.js';

export const newsletterManager = {
  getDefaultChannel() {
    // Check if stored in database settings
    const defaultJid = db.data?.settings?.defaultChannel;
    return defaultJid || '120363200000000000@newsletter';
  },

  setDefaultChannel(jid) {
    if (!db.data.settings) {
      db.data.settings = {};
    }
    db.data.settings.defaultChannel = jid;
    db.save();
    return true;
  },

  async sendNewsletterInvite(sock, jid, options = {}, extraOptions = {}) {
    const newsletterJid = options.newsletterJid || this.getDefaultChannel();
    const name = options.name || `${brand.name} Updates`;
    const caption = options.caption || `Official updates from ${brand.name}\n${brand.signature}`;
    const thumbnail = options.thumbnail || null;
    const forwardingEnabled = options.forwardingEnabled !== false;

    const data = {
      newsletterJid,
      name,
      caption,
      thumbnail,
      forwardingEnabled,
      contextInfo: options.contextInfo || {}
    };

    if (newsletterBuilder.validate()) {
      const payload = newsletterBuilder.build(data);
      // Use relayMessage or standard sendMessage
      return await baileysBridge.relayMessage(sock, jid, payload, extraOptions);
    } else {
      // Graceful fallback to ExternalAdReply preview or text link
      return await newsletterBuilder.fallback(sock, jid, data, extraOptions);
    }
  },

  async sendFollowerInvite(sock, jid, options = {}, extraOptions = {}) {
    const newsletterJid = options.newsletterJid || this.getDefaultChannel();
    const name = options.name || `${brand.name} Channel`;
    const caption = options.caption || `Follow our official channel for latest updates!`;
    const thumbnail = options.thumbnail || null;

    const data = {
      newsletterJid,
      name,
      caption,
      thumbnail,
      contextInfo: options.contextInfo || {}
    };

    // If follower invite is supported
    if (newsletterBuilder.validate()) {
      const payload = newsletterBuilder.buildFollower(data);
      return await baileysBridge.relayMessage(sock, jid, payload, extraOptions);
    } else {
      return await newsletterBuilder.fallback(sock, jid, data, extraOptions);
    }
  }
};

export default newsletterManager;
