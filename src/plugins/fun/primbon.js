/**
 * primbon.js — Javanese/Indonesian numerology suite (ported from OURIN
 * DELUXE V3.4.1 plugins/primbon/*, api.siputzx.my.id keyless endpoints,
 * live-verified 2026-10-23). Consolidated into one command with subcommands:
 *
 *   .primbon nama <name>                       → meaning of a name
 *   .primbon jodoh <n1> <d1/m1/y1> <n2> <d2/m2/y2>
 *                                              → soulmate match by birth dates
 *   .primbon zodiak <sign>                     → today's zodiac reading
 *   .primbon mimpi <thing>                     → dream interpretation
 *   .primbon hoki <number>                     → lucky number reading
 * Aliases: .artinama .ramalanjodoh .zodiak .tafsirmimpi .nomorhoki
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const BASE = 'https://api.siputzx.my.id/api/primbon/';

async function call(endpoint, params) {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== true) throw new Error('reading not found');
  return data.data;
}

const ZODIACS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'sagitarius', 'capricorn', 'aquarius', 'pisces'];
// The upstream API spells it 'sagitarius' — normalize both spellings.
const API_ZODIAC = (s) => (s === 'sagittarius' ? 'sagitarius' : s);

export default {
  name: 'primbon',
  aliases: ['artinama', 'ramalanjodoh', 'zodiak', 'tafsirmimpi', 'nomorhoki'],
  category: 'fun',
  description: '🔮 Javanese primbon readings — name meaning, soulmate match, zodiac, dreams, lucky numbers. Usage: .primbon <subcommand>',
  cooldown: 6000,

  execute: async ({ m, args, commandName, prefix }) => {
    const p = prefix || '.';

    // Direct aliases route straight to their subcommand
    const aliasMap = { artinama: 'nama', ramalanjodoh: 'jodoh', zodiak: 'zodiak', tafsirmimpi: 'mimpi', nomorhoki: 'hoki' };
    let sub = aliasMap[commandName];
    if (!sub) sub = args[0]?.toLowerCase();
    const rest = sub && args[0]?.toLowerCase() === sub ? args.slice(1) : args;

    const help =
      `Primbon readings:\n\n` +
      `\`${p}primbon nama <name>\` — meaning of a name\n` +
      `\`${p}primbon jodoh <name1> <dd/mm/yyyy> <name2> <dd/mm/yyyy>\` — soulmate match\n` +
      `\`${p}primbon zodiak <sign>\` — zodiac reading (${ZODIACS.slice(0, 4).join(', ')}...)\n` +
      `\`${p}primbon mimpi <thing>\` — dream interpretation\n` +
      `\`${p}primbon hoki <number>\` — lucky number reading`;

    await withReactionStatus(m, async () => {
      try {
        if (sub === 'nama' && rest.length) {
          const d = await call('artinama', { nama: rest.join(' ') });
          return await m.reply(`🔮 *ARTI NAMA — ${rest.join(' ')}*\n\n${d.arti}`);
        }

        if (sub === 'jodoh') {
          // .primbon jodoh Name1 dd/mm/yyyy Name2 dd/mm/yyyy
          const joined = rest.join(' ');
          const match = joined.match(/^(.+?)\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(.+?)\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
          if (!match) return await m.reply.warn(`Usage: \`${p}primbon jodoh <name1> <dd/mm/yyyy> <name2> <dd/mm/yyyy>\``);
          const [, nama1, d1, b1, y1, nama2, d2, b2, y2] = match;
          const d = await call('ramalanjodoh', {
            nama1, tgl1: d1, bln1: b1, thn1: y1,
            nama2, tgl2: d2, bln2: b2, thn2: y2,
          });
          const body = typeof d.result === 'string' ? d.result : JSON.stringify(d, null, 1);
          const warn = d.peringatan ? `\n\n⚠️ _${d.peringatan}_` : '';
          return await m.reply(`🔮 *RAMALAN JODOH*\n\n*${nama1}* ❤ *${nama2}*\n\n${String(body).slice(0, 3000)}${warn}`);
        }

        if (sub === 'zodiak' && rest.length) {
          const sign = rest[0].toLowerCase();
          if (!ZODIACS.includes(sign)) {
            return await m.reply.warn(`Signs: ${ZODIACS.join(', ')}`);
          }
          const d = await call('zodiak', { zodiak: API_ZODIAC(sign) });
          return await m.reply(`🔮 *ZODIAK ${sign.toUpperCase()}*\n\n${d.zodiak || d.ramalan || JSON.stringify(d)}`);
        }

        if (sub === 'mimpi' && rest.length) {
          const d = await call('tafsirmimpi', { mimpi: rest.join(' ') });
          const list = (d.hasil || []).map((h) => `• ${h}`).join('\n');
          return await m.reply(`🔮 *TAFSIR MIMPI — ${rest.join(' ')}*\n\n${list || d.solusi || 'no interpretation found'}`);
        }

        if (sub === 'hoki' && rest.length) {
          const number = rest[0].replace(/[^0-9]/g, ''); // API rejects '+' prefixes
          const d = await call('nomorhoki', { phoneNumber: number });
          return await m.reply(`🔮 *NOMOR HOKI — ${number}*\n\n${JSON.stringify(d, null, 1).slice(0, 2500)}`);
        }

        return await m.reply.info(help, 'PRIMBON');
      } catch (err) {
        console.error('[primbon]', err.message);
        await m.reply.error(`Primbon reading failed: ${err.message}`);
      }
    });
  },
};
