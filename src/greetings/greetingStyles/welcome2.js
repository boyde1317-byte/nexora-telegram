import { greetingBuilder } from '../greetingBuilder.js';
import { greetingConfig } from '../greetingConfig.js';

export const welcome2 = {
  id: 2,
  name: 'Document Card Greeting',

  async render({ sock, jid, userJid, variables, isWelcome }) {
    const textTemplate = isWelcome ? greetingConfig.getWelcomeText() : greetingConfig.getGoodbyeText();
    const caption = greetingBuilder.buildText(textTemplate, variables);

    const imageUrl = isWelcome ? greetingConfig.getWelcomeImage() : greetingConfig.getGoodbyeImage();
    const thumbnailPic = variables.profilePicUrl || imageUrl;

    const payload = {
      document: { url: imageUrl },
      mimetype: 'application/pdf',
      fileName: isWelcome ? 'Welcome.pdf' : 'Goodbye.pdf',
      caption: caption,
      mentions: [userJid],
      contextInfo: {
        mentionedJid: [userJid],
        externalAdReply: {
          title: isWelcome ? 'Welcome' : 'Farewell',
          body: variables.groupName,
          mediaType: 1,
          thumbnailUrl: thumbnailPic,
          originalImageUrl: imageUrl,
          renderLargerThumbnail: false,
          sourceUrl: 'https://github.com/boyde1317-byte'
        }
      }
    };

    return payload;
  }
};

export default welcome2;
