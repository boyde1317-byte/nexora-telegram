/**
 * antiword.js — banned-words protection for a group.
 *
 * Subcommands:
 *   .antiword                     → selectMenu picker
 *   .antiword on/off/status       → toggle enforcement
 *   .antiword add <word>          → ban a word
 *   .antiword remove <word>       → unban a word
 *   .antiword list                → show banned words
 *
 * Enforcement lives in handlers/message.js: non-admin messages containing a
 * banned word (word-boundary match, case-insensitive) are deleted and struck
 * (shared 3-strike counter — see lib/antiGuard.js).
 */
import { selectMenu, actionCardWithAd, richTableCard } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

const getWords = (groupData) =>
  (Array.isArray(groupData.antiword?.words) ? groupData.antiword.words : []);

export default {
  name: 'antiword',
  aliases: ['badword', 'banword'],
  category: 'group',
  description: 'Banned-words protection. Usage: .antiword add <word> | remove <word> | list | on | off',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData  = db.getGroup(m.from);
    const sub        = args[0]?.toLowerCase();

    // ── add / remove <word> ────────────────────────────────────────────────
    if (sub === 'add' || sub === 'remove') {
      const word = args.slice(1).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!word) {
        return await m.reply.warn(`Usage: \`${p}antiword ${sub} <word>\``);
      }
      const words    = getWords(groupData);
      const exists    = words.includes(word);
      const nextWords = sub === 'add'
        ? (exists ? words : [...words, word])
        : words.filter((w) => w !== word);

      if (sub === 'add' && exists) {
        return await m.reply.warn(`"${word}" is already banned in this group.`);
      }
      if (sub === 'remove' && !exists) {
        return await m.reply.warn(`"${word}" is not on the banned list.`);
      }

      const on = groupData.antiword?.on ?? false;
      db.setGroup(m.from, { antiword: { on, words: nextWords } });

      const resultText = sub === 'add'
        ? `🔒 *"${word}" is now BANNED*\n\nNon-admins sending it will be deleted and warned. 3 warnings = removal.`
        : `🔓 *"${word}" is now ALLOWED*\n\nIt has been removed from the banned list.`;

      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `${resultText}\n\n_Banned words: ${nextWords.length}_`,
        footer: `${on ? 'Protection is ON' : '⚠️ Protection is OFF — turn it on with ' + p + 'antiword on'}`,
      }, [
        { label: on ? 'Disable Protection' : 'Enable Protection', cmd: `${p}antiword ${on ? 'off' : 'on'}` },
        { label: 'View Banned Words',                                cmd: `${p}antiword list` },
      ], { title: 'ANTI-WORD', body: sub === 'add' ? 'Word banned' : 'Word allowed', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const words = getWords(groupData);
      if (!words.length) {
        return await m.reply.info(`No banned words yet. Add one with \`${p}antiword add <word>\`.`);
      }
      return await richTableCard(sock, m.from, {
        title: '🚫 BANNED WORDS',
        headers: ['#', 'Word'],
        rows: words.map((w, i) => [String(i + 1), w]),
        footer: groupData.antiword?.on ? 'Protection is ON' : 'Protection is OFF',
      }, { quoted: m });
    }

    // ── picker / status / on / off ──────────────────────────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const on    = groupData.antiword?.on ? '✅ ON' : '❌ OFF';
      const words = getWords(groupData);
      return await selectMenu(sock, m.from, {
        text: `🛡️ *ANTI-WORD PROTECTION*\n\nStatus: *${on}*\nBanned words: *${words.length}*\n\nSelect an action from the list below:`,
        footer: 'Deletes banned words from non-admins',
      }, `⚙️ Anti-Word Settings (${on})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antiword on`,     title: '✅ Enable Protection',  description: 'Delete messages containing banned words' },
          { id: `${p}antiword off`,    title: '❌ Disable Protection', description: 'Banned words will be allowed through' },
          { id: `${p}antiword status`, title: '📊 Check Status',       description: 'Show current protection state' },
          { id: `${p}antiword list`,   title: '📜 Banned Words',      description: 'View the banned word list' },
        ]},
        { title: 'Manage Words', rows: [
          { id: `${p}antiword add `,   title: '➕ Add a Word',        description: `Use: ${p}antiword add <word>` },
          { id: `${p}antiword remove `, title: '➖ Remove a Word',     description: `Use: ${p}antiword remove <word>` },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const on    = groupData.antiword?.on;
      const words = getWords(groupData);
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `🛡️ *ANTI-WORD STATUS*\n\nProtection: *${on ? '✅ Enabled' : '❌ Disabled'}*\nBanned words: *${words.length}*`,
        footer: on ? 'Banned words are being deleted.' : 'No enforcement in place.',
      }, [
        { label: on ? 'Disable Now' : 'Enable Now', cmd: `${p}antiword ${on ? 'off' : 'on'}` },
        { label: 'Banned Words',                          cmd: `${p}antiword list` },
      ], { title: 'ANTI-WORD', body: on ? 'Enabled' : 'Disabled', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable  = sub === 'on';
    const words   = getWords(groupData);
    db.setGroup(m.from, { antiword: { on: enable, words } });

    const resultText = enable
      ? `🔒 *Anti-word protection ENABLED*\n\nMessages from non-admins containing any of the ${words.length} banned words will be deleted. 3 warnings = removal.${!words.length ? `\n\n⚠️ _No words banned yet — add some with \`${p}antiword add <word>\`._` : ''}`
      : '🔓 *Anti-word protection DISABLED*\n\nBanned words are stored but no longer enforced.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antiword ${enable ? 'off' : 'on'}` },
      { label: 'Banned Words',                          cmd: `${p}antiword list` },
    ], { title: 'ANTI-WORD', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
