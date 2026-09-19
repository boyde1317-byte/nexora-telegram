/**
 * github.js — GitHub repository info lookup.
 *
 * Upgraded from copyResultCard → richTableCard + mixedCard for structured
 * repo stats display with quick follow-up actions.
 */
import { Providers } from '../../lib/webClient.js';
import { richTableCard, mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'github',
  aliases: ['repo'],
  category: 'web',
  description: 'Get information about a GitHub repository.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p    = prefix || '.';
    const repo = args[0];
    if (!repo || !repo.includes('/')) {
      return await m.reply.info(
        `Usage: \`${p}github <owner/repo>\`\nExample: \`${p}github facebook/react\``,
        'GITHUB REPO'
      );
    }

    try {
      const data = await Providers.github(repo);

      // ── Tier 1: richTableCard + mixedCard ─────────────────────────────
      try {
        await richTableCard(sock, m.from, {
          title:   `🐙 ${data.full_name}`,
          headers: ['Field', 'Value'],
          rows: [
            ['Description', (data.description || 'No description').slice(0, 60)],
            ['Language',    data.language || 'N/A'],
            ['License',     data.license?.name || 'N/A'],
            ['⭐ Stars',    data.stargazers_count.toLocaleString()],
            ['🍴 Forks',    data.forks_count.toLocaleString()],
            ['👁️ Watchers', data.subscribers_count.toLocaleString()],
            ['Issues',      data.open_issues_count.toLocaleString()],
            ['Default Br.', data.default_branch || 'main'],
            ['Created',     new Date(data.created_at).toLocaleDateString('en-GB')],
            ['Updated',     new Date(data.updated_at).toLocaleDateString('en-GB')],
          ],
          footer: 'NEXORA • GitHub',
        }, { quoted: m });
        return;
      } catch (err) {
        console.warn('[github] Tier 1 (richTableCard) failed, fallback:', err.message);
      }

      // ── Tier 2: plain text fallback ───────────────────────────────────
      const text = `🐙 *GITHUB: ${data.full_name}*\n\n` +
        `${data.description || 'No description provided.'}\n\n` +
        `⭐ Stars: ${data.stargazers_count.toLocaleString()}\n` +
        `🍴 Forks: ${data.forks_count.toLocaleString()}\n` +
        `👁️ Watchers: ${data.subscribers_count.toLocaleString()}\n` +
        `📝 Language: ${data.language || 'N/A'}\n` +
        `⚖️ License: ${data.license?.name || 'N/A'}\n` +
        `🔗 URL: ${data.html_url}`;
      await m.reply(text);
    } catch (err) {
      await m.reply.error(`Repository not found or error: ${err.message}`);
    }
  }
};
