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
    if (!pkg) return await m.reply.info('Usage: `${p}npm <package>`', 'NPM REGISTRY');
    
    try {
      const data = await Providers.npm(pkg);
      const latest = data['dist-tags']?.latest;
      const versionData = data.versions[latest];
      
      const text = `📦 *NPM: ${data.name}*\n\n` +
        `${data.description || 'No description.'}\n\n` +
        `🔖 Version: ${latest}\n` +
        `📝 License: ${versionData.license || 'N/A'}\n` +
        `👤 Author: ${data.author?.name || 'N/A'}\n` +
        `🔗 NPM: https://www.npmjs.com/package/${data.name}\n` +
        `🔗 Repository: ${data.repository?.url?.replace('git+', '').replace('.git', '') || 'N/A'}`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • NPM',
        copyLabel: '📋 Copy Install Command',
        copyValue: `npm install ${data.name}`
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Package not found or error: ${err.message}`);
    }
  }
};
