import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgPath = resolve(__dirname, '../node_modules/libsignal/package.json');

if (!existsSync(pkgPath)) {
  console.log('[patch-libsignal] node_modules/libsignal not found — skipping.');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

if (pkg.exports) {
  console.log('[patch-libsignal] libsignal already has exports map — removing to prevent double-.js conflict.');
  delete pkg.exports;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('[patch-libsignal] Cleared exports map. Baileys fork now uses .js imports natively.');
} else {
  console.log('[patch-libsignal] libsignal has no exports map — no patch needed (baileys fork uses .js imports).');
}
