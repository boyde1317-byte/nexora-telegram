import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/index.js';
import { runMigrations, validateSchema } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_PATH = path.resolve(process.cwd(), config.dbPath);

// ── Auto-save interval ──────────────────────────────────────────────────────
const AUTO_SAVE_INTERVAL_MS = config.dbAutoSaveIntervalMs || 60_000;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadDb() {
  try {
    ensureDir(DB_PATH);
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, groups: {}, settings: {} }, null, 2), 'utf-8');
    }
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[DB CRITICAL] Failed to load database:', err.message);
    const backupPath = `${DB_PATH}.bak`;
    if (fs.existsSync(backupPath)) {
      console.warn('[DB] Attempting restoration from backup file...');
      try {
        return JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      } catch (_) {}
    }
    console.error('[DB CRITICAL] No valid backup found. Starting with empty database.');
    return { users: {}, groups: {}, settings: {} };
  }
}

function saveDb(data) {
  try {
    ensureDir(DB_PATH);
    const tempPath = `${DB_PATH}.tmp`;
    const backupPath = `${DB_PATH}.bak`;
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, serialized, 'utf-8');
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
    }
    fs.renameSync(tempPath, DB_PATH);
    return true;
  } catch (err) {
    console.error('[DB] Failed to save database:', err.message);
    return false;
  }
}

// ── Load and migrate ──────────────────────────────────────────────────────────
let _data = loadDb();

// Run migration system (replaces the old inline migrateGreetingFlags)
runMigrations(_data, (data) => saveDb(data));

export const db = {
  data: _data,
  _saveTimeout: null,
  _autoSaveInterval: null,

  get(key) {
    return _data[key];
  },

  set(key, value) {
    _data[key] = value;
    this.save();
  },

  getUser(jid) {
    if (!_data.users) _data.users = {};
    if (!_data.users[jid]) {
      _data.users[jid] = {
        jid,
        banned: false,
        premium: false,
        warnings: 0,
        hasOnboarded: false,
        createdAt: Date.now(),
        xp: 0,
        coins: 0,
        level: 0,
        streak: 0,
        lastDaily: null,
      };
    }
    return _data.users[jid];
  },

  setUser(jid, data) {
    if (!_data.users) _data.users = {};
    _data.users[jid] = { ...this.getUser(jid), ...data };
    this.save();
  },

  getGroup(jid) {
    if (!_data.groups) _data.groups = {};
    if (!_data.groups[jid]) {
      _data.groups[jid] = {
        jid,
        antilink: false,
        antitag: false,
        mute: false,
        warnings: {},
        createdAt: Date.now(),
      };
    }
    return _data.groups[jid];
  },

  setGroup(jid, data) {
    if (!_data.groups) _data.groups = {};
    _data.groups[jid] = { ...this.getGroup(jid), ...data };
    this.save();
  },

  getSettings() {
    if (!_data.settings) _data.settings = {};
    return _data.settings;
  },

  setSettings(data) {
    if (!_data.settings) _data.settings = {};
    _data.settings = { ...this.getSettings(), ...data };
    this.save();
  },

  saveSync() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    saveDb(_data);
  },

  save() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      saveDb(_data);
    }, 2000);
  },

  startAutoSave() {
    if (this._autoSaveInterval) return;
    this._autoSaveInterval = setInterval(() => {
      saveDb(_data);
    }, AUTO_SAVE_INTERVAL_MS);
    this._autoSaveInterval.unref();
  },

  stopAutoSave() {
    if (this._autoSaveInterval) {
      clearInterval(this._autoSaveInterval);
      this._autoSaveInterval = null;
    }
  },

  reload() {
    _data = loadDb();
    runMigrations(_data, (data) => saveDb(data));
    this.data = _data;
  },

  /**
   * Get database statistics summary.
   * @returns {object} Stats object with counts
   */
  getStats() {
    return {
      users: Object.keys(_data.users || {}).length,
      groups: Object.keys(_data.groups || {}).length,
      bannedUsers: Object.values(_data.users || {}).filter(u => u.banned).length,
      premiumUsers: Object.values(_data.users || {}).filter(u => u.premium).length,
      totalXp: Object.values(_data.users || {}).reduce((sum, u) => sum + (u.xp || 0), 0),
      totalCoins: Object.values(_data.users || {}).reduce((sum, u) => sum + (u.coins || 0), 0),
      migrations: _data.settings?._migrations?.length || 0,
    };
  },
};

db.startAutoSave();

export default db;
