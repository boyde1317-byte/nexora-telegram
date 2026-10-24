/**
 * system.js — .system — live consumer of the Galaxy flows-bar card
 * (.testrich "galaxy" pattern, device-verified in v0.3.18-r14).
 *
 * System diagnostics in the OURIN cping/listvps style: host, CPU, memory,
 * uptime, plugin and database figures in a native card topped by the
 * Galaxy flows bar with quick actions. Falls back to a plain-text
 * diagnostics readout on non-nativeFlow clients or relay failure.
 */

import os from 'os';
import { client } from '../../core/client.js';
import { db } from '../../database/db.js';
import { formatUptime } from '../../lib/utils.js';
import { galaxyBarCard } from '../../lib/interactiveKit.js';
import brand from '../../../config/brand.js';

const _bar = (p, size = 10) =>
  '█'.repeat(Math.round((p / 100) * size)) + '░'.repeat(size - Math.round((p / 100) * size));

const _fmtRam = (b) => {
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB';
};

export default {
  name: 'system',
  aliases: ['sysinfo', 'sysdiag'],
  category: 'general',
  description: 'Shows host and bot system diagnostics in a native Galaxy flows card.',
  cooldown: 5000,

  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';

    // ── Collect live figures (same sources as .stats / .about) ──────────
    const totalRam = os.totalmem();
    const usedRam = totalRam - os.freemem();
    const ramPct = (usedRam / totalRam) * 100;
    const cpuLoad = os.loadavg()[0].toFixed(2);
    const cores = os.cpus().length;
    const cpuModel = (os.cpus()[0]?.model || 'Unknown').trim();
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    const pluginsLoaded = client.commands.size;
    const aliasesCount = client.aliases.size;
    const users = Object.keys(db.data?.users || {}).length;
    const groups = Object.keys(db.data?.groups || {}).length;

    const lines = [
      `◈ *${brand.name} System Diagnostics*`,
      '',
      `*» HOST*`,
      `Platform : ${os.platform()} ${os.arch()} (v${os.release()})`,
      `Hostname : ${os.hostname()}`,
      `Uptime   : ${formatUptime(os.uptime())}`,
      '',
      `*» CPU*`,
      `Model    : ${cpuModel}`,
      `Cores    : ${cores}`,
      `Load     : ${cpuLoad}`,
      '',
      `*» MEMORY*`,
      `RAM      : ${_bar(ramPct)} ${ramPct.toFixed(0)}% (${_fmtRam(usedRam)} / ${_fmtRam(totalRam)})`,
      `Heap     : ${_bar(heapPct)} ${heapPct}% (${rssMb} MB RSS)`,
      `Node     : ${process.version}`,
      '',
      `*» BOT*`,
      `Plugins  : ${pluginsLoaded} commands, ${aliasesCount} aliases`,
      `Uptime   : ${formatUptime(process.uptime())}`,
      `Users    : ${users} • Groups: ${groups}`,
    ];

    const body = lines.join('\n');

    try {
      await galaxyBarCard(sock, m.from, {
        text: body,
        footer: `© ${brand.name} • System Diagnostics`,
        barText: '⚡ System Flows',
        extraButtons: [
          { text: '📊 Bot Stats', id: p + 'stats' },
          { text: '⚡ Latency',    id: p + 'ping' },
          { text: '☰ Main Menu',  id: p + 'menu' },
        ],
      }, { quoted: m });
    } catch (err) {
      console.warn('[system] galaxyBarCard failed, plain fallback:', err.message);
      await m.reply(body);
    }
  },
};
