export default {
  name: 'setdesc',
  category: 'group',
  description: 'Changes the group description.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const desc = args.join(' ');
    if (!desc) {
      return await m.reply.info(`Usage: \`${p}setdesc <new description>\``, '📝 GROUP DESCRIPTION');
    }
    
    try {
      await sock.groupUpdateDescription(m.from, desc);
      await m.reply.success('📝 Group description updated. Looking sharp. ✦');
    } catch (err) {
      await m.reply.error(`Failed to update description: ${err.message}`);
    }
  }
};
