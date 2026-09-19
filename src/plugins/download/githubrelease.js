import { Providers, webClient } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'githubrelease',
  aliases: ['ghrelease', 'release'],
  category: 'download',
  description: 'Get the latest release of a GitHub repository.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const repo = args[0];
    if (!repo || !repo.includes('/')) {
      return await m.reply.info(`Usage: \`${prefix}release <owner/repo>\`\nExample: \`${prefix}release facebook/react\``, 'GITHUB RELEASE');
    }

    try {
      const { data } = await webClient.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { useCache: true });
      
      let text = `📦 *LATEST RELEASE: ${data.name || data.tag_name}*\n` +
        `🔗 Repository: ${repo}\n\n` +
        `*Published:* ${new Date(data.published_at).toLocaleDateString()}\n` +
        `*URL:* ${data.html_url}\n\n`;

      if (data.assets && data.assets.length > 0) {
        text += `*Assets:*\n`;
        data.assets.slice(0, 5).forEach(asset => {
          text += `• ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)\n  ${asset.browser_download_url}\n`;
        });
      } else {
        text += `_No downloadable assets found._`;
      }

      await copyResultCard(sock, m.from, {
        text,
        footer: 'GitHub Releases API',
        copyLabel: '📋 Copy Link',
        copyValue: data.html_url
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to fetch release (maybe no releases exist?): ${err.message}`);
    }
  }
};
