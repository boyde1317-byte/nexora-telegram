export default {
  name: 'setname',
  category: 'group',
  description: 'Changes the group subject/name.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const name = args.join(' ');
    if (!name) {
      return await m.reply.info(`Usage: \`${p}setname <new name>\``, '✏️ GROUP NAME');
    }
    
    try {
      await sock.groupUpdateSubject(m.from, name);
      await m.reply.success(`✏️ Group name changed to: *${name}*. Fresh identity. ✦`);
    } catch (err) {
      await m.reply.error(`Failed to update name: ${err.message}`);
    }
  }
};
