/**
 * groupsettings.js — Change group settings with an interactive menu.
 *
 * Improved: selectMenu picker instead of plain text list.
 * Aliases: .open, .close, .lock, .unlock, .gset
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { selectMenu, actionCard } from '../../lib/interactiveKit.js';

const SETTINGS = {
  open:    { announcement: false, label: '🌐 Open',   desc: 'All members can send messages.' },
  close:   { announcement: true,  label: '🔒 Closed', desc: 'Only admins can send messages.' },
  lock:    { restrict: true,      label: '🔐 Locked', desc: 'Only admins can edit group info.' },
  unlock:  { restrict: false,     label: '🔓 Unlocked', desc: 'All members can edit group info.' },
};

export default {
  name: 'groupsettings',
  aliases: ['gset', 'open', 'close', 'lock', 'unlock'],
  category: 'group',
  description: 'Change group settings. Options: open, close (messages), lock, unlock (info editing).',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 4000,
  execute: async ({ m, sock, args, body, prefix }) => {
    const p = prefix || '.';
    const rawCmd = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    const action = SETTINGS[rawCmd] ? rawCmd : args[0]?.toLowerCase();

    // No action — show interactive menu
    if (!action || !SETTINGS[action]) {
      return await selectMenu(sock, m.from, {
        text:   '⚙️ *GROUP SETTINGS*\n\nSelect a setting to change:',
        footer: 'NEXORA • Group Settings',
      }, '⚙️ Group Settings', [
        { title: 'Message Settings', rows: [
          { id: `${p}open`,   title: '🌐 Open Group',   description: 'All members can send messages' },
          { id: `${p}close`,  title: '🔒 Close Group',  description: 'Only admins can send messages' },
        ]},
        { title: 'Protection', rows: [
          { id: `${p}antilink`,     title: '🔗 Anti-Link',      description: 'Delete non-admin links' },
          { id: `${p}antitag`,      title: '📢 Anti-Tag',       description: 'Stop mass-mention spam' },
          { id: `${p}antisticker`,  title: '🖼️ Anti-Sticker',  description: 'Delete non-admin stickers' },
          { id: `${p}antispam`,     title: '⚡ Anti-Spam',     description: 'Flood control (5 msgs / 8s)' },
          { id: `${p}antiword`,     title: '🤬 Anti-Word',     description: 'Banned-words filter' },
          { id: `${p}antidelete`,  title: '🗑️ Anti-Delete',  description: 'Snitch deleted messages' },
          { id: `${p}antiviewonce`, title: '👁️ Anti-View-Once', description: 'Auto-save view-once media' },
          { id: `${p}antiforeign`,  title: '🌍 Anti-Foreign',  description: 'Country-code join filter' },
          { id: `${p}antibot`,      title: '🤖 Anti-Bot',      description: 'STRONG bot detection + removal' },
        ]},
        { title: 'Info Editing', rows: [
          { id: `${p}lock`,   title: '🔐 Lock Info',    description: 'Only admins can edit group info' },
          { id: `${p}unlock`, title: '🔓 Unlock Info',  description: 'All members can edit group info' },
        ]},
        { title: 'Quick Actions', rows: [
          { id: `${p}groupinfo`,  title: '📋 Group Info',  description: 'View current settings' },
          { id: `${p}grouplink`,  title: '🔗 Invite Link',  description: 'Get group invite link' },
        ]},
      ], [], { quoted: m });
    }

    const setting = SETTINGS[action];

    await withReactionStatus(m, async () => {
      if ('announcement' in setting) {
        await sock.groupSettingUpdate(m.from, setting.announcement ? 'announcement' : 'not_announcement');
      }
      if ('restrict' in setting) {
        await sock.groupSettingUpdate(m.from, setting.restrict ? 'locked' : 'unlocked');
      }

      try {
        await actionCard(sock, m.from, {
          text:   `${setting.label} — ${setting.desc}`,
          footer: 'NEXORA • Group Settings',
        }, [
          { label: '⚙️ More Settings', cmd: `${p}gset` },
          { label: '📋 Group Info',    cmd: `${p}groupinfo` },
        ], { quoted: m });
      } catch (_) {
        await m.reply.success(`${setting.label} — ${setting.desc}`);
      }
    });
  }
};
