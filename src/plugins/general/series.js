/**
 * series.js — TV show cards, the .recipe treatment for television.
 *
 * Data: TVMaze (keyless) — posters, summaries, ratings, full episode
 * lists, and next-episode dates for running shows.
 *
 * Flow:
 *   .series <name>         → 1 hit: full card
 *                            2+ hits: picker (first hit's poster as
 *                            header image) → .series id <id>
 *   .series id <tvmazeId>  → full card: poster → info TABLE → summary
 *                            card + buttons (Episode Guide, ▶ Official
 *                            Site when there is one)
 *   .series episodes <id>  → episode picker: last 3 aired + next 3
 *                            upcoming (or the final season when ended)
 *   .series ep <id> <S> <E>→ episode detail card
 */
import { selectMenu, richTableCard, mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

const BASE = 'https://api.tvmaze.com';

async function tvmaze(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TVMaze returned HTTP ${res.status}.`);
  return res.json();
}

const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

const fmtDate = (d) => (d ? d : '—');

function networkOf(show) {
  return show.network?.name || show.webChannel?.name || null;
}

async function sendFullCard({ m, sock, show, nextEpisode, prefix }) {
  const p = prefix || '.';
  const poster = show.image?.original || show.image?.medium;
  const meta = [networkOf(show), ...(show.genres || [])].filter(Boolean).join(' • ');

  if (poster) {
    await sock.sendMessage(m.from, {
      image: { url: poster },
      caption: `📺 *${show.name}*\n_${meta || 'TV Series'}_`,
    }, { quoted: m });
  } else {
    await sock.sendMessage(m.from, { text: `📺 *${show.name}*\n_${meta || 'TV Series'}_` }, { quoted: m });
  }

  const nextLine = nextEpisode
    ? `S${String(nextEpisode.season).padStart(2, '0')}E${String(nextEpisode.number).padStart(2, '0')} — ${nextEpisode.airdate}${nextEpisode.airtime ? ` ${nextEpisode.airtime}` : ''}`
    : null;

  try {
    await richTableCard(sock, m.from, {
      title: `📺 SERIES INFO — ${String(show.name).toUpperCase()}`,
      headers: ['Field', 'Value'],
      rows: [
        ['Status', show.status],
        ['Premiered', fmtDate(show.premiered)],
        ['Ended', fmtDate(show.ended)],
        ['Network', networkOf(show) || '—'],
        ['Genres', (show.genres || []).join(', ') || '—'],
        ['Rating', show.rating?.average ? `⭐ ${show.rating.average}/10` : '—'],
        ['Runtime', show.runtime ? `${show.runtime} min` : '—'],
        ...(nextLine ? [['Next Episode', nextLine]] : []),
      ],
      footer: 'NEXORA • TVMaze',
    }, { quoted: m });
  } catch {
    await sock.sendMessage(m.from, { text:
      `*Status:* ${show.status}\n*Premiered:* ${fmtDate(show.premiered)}\n*Ended:* ${fmtDate(show.ended)}\n` +
      `*Network:* ${networkOf(show) || '—'}\n*Genres:* ${(show.genres || []).join(', ') || '—'}\n` +
      `*Rating:* ${show.rating?.average || '—'}${nextLine ? `\n*Next Episode:* ${nextLine}` : ''}` }, { quoted: m });
  }

  const summary = stripHtml(show.summary) || 'No summary available.';
  const buttons = [
    { kind: 'action', label: '🎬 Episode Guide', cmd: `${p}series episodes ${show.id}` },
  ];
  if (show.officialSite) {
    buttons.push({ kind: 'url', label: '▶ Official Site', url: show.officialSite, useWebview: true });
  }

  await mixedCard(sock, m.from, {
    text: `📝 *About*\n\n${summary.length > 900 ? summary.slice(0, 897) + '…' : summary}`,
    footer: `NEXORA • TVMaze • ${show.status || 'TV'}`,
  }, buttons, { quoted: m });
}

export default {
  name: 'series',
  aliases: ['tv', 'show', 'tvshow'],
  category: 'general',
  description: 'TV series info — poster, info table, episodes. Usage: .series <name>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();

    if (!args.length) {
      return await m.reply.info(
        `Usage: \`${p}series <name>\`\n\nExamples:\n• \`${p}series breaking bad\` — poster, info table, summary\n• \`${p}series id 169\` — jump straight to a TVMaze id\n• From the card: 🎬 Episode Guide → browse episodes`,
        'NEXORA • Series'
      );
    }

    await withReactionStatus(m, async () => {
      // ── .series ep <id> <season> <number> ──────────────────────────
      if (sub === 'ep' && args[1] && args[2] && args[3]) {
        const episodes = await tvmaze(`/shows/${args[1]}/episodes`);
        const ep = episodes.find(e => String(e.season) === String(args[2]) && String(e.number) === String(args[3]));
        if (!ep) return await m.reply.error(`No episode S${args[2]}E${args[3]} for that show.`);
        const summary = stripHtml(ep.summary);
        const caption = `🎬 *${ep.name}*\n_S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')} • ${ep.airdate || 'unaired'}${ep.runtime ? ` • ${ep.runtime} min` : ''}_`;
        if (ep.image?.original || ep.image?.medium) {
          await sock.sendMessage(m.from, { image: { url: ep.image?.original || ep.image?.medium }, caption }, { quoted: m });
        } else {
          await sock.sendMessage(m.from, { text: caption }, { quoted: m });
        }
        if (summary) {
          await mixedCard(sock, m.from, { text: summary.slice(0, 900), footer: 'NEXORA • TVMaze' }, [], { quoted: m });
        }
        return;
      }

      // ── .series episodes <id> ───────────────────────────────────────
      if (sub === 'episodes' && args[1]) {
        const episodes = await tvmaze(`/shows/${args[1]}/episodes`);
        if (!episodes.length) return await m.reply.error('No episode data for that show.');
        const today = new Date().toISOString().slice(0, 10);
        const aired = episodes.filter(e => e.airdate && e.airdate <= today).slice(-3).reverse();
        const upcoming = episodes.filter(e => e.airdate && e.airdate > today).slice(0, 3);
        const picks = upcoming.length ? [...upcoming, ...aired] : episodes.slice(-6).reverse();
        if (!picks.length) return await m.reply.error('No episodes listed yet.');
        const showName = picks[0]?.show?.name || '';
        return await selectMenu(sock, m.from, {
          text: `🎬 *${picks.length} episodes*${showName ? ` — ${showName}` : ''}\n${upcoming.length ? 'Upcoming first, then the latest aired.' : 'The final episodes.'}\nTap one for its card.`,
          footer: 'NEXORA • Episode Picker',
        }, '🎬 Pick an episode', [
          {
            title: 'Episodes',
            rows: picks.slice(0, 10).map(ep => ({
              id: `${p}series ep ${args[1]} ${ep.season} ${ep.number}`,
              title: `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')} ${ep.name}`.slice(0, 60),
              description: `${ep.airdate || 'unaired'}${upcoming.some(u => u.id === ep.id) ? ' • UPCOMING' : ''}`,
            })),
          },
        ], [], { quoted: m });
      }

      // ── .series id <id> ─────────────────────────────────────────────
      if (sub === 'id' && args[1]) {
        const data = await tvmaze(`/shows/${args[1]}?embed=nextepisode`);
        if (!data?.id) return await m.reply.error('That show ID does not exist.');
        return await sendFullCard({
          m, sock, show: data,
          nextEpisode: data.status === 'Running' ? data._embedded?.nextepisode : null,
          prefix: p,
        });
      }

      // ── .series <name> ──────────────────────────────────────────────
      const query = args.join(' ').trim();
      const results = await tvmaze(`/search/shows?q=${encodeURIComponent(query)}`);
      const shows = (results || []).map(r => r.show).filter(Boolean).slice(0, 8);
      if (!shows.length) {
        return await m.reply.error(`No series found for "${query}".`);
      }
      if (shows.length === 1) {
        const detail = await tvmaze(`/shows/${shows[0].id}?embed=nextepisode`);
        return await sendFullCard({
          m, sock, show: detail,
          nextEpisode: detail.status === 'Running' ? detail._embedded?.nextepisode : null,
          prefix: p,
        });
      }
      return await selectMenu(sock, m.from, {
        text: `🔍 *${shows.length} series for "${query}"*\nTap one for the full card.`,
        footer: 'NEXORA • Series Picker',
      }, '📺 Pick a series', [
        {
          title: 'Series',
          rows: shows.slice(0, 6).map((s, idx) => ({
            id: `${p}series id ${s.id}`,
            title: `${idx + 1}. ${s.name}`.slice(0, 60),
            description: [s.premiered, networkOf(s), s.rating?.average ? `⭐ ${s.rating.average}` : null, s.status].filter(Boolean).join(' • ').slice(0, 60),
          })),
        },
      ], [], { quoted: m, thumbnail: shows[0].image?.original || shows[0].image?.medium });
    });
  },
};
