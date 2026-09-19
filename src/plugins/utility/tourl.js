/**
 * tourl.js — upload media (image/video/audio/sticker/document) to a public
 * host and return a direct URL.
 *
 * Supports multiple upload platforms with automatic fallback: if the
 * requested (or default, highest-priority) host fails, the next one in
 * HOST_ORDER is tried automatically before giving up. A specific host can
 * also be forced with `.tourl <host>`.
 *
 * Hosts:
 *   - catbox     → catbox.moe        (permanent hosting, JSON-free plain-text API)
 *   - litterbox  → litterbox.catbox.moe (catbox's temporary-hosting CDN, expires)
 *   - cdn        → 0x0.st            (minimalist file CDN, plain-text API)
 *   - uguu       → uguu.se           (temporary-hosting CDN, plain-text API)
 *   - tmpfiles   → tmpfiles.org      (original host, JSON API, ~60min expiry)
 */
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { selectMenu } from '../../lib/interactiveKit.js';

const SUPPORTED = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

const LITTERBOX_TIMES = new Set(['1h', '12h', '24h', '72h']);

// ── Per-host uploaders. Each returns { url, note }. Throw on failure. ────────
const HOSTS = {
  catbox: {
    label: 'Catbox (permanent)',
    async upload(buffer, filename, mime) {
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([buffer], { type: mime }), filename);

      const res = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Catbox returned ${res.status}.`);
      const url = (await res.text()).trim();
      if (!url.startsWith('http')) throw new Error(`Catbox rejected the upload: ${url || 'no response'}`);
      return { url, note: 'Permanent — never expires.' };
    },
  },

  litterbox: {
    label: 'Litterbox (temporary Catbox CDN)',
    async upload(buffer, filename, mime, extra = {}) {
      const time = LITTERBOX_TIMES.has(extra.time) ? extra.time : '1h';
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('time', time);
      form.append('fileToUpload', new Blob([buffer], { type: mime }), filename);

      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Litterbox returned ${res.status}.`);
      const url = (await res.text()).trim();
      if (!url.startsWith('http')) throw new Error(`Litterbox rejected the upload: ${url || 'no response'}`);
      return { url, note: `Temporary — expires in ${time}.` };
    },
  },

  cdn: {
    label: '0x0.st (CDN)',
    async upload(buffer, filename, mime) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mime }), filename);

      const res = await fetch('https://0x0.st', {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`0x0.st returned ${res.status}.`);
      const url = (await res.text()).trim();
      if (!url.startsWith('http')) throw new Error(`0x0.st rejected the upload: ${url || 'no response'}`);
      return { url, note: 'CDN-hosted — retention varies with file size/traffic.' };
    },
  },

  uguu: {
    label: 'Uguu (temporary CDN)',
    async upload(buffer, filename, mime) {
      const form = new FormData();
      form.append('files[]', new Blob([buffer], { type: mime }), filename);

      const res = await fetch('https://uguu.se/upload?output=text', {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Uguu returned ${res.status}.`);
      const url = (await res.text()).trim().split('\n')[0];
      if (!url.startsWith('http')) throw new Error(`Uguu rejected the upload: ${url || 'no response'}`);
      return { url, note: 'Temporary — expires after ~48 hours.' };
    },
  },

  tmpfiles: {
    label: 'tmpfiles.org',
    async upload(buffer, filename, mime) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mime }), filename);

      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body:   form,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`tmpfiles.org returned ${res.status}.`);
      const json = await res.json();
      const pageUrl = json?.data?.url;
      if (!pageUrl) throw new Error('tmpfiles.org: upload succeeded but no URL returned.');
      const url = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      return { url, note: 'Temporary — expires after ~60 minutes.' };
    },
  },
};

// Default try order when no host is forced: permanent/reliable first, then
// temporary CDNs, tmpfiles last (shortest-lived).
const HOST_ORDER = ['catbox', 'litterbox', 'cdn', 'uguu', 'tmpfiles'];

// ── Pending-media store ─────────────────────────────────────────────────────
// When `.tourl` is sent on media WITHOUT a host, we show a provider picker.
// Tapping a pill dispatches `.tourl <host>` as a NEW message — which no longer
// quotes the media. So we stash the serialized media target (small: media
// protos hold a URL + keys, not bytes) against (chat, sender) with a TTL, and
// the follow-up `.tourl <host>` pulls it back out.
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pendingMedia = new Map(); // `${from}:${sender}` → { target, ts }

function pendingKey(m) {
  return `${m.from}:${m.sender}`;
}

function stashPending(m, target) {
  // Prune stale entries so the Map never grows unbounded.
  const now = Date.now();
  for (const [k, v] of pendingMedia) {
    if (now - v.ts > PENDING_TTL_MS) pendingMedia.delete(k);
  }
  pendingMedia.set(pendingKey(m), { target, ts: now });
}

function takePending(m) {
  const entry = pendingMedia.get(pendingKey(m));
  if (!entry) return null;
  pendingMedia.delete(pendingKey(m));
  if (Date.now() - entry.ts > PENDING_TTL_MS) return null;
  return entry.target;
}

/**
 * Send the provider picker (proven single_select via selectMenu).
 * Each row id IS the command the pill tap dispatches.
 */
async function sendProviderPicker(sock, m) {
  await selectMenu(
    sock,
    m.from,
    {
      text:  '☁️ *Choose an upload provider*',
      footer: 'Pick a host — upload starts instantly.',
    },
    '📦 Select Provider',
    [
      {
        title: '♾️ Permanent',
        rows: [
          { id: '.tourl catbox', title: 'Catbox', description: 'Permanent — never expires' },
        ],
      },
      {
        title: '⏳ Temporary',
        rows: [
          { id: '.tourl litterbox 1h',  title: 'Litterbox · 1h',  description: 'Catbox temp CDN — 1 hour' },
          { id: '.tourl litterbox 24h', title: 'Litterbox · 24h', description: 'Catbox temp CDN — 24 hours' },
          { id: '.tourl uguu',          title: 'Uguu',            description: 'Temp CDN — ~48 hours' },
          { id: '.tourl tmpfiles',      title: 'tmpfiles.org',    description: 'Temp — ~60 minutes' },
        ],
      },
      {
        title: '⚡ CDN',
        rows: [
          { id: '.tourl cdn', title: '0x0.st', description: 'Minimalist CDN — retention varies' },
        ],
      },
    ],
    [
      { kind: 'action', label: '🚀 Auto (best first)', cmd: '.tourl auto' },
      { kind: 'action', label: '❌ Cancel',           cmd: '.tourl cancel' },
    ],
    { quoted: m }
  );
}

export default {
  name: 'tourl',
  aliases: ['geturl', 'mediaurl', 'uploadmedia', 'fileurl'],
  category: 'utility',
  description: 'Uploads any media (image, video, audio, sticker, document) to a public host and returns a direct URL.',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let target = SUPPORTED.includes(m.quoted?.type) ? m.quoted
               : SUPPORTED.includes(m.type)         ? m
               : null;

    // ── Argument handling ───────────────────────────────────────────────────
    // Special args (dispatched by picker taps or power users):
    //   auto   → upload now, trying hosts in default order (no picker)
    //   cancel → drop the stashed media, abort
    // A known host name forces that host directly.
    const hostArg = args[0]?.toLowerCase();
    const special = hostArg === 'auto' || hostArg === 'cancel';

    if (hostArg === 'cancel') {
      const had = pendingMedia.delete(pendingKey(m));
      return await m.reply.info(
        had ? '🗑️ Pending upload cancelled — stashed media dropped.'
            : 'Nothing to cancel — no pending media.',
        'TOURL'
      );
    }

    const forcedHost = hostArg && HOSTS[hostArg] ? hostArg : null;
    if (hostArg && !forcedHost && !special) {
      return await m.reply.error(
        `Unknown host "${hostArg}".\n\nAvailable: ${Object.keys(HOSTS).join(', ')}`
      );
    }
    const litterboxTime = forcedHost === 'litterbox' ? args[1]?.toLowerCase() : undefined;

    // ── Media resolution ───────────────────────────────────────────────────
    // Fresh media in the reply wins; otherwise fall back to media stashed by
    // a previous picker flow (tap dispatches a new message that doesn't
    // quote the media).
    if (!target) {
      target = takePending(m) || null;
    }

    if (!target) {
      return await m.reply.info(
        `Reply to or send any media with \`${p}tourl\` — you'll get a provider picker.\n\n` +
        `Supported media: image, video, audio, sticker, document.\n\n` +
        `Skip the picker:\n` +
        `• \`${p}tourl auto\` — tries hosts in default order (${HOST_ORDER.map(h => HOSTS[h].label).join(' → ')})\n` +
        `• \`${p}tourl <host>\` — force a host (${Object.keys(HOSTS).join(', ')})\n` +
        `• \`${p}tourl litterbox <1h|12h|24h|72h>\` — temp host with expiry`,
        'MEDIA → URL'
      );
    }

    // ── Picker flow ─────────────────────────────────────────────────────────
    // Media present + no host/auto arg → show the provider picker and stash
    // the media for the follow-up command.
    if (!forcedHost && !special) {
      stashPending(m, target);
      await sendProviderPicker(sock, m);
      return;
    }

    await withReactionStatus(m, async () => {
      // NOTE: `sock` (the Baileys socket) has no `downloadMediaMessage` method —
      // that's a top-level export of the `baileys` package, not a socket method.
      // serializer.js already wires a correct `.download()` helper onto both `m`
      // and `m.quoted` (using the real `downloadMediaMessage(msg, 'buffer', {})`
      // export under the hood), so reuse that instead of calling a method that
      // doesn't exist on `sock`.
      const buffer = await target.download().catch(() => null);
      if (!buffer) throw new Error('Could not download the media. Try again.');

      if (buffer.length > 15 * 1024 * 1024) {
        throw new Error('File too large. Maximum upload size is 15 MB.');
      }

      const typeMap = {
        imageMessage:    { ext: 'jpg', mime: 'image/jpeg' },
        videoMessage:    { ext: 'mp4', mime: 'video/mp4' },
        audioMessage:    { ext: 'ogg', mime: 'audio/ogg' },
        documentMessage: { ext: 'bin', mime: 'application/octet-stream' },
        stickerMessage:  { ext: 'webp', mime: 'image/webp' },
      };
      const { ext, mime } = typeMap[target.type] ?? { ext: 'bin', mime: 'application/octet-stream' };
      const filename = `nexora_${Date.now()}.${ext}`;

      const tryOrder = forcedHost ? [forcedHost] : HOST_ORDER;
      const failures = [];
      let hostKey = null;
      let uploadResult = null;

      for (const key of tryOrder) {
        try {
          uploadResult = await HOSTS[key].upload(buffer, filename, mime, { time: litterboxTime });
          hostKey = key;
          break;
        } catch (err) {
          failures.push(`${HOSTS[key].label}: ${err.message}`);
        }
      }

      if (!uploadResult) {
        throw new Error(`All upload hosts failed.\n${failures.join('\n')}`);
      }

      const lines = [
        `📁 Type   : ${target.type.replace('Message', '')}`,
        `📏 Size   : ${(buffer.length / 1024).toFixed(1)} KB`,
        `🌐 Host   : ${HOSTS[hostKey].label}`,
        `🔗 URL    : ${uploadResult.url}`,
        ``,
        `_${uploadResult.note}_`,
      ];
      if (failures.length) {
        lines.push('', `_Fell back after: ${failures.length} host(s) failed._`);
      }

      const output = asciiBuilder.box('🔗 MEDIA UPLOADED', lines);
      await m.reply(output, { contextInfo: buildEnrichedContextInfo() });
    });
  }
};
