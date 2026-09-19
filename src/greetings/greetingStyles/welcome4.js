import { greetingBuilder } from '../greetingBuilder.js';
import { greetingConfig } from '../greetingConfig.js';

/**
 * Style 4 — Minimal.
 *
 * One short text line with a plain @mention. No image, no externalAdReply
 * banner, no fake PDF — the anti-spam default. Users complained the banner
 * styles read like promo-bot spam; this is the clean option.
 */
export const welcome4 = {
  id: 4,
  name: 'Minimal',

  async render({ userJid, variables, isWelcome }) {
    const textTemplate = isWelcome
      ? greetingConfig.getWelcomeText()
      : greetingConfig.getGoodbyeText();
    const caption = greetingBuilder.buildText(textTemplate, variables);

    return {
      text: caption,
      mentions: [userJid],
    };
  },
};

export default welcome4;
