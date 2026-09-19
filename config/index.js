import brand from './brand.js';

/**
 * ── NEXORA-MD Configuration v2.0 ────────────────────────────────────────────
 *
 * Upgraded config system with environment variable validation, sensible
 * defaults, and structured feature flags. All values are resolved at import
 * time and frozen — no runtime mutation.
 *
 * SECURITY: Owner numbers are read from env only — no hardcoded fallback
 * phone numbers in source. If env is unset, an empty array is returned and
 * the bot will have no owner (all owner-only commands will be inaccessible
 * until OWNER_NUMBERS is set in .env).
 */

// ── Helper: parse phone numbers from env ────────────────────────────────────
function parseOwnerNumbers() {
  const raw = process.env.OWNER_NUMBERS;
  if (raw && raw.trim()) {
    return raw.split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  }
  console.warn('[CONFIG] OWNER_NUMBERS not set in environment. Owner-only commands will be unavailable until configured.');
  return [];
}

// ── Super owner tier ────────────────────────────────────────────────────────
// SUPER_OWNER_NUMBERS (comma-separated) can log out every paired session at
// once (.logoutall) and unpair any session individually — powers regular
// owners and paired-session owners don't have. Defaults to the FIRST
// OWNER_NUMBERS entry when not set.
function parseSuperOwnerNumbers(ownerList) {
  const raw = process.env.SUPER_OWNER_NUMBERS;
  if (raw && raw.trim()) {
    return raw.split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  }
  return ownerList.length ? [ownerList[0]] : [];
}

// ── Helper: parse boolean env vars ──────────────────────────────────────────
function parseBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  return ['true', '1', 'yes', 'on', 'enabled'].includes(val.toLowerCase().trim());
}

