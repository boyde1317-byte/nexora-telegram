/**
 * airquality.js — air quality map + table, the .weather treatment for
 * what you're breathing.
 *
 * Data: open-meteo (keyless) — geocoding + current European and US
 * AQI with the full pollutant panel.
 *
 * Card: real native map card (locationMessage — the same primitive
 * as .weather), then the pollutant table, then a verdict card with
 * a refresh button. No static tile images — a REAL tappable map.
 */
import { richTableCard, mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { sendRealLocationCard } from '../../lib/richMap.js';

/** US EPA AQI categories — the verdict emoji/text comes from here. */
function aqiVerdict(usAqi) {
  const v = Number(usAqi);
  if (!Number.isFinite(v)) return { emoji: '🌫️', label: 'Unknown', color: 'gray' };
  if (v <= 50)   return { emoji: '🟢', label: 'Good', color: 'green', note: 'Air quality is satisfactory — enjoy your day outside.' };
  if (v <= 100)  return { emoji: '🟡', label: 'Moderate', color: 'yellow', note: 'Acceptable, but unusually sensitive people should watch for symptoms.' };
  if (v <= 150)  return { emoji: '🟠', label: 'Unhealthy for Sensitive Groups', color: 'orange', note: 'Sensitive groups (children, elderly, asthma) should limit long outdoor exertion.' };
  if (v <= 200)  return { emoji: '🔴', label: 'Unhealthy', color: 'red', note: 'Everyone should limit prolonged outdoor exertion today.' };
  if (v <= 300)  return { emoji: '🟣', label: 'Very Unhealthy', color: 'purple', note: 'Avoid outdoor activity — keep windows closed if you can.' };
  return { emoji: '🟤', label: 'Hazardous', color: 'maroon', note: 'Health warning — stay indoors, mask up if you must go out.' };
}

const fmt = (v, unit) => (v != null && Number.isFinite(Number(v)) ? `${v} ${unit}` : '—');

export default {
  name: 'airquality',
  aliases: ['aqi', 'air'],
  category: 'web',
  description: 'Air quality map + pollutant table for a city. Usage: .airquality <city>',
  cooldown: 6000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const location = args.join(' ').trim();
    if (!location) {
      return await m.reply.info(
        `Usage: \`${p}airquality <city>\`\n\nExample: \`${p}airquality Accra\` — map + pollutant table + health verdict`,
        'NEXORA • Air Quality'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const geo = await (await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
          { signal: AbortSignal.timeout(15000) },
        )).json();
        const place = geo.results?.[0];
        if (!place) throw new Error(`Location "${location}" not found.`);

        const locName = `${place.name}, ${place.country}`;

        const aq = await (await fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}` +
          `&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`,
          { signal: AbortSignal.timeout(15000) },
        )).json();
        const cur = aq.current;
        if (!cur) throw new Error('No air quality data for that location.');

        const verdict = aqiVerdict(cur.us_aqi);
        const tableRows = [
          ['US AQI', `${cur.us_aqi ?? '—'} ${verdict.emoji} ${verdict.label}`],
          ['EU AQI', cur.european_aqi ?? '—'],
          ['PM2.5', fmt(cur.pm2_5, 'µg/m³')],
          ['PM10', fmt(cur.pm10, 'µg/m³')],
          ['Ozone (O₃)', fmt(cur.ozone, 'µg/m³')],
          ['Nitrogen Dioxide', fmt(cur.nitrogen_dioxide, 'µg/m³')],
          ['Sulphur Dioxide', fmt(cur.sulphur_dioxide, 'µg/m³')],
          ['Carbon Monoxide', fmt(cur.carbon_monoxide, 'µg/m³')],
        ];

        // Real native map card, then the pollutant table
        const sent = await sendRealLocationCard(sock, m.from, m, {
          name: `${verdict.emoji} ${place.name}`,
          address: `AQI ${cur.us_aqi ?? '—'} — ${verdict.label}`,
          latitude: place.latitude,
          longitude: place.longitude,
        });
        try {
          await richTableCard(sock, m.from, {
            title: `🌫️ AIR QUALITY — ${locName.toUpperCase()}`,
            headers: ['Pollutant', 'Now'],
            rows: tableRows,
            footer: 'NEXORA • open-meteo',
          }, { quoted: m });
        } catch {
          await sock.sendMessage(m.from, {
            text: `🌫️ *AIR QUALITY — ${locName}*\n\n` + tableRows.map(([k, v]) => `• *${k}:* ${v}`).join('\n'),
          }, { quoted: m });
        }

        // Verdict card + refresh
        await mixedCard(sock, m.from, {
          text: `${verdict.emoji} *${verdict.label.toUpperCase()}*\n\n${verdict.note || ''}`,
          footer: `NEXORA • ${locName} • updated ${aq.current?.time ? cur.time.slice(11, 16) + ' local' : 'now'}`,
        }, [
          { kind: 'action', label: '🔄 Refresh', cmd: `${p}airquality ${location}` },
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Air quality lookup failed: ${err.message}`);
        throw err;
      }
    });
  },
};
