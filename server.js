// ─── Load environment variables FIRST before any other imports ───────────────
// NOTE: 'dotenv/config' is a side-effecting import that runs at import-time
// (not a function call), so it executes before other imports resolve —
// unlike calling dotenvConfig() as a statement, which ESM hoists imports
// above, causing env-dependent modules (e.g. config/index.js) to load
// before .env is actually read.
import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectToWhatsApp } from './src/core/connection.js';
import { client } from './src/core/client.js';
import { assetManager } from './src/assets/assetManager.js';
import { db } from './src/database/db.js';
import brand from './config/brand.js';
import { pairRouter, SOCIALS } from './src/web/pairWeb.js';
import { config, configValidation } from './config/index.js';

const app = express();
const PORT = config.server.port;
const HOST = config.server.host;

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Body parser for API endpoints
app.use(express.json({ limit: '1mb' }));

// Rate limit all API routes — prevent abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limit on the health endpoint to prevent monitoring abuse
const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Free web pairing (own stricter rate limits; outside /api limiter) ──────
app.use(pairRouter);

app.use('/api/health', healthLimiter);
app.use('/api/', apiLimiter);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
let httpServer = null;
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] ${signal} received. Closing connections and saving state...`);

  // 1. Stop the auto-save interval
  try {
    db.stopAutoSave();
  } catch (_) {}

  // 2. Persist the database immediately
  try {
    db.saveSync();
    console.log('[SHUTDOWN] Database saved.');
  } catch (err) {
    console.error('[SHUTDOWN] Failed to save database:', err.message);
  }

  // 3. Tear down the Baileys socket if open
  try {
    if (client.socket) {
      client.socket.end(undefined);
      console.log('[SHUTDOWN] WhatsApp socket closed.');
    }
  } catch (_) {}

  // 4. Stop the HTTP server
  if (httpServer) {
    httpServer.close(() => {
      console.log('[SHUTDOWN] HTTP server closed. Goodbye.');
      process.exit(0);
    });
    // Force-kill if HTTP close takes too long
    setTimeout(() => process.exit(0), 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─── Global error safety nets ─────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception — saving DB then exiting:', err);
  try { db.saveSync(); } catch (_) {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] Unhandled Promise Rejection:', reason);
});

// ─── Web Server ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${brand.name}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #0c0f12;
          color: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
          background-color: #171d24;
          padding: 3rem;
          border-radius: 12px;
          border: 1px solid #2d3748;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
          max-width: 500px;
          width: 90%;
        }
        h1 { color: #25d366; margin-bottom: 1rem; font-size: 2rem; font-weight: 700; }
        p { color: #94a3b8; font-size: 1.05rem; line-height: 1.6; margin: 0.5rem 0; }
        .status-badge {
          display: inline-block;
          background-color: #1b2622;
          color: #10b981;
          padding: 0.4rem 1rem;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.9rem;
          border: 1px solid #065f46;
          margin-top: 1.5rem;
        }
        .version { color: #475569; font-size: 0.8rem; margin-top: 1rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${brand.name}</h1>
        <p>${brand.description}</p>
        <p>Created by ${brand.creator} • Framework: ${brand.core}</p>
        <p><strong>Note:</strong> Check your server console logs to retrieve the pairing code or QR code.</p>
        <div class="status-badge">● Nexora Core v2 Ready</div>
        <a href="/pair" style="
          display:inline-block;margin-top:1.25rem;padding:0.7rem 1.6rem;
          background-color:#25d366;color:#06130a;font-weight:700;
          border-radius:10px;text-decoration:none;font-size:0.95rem;
        ">📱 Pair your number — free</a>
        <div style="margin-top:1.4rem;display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;">
          ${SOCIALS.map(function (s) { return `
          <a href="${s.url}" target="_blank" rel="noopener" style="
            display:inline-flex;align-items:center;gap:.4rem;padding:.42rem .85rem;
            background-color:#171d24;border:1px solid #2d3748;border-radius:999px;
            color:#94a3b8;font-size:.78rem;font-weight:600;text-decoration:none;">
            <span style="width:14px;height:14px;display:inline-flex;color:#25d366;">${s.svg}</span>${s.name}
          </a>`; }).join('')}
        </div>
        <p class="version">v${brand.version} • Node.js ${process.version}</p>
      </div>
    </body>
    </html>
  `);
});

