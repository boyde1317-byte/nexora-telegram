/**
 * help.js — .help — the native command directory drill-down.
 *
 * Three views, all on device-proven primitives (selectMenu single_select +
 * mixedCard), all with plain-text fallbacks:
 *   .help                 → category picker (tap → .help <category>)
 *   .help <category>      → that category's commands (tap → .help <command>)
 *   .help <command>       → command detail card (description, aliases,
 *                           category, cooldown, copy-command button)
 *
 * The .menu commandDirectory style links here as its first hop, so the
 * whole menu → categories → commands → details chain is native and tappable.
 */

import { selectMenu, mixedCard } from '../../lib/interactiveKit.js';
import { sendListCard } from '../../lib/richContent.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import {
  buildCategoryIndex, matchCategory, resolveCommand,
  categoryEmoji, titleize,
} from '../../lib/commandDirectory.js';

export default {
  name: 'help',
  aliases: ['categories', 'modules'],
  category: 'general',
  description: 'Browse command categories. Usage: .help [category|command]',
  cooldown: 3000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const token = (args[0] || '').toLowerCase();
    const byCat = buildCategoryIndex();

    if (!byCat.size) {
      return await m.reply.error('No commands are loaded. Use .menu to check the bot state.');
    }

    // ── View 2: .help <category> → that category's command picker ──────
    const cat = matchCategory(token, byCat);
    if (cat) {
      const cmds = byCat.get(cat);
      try {
        const sent = await selectMenu(sock, m.from, {
          text: [
            `${categoryEmoji(cat)} *${toSmallcaps(titleize(cat))}* — *${cmds.length}* ${toSmallcaps('commands')}`,
            ``,
            `${toSmallcaps('Tap a command for its full detail page (usage, aliases, cooldown, copy button).')}`,
          ].join('\n'),
          title:    `✦ ${toSmallcaps(titleize(cat))} ✦`,
          subtitle: `${cmds.length} ${toSmallcaps('commands')}`,
          footer:   `${toSmallcaps('back')}: ${p}help • ${toSmallcaps('menu')}: ${p}menu`,
        }, `📂 ${toSmallcaps('Commands')}`, [
          {
            title: `${categoryEmoji(cat)} ${titleize(cat)} (${cmds.length})`,
            rows: cmds.slice(0, 25).map(c => ({
              id:    `${p}help ${c.name}`,
              title: c.name,
              description: String(c.description || '').slice(0, 60),
            })),
          },
        ], [
          { label: `⬅️ ${toSmallcaps('All Categories')}`, cmd: `${p}help` },
          { label: `📜 ${toSmallcaps('Full Menu')}`,      cmd: `${p}menu` },
        ], { quoted: m });
        if (sent) return;
      } catch (err) {
        console.warn('[help] category picker failed, text fallback:', err.message);
      }
      // Plain fallback
      return await m.reply.info(
        cmds.map(c => `▸ *${c.name}*${c.description ? `\n   ${c.description}` : ''}`).join('\n'),
        `NEXORA • ${titleize(cat)}`
      );
    }

    // ── View 3: .help <command> → detail card ──────────────────────────
    const cmd = token ? resolveCommand(token) : null;
    if (cmd) {
      const aliases = (cmd.aliases || []).length
        ? cmd.aliases.join(', ')
        : 'none';
      const cooldown = cmd.cooldown
        ? `${Math.round(cmd.cooldown / 1000)}s`
        : 'none';
      try {
        const sent = await mixedCard(sock, m.from, {
          text: [
            `⚡ *${cmd.name}*`,
            ``,
            cmd.description || 'No description provided.',
            ``,
            `📂 ${toSmallcaps('Category')}: *${cmd.category || 'other'}*`,
            `🏷️ ${toSmallcaps('Aliases')}: *${aliases}*`,
            `⏳ ${toSmallcaps('Cooldown')}: *${cooldown}*`,
            `🔖 ${toSmallcaps('Usage')}: *${p}${cmd.name}*`,
          ].join('\n'),
          footer: `${toSmallcaps('copy the command, paste it in chat and add your arguments')}`,
        }, [
          { kind: 'copy',   label: `📋 ${toSmallcaps('Copy Command')}`, value: `${p}${cmd.name} ` },
          { kind: 'action', label: `📂 ${toSmallcaps(cmd.category ? titleize(cmd.category) : 'Category')}`, cmd: `${p}help ${cmd.category || 'other'}` },
          { kind: 'action', label: `⬅️ ${toSmallcaps('All Categories')}`, cmd: `${p}help` },
        ], { quoted: m });
        if (sent) return;
      } catch (err) {
        console.warn('[help] detail card failed, text fallback:', err.message);
      }
      // Plain fallback
      return await m.reply.info(
        `⚡ *${cmd.name}*\n${cmd.description || ''}\n\n📂 Category: ${cmd.category || 'other'}\n🏷️ Aliases: ${aliases}\n⏳ Cooldown: ${cooldown}\n🔖 Usage: ${p}${cmd.name}`,
        `NEXORA • ${cmd.name}`
      );
    }

    if (token) {
      // Token matched neither a category nor a command
      return await m.reply.error(
        `No category or command called *${token}*. Try \`${p}help\` for the full directory.`
      );
    }

    // ── View 1: .help → category picker (rich) or list card (fallback) ─
    const rows = [...byCat.entries()].map(([c, cmds]) => ({
      id:    `${p}help ${c}`,
      title: `${categoryEmoji(c)} ${titleize(c)} (${cmds.length})`,
      description: cmds.slice(0, 4).map(x => x.name).join(', ') + (cmds.length > 4 ? ` … +${cmds.length - 4}` : ''),
    }));

    const totalCmds = [...byCat.values()].reduce((n, list) => n + list.length, 0);
    try {
      const sent = await selectMenu(sock, m.from, {
        text: [
          `✦ *${toSmallcaps('Command Categories')}* ✦`,
          ``,
          `${toSmallcaps('Every command is one tap away: category → command → detail page.')}`,
        ].join('\n'),
        title:    `✦ ${toSmallcaps('NEXORA-MD')} ✦`,
        subtitle: `${byCat.size} ${toSmallcaps('categories')} • ${totalCmds} ${toSmallcaps('commands')}`,
        footer:   `${toSmallcaps('full menu')}: ${p}menu • ${toSmallcaps('categories → commands → details')}`,
      }, `📂 ${toSmallcaps('Browse Categories')}`, [
        { title: toSmallcaps('Categories'), rows },
      ], [
        { label: `📜 ${toSmallcaps('Full Menu')}`, cmd: `${p}menu` },
      ], { quoted: m });
      if (sent) return;
    } catch (err) {
      console.warn('[help] category picker failed, list-card fallback:', err.message);
    }

    // Legacy fallback: the original native list card shape
    const listSent = await sendListCard(sock, m.from, m, {
      title: 'Command Categories',
      rows: [...byCat.entries()].slice(0, 10).map(([c, cmds]) => {
        const shown = cmds.slice(0, 4).map(x => x.name).join(', ') + (cmds.length > 4 ? `, +${cmds.length - 4}` : '');
        return [`${categoryEmoji(c)} ${titleize(c)} (${cmds.length})`, shown];
      }),
      headerText: '❖ NEXORA-MD Command Categories',
      footer: `Use ${p}help for the full list • © NEXORA-MD by Aizen`,
    });
    if (listSent) return;

    // Plain text (guaranteed)
    await m.reply.info(
      [...byCat.entries()].map(([c, cmds]) =>
        `▸ ${categoryEmoji(c)} ${titleize(c)} (${cmds.length})\n   ${cmds.slice(0, 4).map(x => x.name).join(', ')}${cmds.length > 4 ? `, +${cmds.length - 4}` : ''}`
      ).join('\n\n'),
      'NEXORA • Categories'
    );
  },
};
