/**
 * convert.js — Quick unit and currency conversions.
 *
 * .convert 100 usd to ghs   — Currency conversion
 * .convert 1 km to mi        — Length
 * .convert 1 kg to lb        — Weight
 * .convert 100 C to F        — Temperature
 * .convert 1 gb to mb        — Data
 *
 * Currency rates use the free exchangerate.host API (no key needed).
 * Unit conversions are done locally (no API call).
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard, copyResultCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const CURRENCY_CACHE = { rates: null, timestamp: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Unit conversion factors (to base unit) ──────────────────────────────
const UNITS = {
  // Length (base: meter)
  length: {
    mm: 0.001, cm: 0.01, m: 1, km: 1000,
    in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
  },
  // Weight (base: gram)
  weight: {
    mg: 0.001, g: 1, kg: 1000, t: 1_000_000,
    oz: 28.3495, lb: 453.592,
  },
  // Data (base: byte)
  data: {
    b: 1, kb: 1024, mb: 1024**2, gb: 1024**3, tb: 1024**4,
  },
  // Time (base: second)
  time: {
    s: 1, m: 60, h: 3600, d: 86400, w: 604800,
  },
  // Volume (base: liter)
  volume: {
    ml: 0.001, l: 1,
    gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588,
    floz: 0.0295735,
  },
};

function findUnitCategory(unit) {
  const lower = unit.toLowerCase();
  for (const [cat, units] of Object.entries(UNITS)) {
    if (units[lower] !== undefined) return cat;
  }
  return null;
}

function convertTemperature(value, from, to) {
  let celsius;
  if (from === 'c') celsius = value;
  else if (from === 'f') celsius = (value - 32) * 5/9;
  else if (from === 'k') celsius = value - 273.15;
  else return null;

  if (to === 'c') return celsius;
  if (to === 'f') return celsius * 9/5 + 32;
  if (to === 'k') return celsius + 273.15;
  return null;
}

async function getExchangeRates() {
  const now = Date.now();
  if (CURRENCY_CACHE.rates && now - CURRENCY_CACHE.timestamp < CACHE_TTL) {
    return CURRENCY_CACHE.rates;
  }

  const res = await fetch('https://api.exchangerate.host/latest?base=USD', {
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!data.rates) throw new Error('Failed to fetch exchange rates.');

  CURRENCY_CACHE.rates = data.rates;
  CURRENCY_CACHE.timestamp = now;
  return data.rates;
}

export default {
  name: 'convert',
  aliases: ['conv', 'unit', 'convertor'],
  category: 'web',
  description: 'Convert units and currencies. Usage: .convert <amount> <from> to <to>',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    // Parse: <amount> <from> to <to>  OR  <amount><from> to <to>
    const input = args.join(' ');

    // Currency: "100 usd to ghs"
    const match = input.match(/^([\d.]+)\s+(\w+)\s+to\s+(\w+)$/i);
    if (!match) {
      return await m.reply.info(
        `Usage: \`${p}convert <amount> <from> to <to>\`\n\nExamples:\n• \`${p}convert 100 usd to ghs\` — Currency\n• \`${p}convert 1 km to mi\` — Length\n• \`${p}convert 1 kg to lb\` — Weight\n• \`${p}convert 100 C to F\` — Temperature\n• \`${p}convert 1 gb to mb\` — Data`,
        'CONVERTER'
      );
    }

    const value = parseFloat(match[1]);
    const from = match[2].toLowerCase();
    const to   = match[3].toLowerCase();

    // Try temperature first (C/F/K are single letters)
    if (['c', 'f', 'k'].includes(from) && ['c', 'f', 'k'].includes(to)) {
      const result = convertTemperature(value, from, to);
      if (result !== null) {
        const resultStr = result.toFixed(2);
        const fromLabel = from === 'c' ? '°C' : from === 'f' ? '°F' : 'K';
        const toLabel   = to === 'c' ? '°C' : to === 'f' ? '°F' : 'K';

        try {
          return await copyResultCard(sock, m.from, {
            text: `🌡️ *TEMPERATURE CONVERSION*\n\n${value}${fromLabel} = *${resultStr}${toLabel}*`,
            footer: 'NEXORA • Converter',
            copyValue: `${value}${fromLabel} = ${resultStr}${toLabel}`,
          }, { quoted: m });
        } catch (_) {
          return await m.reply(`🌡️ *${value}${fromLabel} = ${resultStr}${toLabel}*`);
        }
      }
    }

    // Try unit conversion
    const fromCat = findUnitCategory(from);
    const toCat = findUnitCategory(to);

    if (fromCat && toCat && fromCat === toCat) {
      const fromFactor = UNITS[fromCat][from];
      const toFactor = UNITS[fromCat][to];
      const result = (value * fromFactor) / toFactor;

      const resultStr = result < 0.01 ? result.toExponential(4) : result.toFixed(4).replace(/\.?0+$/, '');

      try {
        return await copyResultCard(sock, m.from, {
          text: `📐 *${fromCat.toUpperCase()} CONVERSION*\n\n${value} ${from} = *${resultStr} ${to}*`,
          footer: 'NEXORA • Converter',
          copyValue: `${value} ${from} = ${resultStr} ${to}`,
        }, { quoted: m });
      } catch (_) {
        return await m.reply(`📐 *${value} ${from} = ${resultStr} ${to}*`);
      }
    }

    // Try currency conversion
    await withReactionStatus(m, async () => {
      try {
        const rates = await getExchangeRates();
        const fromUpper = from.toUpperCase();
        const toUpper = to.toUpperCase();

        if (!rates[fromUpper] || !rates[toUpper]) {
          return await m.reply.error(
            `Unknown unit or currency: *${fromUpper}* or *${toUpper}*.\n\nSupported currencies: USD, EUR, GBP, GHS, NGN, KES, ZAR, INR, JPY, CNY, and more.\n\nType \`${p}currency\` to see full currency list.`
          );
        }

        // Convert: value in `from` → USD → `to`
        const inUSD = value / rates[fromUpper];
        const result = inUSD * rates[toUpper];
        const resultStr = result.toLocaleString(undefined, { maximumFractionDigits: 2 });

        try {
          return await richTableCard(sock, m.from, {
            title: `💱 CURRENCY CONVERSION`,
            headers: ['Field', 'Value'],
            rows: [
              ['Amount',     `${value.toLocaleString()} ${fromUpper}`],
              ['Converted',  `${resultStr} ${toUpper}`],
              ['Rate',       `1 ${fromUpper} = ${(rates[toUpper] / rates[fromUpper]).toFixed(4)} ${toUpper}`],
            ],
            footer: 'NEXORA • Currency',
          }, { quoted: m });
        } catch (_) {
          return await m.reply(
            `💱 *${value.toLocaleString()} ${fromUpper} = ${resultStr} ${toUpper}*\n\nRate: 1 ${fromUpper} = ${(rates[toUpper] / rates[fromUpper]).toFixed(4)} ${toUpper}`
          );
        }
      } catch (err) {
        return await m.reply.error(`Conversion failed: ${err.message}`);
      }
    });
  }
};
