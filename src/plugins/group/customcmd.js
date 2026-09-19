/**
 * @file src/plugins/group/customcmd.js
 *
 * .setcmd — group admins define their own text commands for the group.
 *
 *   .setcmd .slap   🖐️ slaps {sender} into next week
 *   .setcmd del .slap
 *   .setcmd list
 *
 * Stored per-group in db (groups[jid].customCommands: name → { text,
 * createdBy, createdAt }). EXECUTION is open to everyone in the group —
 * intercepted in handlers/message.js before the fuzzy "did you mean?"
 * suggestion, so a deliberately-set custom command always wins and
 * never shadows a built-in (registry lookup happens first).
 *
 * Placeholders at execution time:
 *   {sender}  → sender's pushName (falls back to JID number)
 *   {chat}    → group name
 *
 * Caps: 20 commands/group, 300 chars per text.
 */
import { db } from '../../database/db.js';
import { client } from '../../core/client.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const MAX_CMDS  = 20;
const MAX_CHARS = 300;

const normCmd = (raw) => raw.toLowerCase().replace(/^[.!$#%^&*]+/, '');

export function getCustomCommands(jid) {
  return db.getGroup(jid)?.customCommands || {};
}

export function findCustomCommand(jid, name) {
  const cmds = getCustomCommands(jid);
  return cmds[normCmd(name)] || null;
}

export default {
  name: 'setcmd',
  aliases: ['customcmd'],
  category: 'group',
  description: 'Define group text commands. Usage: .setcmd .name <text> | .setcmd del .name | .setcmd list',
  cooldown: 5000,
  permissions: { groupOnly: true, admin: true, owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const sub = (args[0] || '').toLowerCase();
    const rest = args.slice(1);

    // ── .setcmd list ────────────────────────────────────────────────────
    if (sub === 'list' || sub === 'ls') {
      const cmds = getCustomCommands(m.from);
      const names = Object.keys(cmds);
      if (!names.length) {
        return await m.reply.info(
          `No custom commands set yet.\nCreate one: *${prefix}setcmd .hug some text*`
        );
      }
      return await richTableCard(sock, m.from, {
        title: '✦ Custom Commands ✦',
        headers: ['Command', 'Text', 'By'],
        rows: names.map(n => [
          `${prefix}${n}`,
          (cmds[n].text.length > 60 ? cmds[n].text.slice(0, 57) + '…' : cmds[n].text),
          cmds[n].createdBy || '—',
        ]),
        footer: `${names.length}/${MAX_CMDS} used · ${prefix}setcmd del ${prefix}<name> to remove`,
      }, { quoted: m });
    }

    // ── .setcmd del .name ───────────────────────────────────────────────
    if (sub === 'del' || sub === 'remove' || sub === 'rm') {
      const name = normCmd(rest[0] || '');
      if (!name) return await m.reply.error(`Usage: *${prefix}setcmd del ${prefix}<name>*`);
      const cmds = getCustomCommands(m.from);
      if (!cmds[name]) return await m.reply.error(`No custom command *${prefix}${name}* in this group.`);
      delete cmds[name];
      db.setGroup(m.from, { customCommands: cmds });
      return await m.reply.success(`Custom command *${prefix}${name}* removed.`);
    }

    // ── .setcmd .name <text> ────────────────────────────────────────────
    const name = normCmd(sub);
    if (!name) {
      return await m.reply.error(
        `Usage:\n*${prefix}setcmd .name <reply text>* — create\n*${prefix}setcmd del .name* — remove\n*${prefix}setcmd list* — show all\n\nPlaceholders: *{sender}* (name), *{chat}* (group name)`
      );
    }
    const text = rest.join(' ').trim();
    if (!text) return await m.reply.error(`Give me some text: *${prefix}setcmd .${name} <text>*`);
    if (client.commands.has(name) || client.aliases.has(name)) {
      return await m.reply.error(`*${prefix}${name}* is a built-in command — pick a different name.`);
    }
    if (text.length > MAX_CHARS) return await m.reply.error(`Text too long — max ${MAX_CHARS} chars.`);

    const cmds = { ...getCustomCommands(m.from) };
    if (!cmds[name] && Object.keys(cmds).length >= MAX_CMDS) {
      return await m.reply.error(`Command limit reached (${MAX_CMDS}). Remove one with *${prefix}setcmd del* first.`);
    }

    cmds[name] = {
      text,
      createdBy: (m.pushName || 'admin'),
      createdAt: Date.now(),
    };
    db.setGroup(m.from, { customCommands: cmds });
    return await m.reply.success(
      `Custom command *${prefix}${name}* ${'set'}.\nTry it: *${prefix}${name}*`
    );
  },
};
