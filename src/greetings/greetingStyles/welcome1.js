import { greetingBuilder } from '../greetingBuilder.js';
import { greetingConfig } from '../greetingConfig.js';

export const welcome1 = {
  id: 1,
  name: 'Image Greeting',

  async render({ sock, jid, userJid, variables, isWelcome }) {
    const textTemplate = isWelcome ? greetingConfig.getWelcomeText() : greetingConfig.getGoodbyeText();
    const caption = greetingBuilder.buildText(textTemplate, variables);

    const imageUrl = isWelcome ? greetingConfig.getWelcomeImage() : greetingConfig.getGoodbyeImage();

    // Context Info containing externalAdReply (banner style and profile pic overlay)
    // Uses the fork's originalImageUrl field for high-quality link preview rendering
    const contextInfo = {
      mentionedJid: [userJid],
      externalAdReply: {
        title: isWelcome ? 'New member joined' : 'Member left',
        body: isWelcome ? `Welcome ${variables.userNumber} to ${variables.groupName}!` : `Goodbye from ${variables.groupName}`,
        mediaType: 1,
        renderLargerThumbnail: false,
        originalImageUrl: imageUrl,
        sourceUrl: 'https://github.com/boyde1317-byte'
      }
    };

    // Use profile pic URL as thumbnail overlay if fetched successfully
    if (variables.profilePicUrl) {
      contextInfo.externalAdReply.thumbnailUrl = variables.profilePicUrl;
    } else {
      contextInfo.externalAdReply.thumbnailUrl = imageUrl;
    }

    const payload = {
      image: { url: imageUrl },
      caption: caption,
      mentions: [userJid],
      contextInfo
    };

    return payload;
  }
};

export default welcome1;
