import { profileTemplate } from './templates/profile.js';
import { systemTemplate } from './templates/system.js';
import { getRandomResponse } from '../nexora-messages.js';
import { toSmallcaps } from '../lib/smallcaps.js';

/**
 * Message formatter — wraps user-facing text in the NEXORA persona.
 *
 * Each method maps to a message severity/type and applies the appropriate
 * accent symbol + tone. Short messages delegate to nexora-messages.js for
 * randomized variety; longer messages get a prefix + the original text.
 */
export const messageFormatter = {
  success(message) {
    if (!message) return getRandomResponse('success');
    const trimmed = message.trim();
    if (trimmed === 'Done.' || trimmed === 'Success.' || trimmed === 'Command executed.') {
      return getRandomResponse('success');
    }
    return `✦ ${message}`;
  },

  error(message) {
    if (!message) return getRandomResponse('error');
    const trimmed = message.trim();
    if (trimmed === 'Error.' || trimmed === 'Failed.') {
      return getRandomResponse('error');
    }
    const clean = message.replace(/^(❌ Error: |❌ |Error: )/i, '');
    return `⨯ ${clean}`;
  },

  warn(message) {
    if (!message) return getRandomResponse('warning');
    return `⚆ ${message}`;
  },

  info(message, title = '') {
    if (!message) return '';
    const formattedTitle = title && title !== 'INFO' && title !== 'PROCESSING'
      ? `*${toSmallcaps(title)}*\n`
      : '';
    return `☕ ${formattedTitle}${message}`;
  },

  loading(message = 'Processing...') {
    if (message === 'Downloading media...' || message === 'Processing...') {
      return getRandomResponse('loading');
    }
    return `∘ ${message}`;
  },

  profile(profileData) {
    return profileTemplate(profileData);
  },

  system(systemData) {
    return systemTemplate(systemData);
  },
};

export default messageFormatter;
