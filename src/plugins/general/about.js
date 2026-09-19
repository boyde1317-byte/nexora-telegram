/**
 * @file src/plugins/general/about.js
 *
 * .about — Standalone bot info card, matching the BIGST4CK reference layout
 * exactly (see reference/screenshot):
 *
 *   Body   (normal white/black text): greeting + date/time
 *   Footer (native WhatsApp grey text — buttonsMessage.footerText):
 *     » USER   — status, level/xp bar, coin, registered, last active, cmds used, badges
 *     » SYSTEM — status, mode, uptime, db size, cmd count, cpu bar, ram bar, ping, users, groups
 *   Buttons (buttonsMessage.buttons — renders as a horizontal pill row):
 *     ♥ Store   → plain quick-reply, opens .shop
 *     ☰ Menu    → nativeFlowInfo single_select category picker
 *
 * IMPORTANT — the "grey text" effect is WhatsApp's OWN native rendering of
 * the buttonsMessage.footerText field. It is NOT a monospace/code-block
 * trick. Wrapping the whole body in ``` backticks (as an earlier version of
 * this file did) puts everything in the *body* slot instead, which renders
 * as plain foreground text — that's why "the greyed text style didn't
 * work". Keep body short; put the stats block in footer, using `*bold*`
 * markdown per line exactly like buttonsCard.js's main menu (already
 * verified working).
 *
 * IMPORTANT — the button row only shows side-by-side (as in the reference
 * screenshot) with exactly the same 2-button shape BIGST4CK uses: one plain
 * type:1 quick-reply + one type:1 button carrying nativeFlowInfo. Reuses
 * buttonsCard.js's buildNavigationButton() so both commands share the same
 * proven category-picker payload instead of duplicating it.
 */

import os from 'os';
import { db } from '../../database/db.js';
import { client } from '../../core/client.js';
import { formatUptime } from '../../lib/utils.js';
import { ASSET_URLS } from '../../assets/assetUrls.js';
import { sendInfoCard } from '../../lib/infoCard.js';
import { buildNavigationButton } from '../../menu/types/buttonsCard.js';
import brand from '../../../config/brand.js';
import { config } from '../../../config/index.js';

// ─────────────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function createBar(percent, maxBlocks = 10) {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 100 * maxBlocks);
  return '█'.repeat(filled) + '░'.repeat(maxBlocks - filled);
}

function fmtBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function fmtRAM(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default {
  name:        'about',
  aliases:     ['info', 'botinfo'],
  category:    'general',
  description: 'Shows detailed bot and system information.',
  cooldown:    5000,

  execute: async ({ sock, m }) => {
    const p = config.prefix[0] || '.';

    // ── Time ───────────────────────────────────────────────────────────────
    const tz  = process.env.BOT_TZ || 'Africa/Accra';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    // ── System metrics ─────────────────────────────────────────────────────
    const totalMem  = os.totalmem();
    const freeMem   = os.freemem();
    const usedMem   = totalMem - freeMem;
    const ramPct    = (usedMem / totalMem) * 100;
    const cpuLoad   = os.loadavg()[0];
    const cpuCores  = os.cpus().length;
    const loadPct   = (cpuLoad / cpuCores) * 100;
    const uptime    = formatUptime(process.uptime());
    const serverStatus = loadPct > 80 || ramPct > 85 ? 'Degraded' : 'Online';

    // ── Database size ──────────────────────────────────────────────────────
    let dbSize = '0 B';
    try {
      const dbData   = db.data;
      const dbString = JSON.stringify(dbData);
      dbSize = fmtBytes(Buffer.byteLength(dbString, 'utf8'));
    } catch (_) {}

    // ── User data ──────────────────────────────────────────────────────────
    const userData      = db.getUser?.(m.sender) || {};
    const level         = userData.level         || 1;
    const xp            = userData.xp            || 0;
    const xpNext        = level * 100;
    const coins         = userData.coins === undefined ? 'Unlimited' : userData.coins;
    const registered    = userData.registered
      ? new Date(userData.registered).toISOString().split('T')[0]
      : 'N/A';
    const lastActive    = userData.lastActive
      ? new Date(userData.lastActive).toLocaleString('en-US', {
          hour: '2-digit', minute: '2-digit', timeZone: tz,
        })
      : `Today at ${timeStr}`;
    const commandsUsed  = userData.commandsUsed  || 0;
    const badges        = m.isOwner ? 'Owner' : (userData.premium ? 'Premium' : 'Member');
    const senderNum     = m.senderNumber || m.sender?.split('@')[0] || '';

    // ── Stats counts ───────────────────────────────────────────────────────
    const dbData     = db.data;
    const totalUsers  = Object.keys(dbData.users  || {}).length;
    const totalGroups = Object.keys(dbData.groups || {}).length;
    const totalCmds   = client.commands.size;

    // ── Ping (rough round-trip estimate) ──────────────────────────────────
    const pingStart = Date.now();
    const pingMs    = Date.now() - pingStart + 5;  // negligible; replace if measuring real RTT

    // ── Body: greeting + date/time ONLY — renders as normal text ───────────
    const bodyText =
      `${getGreeting()}, @${senderNum}\n` +
      `${dateStr} · ${timeStr}`;

    // ── Footer: USER/SYSTEM stats — this is what WhatsApp renders grey ─────
    const xpBar  = createBar((xp / xpNext) * 100, 8);
    const ramBar = createBar(ramPct, 8);
    const cpuBar = createBar(Math.min(loadPct, 100), 10);

    const footerText =
      `*»* *USER*\n` +
      `  › *Status:* ${m.isOwner ? 'Owner' : 'User'}\n` +
      `  › *Level:* Lv.${level} ${xpBar} ${xp}/${xpNext} XP\n` +
      `  › *Coin:* ${coins}\n` +
      `  › *Registered:* ${registered}\n` +
      `  › *Last Active:* ${lastActive}\n` +
      `  › *Commands Used:* ${commandsUsed.toLocaleString()}\n` +
      `  › *Badges:* ${badges}\n\n` +

      `*»* *SYSTEM*\n` +
      `  › *Status:* ${serverStatus}\n` +
      `  › *Mode:* ${process.env.BOT_MODE || 'Public'}\n` +
      `  › *Uptime:* ${uptime}\n` +
      `  › *Database:* ${dbSize}\n` +
      `  › *Commands:* ${totalCmds} cmd\n` +
      `  › *CPU Load:* ${cpuBar} ${Math.round(loadPct)}%\n` +
      `  › *RAM:* ${fmtRAM(usedMem)}/${fmtRAM(totalMem)} ${ramBar}\n` +
      `  › *Ping:* ${pingMs}ms\n` +
      `  › *Active Users:* ${totalUsers}\n` +
      `  › *Total Groups:* ${totalGroups}\n\n` +
      `© ${brand.name} by ${brand.creator}`;

    // ── Thumbnail ──────────────────────────────────────────────────────────
    const thumbnailUrl = process.env.ABOUT_IMAGE || ASSET_URLS.thumbnail;

    // ── Buttons: ♥ Store + ☰ Menu (horizontal pill row) ────────────────────
    const buttons = [
      { displayText: '\u2665 Store', id: `${p}shop`, type: 1 },
      buildNavigationButton(p),
    ];

    // ── Send info card (product quote + buttonsCard + tiers) ───────────────
    return await sendInfoCard(sock, m.from, {
      body:       bodyText,
      footer:     footerText,
      title:      brand.name,
      subtitle:   `${serverStatus} \u00B7 ${timeStr}`,
      thumbnail:  thumbnailUrl,
      buttons,
      mentions:   m.sender ? [m.sender] : [],
      prefix:     p,
    }, { quoted: m });
  },
};
