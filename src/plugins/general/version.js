/**
 * version.js — bot/runtime version info.
 *
 * Tier 1: richResponse table + actionCard with follow-up buttons.
 * Tier 2: adReply card (original behaviour).
 */
import brand from '../../../config/brand.js';


import { richTableCard} from '../../lib/interactiveKit.js';
import client from '../../core/client.js';

export default {
  name: 'version',
  aliases: ['v', 'ver'],
  category: 'general',
  description: 'Displays current bot, developer, core, and runtime version details.',
  cooldown: 2000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    const totalCmds = client.commands?.size ?? 0;

    // ── Tier 1: richResponse table ─────────────────────────────────────────
    try {
      await richTableCard(sock, m.from, {
        title:   'VERSION INFO',
        headers: ['Component', 'Details'],
        rows: [
          ['Bot Name',    brand.name],
          ['Developer',   brand.creator],
          ['Framework', brand.core],
          ['Version',     `v${brand.version}`],
          ['Node.js',     process.version],
          ['Platform',    process.platform],
          ['Commands',    String(totalCmds)],
        ],
        footer: `${brand.name} — Up to date`,
      }, { quoted: m });

      return;
    } catch (err) {
      console.warn('[version] Tier 1 failed:', err.message);
    }

    // ── Tier 2: plain text fallback ───────────────────────────────────────
    const text = [
      `╭─ VERSION`,
      `│ Bot: ${brand.name}`,
      `│ Developer: ${brand.creator}`,
      `│ Core: v${brand.version}`,
      `│ Runtime: Node.js ${process.version}`,
      `╰─ ${brand.signature}`,
    ].join('\n');

    await m.reply(text);
  }
};