// ─── Enhanced Health Endpoint ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const pluginStats = client.getPluginStats ? client.getPluginStats() : {};
  const totalExecutions = Object.values(pluginStats).reduce((sum, s) => sum + (s.executions || 0), 0);
  const totalErrors = Object.values(pluginStats).reduce((sum, s) => sum + (s.errors || 0), 0);

  res.json({
    status: 'healthy',
    version: brand.version,
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    botActive: !!client.socket,
    botConnected: client.socket?.user ? true : false,
    botName: client.socket?.user?.name || null,
    memory: {
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMb: Math.round(memUsage.external / 1024 / 1024),
      heapUsagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    plugins: {
      loaded: client.commands.size,
      aliases: client.aliases.size,
      totalExecutions,
      totalErrors,
    },
    database: {
      users: Object.keys(db.data?.users || {}).length,
      groups: Object.keys(db.data?.groups || {}).length,
    },
    config: {
      publicMode: config.publicMode,
      autoRead: config.autoRead,
      prefix: config.prefix,
      features: config.features,
    },
  });
});

// ─── API: Plugin stats endpoint ──────────────────────────────────────────────
app.get('/api/plugins', (req, res) => {
  const stats = client.getPluginStats ? client.getPluginStats() : {};
  const plugins = [];

  client.commands.forEach((cmd, name) => {
    plugins.push({
      name,
      aliases: cmd.aliases || [],
      category: cmd.category || 'hidden',
      description: cmd.description || '',
      cooldown: cmd.cooldown || 0,
      stats: stats[name] || { executions: 0, errors: 0, lastUsed: null },
    });
  });

  res.json({
    total: plugins.length,
    plugins: plugins.sort((a, b) => (b.stats.executions || 0) - (a.stats.executions || 0)),
  });
});

// ─── API: Database stats endpoint ─────────────────────────────────────────────
app.get('/api/database', (req, res) => {
  res.json({
    users: Object.keys(db.data?.users || {}).length,
    groups: Object.keys(db.data?.groups || {}).length,
    bannedUsers: Object.values(db.data?.users || {}).filter(u => u.banned).length,
    premiumUsers: Object.values(db.data?.users || {}).filter(u => u.premium).length,
  });
});

// ─── Helper: format uptime ───────────────────────────────────────────────────
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

// ─── Start ─────────────────────────────────────────────────────────────────────
httpServer = app.listen(PORT, HOST, async () => {
  console.log(`╭───────────────────────────────────╮`);
  console.log(`│         ${brand.name} v${brand.version}         │`);
  console.log(`├───────────────────────────────────┤`);
  console.log(`│ Developer  : ${brand.creator}              │`);
  console.log(`│ Engine     : ${brand.core}          │`);
  console.log(`│ Version    : v${brand.version}                  │`);
  console.log(`│ Status     : Starting              │`);
  console.log(`╰───────────────────────────────────╯`);
  console.log(`[INFO] Web server listening on ${HOST}:${PORT}...`);

  if (configValidation.warnings.length > 0) {
    console.log(`[CONFIG] ${configValidation.warnings.length} warning(s) detected. Check logs above.`);
  }

  try {
    await assetManager.init();
    // Pre-fetch and cache the externalAdReply thumbnail so the first reply isn't delayed
    const { initThumbnail } = await import('./src/lib/enrichContext.js');
    await initThumbnail();
    await client.loadPlugins();
    await connectToWhatsApp();

    // Automatic database backups — 24h snapshots, 7-day retention
    try {
      const { scheduleBackups } = await import('./src/lib/backupService.js');
      const { db } = await import('./src/database/db.js');
      scheduleBackups(db);
    } catch (err) {
      console.warn('[STARTUP] Backup scheduler failed to start:', err.message || err);
    }

    // Reminders — re-arm timers for anything pending, deliver missed ones
    try {
      const { initReminderService } = await import('./src/lib/reminderService.js');
      initReminderService();
      const { initDigestService } = await import('./src/lib/digestService.js');
      initDigestService();
    } catch (err) {
      console.warn('[STARTUP] Reminder service failed to start:', err.message || err);
    }

    // Reconnect any saved extra sessions (.pair-linked numbers)
    try {
      const { resumeExtraSessions } = await import('./src/core/sessionManager.js');
      await resumeExtraSessions();
    } catch (err) {
      console.warn('[STARTUP] Extra-session resume failed:', err.message || err);
    }

    // ── Telegram control panel (NEXORA Telegram port) ───────────────────
    // A second command surface over the same session engine: pairing,
    // approvals, fleet status and broadcasts from Telegram. No-op (and no
    // import side effects) when TELEGRAM_BOT_TOKEN is unset — the pure
    // WhatsApp deployment behaves exactly as before.
    try {
      const { startTelegramBot } = await import('./src/telegram/index.js');
      await startTelegramBot();
    } catch (err) {
      console.warn('[STARTUP] Telegram control panel failed to start:', err.message || err);
    }
  } catch (err) {
    console.error('[CRITICAL] Startup failed:', err);
    process.exit(1);
  }
});
