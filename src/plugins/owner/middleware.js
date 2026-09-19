/**
 * @file src/plugins/owner/middleware.js
 *
 * .middleware — Shows registered pipeline middlewares, their priorities,
 * and current rate-limiter/cooldown status. Wraps the
 * src/handlers/middleware.js module as an owner-only diagnostic command.
 *
 * Also provides:
 *   .middleware reset    — clears the rate limiter map
 *   .middleware list     — same as bare .middleware (shows all)
 *
 * Uses sendInfoCard for the .info-style visual treatment.
 */

import { middlewareRegistry, rateLimiter } from '../../handlers/middleware.js';
import { sendInfoCard } from '../../lib/infoCard.js';
import { config } from '../../../config/index.js';

export default {
  name:        'middleware',
  aliases:     ['mw', 'pipeline'],
  category:    'owner',
  description: 'Shows registered middleware pipeline and rate-limiter status.',
  cooldown:    2000,
  permissions:  { owner: true },

  execute: async ({ sock, m, args }) => {
    const p = config.prefix[0] || '.';
    const sub = (args && args[0]) || '';

    // ── Sub-command: reset rate limiter ───────────────────────────────────
    if (sub === 'reset' || sub === 'clear') {
      rateLimiter.reset();
      return await sock.sendMessage(m.from, {
        text: `\u2705 Rate limiter map cleared.`,
      }, { quoted: m });
    }

    // ── Default: list all middlewares ─────────────────────────────────────
    const middlewares = middlewareRegistry.getMiddlewares();

    // ── Body: short headline ──────────────────────────────────────────────
    const bodyText =
      `\u{1F527} *Middleware Pipeline*\n` +
      `${middlewares.length} middlewares registered`;

    // ── Footer: detailed list (renders as grey text) ───────────────────────
    let footerText =
      `*»* *REGISTERED MIDDLEWARES*\n`;

    for (const mw of middlewares) {
      footerText += `  \u203A [${String(mw.priority).padStart(2, ' ')}] ${mw.name}\n`;
    }

    footerText +=
      `\n*»* *RATE LIMITER*\n` +
      `  \u203A *Max:* ${rateLimiter.max} per ${rateLimiter.windowMs / 1000}s\n` +
      `  \u203A *Window:* ${rateLimiter.windowMs}ms\n\n` +
      `*»* *SUB-COMMANDS*\n` +
      `  \u203A ${p}middleware reset \u2014 clear rate limiter\n` +
      `  \u203A ${p}middleware list \u2014 show this list`;

    // ── Send info card ────────────────────────────────────────────────────
    return await sendInfoCard(sock, m.from, {
      body:     bodyText,
      footer:   footerText,
      subtitle: `${middlewares.length} middlewares`,
      buttons:  [
        { displayText: '\u{1F504} Reset',  id: `${p}middleware reset`, type: 1 },
        { displayText: '\u2630 Menu',     id: `${p}menu`,              type: 1 },
      ],
      prefix:   p,
    }, { quoted: m });
  },
};
