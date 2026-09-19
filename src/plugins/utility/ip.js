import { withReactionStatus, replyTable, getBrandThumbnail } from '../../lib/cosmetics.js';
import { mixedCard, actionCardWithAd } from '../../lib/interactiveKit.js';

const IP_RE   = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

export default {
  name: 'ip',
  aliases: ['ipinfo', 'iplookup', 'geoip', 'myip'],
  category: 'utility',
  description: 'Looks up info for an IP address or domain. Use `.ip` alone to check your own public IP.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const input = args[0]?.trim().replace(/^https?:\/\//i, '').split('/')[0];
    const target = (input && (IP_RE.test(input) || HOST_RE.test(input))) ? input : '';
    const p = prefix || '.';

    await withReactionStatus(m, async () => {
      const endpoint = target ? `https://ipwho.is/${target}` : 'https://ipwho.is/';
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`IP lookup service returned ${res.status}.`);
      const d = await res.json();

      if (!d.success) throw new Error(d.message ?? 'Lookup failed — invalid IP or domain.');

      const rows = [
        ['IP',          d.ip],
        ['Type',        d.type ?? 'N/A'],
        ['Continent',   d.continent ?? 'N/A'],
        ['Country',     `${d.flag?.emoji ?? ''} ${d.country ?? 'N/A'} (${d.country_code ?? ''})`],
        ['Region',      d.region ?? 'N/A'],
        ['City',        d.city ?? 'N/A'],
        ['Postal',      d.postal ?? 'N/A'],
        ['Latitude',    String(d.latitude ?? 'N/A')],
        ['Longitude',   String(d.longitude ?? 'N/A')],
        ['Timezone',    d.timezone?.id ?? 'N/A'],
        ['UTC Offset',  d.timezone?.utc ?? 'N/A'],
        ['ISP',         (d.connection?.isp ?? d.org ?? 'N/A').slice(0, 40)],
        ['ASN',         d.connection?.asn ? `AS${d.connection.asn}` : 'N/A'],
        ['Org',         (d.connection?.org ?? 'N/A').slice(0, 40)],
        ['VPN/Proxy',   d.security?.vpn  ? '⚠️ Yes' : '✅ No'],
        ['Tor',         d.security?.tor  ? '⚠️ Yes' : '✅ No'],
      ].filter(([, v]) => v !== 'N/A' && v !== '');

      const mapsUrl = `https://maps.google.com/?q=${d.latitude},${d.longitude}`;
      const thumbnailUrl = await getBrandThumbnail();
      try {
        await actionCardWithAd(sock, m.from, {
          text:   `🌐 *IP INFO — ${d.ip}*

${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
          footer: '📍 Tap thumbnail for Maps',
        }, [
          { label: '🔍 Lookup Another', cmd: `${p}ip` },
        ], {
          title:    `🌐 ${d.ip}`,
          body:     `${d.flag?.emoji ?? ''} ${d.country ?? ''} • ${d.city ?? ''}`,
          sourceUrl: mapsUrl,
          thumbnailUrl,
          originalImageUrl: thumbnailUrl,
          renderLargerThumbnail: true,
        }, { quoted: m });
      } catch (_) {
        await replyTable(m, sock, {
          caption: `🌐 IP INFO — ${d.ip}`,
          rows,
          footer: `Maps: ${mapsUrl}`,
        });
      }
    });
  }
};
