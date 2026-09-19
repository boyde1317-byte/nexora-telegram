/**
 * @file src/plugins/group/heatchart.js
 *
 * .heatchart — when is this group actually alive?
 *
 * Renders the heatmap tally (lib/heatmap.js) as a compact native card:
 * a 24-hour bar chart (one line, unicode bars), weekday totals, peak /
 * dead hours, and top talkers. No external API — pure data the bot
 * already sees. In-memory by design, so the chart reflects the current
 * boot's rolling window: hourly buckets rotate at each midnight.
 */
import { getHeat } from '../../lib/heatmap.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

const BAR = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hourBars(hours) {
  const max = Math.max(...hours, 1);
  return hours
    .map((n, h) => (n === 0 ? '·' : BAR[Math.min(BAR.length - 1, Math.ceil((n / max) * BAR.length) - 1)]))
    .join('');
}

function fmtHour(h) {
  const ampm = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${ampm}`;
}

function shortName(phone) {
  const num = String(phone).split('@')[0].split(':')[0];
  return `+${num.slice(-4)}`;
}

export default {
  name: 'heatchart',
  aliases: ['heat', 'activity'],
  category: 'group',
  description: "When this group is actually alive — hourly activity chart, peak hours, and top talkers. Usage: .heatchart",
  cooldown: 8000,
  async execute({ m, sock, prefix }) {
    const p = prefix || '.';
    if (!m.isGroup) {
      return await m.reply.info(`This one needs a group — it charts the chat's activity.`, 'HEATCHART');
    }

    const heat = getHeat(m.from);
    if (!heat || heat.total === 0) {
      return await m.reply.info(
        `No activity recorded yet since the bot started. Charts build as people talk — try again later.`,
        'HEATCHART'
      );
    }

    // ── Stats ────────────────────────────────────────────────────────────
    const maxHour = heat.hours.indexOf(Math.max(...heat.hours));
    const peakHours = heat.hours.map((n, h) => ({ n, h })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    // Longest zero-run = dead stretch (wrap around midnight)
    let deadStart = -1, deadLen = 0, cur = 0, curStart = -1;
    for (let i = 0; i < 48; i++) {
      const h = i % 24;
      if (heat.hours[h] === 0) {
        if (cur === 0) curStart = h;
        cur++;
        if (cur > deadLen) { deadLen = cur; deadStart = curStart; }
      } else {
        cur = 0;
      }
    }
    const busiestDay = heat.days.indexOf(Math.max(...heat.days));
    const total = heat.total.toLocaleString();

    // ── Card body ───────────────────────────────────────────────────────
    const chart =
      `    12am        6am        noon       6pm\n` +
      `    ${hourBars(heat.hours)}`;

    const days =
      DAY_NAMES.map((d, i) => `${d} ${'▁▂▃▄▅▆▇█'.slice(0, Math.min(8, Math.ceil((heat.days[i] / Math.max(...heat.days, 1)) * 8))) || '·'} ${heat.days[i]}`).join('\n');

    const topTalkers = heat.top.slice(0, 5);
    const talkerLines = topTalkers.length
      ? topTalkers.map((u, i) => `${i === 0 ? '👑' : `${i + 1}.`} ${shortName(u.phone)} — ${u.count} msgs`).join('\n')
      : '_nobody yet_';

    const text =
      `🔥 *GROUP HEATMAP*\n\n` +
      `${chart}\n\n` +
      `${days}\n\n` +
      `⏰ *Peak hour:* ${fmtHour(maxHour)} (${heat.hours[maxHour].toLocaleString()} msgs)\n` +
      `💀 *Dead zone:* ${deadLen > 0 ? `${deadLen}h stretch starting ${fmtHour(deadStart)}` : 'none — this group never sleeps 👻'}\n` +
      `📅 *Busiest day:* ${DAY_NAMES[busiestDay]}\n` +
      `💬 *Messages:* ${total} from ${heat.activeUsers} people\n\n` +
      `🏆 *Top talkers*\n${talkerLines}\n\n` +
      `_Rolling window since the bot's last boot — buckets reset daily._`;

    try {
      const sent = await copyResultCard(sock, m.from, {
        text,
        footer: `${p}heatchart • ${p}menu for more`,
        copyLabel: '📋 Copy Stats',
        copyValue: text.replace(/\*/g, ''),
      }, { quoted: m });
      if (sent) return;
    } catch (err) {
      console.warn('[heatchart] card failed, plain fallback:', err.message || err);
    }
    await m.reply(text.replace(/^🔥 /, '🔥 '));
  },
};
