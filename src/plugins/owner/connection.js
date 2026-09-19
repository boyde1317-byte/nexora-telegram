/**
 * @file src/plugins/owner/connection.js
 *
 * .connection — Shows WhatsApp connection health, state history, message
 * metrics, and reconnect diagnostics. Wraps the
 * src/core/connectionMonitor.js module as an owner-only diagnostic command.
 *
 * Uses sendInfoCard for the .info-style visual treatment:
 *   body   → short state headline
 *   footer → detailed metrics (grey footer text)
 *   product quote + pill buttons + thumbnail header
 */

import { connectionMonitor } from '../../core/connectionMonitor.js';
import { formatUptime } from '../../lib/utils.js';
import { sendInfoCard } from '../../lib/infoCard.js';
import { config } from '../../../config/index.js';

export default {
  name:        'connection',
  aliases:     ['health', 'conn'],
  category:    'owner',
  description: 'Shows WhatsApp connection health, metrics, and reconnect diagnostics.',
  cooldown:    3000,
  permissions:  { owner: true },

  execute: async ({ sock, m }) => {
    const p = config.prefix[0] || '.';
    const health    = connectionMonitor.getHealth();
    const metrics   = connectionMonitor.getMetrics();
    const history   = connectionMonitor.getStateHistory();
    const reconnects = connectionMonitor.getReconnectHistory();

    // ── State indicator ───────────────────────────────────────────────────
    const stateEmoji = {
      connected:    '\u{1F7E2}',
      connecting:   '\u{1F7E1}',
      reconnecting: '\u{1F7E1}',
      disconnected: '\u{1F534}',
      error:        '\u{1F534}',
      logged_out:   '\u{1F6AB}',
    };
    const stateIcon = stateEmoji[health.state] || '\u2754';
    const uptimeStr = health.uptime > 0 ? formatUptime(health.uptime / 1000) : 'N/A';

    // ── Last activity ─────────────────────────────────────────────────────
    const fmtAge = (ms) => {
      if (ms === null || ms === undefined) return 'N/A';
      if (ms < 60000)   return `${Math.round(ms / 1000)}s ago`;
      if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
      return `${Math.round(ms / 3600000)}h ago`;
    };

    // ── Body: short headline ──────────────────────────────────────────────
    const bodyText =
      `\u{1F4E1} *Connection Health*\n` +
      `${stateIcon} ${health.state || 'unknown'} \u2502 Uptime: ${uptimeStr}\n` +
      `Latency: ${connectionMonitor.heartbeat.getLatency()}ms`;

    // ── Footer: detailed metrics (renders as grey text) ────────────────────
    let footerText =
      `*»* *MESSAGE METRICS*\n` +
      `  \u203A *Received:* ${metrics.messagesReceived}\n` +
      `  \u203A *Sent:* ${metrics.messagesSent}\n` +
      `  \u203A *Commands:* ${metrics.commandsExecuted}\n` +
      `  \u203A *Errors:* ${metrics.errorsCaught}\n` +
      `  \u203A *Reconnects:* ${metrics.reconnects}\n` +
      `  \u203A *Group Events:* ${metrics.groupEvents}\n\n` +
      `*»* *LAST ACTIVITY*\n` +
      `  \u203A *Last In:* ${fmtAge(health.lastIncomingAge)}\n` +
      `  \u203A *Last Out:* ${fmtAge(health.lastOutgoingAge)}\n` +
      `  \u203A *Total Msg:* ${health.totalMessages}\n` +
      `  \u203A *Total Err:* ${health.totalErrors}`;

    // ── Reconnect history (last 5) ─────────────────────────────────────────
    const recentReconnects = reconnects.slice(-5).reverse();
    if (recentReconnects.length > 0) {
      footerText += '\n\n*»* *RECONNECT HISTORY*';
      for (const r of recentReconnects) {
        const time = new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dur  = r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '...';
        const icon = r.status === 'success' ? '\u2705' : r.status === 'failed' ? '\u274C' : '\u23F3';
        footerText += `\n  ${icon} #${r.attempt} \u2502 ${time} \u2502 ${dur} \u2502 ${r.reason}`;
      }
    }

    // ── State history (last 5) ─────────────────────────────────────────────
    const recentStates = history.slice(-5).reverse();
    if (recentStates.length > 0) {
      footerText += '\n\n*»* *STATE TRANSITIONS*';
      for (const s of recentStates) {
        const time = new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        footerText += `\n  ${stateEmoji[s.state] || '\u2754'} ${s.from} \u2192 ${s.to} \u2502 ${time}${s.reason ? ` \u2502 ${s.reason}` : ''}`;
      }
    }

    // ── Send info card ────────────────────────────────────────────────────
    return await sendInfoCard(sock, m.from, {
      body:     bodyText,
      footer:   footerText,
      subtitle: `${stateIcon} ${health.state || 'unknown'}`,
      buttons:  [
        { displayText: '\u{1F501} Reconnect', id: `${p}restart`, type: 1 },
        { displayText: '\u2630 Menu',          id: `${p}menu`,    type: 1 },
      ],
      prefix:   p,
    }, { quoted: m });
  },
};
