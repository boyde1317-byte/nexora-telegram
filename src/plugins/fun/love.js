import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';

function stablePercent(a, b) {
  const key = [a, b].sort().join('|');
  let hash = 0;
  for (const ch of key) hash = (Math.imul(31, hash) + ch.charCodeAt(0)) >>> 0;
  return hash % 101;
}

function heartBar(pct, len = 10) {
  const filled = Math.round((pct / 100) * len);
  return '❤️'.repeat(filled) + '🖤'.repeat(len - filled);
}

function verdict(pct) {
  if (pct >= 95) return '💍 Marry already! This is destiny!';
  if (pct >= 80) return '😍 True love! A perfect match!';
  if (pct >= 65) return '💕 Great chemistry — keep it up!';
  if (pct >= 50) return '🙂 Pretty good — give it a chance!';
  if (pct >= 35) return '😬 It could work with effort…';
  if (pct >= 20) return '😅 Tough road ahead, but not impossible.';
  return '💔 Not looking great — opposites rarely attract here.';
}

export default {
  name: 'love',
  aliases: ['ship', 'lovemeter', 'compatibility', 'match'],
  category: 'fun',
  description: 'Checks love compatibility between two names or two mentions. Results are consistent for the same pair.',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    await withReactionStatus(m, async () => {
      const mentions = m.msg?.contextInfo?.mentionedJid ?? [];
      let nameA, nameB;

      if (mentions.length >= 2) {
        nameA = '+' + mentions[0].split('@')[0].split(':')[0];
        nameB = '+' + mentions[1].split('@')[0].split(':')[0];
      } else if (mentions.length === 1) {
        nameA = '+' + m.sender.split('@')[0].split(':')[0];
        nameB = '+' + mentions[0].split('@')[0].split(':')[0];
      } else {
        const raw = args.join(' ');
        const parts = raw.split(/[&+|,]/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          [nameA, nameB] = parts;
        } else if (parts.length === 1) {
          nameA = '+' + m.sender.split('@')[0].split(':')[0];
          nameB = parts[0];
        } else {
          return await m.reply.info(
            `Usage:\n• \`${prefix}love @person1 @person2\`\n• \`${prefix}love Name1 & Name2\`\n• \`${prefix}love @someone\` (compares with you)`,
            'LOVE METER'
          );
        }
      }

      const pct = stablePercent(nameA.toLowerCase(), nameB.toLowerCase());
      const bar = heartBar(pct);

      const text = `✦ *LOVE METER* ✦\n\n👤 ${nameA}\n💞  &\n👤 ${nameB}\n\n${bar}\n\n💯 Compatibility: *${pct}%*\n\n${verdict(pct)}`;

      await mixedCard(sock, m.from, {
        text,
        footer: 'NEXORA • Love Calc 💕'
      }, [
        { kind: 'action', label: '🔄 Test Another', cmd: `${prefix}love` }
      ], { quoted: m, mentions: [...mentions] });
    });
  }
};
