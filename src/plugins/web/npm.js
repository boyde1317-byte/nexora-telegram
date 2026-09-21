import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'npm',
  category: 'web',
  description: 'Search for an NPM package.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const pkg = args[0];
    if (!pkg) return await m.reply.info(`Usage: ${p}npm <package>`, 'NPM REGISTRY');
    
    try {
      const data = await Providers.npm(pkg);
      const repoUrl = typeof data.repository === 'string'
        ? data.repository.replace(/^git\+/, '').replace(/\.git$/, '')
        : (data.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '');

      const text = `📦 *NPM: ${data.name}*\n\n` +
        `${data.description || 'No description.'}\n\n` +
        `🔖 Version: ${data.version}\n` +
        (data.weeklyDownloads !== null ? `⬇️ Downloads (7d): ${data.weeklyDownloads.toLocaleString('en-US')}\n` : '') +
        `📝 License: ${data.license || 'N/A'}\n` +
        `👤 Author: ${data.author?.name || (typeof data.author === 'string' ? data.author : 'N/A')}\n` +
        `🔗 NPM: https://www.npmjs.com/package/${data.name.replace('/', '%2F')}\n` +
        `🔗 Repository: ${repoUrl || 'N/A'}`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • NPM',
        copyLabel: '📋 Copy Install Command',
        copyValue: `npm install ${data.name}`
      }, { quoted: m });
    } catch (err) {
      if (err.notFound) {
        const lines = (err.suggestions || []).map(
          (s) => `*${s.name}* (v${s.version})${s.desc ? ` — ${s.desc}` : ''}`
        );
        return await m.reply.error(
          `📦 Package *${pkg}* was not found on npm.` +
          (lines.length ? `\n\nDid you mean:\n${lines.join('\n')}` : '') +
          `\n\nTry again with the exact name, or search: https://www.npmjs.com/search?q=${encodeURIComponent(pkg)}`
        );
      }
      await m.reply.error(`Package lookup failed: ${err.message}`);
    }
  }
};
