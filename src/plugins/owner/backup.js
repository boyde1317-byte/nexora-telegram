/**
 * backup.js — owner control over the automatic database backups.
 *
 *   .backup            → status: last snapshot, count, next auto run
 *   .backup now        → snapshot immediately
 *   .backup list       → table of kept snapshots
 *   .backup restore <db-...json> → restore (safety copy written first)
 *
 * Backups land in ./backups/ every 24h automatically and are pruned
 * after 7 days (see src/lib/backupService.js).
 */
import { backupDir, listBackups, runBackup, restoreBackup } from '../../lib/backupService.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const ageText = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default {
  name: 'backup',
  aliases: [],
  category: 'owner',
  description: 'Database backup manager: .backup [now|list|restore <file>]',
  permissions: { owner: true },
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix, db }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();

    // ── status ─────────────────────────────────────────────────────────────
    if (!sub || sub === 'status') {
      const all = listBackups();
      const latest = all[0];
      const body = all.length
        ? `• *Snapshots kept:* ${all.length}\n• *Last backup:* ${ageText(latest.mtime)} (${Math.round(latest.size / 1024)} KB)\n• *Retention:* 7 days, auto every 24h`
        : `• *Snapshots kept:* none yet\n• *Retention:* 7 days, auto every 24h\n\nRun \`${p}backup now\` for the first snapshot.`;
      return await m.reply.info(body, '🗄️ BACKUPS');
    }

    // ── manual snapshot ────────────────────────────────────────────────────
    if (sub === 'now') {
      await m.react('⏳');
      const res = runBackup(db);
      if (!res.ok) {
        await m.react('❌');
        return await m.reply.error(res.error || 'Backup failed.');
      }
      await m.react('✅');
      return await m.reply.success(`Snapshot saved: \`${res.entry.name}\` (${Math.round(res.entry.size / 1024)} KB)`);
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const all = listBackups();
      if (!all.length) return await m.reply.info('No snapshots yet. Use `.backup now`.', 'BACKUPS');
      return await richTableCard(sock, m.from, {
        title: `🗄️ BACKUPS (${all.length})`,
        headers: ['File', 'Size', 'Age'],
        rows: all.slice(0, 15).map(b => [
          b.name.replace(/^db-/, '').replace('.json', ''),
          `${Math.round(b.size / 1024)} KB`,
          ageText(b.mtime),
        ]),
        footer: `${p}backup restore <file> to roll back`,
      }, { quoted: m });
    }

    // ── restore ────────────────────────────────────────────────────────────
    if (sub === 'restore') {
      const file = args[1];
      if (!file) return await m.reply.warn(`Usage: \`${p}backup restore db-YYYYMMDD-HHmmss.json\` — pick from \`${p}backup list\`.`);
      await m.react('⏳');
      const target = file.endsWith('.json') ? file : `${file}.json`;
      const res = restoreBackup(target, db);
      if (!res.ok) {
        await m.react('❌');
        return await m.reply.error(res.error);
      }
      await m.react('✅');
      return await m.reply.success(`Restored \`${target}\`. A safety copy of the previous state was written to \`db.json.pre-restore\`.`);
    }

    return await m.reply.warn(`Unknown option \`${sub}\`. Use \`${p}backup\`, \`${p}backup now\`, \`${p}backup list\` or \`${p}backup restore <file>\`.`);
  },
};
