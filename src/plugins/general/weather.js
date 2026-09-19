/**
 * weather.js — .weather <city> — live consumer of the fork's map+table
 * combo generator (generateMapWithTable, device-audited v0.3.18-r6).
 *
 * Flow: Nominatim geocode -> Open-Meteo (free, no key) current + 4-day
 * forecast -> one native card: OSM map pin + forecast table.
 * Fallback chain: AIRich markdown (text + table) -> plain text.
 */

import { geocodeFrom } from './locate.js';
import { sendRealLocationCard } from '../../lib/richMap.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';

// Open-Meteo — free, no key: https://open-meteo.com
const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'],
  51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Dense drizzle', '🌦'],
  56: ['Freezing drizzle', '🌧'], 57: ['Freezing drizzle', '🌧'],
  61: ['Light rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
  66: ['Freezing rain', '🌧'], 67: ['Freezing rain', '🌧'],
  71: ['Light snow', '❄️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
  80: ['Light showers', '🌦'], 81: ['Showers', '🌦'], 82: ['Violent showers', '⛈'],
  85: ['Snow showers', '🌨'], 86: ['Snow showers', '🌨'],
  95: ['Thunderstorm', '⛈'], 96: ['Storm + hail', '⛈'], 99: ['Storm + hail', '⛈'],
};
const wmo = (code) => WMO[code] || ['Unknown', '🌡'];

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  return res.json();
}

export default {
  name: 'weather',
  aliases: ['w', 'forecast'],
  category: 'general',
  description: 'Live weather + forecast with a map card. Usage: .weather <city>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ').trim();

    if (!query) {
      return await m.reply.info(
        `Usage: \`${p}weather <city>\`\n\nExamples:\n• \`${p}weather Accra\`\n• \`${p}weather Kumasi\`\n• \`${p}weather Tokyo\``,
        'NEXORA • Weather'
      );
    }

    try {
      const hit = await geocodeFrom(query);
      if (!hit) {
        return await m.reply.warn(`Couldn't find "${query}". Try a city name like \`${p}weather Accra\`.`);
      }

      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      const city = (hit.name && hit.name.trim()) || query;

      const wx = await fetchWeather(lat, lon);
      const cur = wx.current || {};
      const [curLabel, curEmoji] = wmo(cur.weather_code);

      // ── Tier 1: native map + forecast table card ──
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const rows = (wx.daily?.time || []).map((iso, i) => {
        const [lbl, emo] = wmo(wx.daily.weather_code[i]);
        const d = new Date(iso + 'T12:00:00');
        return [
          i === 0 ? 'Today' : dayNames[d.getDay()],
          `${emo} ${lbl}`,
          `${Math.round(wx.daily.temperature_2m_min[i])}° / ${Math.round(wx.daily.temperature_2m_max[i])}°`,
          `${wx.daily.precipitation_probability_max?.[i] ?? 0}%`,
        ];
      });

      // Real native map card, then the forecast table
      const sent = await sendRealLocationCard(sock, m.from, m, {
        name: `${curEmoji} ${city}`,
        address: `${curLabel} • ${Math.round(cur.temperature_2m)}°C (feels ${Math.round(cur.apparent_temperature)}°)`,
        latitude: lat,
        longitude: lon,
      });
      try {
        const { richTableCard } = await import('../../lib/interactiveKit.js');
        await richTableCard(sock, m.from, {
          title: `${curEmoji} ${city.toUpperCase()} — 4-DAY FORECAST`,
          headers: ['Day', 'Condition', 'Min/Max', 'Rain'],
          rows,
          footer: 'NEXORA • Open-Meteo',
        }, { quoted: m });
      } catch {
        /* table tier falls through to AIRich/plain below */
      }
      if (sent) return;

      // ── Tier 2: AIRich markdown (text + native table) ──
      const tableMd = rows
        .map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`)
        .join('\n');
      const markdown =
        `*${city} — ${curEmoji} ${curLabel}*\n` +
        `Now: ${Math.round(cur.temperature_2m)}°C (feels like ${Math.round(cur.apparent_temperature)}°C) • ` +
        `Humidity ${cur.relative_humidity_2m}% • Wind ${Math.round(cur.wind_speed_10m)} km/h\n\n` +
        `| Day | Condition | Min/Max | Rain |\n| --- | --- | --- | --- |\n${tableMd}`;

      const richSent = await sendAIRichReply(sock, m.from, m, { markdown, footer: 'NEXORA • Open-Meteo' });
      if (richSent) return;

      // ── Tier 3: plain text ──
      await m.reply.info(`${markdown.replace(/\|/g, ' | ').replace(/\n\s+\|\s+---.*\n/, '\n')}`, 'NEXORA • Weather');
    } catch (err) {
      await m.reply.error(`Weather failed: ${err.message}`);
    }
  },
};
