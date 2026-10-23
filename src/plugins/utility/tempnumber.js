/**
 * tempnumber.js — disposable SMS numbers (Omegatech Temp-number, new find
 * 2026-10-23). The SMS twin of .tempmail: grab a public throwaway number,
 * use it for sign-ups, and read the OTPs that land on it.
 *
 *   .tempnumber                     → overview
 *   .tempnumber list [country]      → fresh temp numbers, filter by country
 *   .tempnumber countries           → available countries + counts
 *   .tempnumber otps [filter]       → latest OTP feed (filter: sender,
 *                                     country, number, anything)
 *   .tempnumber check <number>     → OTPs seen for one number
 *
 * Rich tier: list/otps render as native V2 tables (the .stats pattern)
 * when capabilities.richResponse is on; plain-text fallbacks otherwise.
 *
 * Shared numbers, shared secrets: these are public inboxes — anyone can
 * read what lands on them. Fine for throwaway sign-ups, never for
 * anything that matters.
 */
import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getNumbers, getOtps, filterOtps, getCountries } from '../../lib/tempnumber.js';

const SAMPLE_SIZE = 12;

export default {
  name: 'tempnumber',
  aliases: ['tempno', 'tmpno', 'tempnum'],
  category: 'utility',
  description: '📱 Disposable SMS numbers + live OTP feed. Usage: .tempnumber [list|otps|check]',
  cooldown: 6000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const action = args[0]?.toLowerCase();
    const rest = args.slice(1);

    // ── Overview ───────────────────────────────────────────────────────
    if (!action || action === 'help') {
      return await m.reply.info(
        `📱 *TEMP NUMBER*\n\n` +
        `Public throwaway SMS numbers — sign up without your real SIM.\n\n` +
        `\`${p}tempnumber list [country]\` — get numbers\n` +
        `\`${p}tempnumber countries\` — what's available\n` +
        `\`${p}tempnumber otps [filter]\` — latest OTP feed\n` +
        `\`${p}tempnumber check <number>\` — OTPs for one number\n\n` +
        `_All numbers in the pool are currently 🇷🇺 Russia. Shared numbers: any OTP that lands is public — nothing important, ever._`,
        'NEXORA TEMP NUMBER'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        // ── List numbers ─────────────────────────────────────────────────
        if (action === 'list' || action === 'numbers') {
          const term = rest.join(' ').trim().toLowerCase();
          let list = await getNumbers();
          if (term) {
            list = list.filter((n) =>
              [n.country, n.countryCode, n.number].some((v) => String(v).toLowerCase().includes(term))
            );
          }
          if (!list.length) {
            return await m.reply.warn(term ? `No numbers matched "${rest.join(' ')}".` : 'No numbers available right now.');
          }
          // Random sample — the pool is huge and the first entries never change
          const pool = list.length <= SAMPLE_SIZE ? list : (() => {
            const picks = [];
            const seen = new Set();
            while (picks.length < SAMPLE_SIZE) {
              const idx = Math.floor(Math.random() * list.length);
              if (seen.has(idx)) continue;
              seen.add(idx);
              picks.push(list[idx]);
            }
            return picks;
          })();

          if (capabilities.richResponse) {
            try {
              return await baileysBridge.sendRichTable(sock, m.from, {
                title: `📱 Temp Numbers${term ? ` — ${rest.join(' ')}` : ''}`,
                headers: ['Number', 'Country'],
                rows: pool.map((n) => [`+${n.number}`, `${n.flag} ${n.country}`]),
                footer: `${list.length.toLocaleString()} available${term ? ' (filtered)' : ''} • Omegatech`,
              }, { quoted: m });
            } catch (err) {
              console.warn('[tempnumber] rich table failed, text fallback:', err.message);
            }
          }
          const lines = pool.map((n) => `${n.flag} \`${n.countryCode}${n.number}\` — ${n.country}`);
          return await m.reply(
            `📱 *TEMP NUMBERS*\n\n${lines.join('\n')}\n\n` +
            `${list.length.toLocaleString()} available${term ? ' (filtered)' : ''} · OTP feed: \`${p}tempnumber otps\``
          );
        }

        // ── Countries ─────────────────────────────────────────────────────
        if (action === 'countries' || action === 'country') {
          const countries = await getCountries();
          const top = countries.slice(0, 20);
          const lines = top.map((c) => `${c.flag} ${c.country} — ${c.count.toLocaleString()}`);
          return await m.reply(
            `🌍 *AVAILABLE COUNTRIES*\n\n${lines.join('\n')}` +
            (countries.length > top.length ? `\n\n_…and ${countries.length - top.length} more_` : '') +
            `\n\n\`${p}tempnumber list <country>\``
          );
        }

        // ── OTP feed ──────────────────────────────────────────────────────
        if (action === 'otps' || action === 'otp' || action === 'feed') {
          const term = rest.join(' ').trim();
          const otps = filterOtps(await getOtps({ limit: 100 }), term).slice(0, SAMPLE_SIZE);
          if (!otps.length) {
            return await m.reply.warn(term ? `Nothing in the feed matches "${term}".` : 'The OTP feed is empty right now.');
          }

          if (capabilities.richResponse) {
            try {
              return await baileysBridge.sendRichTable(sock, m.from, {
                title: `📲 Latest OTPs${term ? ` — ${term}` : ''}`,
                headers: ['Number', 'Sender', 'OTP', 'Time'],
                rows: otps.map((o) => [`${o.flag} ${o.maskedNumber}`, o.sender, o.otp, o.time.split(' ')[1] || o.time]),
                footer: `Public feed · Omegatech Temp-number`,
              }, { quoted: m });
            } catch (err) {
              console.warn('[tempnumber] rich table failed, text fallback:', err.message);
            }
          }
          const lines = otps.map((o) => `${o.flag} \`${o.maskedNumber}\` · *${o.sender}* · \`${o.otp}\` · ${o.time}`);
          return await m.reply(`📲 *LATEST OTPS*\n\n${lines.join('\n')}\n\n${p}tempnumber check <number> — one number`);
        }

        // ── Check one number ─────────────────────────────────────────────
        if (action === 'check' || action === 'waitsms') {
          const target = rest.join(' ').replace(/[^0-9+]/g, '').replace(/^\+/, '');
          if (!target || target.length < 6) {
            return await m.reply.warn(`Give a number to watch: \`${p}tempnumber check +79775594420\``);
          }
          const otps = filterOtps(await getOtps({ limit: 100 }), target);
          if (!otps.length) {
            return await m.reply(`📭 No OTPs seen for that number in the public feed. It may be quiet — try \`${p}tempnumber otps\` in a minute.`);
          }
          const lines = otps.slice(0, 5).map((o) =>
            `*${o.sender}* · \`${o.otp}\` · ${o.time}\n> ${(o.message || '').slice(0, 120)}`
          );
          return await m.reply(`📲 *OTPS FOR +${target}*\n\n${lines.join('\n\n')}`);
        }

        return await m.reply.warn(`Unknown subcommand. Try \`${p}tempnumber\` for help.`);
      } catch (err) {
        console.error('[tempnumber]', err.message);
        await m.reply.error(`Temp-number failed: ${err.message}`);
      }
    });
  },
};