// ── Helper: parse integer env vars ──────────────────────────────────────────
function parseInt(val, defaultVal) {
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// ── Validate required env vars at startup ────────────────────────────────────
function validateConfig(config) {
  const warnings = [];
  const errors = [];

  if (config.owner.length === 0) {
    warnings.push('OWNER_NUMBERS not set — owner commands unavailable');
  }

  if (config.pairing.enabled && !config.pairing.phoneNumber) {
    errors.push('Pairing mode enabled but PAIRING_PHONE not set');
  }

  // Validate phone number formats
  for (const num of config.owner) {
    if (num.length < 7 || num.length > 15) {
      warnings.push(`Owner number "${num}" looks invalid (expected 7-15 digits)`);
    }
  }

  if (config.pairing.phoneNumber) {
    const clean = config.pairing.phoneNumber.replace(/[^0-9]/g, '');
    if (clean.length < 7 || clean.length > 15) {
      warnings.push(`Pairing phone "${config.pairing.phoneNumber}" looks invalid`);
    }
    // Check that pairing phone is in owner list
    if (config.owner.length > 0 && !config.owner.includes(clean)) {
      warnings.push('PAIRING_PHONE is not in OWNER_NUMBERS list — pairing will work but the paired account may not have owner access');
    }
  }

  // Validate XP config ranges
  if (config.xp.perMessageMin >= config.xp.perMessageMax) {
    warnings.push('xp.perMessageMin should be less than xp.perMessageMax');
  }

  // Log warnings
  for (const w of warnings) {
    console.warn(`[CONFIG WARNING] ${w}`);
  }

  // Log errors and exit if critical
  for (const e of errors) {
    console.error(`[CONFIG ERROR] ${e}`);
  }

  return { warnings, errors, valid: errors.length === 0 };
}

// ── Build the config object ──────────────────────────────────────────────────
const rawConfig = {
  botName: brand.name,

  // ── Owner / identity ──────────────────────────────────────────────────────
  owner: parseOwnerNumbers(),
  superOwner: parseSuperOwnerNumbers(parseOwnerNumbers()),

  // ── Command prefix ────────────────────────────────────────────────────────
  prefix: ["!", ".", "/"],

  // ── Pairing configuration ─────────────────────────────────────────────────
  pairing: {
    enabled: parseBool(process.env.PAIRING_ENABLED, true),
    phoneNumber: process.env.PAIRING_PHONE || '',
  },

  // ── Session storage ───────────────────────────────────────────────────────
  sessionPath: process.env.SESSION_PATH || './session',

  // ── Connection settings ───────────────────────────────────────────────────
  reconnectLimit: parseInt(process.env.RECONNECT_LIMIT, 0), // 0 = unlimited
  connectTimeoutMs: parseInt(process.env.CONNECT_TIMEOUT, 60000),
  keepAliveIntervalMs: parseInt(process.env.KEEPALIVE_INTERVAL, 30000),

  // ── Rate limiting ──────────────────────────────────────────────────────────
  rateLimit: {
    maxCommands: parseInt(process.env.RATE_LIMIT_MAX, 15),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 30000), // 30 seconds
    cooldownMs: parseInt(process.env.COMMAND_COOLDOWN, 1500),
  },

  // ── Behavior toggles ──────────────────────────────────────────────────────
  autoRead: parseBool(process.env.AUTO_READ, true),
  publicMode: parseBool(process.env.PUBLIC_MODE, true),
  autoStatusView: parseBool(process.env.AUTO_STATUS_VIEW, false),

  // ── Database ──────────────────────────────────────────────────────────────
  dbPath: process.env.DB_PATH || './src/database/db.json',
  dbAutoSaveIntervalMs: parseInt(process.env.DB_AUTOSAVE_INTERVAL, 60000),

  // ── Channel / Newsletter ──────────────────────────────────────────────────
  channelJid: process.env.CHANNEL_JID || '120363406397452589@newsletter',

  // ── XP / leveling system ──────────────────────────────────────────────────
  xp: {
    perMessageMin: parseInt(process.env.XP_MIN, 5),
    perMessageMax: parseInt(process.env.XP_MAX, 15),
    messageCooldownMs: parseInt(process.env.XP_COOLDOWN, 60000),
    levelUpAnnounce: parseBool(process.env.XP_ANNOUNCE, true),
    levelUpCoinBonus: parseInt(process.env.XP_LEVELUP_BONUS, 50),
    dailyBaseXp: parseInt(process.env.DAILY_BASE_XP, 100),
    dailyBaseCoins: parseInt(process.env.DAILY_BASE_COINS, 50),
    streakBonusMultiplier: parseFloat(process.env.STREAK_MULTIPLIER || '1.5'),
    maxStreakBonus: parseInt(process.env.MAX_STREAK_BONUS, 200),
  },

  // ── Anti-spam / moderation ────────────────────────────────────────────────
  moderation: {
    antilinkWarnThreshold: parseInt(process.env.ANTILINK_WARN_THRESHOLD, 3),
    antitagThreshold: parseInt(process.env.ANTITAG_THRESHOLD, 10),
    warnExpiryMs: parseInt(process.env.WARN_EXPIRY, 86400000), // 24 hours
  },

  // ── Logging ────────────────────────────────────────────────────────────────
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || null,
    maxFileSize: parseInt(process.env.LOG_MAX_SIZE, 10 * 1024 * 1024), // 10MB
  },

  // ── Features (feature flags) ─────────────────────────────────────────────
  features: {
    ai: parseBool(process.env.ENABLE_AI, true),
    economy: parseBool(process.env.ECONOMY_ENABLED, true),
    greetings: parseBool(process.env.GREETINGS_ENABLED, true),
    newsletters: parseBool(process.env.NEWSLETTER_ENABLED, true),
    games: parseBool(process.env.GAMES_ENABLED, true),
    downloads: parseBool(process.env.DOWNLOADS_ENABLED, true),
    groupManagement: parseBool(process.env.GROUP_MGMT_ENABLED, true),
    statusPosting: parseBool(process.env.STATUS_ENABLED, true),
    antiCall: parseBool(process.env.ANTI_CALL, true),
    autoRecovery: parseBool(process.env.AUTO_RECOVERY, true),
    hotReload: parseBool(process.env.HOT_RELOAD, process.env.NODE_ENV === 'development'),
    // ── externalAdReply preview cards on text-only replies ────────────────
    // When enabled, every m.reply(text) call automatically gets a contextInfo
    // with an externalAdReply banner (bot logo + source URL link-preview card)
    // attached — no need for each plugin to pass contextInfo manually.
    // Set AD_REPLY_CARDS=false in .env to disable.
    adReplyCards: parseBool(process.env.AD_REPLY_CARDS, true),
  },

  // ── externalAdReply card appearance ──────────────────────────────────────
  // Defaults pulled from config/brand.js at runtime — override via env only
  // if you need per-deployment customisation.
  adReply: {
    title: process.env.AD_REPLY_TITLE || '',        // empty = use brand.name
    body: process.env.AD_REPLY_BODY || '',           // empty = use brand.tagline
    sourceUrl: process.env.AD_REPLY_URL || '',       // empty = GitHub repo URL
    thumbnailUrl: process.env.AD_REPLY_THUMBNAIL || '', // empty = ASSET_URLS.thumbnail
    renderLargerThumbnail: parseBool(process.env.AD_REPLY_LARGE_THUMB, false),
  },

  // ── Web server ────────────────────────────────────────────────────────────
  server: {
    port: parseInt(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    cors: parseBool(process.env.ENABLE_CORS, false),
  },

  // ── Media ──────────────────────────────────────────────────────────────────
  media: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 50 * 1024 * 1024), // 50MB
    stickerPackSize: parseInt(process.env.STICKER_PACK_SIZE, 10),
    tempDir: process.env.TEMP_DIR || '/tmp/nexora-media',
  },
};

// Parse float helper (needed above)
function parseFloat(val, defaultVal) {
  const parsed = Number.parseFloat(val);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// Run validation
const _validation = validateConfig(rawConfig);

// Freeze the config to prevent accidental mutation
export const config = Object.freeze(rawConfig);

// Export validation results for startup diagnostics
export const configValidation = _validation;

export default config;
