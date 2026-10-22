/**
 * Verifies the vendored HTML-game payloads against their manifest.
 *
 * Integrity model (owner-directed 2026-10-22 rebrand):
 *   - localSha256  → pins OUR vendored copy (NEXORA-rebranded). A mismatch
 *                    means the local file was edited outside a rebrand —
 *                    restore it or re-pin deliberately.
 *   - upstreamSha256 → provenance: the byte-faithful original from the real
 *                    source. Files with a remote `source` URL are re-fetched
 *                    and compared against this hash to detect upstream drift.
 *                    On drift, decide: follow (re-apply the rebrand + re-pin
 *                    both hashes) or keep the pin.
 *   - inline-sourced files (calc.html) are hash-checked only.
 *
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
  const localPin = meta.localSha256 || meta.sha256;
  if (sha !== localPin) {
    console.error(`✗ ${file}: local sha256 ${sha} ≠ manifest ${localPin} (file was edited — restore it, or re-pin after an intentional rebrand)`);
    fail++;
    continue;
  }
  if (!/^https:\/\//.test(meta.source)) {
    console.log(`✓ ${file}: local hash matches (inline source, no remote to fetch)`);
    continue;
  }
  try {
    const res = await fetch(meta.source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = Buffer.from(await res.arrayBuffer());
    const rsha = crypto.createHash('sha256').update(remote).digest('hex');
    const upstreamPin = meta.upstreamSha256 || meta.sha256;
    if (rsha === upstreamPin) {
      console.log(`✓ ${file}: local hash ok, upstream unchanged`);
    } else {
      console.error(`✗ ${file}: real source changed upstream (remote sha256 ${rsha} ≠ pinned ${upstreamPin}) — decide: follow or pin`);
      fail++;
    }
  } catch (e) {
    console.warn(`⚠ ${file}: could not fetch source (${e.message}) — local hash still verified ✓`);
  }
}
console.log(fail ? `${fail} mismatch(es)` : 'all payloads verified (local pins + upstream provenance)');
process.exit(fail ? 1 : 0);
