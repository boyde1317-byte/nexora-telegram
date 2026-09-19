/**
 * @file src/plugins/group/del.js
 *
 * .del (delete) — reply to a message and delete it for everyone.
 *
 *  • Replying to one of the BOT's messages → deleted outright (deleting
 *    your own messages needs no privileges). Works in groups and DMs.
 *  • Replying to a MEMBER's message (groups only) → needs the bot to be
 *    a group admin (WhatsApp's admin delete-for-everyone window, ~2 days).
 *  • Sender gate: group admins / owner — same as .purge. In DMs the gate
 *    is a no-op, so anyone can clean bot messages in their own chat.
 */
export default {
  name: 'del',
  aliases: ['delete'],
  category: 'group',
  description: 'Delete a message for everyone. Reply to it and send .del',
  cooldown: 3000,
  permissions: { admin: true, owner: true },
  execute: async ({ sock, m }) => {
    if (!m.quoted) {
      return await m.reply.error(
        'Reply to the message you want deleted and send `.del` again.'
      );
    }

    const qKey = m.quoted.key || {};
    const isBotMessage = qKey.fromMe === true;
    const isGroup = m.from.endsWith('@g.us');

    try {
      if (isBotMessage) {
        // Own message — remoteJid + fromMe + id is the proven delete shape.
        await sock.sendMessage(m.from, {
          delete: {
            remoteJid: m.from,
            fromMe: true,
            id: qKey.id,
          },
        }, { quoted: m });
        return; // silent success — the deletion IS the confirmation
      }

      // Someone else's message — admin delete, group only
      if (!isGroup) {
        return await m.reply.error("I can only delete other people's messages in groups.");
      }
      const botIsAdmin = await m.isBotAdmin();
      if (!botIsAdmin) {
        return await m.reply.error(
          'Make me a group admin first — WhatsApp only lets admins delete other members\' messages.'
        );
      }
      await sock.sendMessage(m.from, { delete: qKey }, { quoted: m });
      // silent success
    } catch (err) {
      await m.reply.error(`Delete failed: ${err.message || 'message may be too old to delete for everyone'}`);
    }
  },
};
