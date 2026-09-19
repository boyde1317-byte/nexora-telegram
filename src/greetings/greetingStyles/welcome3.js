import { greetingBuilder } from '../greetingBuilder.js';
import { greetingConfig } from '../greetingConfig.js';

export const welcome3 = {
  id: 3,
  name: 'Interactive Greeting',

  async render({ sock, jid, userJid, variables, isWelcome }) {
    const textTemplate = isWelcome ? greetingConfig.getWelcomeText() : greetingConfig.getGoodbyeText();
    const caption = greetingBuilder.buildText(textTemplate, variables);

    const imageUrl = isWelcome ? greetingConfig.getWelcomeImage() : greetingConfig.getGoodbyeImage();
    const thumbnailPic = variables.profilePicUrl || imageUrl;

    const payload = {
      text: caption,
      mentions: [userJid],
      contextInfo: {
        mentionedJid: [userJid],
        externalAdReply: {
          title: isWelcome ? `Welcome to ${variables.groupName}` : `A member left ${variables.groupName}`,
          body: 'NEXORA-MD',
          mediaType: 1,
          renderLargerThumbnail: false,
          thumbnailUrl: thumbnailPic,
          originalImageUrl: imageUrl,
          sourceUrl: 'https://github.com/boyde1317-byte'
        }
      }
    };

    return payload;
  }
};

export default welcome3;
