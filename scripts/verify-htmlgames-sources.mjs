/**
 * Verifies the vendored HTML-game payloads against their real sources.
 * The real source is the only source of truth: each file's sha256 must
 * match SOURCES.json. Files with a remote `source` URL are re-fetched and
 * compared; inline-sourced files (calc.html) are hash-checked only.
 * Run: node scripts/verify-htmlgames-sources.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = path.join(__dirname, '..', 'src', 'assets', 'htmlgames');
const manifest = JSON.parse(fs.readFileSync(path.join(GAMES_DIR, 'SOURCES.json'), 'utf8'));

let fail = 0;
for (const [file, meta] of Object.entries(manifest.files)) {
  const local = fs.readFileSync(path.join(GAMES_DIR, file));
  const sha = crypto.createHash('sha256').update(local).digest('hex');
  if (sha !== meta.sha256) {
    console.error(`✗ ${file}: local sha256 ${sha} ≠ manifest ${meta.sha256} (file was edited — restore from real source)`);
    fail++;
    continue;
  }
  if (!/^https:\/\//.test(meta.source)) {
    console.log(`✓ ${file}: hash matches (inline source, no remote to fetch)`);
    continue;
  }
  try {
    const res = await fetch(meta.source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = Buffer.from(await res.arrayBuffer());
    if (remote.equals(local)) {
      console.log(`✓ ${file}: byte-identical to real source`);
    } else {
      const rsha = crypto.createHash('sha256').update(remote).digest('hex');
      console.error(`✗ ${file}: real source changed upstream (remote sha256 ${rsha}) — decide: follow or pin`);
      fail++;
    }
  } catch (e) {
    console.warn(`⚠ ${file}: could not fetch source (${e.message}) — local hash still verified ✓`);
  }
}
console.log(fail ? `${fail} mismatch(es)` : 'all payloads match their real sources');
process.exit(fail ? 1 : 0);
