export default {
  name: 'revoke',
  aliases: ['resetlink'],
  category: 'group',
  description: 'Revokes the current group invite link and generates a new one.',
  permissions: { groupOnly: true, admin: true, botAdmin: true },
  cooldown: 5000,
  execute: async ({ m, sock }) => {
    try {
      await sock.groupRevokeInvite(m.from);
      await m.reply.success('🔗 Group invite link has been revoked and reset.');
    } catch (err) {
      await m.reply.error(`Failed to revoke invite link: ${err.message}`);
    }
  }
};
