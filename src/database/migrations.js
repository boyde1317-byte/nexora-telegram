/**
 * Database Migration and Schema Validation System for NEXORA-MD
 */

/**
 * Validates top-level database structure against expected schema keys.
 * Logs warnings for missing or unexpected keys.
 *
 * @param {object} data - Database state object
 * @returns {boolean} - True if validation finished
 */
export function validateSchema(data) {
  if (!data || typeof data !== 'object') {
    console.warn('[DB SCHEMA] Invalid database data object provided.');
    return false;
  }

  const expectedKeys = ['users', 'groups', 'settings', 'stats', 'reminders', 'digest'];
  const actualKeys = Object.keys(data);

  // Check missing expected keys
  for (const key of expectedKeys) {
    if (!(key in data)) {
      console.warn(`[DB SCHEMA WARNING] Missing expected top-level key: "${key}"`);
    }
  }

  // Check unexpected top-level keys
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      console.warn(`[DB SCHEMA WARNING] Unexpected top-level key: "${key}"`);
    }
  }

  return true;
}

/**
 * Built-in migrations list.
 * Each migration object contains:
 *   - id: unique numeric identifier
 *   - name: short descriptive name
 *   - up: function(data) performing data mutations
 */
export const migrations = [
  {
    id: 1,
    name: 'addUserFields',
    up(data) {
      if (!data.users) data.users = {};
      for (const jid of Object.keys(data.users)) {
        const user = data.users[jid];
        if (!user || typeof user !== 'object') continue;
        if (user.banned === undefined) user.banned = false;
        if (user.premium === undefined) user.premium = false;
        if (user.warnings === undefined) user.warnings = 0;
        if (user.hasOnboarded === undefined) user.hasOnboarded = false;
        if (user.createdAt === undefined) user.createdAt = Date.now();
        if (user.xp === undefined) user.xp = 0;
        if (user.coins === undefined) user.coins = 0;
        if (user.level === undefined) user.level = 0;
        if (user.streak === undefined) user.streak = 0;
        if (user.lastDaily === undefined) user.lastDaily = null;
      }
    }
  },
  {
    id: 2,
    name: 'addGroupFields',
    up(data) {
      if (!data.groups) data.groups = {};
      for (const jid of Object.keys(data.groups)) {
        const group = data.groups[jid];
        if (!group || typeof group !== 'object') continue;
        if (group.antilink === undefined) group.antilink = false;
        if (group.mute === undefined) group.mute = false;
        if (group.createdAt === undefined) group.createdAt = Date.now();
        if (group.antitag === undefined) group.antitag = false;
        if (group.warnings === undefined) group.warnings = {};
      }
    }
  },
  {
    id: 3,
    name: 'addSettingsDefaults',
    up(data) {
      if (!data.settings) data.settings = {};
      if (data.settings.menuStyle === undefined) data.settings.menuStyle = 1;
      if (data.settings.theme === undefined) data.settings.theme = 'modern';
      if (data.settings.footerStyle === undefined) data.settings.footerStyle = 'clean';
      if (data.settings.publicMode === undefined) data.settings.publicMode = true;
      if (data.settings.autoRead === undefined) data.settings.autoRead = true;
    }
  },
  {
    id: 4,
    name: 'migrateGreetingFlags',
    up(data) {
      if (!data.groups) return;
      let migrated = 0;
      for (const jid of Object.keys(data.groups)) {
        const g = data.groups[jid];
        if (!g || typeof g !== 'object') continue;
        if ('welcome' in g && g.welcome === false) {
          delete g.welcome;
          migrated++;
        }
        if ('goodbye' in g && g.goodbye === false) {
          delete g.goodbye;
          migrated++;
        }
      }
      if (migrated > 0) {
        console.log(`[DB MIGRATION] Cleaned ${migrated} stale greeting flag(s) from existing groups.`);
      }
    }
  },
  {
    id: 5,
    name: 'addPluginStats',
    up(data) {
      if (!data.settings) data.settings = {};
      if (!data.settings.pluginStats || typeof data.settings.pluginStats !== 'object') {
        data.settings.pluginStats = {};
      }
    }
  },
  {
    id: 6,
    name: 'addConnectionStats',
    up(data) {
      if (!data.settings) data.settings = {};
      const defaultStats = {
        totalConnections: 0,
        disconnects: 0,
        lastConnected: null,
        lastDisconnected: null,
        uptime: 0
      };
      if (!data.settings.connectionStats || typeof data.settings.connectionStats !== 'object') {
        data.settings.connectionStats = defaultStats;
      } else {
        for (const [key, val] of Object.entries(defaultStats)) {
          if (data.settings.connectionStats[key] === undefined) {
            data.settings.connectionStats[key] = val;
          }
        }
      }
    }
  },
  {
    id: 7,
    name: 'addSudoOwners',
    up(data) {
      if (!data.settings) data.settings = {};
      if (!Array.isArray(data.settings.sudoOwners)) {
        data.settings.sudoOwners = [];
      }
    }
  }
];

/**
 * Runs all pending migrations in order.
 * Tracks applied migration IDs in data.settings._migrations.
 * Logs each migration applied and saves database after completion.
 *
 * @param {object} data - Database state object
 * @param {function} [saveFn] - Optional function to save database state after migrations
 * @returns {object} - Mutated data object
 */
export function runMigrations(data, saveFn) {
  if (!data || typeof data !== 'object') {
    console.error('[DB MIGRATION] Invalid data provided to runMigrations.');
    return data;
  }

  validateSchema(data);

  if (!data.users) data.users = {};
  if (!data.groups) data.groups = {};
  if (!data.settings) data.settings = {};
  if (!Array.isArray(data.settings._migrations)) {
    data.settings._migrations = [];
  }

  const appliedMigrations = data.settings._migrations;
  let appliedCount = 0;

  // Execute pending migrations in ID order
  const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);

  for (const migration of sortedMigrations) {
    if (!appliedMigrations.includes(migration.id)) {
      try {
        console.log(`[DB MIGRATION] Running migration #${migration.id} (${migration.name})...`);
        migration.up(data);
        data.settings._migrations.push(migration.id);
        appliedCount++;
        console.log(`[DB MIGRATION] Applied migration #${migration.id} (${migration.name}) successfully.`);
      } catch (err) {
        console.error(`[DB MIGRATION] Failed migration #${migration.id} (${migration.name}):`, err.message);
      }
    }
  }

  if (appliedCount > 0) {
    console.log(`[DB MIGRATION] Completed ${appliedCount} migration(s).`);
    if (typeof saveFn === 'function') {
      saveFn(data);
    }
  }

  return data;
}
