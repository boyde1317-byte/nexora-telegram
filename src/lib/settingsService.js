/**
 * settingsService.js — Runtime layer over the frozen config.
 *
 * config/index.js resolves env at import time and Object.freeze's the
 * result, so nothing there can change at runtime. This service keeps a
 * *settings override* map in the database: every lookup falls back to
 * the config default, so the .env value stays the baseline and owners
 * can flip/set values live with .settings — persisted across restarts.
 *
 * Two legacy flat keys are honored for backward compatibility:
 *   publicMode  — read/written at db.settings.publicMode (was used by
 *                 the .self/.public commands before this service)
 *   anticall    — read/written at db.settings.anticall (the .anticall
 *                 command's toggle)
 */

const overridesKey = 'overrides';

// ── registry: every runtime-manageable config setting ───────────────────────
// type: 'bool' | 'int' | 'float' | 'string'
// dbKey: optional legacy flat settings key (else stored under overrides)
// restart: value is only consumed at boot — changes apply next restart
// gateCat: command categories this feature flag disables at dispatch
export const SETTING_DEFS = {
  // ── behavior ───────────────────────────────────────────────────────────
  publicMode:            { type: 'bool', label: 'Public Mode',       cat: 'Behavior', dbKey: 'publicMode' },
  autoRead:              { type: 'bool', label: 'Auto-Read Chats',    cat: 'Behavior' },
  autoStatusView:        { type: 'bool', label: 'Auto-View Status',   cat: 'Behavior' },

  // ── feature flags (gate command categories at dispatch) ────────────────
  'features.ai':             { type: 'bool', label: 'AI Commands',        cat: 'Features', gateCat: ['ai', 'logomaker'] },
  'features.economy':        { type: 'bool', label: 'Economy',             cat: 'Features', gateCat: ['economy'] },
  'features.greetings':      { type: 'bool', label: 'Greetings',          cat: 'Features' },
  'features.newsletters':    { type: 'bool', label: 'Channel / Newsletters', cat: 'Features', gateCat: ['channel'] },
  'features.games':          { type: 'bool', label: 'Games',              cat: 'Features', gateCat: ['games'] },
  'features.downloads':      { type: 'bool', label: 'Downloaders',        cat: 'Features', gateCat: ['download'] },
  'features.groupManagement':{ type: 'bool', label: 'Group Management',    cat: 'Features', gateCat: ['group'] },
  'features.statusPosting':  { type: 'bool', label: 'Status Posting',      cat: 'Features' },
  'features.antiCall':       { type: 'bool', label: 'Anti-Call',           cat: 'Features', dbKey: 'anticall' },
  'features.autoRecovery':   { type: 'bool', label: 'Auto-Recovery',       cat: 'Features', restart: true },
  'features.hotReload':      { type: 'bool', label: 'Hot Reload',         cat: 'Features', restart: true },
  'features.adReplyCards':   { type: 'bool', label: 'Link-Preview Cards', cat: 'Features' },

  // ── cosmetics ──────────────────────────────────────────────────────────
  'adReply.renderLargerThumbnail': { type: 'bool',   label: 'Large Preview Thumb', cat: 'Cosmetics' },
  'adReply.title':                 { type: 'string', label: 'Card Title',   cat: 'Cosmetics', max: 60 },
  'adReply.body':                  { type: 'string', label: 'Card Body',    cat: 'Cosmetics', max: 80 },
  'adReply.sourceUrl':             { type: 'string', label: 'Card Link',    cat: 'Cosmetics', max: 200 },

  // ── limits ─────────────────────────────────────────────────────────────
  'rateLimit.maxCommands':    { type: 'int', label: 'Rate Limit / Commands', cat: 'Limits', min: 1, max: 200 },
  'rateLimit.windowMs':       { type: 'int', label: 'Rate Limit Window (ms)', cat: 'Limits', min: 1000, max: 600000 },
  'rateLimit.cooldownMs':     { type: 'int', label: 'Command Cooldown (ms)', cat: 'Limits', min: 0, max: 600000 },
  'moderation.antilinkWarnThreshold': { type: 'int', label: 'Antilink Warn Threshold', cat: 'Limits', min: 1, max: 10 },
  'moderation.antitagThreshold':      { type: 'int', label: 'Antitag Threshold',      cat: 'Limits', min: 2, max: 50 },
  'moderation.warnExpiryMs':          { type: 'int', label: 'Warn Expiry (ms)',       cat: 'Limits', min: 60000, max: 604800000 },
  'xp.perMessageMin':        { type: 'int', label: 'XP / Message (min)', cat: 'XP & Economy', min: 1, max: 100 },
  'xp.perMessageMax':        { type: 'int', label: 'XP / Message (max)', cat: 'XP & Economy', min: 1, max: 100 },
  'xp.messageCooldownMs':    { type: 'int', label: 'XP Cooldown (ms)',   cat: 'XP & Economy', min: 1000, max: 3600000 },
  'xp.levelUpCoinBonus':     { type: 'int', label: 'Level-Up Coin Bonus', cat: 'XP & Economy', min: 0, max: 10000 },
  'xp.dailyBaseXp':          { type: 'int', label: 'Daily XP Base',       cat: 'XP & Economy', min: 1, max: 10000 },
  'xp.dailyBaseCoins':       { type: 'int', label: 'Daily Coin Base',     cat: 'XP & Economy', min: 0, max: 10000 },
  'xp.maxStreakBonus':       { type: 'int', label: 'Max Streak Bonus',     cat: 'XP & Economy', min: 0, max: 10000 },
  'media.maxFileSize':       { type: 'int', label: 'Max Media Size (bytes)', cat: 'Limits', min: 1048576, max: 104857600 },

};

