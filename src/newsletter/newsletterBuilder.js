import capabilities from '../core/capabilities.js';
import { baileysBridge } from '../core/baileysBridge.js';

export const newsletterBuilder = {
  validate() {
    return capabilities.newsletter?.adminInviteMessage || false;
  },

  build(data) {
    const defaultJid = data.newsletterJid || '120363200000000000@newsletter';
    const name = data.name || 'NEXORA MD Updates';
    const caption = data.caption || 'Join the official Nexora MD channel for next-gen updates!';
    const expiration = data.inviteExpiration || Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days default
    
    // Convert jpegThumbnail if provided as string/base64 to Buffer
    let thumbnail = null;
    if (data.thumbnail) {
      if (Buffer.isBuffer(data.thumbnail)) {
        thumbnail = data.thumbnail;
      } else if (typeof data.thumbnail === 'string') {
        thumbnail = Buffer.from(data.thumbnail.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      }
    }

    // Advanced context info with forwardedNewsletterMessageInfo if supported
    const contextInfo = data.contextInfo || {};
    if (data.forwardingEnabled) {
      contextInfo.forwardedNewsletterMessageInfo = {
        newsletterJid: defaultJid,
        serverMessageId: 1,
        newsletterName: name,
        contentType: 1, // UPDATE
        accessibilityText: name
      };
      contextInfo.isForwarded = true;
    }

    return {
      newsletterAdminInviteMessage: {
        newsletterJid: defaultJid,
        newsletterName: name,
        jpegThumbnail: thumbnail,
        caption: caption,
        inviteExpiration: String(expiration), // protobuf int64 can be passed as String
        contextInfo: contextInfo
      }
    };
  },

  buildFollower(data) {
    const defaultJid = data.newsletterJid || '120363200000000000@newsletter';
    const name = data.name || 'NEXORA MD Updates';
    const caption = data.caption || 'Follow Nexora MD on WhatsApp Channels!';

    let thumbnail = null;
    if (data.thumbnail) {
      if (Buffer.isBuffer(data.thumbnail)) {
        thumbnail = data.thumbnail;
      } else if (typeof data.thumbnail === 'string') {
        thumbnail = Buffer.from(data.thumbnail.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      }
    }

    return {
      newsletterFollowerInviteMessage: {
        newsletterJid: defaultJid,
        newsletterName: name,
        jpegThumbnail: thumbnail,
        caption: caption,
        contextInfo: data.contextInfo || {}
      }
    };
  },

  fallback: async (sock, jid, data, options = {}) => {
    console.log('[UI ENGINE] Newsletter Invite unsupported. Falling back to ExternalAdReply channel preview...');
    
    const inviteLink = `https://whatsapp.com/channel/${(data.newsletterJid || '').split('@')[0]}`;
    
    // Fallback to ExternalAdReply
    const externalAdReply = {
      title: data.name || 'NEXORA MD Updates',
      body: data.caption || 'Official updates from Nexora Core',
      mediaType: 1, // IMAGE
      previewType: 'PHOTO',
      thumbnailUrl: data.thumbnailUrl || 'https://raw.githubusercontent.com/Aizen/Nexora-Assets/main/logo.png',
      sourceUrl: inviteLink
    };

    const text = `📢 *${data.name || 'NEXORA MD UPDATES'}*\n\n` +
                 `${data.caption || 'Join the official Nexora MD channel for next-gen updates!'}\n\n` +
                 `🔗 *Join Channel:* ${inviteLink}`;

    return await sock.sendMessage(jid, {
      text: text,
      contextInfo: {
        externalAdReply: externalAdReply
      }
    }, options);
  }
};

export default newsletterBuilder;
