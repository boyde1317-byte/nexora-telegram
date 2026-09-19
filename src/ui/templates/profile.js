import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../asciiBuilder.js';

/**
 * Enhanced user profile template.
 * Builds a visually striking profile card with stat rows and badges.
 */
export const profileTemplate = (profileData) => {
  const lines = [];

  // ── User Identity ──────────────────────────────────────────────────
  lines.push(asciiBuilder.statRow('Name', profileData.name || 'Unknown User', '\u{1F464}'));
  lines.push(asciiBuilder.statRow('Number', `@${profileData.jid?.split('@')[0] || 'N/A'}`, '\u{1F4F1}'));
  lines.push(asciiBuilder.statRow('Status', profileData.status || 'Active Member', '\u{1F3C5}'));
  lines.push(asciiBuilder.statRow('Registered', profileData.registeredDate || 'Today', '\u{1F4C5}'));

  // ── Economy Badges ─────────────────────────────────────────────────
  lines.push('');
  if (profileData.premium) {
    lines.push(asciiBuilder.badge('Tier', 'PREMIUM'));
  } else {
    lines.push(asciiBuilder.badge('Tier', 'STANDARD'));
  }
  if (profileData.balance !== undefined) {
    lines.push(asciiBuilder.badge('Balance', `${profileData.balance} coins`));
  }
  if (profileData.level !== undefined) {
    lines.push(asciiBuilder.badge('Level', profileData.level));
  }

  return asciiBuilder.panel('User Profile', lines, { accent: '\u2706' });
};

export default profileTemplate;