// ── helpers ────────────────────────────────────────────────────────────────
function deepGet(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function getSettingDef(key) {
  return SETTING_DEFS[key] || null;
}

export function listSettingKeys() {
  return Object.keys(SETTING_DEFS);
}

/** Resolve a setting: db override → legacy flat key → frozen config default. */
export function getSetting(key, { db, config } = {}) {
  const def = SETTING_DEFS[key];
  if (!def) return undefined;
  const settings = db ? db.getSettings() : {};
  if (def.dbKey && settings[def.dbKey] !== undefined) return settings[def.dbKey];
  const ov = settings[overridesKey]?.[key];
  if (ov !== undefined) return ov;
  return deepGet(config, key);
}

/** Is a command category enabled under the current feature flags? */
export function isCategoryEnabled(category, { db, config } = {}) {
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    if (def.gateCat?.includes(category)) {
      if (getSetting(key, { db, config }) === false) return false;
    }
  }
  return true;
}

/**
 * Set (or toggle) a setting. Returns { ok, value | error, def }.
 * Booleans toggle when value === undefined.
 */
export function setSetting(key, value, { db, config } = {}) {
  const def = SETTING_DEFS[key];
  if (!def) return { ok: false, error: `Unknown setting \`${key}\`.` };

  const settings = db.getSettings();
  const current  = getSetting(key, { db, config });

  let next;
  if (value === undefined || value === null || value === '') {
    if (def.type !== 'bool') return { ok: false, error: `Provide a value for \`${key}\` (got: current = ${current}).` };
    next = !current;
  } else if (def.type === 'bool') {
    next = ['on', 'true', '1', 'yes', 'enabled'].includes(String(value).toLowerCase().trim());
  } else if (def.type === 'int' || def.type === 'float') {
    next = def.type === 'int' ? Number.parseInt(value, 10) : Number.parseFloat(value);
    if (Number.isNaN(next)) return { ok: false, error: `\`${value}\` is not a valid ${def.type} for \`${key}\`.` };
    if (def.min !== undefined && next < def.min) return { ok: false, error: `${def.label} must be ≥ ${def.min}.` };
    if (def.max !== undefined && next > def.max) return { ok: false, error: `${def.label} must be ≤ ${def.max}.` };
  } else {
    next = String(value).trim().slice(0, def.max || 200);
    if (!next) return { ok: false, error: 'Empty value.' };
  }

  if (def.dbKey) {
    db.setSettings({ [def.dbKey]: next });
  } else {
    const overrides = settings[overridesKey] || {};
    overrides[key] = next;
    db.setSettings({ [overridesKey]: overrides });
  }
  return { ok: true, value: next, def };
}

/** Clear an override (or all) — back to the .env/config default. */
export function resetSetting(key, { db } = {}) {
  const settings = db.getSettings();
  if (key === 'all') {
    const { [overridesKey]: _drop, ...rest } = settings;
    db._data.settings = rest; // full replace: drop overrides but keep legacy keys
    return { ok: true, cleared: 'all overrides' };
  }
  const def = SETTING_DEFS[key];
  if (!def) return { ok: false, error: `Unknown setting \`${key}\`.` };
  if (def.dbKey) {
    const next = { ...settings };
    delete next[def.dbKey];
    db._data.settings = next;
  } else if (settings[overridesKey]) {
    const overrides = { ...settings[overridesKey] };
    delete overrides[key];
    db.setSettings({ [overridesKey]: overrides });
  }
  return { ok: true };
}
