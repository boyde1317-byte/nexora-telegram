/**
 * profile.js — User profile card.
 *
 * One cute, single-message card: profile picture (if any) carrying a soft
 * formatted caption. No tables, no follow-up messages — just one look.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getLevelProgress, progressBar, rankInfo, streakEmoji } from '../../economy/leveling.js';
import { resolveDisplayIdentity } from '../../lib/identity.js';

/** Format a phone number in readable chunks: 233533416608 → +233 533 416 608 */
function prettyNumber(num) {
  const d = String(num).replace(/\D/g, '');
  const chunks = [];
  for (let i = d.length; i > 0; i -= 3) chunks.unshift(d.slice(Math.max(0, i - 3), i));
  return chunks.join(' ');
}

/** Build the cute profile caption. */
export function profileCard({ label, number, username, d, isSelf }) {
  const progress = getLevelProgress(d.xp ?? 0);
  const level    = progress.level;
  const badge    = rankInfo(level).badge;
  const rankName = rankInfo(level).label;
  const fire     = streakEmoji(d.streak ?? 0);
  const span     = progress.nextLevelXp - progress.currentLevelXp;
  const bar      = '```' + progressBar(progress.xpIntoLevel, span, 14).replace(/ \d+%$/, '') + '```';
  const pct      = span > 0 ? Math.round((progress.xpIntoLevel / span) * 100) : 100;

  const lastDaily = d.lastDaily
    ? new Date(d.lastDaily).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'never ✨';

  const who = username
    ? `${number ? `*+${prettyNumber(number)}* ・ *@${username}*` : `*@${username}*`}`
    : number ? `*+${prettyNumber(number)}*` : '❓ _hidden account (LID)_';

  const lines = [
    isSelf ? '✧･ﾟ: *YOUR PROFILE* :･ﾟ✧' : '✧･ﾟ: *PROFILE* :･ﾟ✧',
    '',
    `👤 ${who}`,
    ...(d.title ? [`🏷️ _${d.title}_`] : []),
    `${badge} *${rankName}* ・ Level *${level}*`,
    '',
    `✨ ${d.xp ?? 0} XP`,
    `${bar}  ${pct}%`,
    `➜ ${(progress.xpToNextLevel ?? 0).toLocaleString()} XP to level up`,
    '',
    `🪙 *${(d.coins ?? 0).toLocaleString()}* coins ・ ${fire} *${d.streak ?? 0}*-day streak`,
    `📅 last claim: ${lastDaily}`,
  ];

  if (d.premium) lines.push('💎 _Premium — you sparkle extra_');
  if (d.warnings > 0) lines.push(`⚠️ ${d.warnings}/3 warnings`);
  if (d.banned) lines.push('🚫 _account banned_');

  lines.push('', '_·˚ ✦ NEXORA ✦ ˚·_');
  return lines.join('\n');
}

export default {
  name: 'profile',
  aliases: ['prof', 'rank', 'level', 'me'],
  category: 'economy',
  description: 'Shows your profile — level, XP, coins, streak and rank. Reply to someone or @ them to view theirs.',
  cooldown: 4000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';
    let targetJid = m.sender;

    if (m.quoted) {
      targetJid = m.quoted.sender;
    } else if (m.msg?.contextInfo?.mentionedJid?.length) {
      targetJid = m.msg.contextInfo.mentionedJid[0];
    }

    const isSelf = targetJid === m.sender;
    // LID-safe identity: real phone number + wa.me username, never raw JID/LID digits
    const { number, username } = await resolveDisplayIdentity(sock, targetJid);

    await withReactionStatus(m, async () => {
      const d = db.getUser(targetJid);
      const caption = profileCard({ label: '', number, username, d, isSelf });

      // Single message: profile picture with the card as caption (or plain text)
      let ppUrl = null;
      try { ppUrl = await sock.profilePictureUrl(targetJid, 'image'); } catch (_) {}

      if (ppUrl) {
        const res = await fetch(ppUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (res?.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          return await sock.sendMessage(m.from, { image: buffer, caption }, { quoted: m });
        }
      }

      return await m.reply(caption);
    });
  },
};
