import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../asciiBuilder.js';

/**
 * Enhanced system status template.
 * Builds a visually striking multi-section system info card
 * with stat rows, progress bars, and sectioned layout.
 */
export const systemTemplate = (systemData) => {
  const lines = [];

  // ── Core System Stats ─────────────────────────────────────────────
  lines.push(asciiBuilder.statRow('Uptime', systemData.uptime || '0m', '\u23F1'));
  lines.push(asciiBuilder.statRow('RAM', systemData.ram || '0MB', '\uFEB3'));
  lines.push(asciiBuilder.statRow('Platform', systemData.platform || 'Node', '\u2699'));
  lines.push(asciiBuilder.statRow('Speed', systemData.ping || '0ms', '\u26A1'));

  // ── System Health Bar ─────────────────────────────────────────────
  const pingMs = parseInt(systemData.ping) || 120;
  const healthPercent = Math.max(10, Math.min(100, 100 - Math.floor(pingMs / 5)));
  lines.push('');
  lines.push(asciiBuilder.progressBar(healthPercent, 14, 'Health'));

  // ── Status Badges ──────────────────────────────────────────────────
  lines.push('');
  const status = healthPercent > 70 ? 'OPTIMAL' : healthPercent > 40 ? 'STABLE' : 'DEGRADED';
  lines.push(asciiBuilder.badge('Status', status));
  lines.push(asciiBuilder.badge('Engine', systemData.engine || 'Baileys'));

  return asciiBuilder.panel('System Status', lines, { accent: '\u2706' });
};

export default systemTemplate;
