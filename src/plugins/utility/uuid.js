import crypto from 'crypto';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'uuid',
  aliases: ['guid'],
  category: 'developer',
  description: 'Generates random UUID(s). Usage: .uuid [count] — up to 10 at once.',
  cooldown: 2000,
  execute: async ({ m, sock, args }) => {
    const count = Math.min(parseInt(args[0]) || 1, 10);
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    const display = uuids.length === 1
      ? `🆔 *UUID GENERATOR*\n\n*${uuids[0]}*`
      : `🆔 *UUID GENERATOR* — ${uuids.length} IDs\n\n${uuids.map((u, i) => `${i + 1}. \`${u}\``).join('\n')}`;

    await copyResultCard(sock, m.from, {
      text: display,
      footer: 'NEXORA • UUID',
      copyLabel: count === 1 ? '📋 Copy UUID' : '📋 Copy All UUIDs',
      copyValue: uuids.join('\n')
    }, { quoted: m });
  }
};
