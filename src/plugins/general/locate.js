/**
 * locate.js — .locate <place> — first live consumer of the fork's OSM
 * map generator (generateMapContent, device-audited v0.3.18-r6 shape).
 *
 * Flow: Nominatim geocode (free, no key) -> native location card
 * (OSM tile + pin + info text). Plain-text fallback with an OSM deep
 * link if rich is disabled or the relay fails.
 */

import { sendRealLocationCard } from '../../lib/richMap.js';

const NOMINATIM_UA = 'NEXORA-MD/1.0 (WhatsApp bot; github.com/boyde1317-byte)';

/**
 * Shared geocoder (also used by weather.js). Returns the top Nominatim
 * hit ({ lat, lon, name, display_name }) or null.
 */
export async function geocodeFrom(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
  // Nominatim throttles at 1 req/s — retry once on 403/429 after a pause
  const attempt = () => fetch(url, {
    headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  let res = await attempt();
  if (res.status === 403 || res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await attempt();
  }
  if (!res.ok) throw new Error(`geocoder returned ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

export default {
  name: 'locate',
  aliases: ['map', 'where'],
  category: 'general',
  description: 'Pin any place on a live map card. Usage: .locate <place>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ').trim();

    if (!query) {
      return await m.reply.info(
        `Usage: \`${p}locate <place>\`\n\nExamples:\n• \`${p}locate Accra Mall\`\n• \`${p}locate Eiffel Tower, Paris\`\n• \`${p}locate Kotoka International Airport\``,
        'NEXORA • Locate'
      );
    }

    try {
      const hit = await geocodeFrom(query);
      if (!hit) {
        return await m.reply.warn(`Nothing on the map for "${query}". Try a more specific or common name.`);
      }

      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      const name = (hit.name && hit.name.trim()) || query;
      const shortAddr = String(hit.display_name || '').split(',').slice(0, 3).join(',').trim();

      // Real native map card — tappable, opens in maps with the pin
      const sent = await sendRealLocationCard(sock, m.from, m, {
        name,
        address: shortAddr,
        latitude: lat,
        longitude: lon,
      });

      const details = `📍 *${name}*
${hit.display_name}

Coordinates: *${lat.toFixed(5)}, ${lon.toFixed(5)}*`;

      if (sent) {
        const { mixedCard } = await import('../../lib/interactiveKit.js');
        await mixedCard(sock, m.from, {
          text: details,
          footer: 'NEXORA • Locate',
        }, [
          { kind: 'copy', label: '📋 Copy Coordinates', value: `${lat.toFixed(5)}, ${lon.toFixed(5)}` },
          { kind: 'url', label: '🗺️ Open in OSM', url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`, useWebview: true },
        ], { quoted: m });
        return;
      }

      // Plain fallback
      await m.reply.info(
        `📍 *${name}*\n${hit.display_name}\n\n` +
          `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}\n` +
          `Map: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
        'NEXORA • Locate'
      );
    } catch (err) {
      await m.reply.error(`Locate failed: ${err.message}`);
    }
  },
};
