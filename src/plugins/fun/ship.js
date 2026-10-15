/**
 * @file src/plugins/fun/ship.js
 * .ship @a [@b] — deterministic compatibility meter with a rendered
 * PNG ship card (two avatars + the % + verdict). Same pair always
 * ships the same number — that's the fun.
 */

import { db } from '../../database/db.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { renderShipCard } from '../../lib/cardEngine.js';
import { getDisplayName } from '../../lib/displayName.js';

const VERDICTS = [
  { min: 95, line: '💍 *SOULMATES. Book the venue.*' },
  { min: 85, line: '🔥 Certified power couple energy.' },
  { min: 70, line: '💕 There\'s something here. Don\'t waste it.' },
  { min: 55, line: '🙂 It could work. With effort. A lot of it.' },
  { min: 40, line: '🤝 Great friends. Terrible romance.' },
  { min: 25, line: '😬 It\'s giving "workplace acquaintances".' },
  { min: 10, line: '🧊 You two would argue over air.' },
  { min: 0,  line: '💀 Do NOT. Even the algorithm is begging you.' },
];

/** Stable 0-99 from the sorted pair — order-insensitive. */
function shipPercent(a, b) {
  const key = [a, b].sort().join('::');
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

const verdictFor = (pct) => VERDICTS.find(v => pct >= v.min).line;

export default {
  name: 'ship',
  aliases: ['compatibility', 'lovecalc'],
  category: 'fun',
  description: 'Ship two people (.ship @a @b) or yourself with someone (.ship @user). Same pair, same fate.',
  cooldown: 6000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const mentioned = (m.msg?.contextInfo?.mentionedJid ?? []).filter(Boolean);
        let a = m.sender, b = null;
        if (mentioned.length >= 2) [a, b] = [mentioned[0], mentioned[1]];
        else if (mentioned.length === 1) b = mentioned[0];
        else {
          // quoted message as fallback target
          const quotedSender = m.quoted?.sender || m.msg?.contextInfo?.participant;
          if (quotedSender) b = quotedSender;
        }
        if (!b) return await m.reply.warn(`Tag who to ship: *${p}ship @crush* or *${p}ship @a @b*`, 'SHIP');
        if (a === b) return await m.reply.warn('Shipping yourself with yourself... 100% obviously. Try tagging someone else. 💀', 'SHIP');

        const pct = shipPercent(a, b);
        const verdict = verdictFor(pct);

        const [nameA, nameB, avA, avB] = await Promise.all([
          getDisplayName(sock, a).catch(() => 'A'),
          getDisplayName(sock, b).catch(() => 'B'),
          sock.profilePictureUrl(a, 'image').catch(() => null),
          sock.profilePictureUrl(b, 'image').catch(() => null),
        ]);

        // try the rendered card first
        try {
          const card = await renderShipCard({
            nameA, nameB, avatarUrlA: avA, avatarUrlB: avB,
            percent: pct, verdict: verdict.replace(/\*/g, '').slice(0, 42),
          });
          await sock.sendMessage(m.from, {
            image: card,
            caption: `💖 *SHIP METER*\n\n${nameA} 💕 ${nameB}\n\n*${pct}%* — ${verdict}`,
            mentions: [a, b],
          }, { quoted: m });
        } catch (err) {
          console.warn('[ship] card render failed, text fallback:', err.message);
          await m.reply(
            `💖 *SHIP METER*\n\n` +
            `@${a.split('@')[0]} 💕 @${b.split('@')[0]}\n\n` +
            `*${pct}%* — ${verdict}`,
            { mentions: [a, b] }
          );
        }

        // the shipped duo earns a tiny XP treat — participation dopamine
        if (Math.random() < 0.5) {
          try { commitAction(b, { coinsDelta: 5, xp: 3 }); } catch { /* never break the fun */ }
        }
      } catch (e) {
        await m.reply.error(`Ship error: ${e.message}`);
      }
    });
  },
};
