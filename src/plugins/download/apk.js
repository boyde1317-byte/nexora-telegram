import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { apkSearch } from '../../lib/downloader.js';
import { formatSize } from '../../lib/utils.js';
import { DownloadProgress } from '../../lib/progress.js';

const MAX_RESULTS = 6;

export default {
  name: 'apk',
  aliases: ['apkdl'],
  category: 'download',
  description: 'Searches for Android APKs. Usage: .apk <app name>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(
        `Usage: \`${p}apk <app name>\`\n\nExample: \`${p}apk whatsapp\``,
        'APK SEARCH'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start(`Searching for "${query}"`);
      try {
        const results = (await apkSearch(query)).slice(0, MAX_RESULTS);
        await progress.done(`✅ Found ${results.length} result${results.length !== 1 ? 's' : ''}.`);

        // NOTE: carouselMessage (baileysBridge.sendCarousel) is NOT used here —
        // relayMessage resolves successfully even when the recipient's WA
        // client can't render carouselMessage, so a try/catch around
        // sendCarousel never actually catches the failure. richTableCard
        // (buttonsMessage-based) is the reliable path.
        await richTableCard(sock, m.from, {
          title: `📱 APK RESULTS: ${query}`,
          headers: ['App', 'Size', 'Version'],
          rows: results.map(a => [
            a.name.slice(0, 25),
            formatSize(a.size),
            a.version ? `v${a.version}` : '—',
          ]),
          footer: 'Unofficial 3rd-party catalog — verify before installing.',
          buttons: results.slice(0, 3).map(a => ({ kind: 'url', label: `⬇️ ${a.name}`.slice(0, 24), url: a.url })),
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`APK search failed: ${err.message}`);
        throw err;
      }
    });
  }
};
