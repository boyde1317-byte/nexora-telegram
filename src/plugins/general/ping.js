/**
 * ping.js — .ping — Moonson msping replica (device-audited rich combo):
 * AIRich product card acting as a system monitor (price = latency ms)
 * with latency / memory / cpu sections, falling back to the classic
 * fake-quote personality ping if rich is off or the relay fails.
 */

import os from 'os';
import { client } from '../../core/client.js';
import { sendFakeQuote } from '../../lib/waUtils.js';
import { getRandomResponse } from '../../nexora-messages.js';
import { AIRich } from '../../lib/NIXCODE.js';
import capabilities from '../../core/capabilities.js';
import { ASSET_URLS } from '../../assets/assetUrls.js';

const _fmtRam = (b) => {
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB';
};
const _bar = (p, size = 10) => '█'.repeat(Math.round((p / 100) * size)) + '░'.repeat(size - Math.round((p / 100) * size));

export default {
  name: 'ping',
  aliases: ['p', 'speed'],
  category: 'general',
  description: 'Measures the response speed of the bot.',
  cooldown: 2000,
  execute: async ({ m, sock }) => {
    const start = Date.now();
    // Fake WhatsApp-branded quote bar gives the "measuring" step a radar-ping feel
    const sent = await sendFakeQuote(sock, m.from, '⚡ _Calculating latency..._', '📡 Ping', { quoted: m });
    const latency = Date.now() - start;

    let pool;
    if (latency < 100)      pool = 'ping_fast';
    else if (latency < 400) pool = 'ping_normal';
    else                    pool = 'ping_slow';
    const comment = getRandomResponse(pool, latency);

    // ── Rich tier: Moonson msping replica (product card system monitor) ──
    if (capabilities.richResponse) {
      try {
        const t0 = performance.now();
        await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(5000) }).catch(() => null);
        const apiLatency = (performance.now() - t0).toFixed(0);

        const totalRam = os.totalmem();
        const usedRam = totalRam - os.freemem();
        const ramPct = (usedRam / totalRam) * 100;
        const cpuLoad = os.loadavg()[0];
        const cores = os.cpus().length;
        const cpuModel = os.cpus()[0]?.model?.trim() || 'Unknown';
        const thumb = ASSET_URLS.thumbnail;

        await new AIRich(sock)
          .addProduct({
            title: 'NEXORA-MD',
            brand: 'System Monitor',
            price: apiLatency + ' ms',
            sale_price: latency < 400 ? 'Excellent' : 'Degraded',
            product_url: 'https://github.com/boyde1317-byte/NEXORA-MD',
            image_url: thumb,
            icon_url: thumb,
          })
          .addText(
            '## ◈ Latency\n\n' +
              '› Bot Ping : **' + latency + ' ms**\n' +
              '› API Ping : **' + apiLatency + ' ms**\n' +
              '› Status   : **' + (latency < 100 ? 'Blazing' : latency < 400 ? 'Healthy' : 'Sluggish') + '**'
          )
          .addText(
            '## ◈ Memory\n\n' +
              '› Used : **' + _fmtRam(usedRam) + ' / ' + _fmtRam(totalRam) + '**\n' +
              '› Bar  : **' + _bar(ramPct) + '** ' + ramPct.toFixed(1) + '%'
          )
          .addText(
            '## ◈ CPU\n\n' +
              '› Model : ' + cpuModel.split('\n')[0] + '\n' +
              '› Cores : **' + cores + '**\n' +
              '› Load  : **' + cpuLoad.toFixed(2) + '**'
          )
          .addTip('_' + comment.replace(/[*_]/g, '') + '_')
          .setFooter('© NEXORA-MD by Aizen')
          .send(m.from, { quoted: m });
        return;
      } catch (err) {
        console.warn('[ping] rich tier failed, using classic ping:', err.message);
      }
    }

    await sock.sendMessage(m.from, {
      text: comment,
      edit: sent.key
    });
  },
};
