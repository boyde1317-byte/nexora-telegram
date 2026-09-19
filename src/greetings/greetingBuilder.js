import { config } from '../../config/index.js';

export const greetingBuilder = {
  /**
   * Expands template placeholders with live parameters.
   */
  buildText(template, variables) {
    if (!template) return '';
    let text = template;
    const now = new Date();

    const replacements = {
      '{user}': variables.userMention || `@${variables.userNumber}`,
      '{group}': variables.groupName || 'the group',
      '{memberCount}': variables.memberCount || '1',
      '{date}': now.toLocaleDateString(),
      '{time}': now.toLocaleTimeString(),
      '{botName}': config.botName || 'NEXORA'
    };

    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(key, value);
    }

    return text;
  }
};

export default greetingBuilder;
