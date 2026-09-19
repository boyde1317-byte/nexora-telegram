import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'save',
  aliases: [],
  category: 'media',
  description: 'Downloads and returns media from a replied message, effectively bypassing View Once limits.',
  cooldown: 5000,
  execute: async ({ sock, m }) => {
    if (!m.quoted) {
      return await m.reply.error('Please reply to a media message (image, video, audio, sticker, document, or view once) to extract it.');
    }

    const qType = m.quoted.type;
    const isViewOnce = qType === 'viewOnceMessage' || qType === 'viewOnceMessageV2' || 
                       m.quoted.message?.viewOnceMessage || m.quoted.message?.viewOnceMessageV2;
    
    const isMedia = [
      'imageMessage', 'videoMessage', 'audioMessage', 
      'stickerMessage', 'documentMessage'
    ].includes(qType) || isViewOnce;

    if (!isMedia) {
      return await m.reply.error('The replied message does not contain extractable media.');
    }

    await withReactionStatus(m, async () => {
      // Download the media using the helper
      const buffer = await m.quoted.download();
      if (!buffer) {
        return await m.reply.error('Media download failed. The file may no longer exist on WhatsApp servers.');
      }

      let payload = {};
      
      // Determine real media type (handling standard or viewOnce envelopes)
      let actualType = qType;
      let actualMsg = m.quoted.msg;

      if (isViewOnce) {
        const innerMsg = m.quoted.message?.viewOnceMessage?.message || m.quoted.message?.viewOnceMessageV2?.message;
        if (innerMsg) {
          if (innerMsg.imageMessage) {
            actualType = 'imageMessage';
            actualMsg = innerMsg.imageMessage;
          } else if (innerMsg.videoMessage) {
            actualType = 'videoMessage';
            actualMsg = innerMsg.videoMessage;
          }
        }
      }

      if (actualType === 'imageMessage') {
        payload = { image: buffer, caption: '✅ *View Once Bypassed successfully!*' };
      } else if (actualType === 'videoMessage') {
        payload = { video: buffer, caption: '✅ *View Once Bypassed successfully!*' };
      } else if (actualType === 'audioMessage') {
        payload = { audio: buffer, mimetype: actualMsg?.mimetype || 'audio/mp4', ptt: actualMsg?.ptt || false };
      } else if (actualType === 'stickerMessage') {
        payload = { sticker: buffer };
      } else {
        payload = { 
          document: buffer, 
          mimetype: actualMsg?.mimetype || 'application/octet-stream', 
          fileName: actualMsg?.fileName || 'downloaded_file' 
        };
      }

      await sock.sendMessage(m.from, payload, { quoted: m });
    }).catch(async (err) => {
      console.error('Download command failed:', err);
      await m.reply.error(`Failed to extract media: ${err.message}`);
    });
  }
};
