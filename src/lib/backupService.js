/**
 * backupService.js — automatic database backups with rotation.
 *
 * Every 24h the database file is snapshotted into ./backups/ as
 * db-YYYYMMDD-HHmmss.json (atomic write: temp file + rename). Backups
 * older than 7 days are pruned automatically, so the folder stays
 * bounded. The schedule self-checks hourly and back-fills a missed
 * backup immediately after downtime or redeploy.
 *
 * .backup (owner) drives the same functions manually: now / list /
 * restore. Restore always writes a safety copy (db.json.pre-restore)
 * before overwriting, so a bad restore is itself reversible.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';

const BACKUP_DIR = path.resolve(process.cwd(), process.env.BACKUP_DIR || 'backups');
const INTERVAL_MS = 24 * 60 * 60 * 1000; // backup at most every 24h
const CHECK_MS = 60 * 60 * 1000;       // check hourly
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep 7 days

let _timer = null;

export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => /^db-\d{8}-\d{6}\.json$/.test(f))
      .map(f => {
        const full = path.join(BACKUP_DIR, f);
        const st = fs.statSync(full);
        return { name: f, path: full, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) {
    return [];
  }
}

/** Snapshot the live database file. Returns the created backup entry. */
export function runBackup(db) {
  // Flush any pending debounced save so the snapshot is current.
  try { db?.saveSync?.(); } catch (_) {}
  const dbPath = path.resolve(process.cwd(), config.dbPath);
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'No database file found.' };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const now = new Date();
  const stamp = [
    'db',
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`,
    `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`,
  ].join('-');
  const target = path.join(BACKUP_DIR, `${stamp}.json`);
  const tmp = `${target}.tmp`;
  fs.copyFileSync(dbPath, tmp);
  fs.renameSync(tmp, target);

  pruneBackups();
  return { ok: true, entry: listBackups().find(b => b.path === target) };
}

/** Delete backups older than the retention window. Returns removed count. */
export function pruneBackups(nowMs = Date.now()) {
  const cutoff = nowMs - RETENTION_MS;
  let removed = 0;
  for (const b of listBackups()) {
    if (b.mtime < cutoff) {
      try { fs.unlinkSync(b.path); removed++; } catch (_) {}
    }
  }
  return removed;
}

/** Overwrite db.json with a backup file. Writes a safety copy first. */
export function restoreBackup(name, db) {
  if (!/^db-\d{8}-\d{6}\.json$/.test(name)) return { ok: false, error: 'Invalid backup filename.' };
  const src = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(src)) return { ok: false, error: 'Backup not found.' };

  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(src, 'utf-8')); }
  catch { return { ok: false, error: 'Backup file is corrupted.' }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Backup file is not a database.' };

  const dbPath = path.resolve(process.cwd(), config.dbPath);
  try {
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.pre-restore`);
    fs.copyFileSync(src, dbPath);
    db?.reload?.();
    db?.saveSync?.();
    return { ok: true, restored: name };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Start the hourly self-check. Backs up immediately when the newest
 * backup is missing or older than 24h (covers fresh deploys).
 */
export function scheduleBackups(db) {
  if (_timer) clearInterval(_timer);
  const tick = async () => {
    try {
      const latest = listBackups()[0];
      const age = latest ? Date.now() - latest.mtime : Infinity;
      if (age >= INTERVAL_MS) {
        const res = runBackup(db);
        if (res.ok) {
          const { mtime } = fs.statSync(res.entry.path);
          console.log(`[BACKUP] Database snapshot saved: ${res.entry.name} (${Math.round(res.entry.size / 1024)} KB) at ${new Date(mtime).toISOString()}`);
        }
      }
    } catch (err) {
      console.warn('[BACKUP] Scheduled check failed:', err.message);
    }
  };
  tick();
  _timer = setInterval(tick, CHECK_MS);
  _timer.unref?.();
}

export function backupDir() { return BACKUP_DIR; }
