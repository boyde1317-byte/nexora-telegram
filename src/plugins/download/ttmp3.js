/**
 * ttmp3.js — TikTok audio (MP3) downloader.
 *
 * Sends the sound of a TikTok as a playable WhatsApp audio message:
 *   1. backend returns a direct audio URL (dl.tiktokio.com) — used as-is
 *   2. if the backend returns no audio, ffmpeg (when present) extracts
 *      the audio track from the video URL as a graceful fallback
 *   3. oversized audio (> 16 MB) ships as a document instead
 *
 * Follow-up card carries the title/author plus cross-platform buttons.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { tiktokDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';
import { mixedCard } from '../../lib/interactiveKit.js';

const MAX_AUDIO = 16 * 1024 * 1024; // WhatsApp media cap

async function contentLength(url) {
  try {
    const h = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(12000) });
    return parseInt(h.headers.get('content-length') || '0', 10);
  } catch (_) { return 0; }
}

async function ffmpegExtract(videoUrl) {
  const { spawn } = await import('child_process');
  const chunks = [];
  const p = spawn('ffmpeg', [
    '-i', videoUrl, '-vn', '-acodec', 'libmp3lame', '-ab', '128k',
    '-f', 'mp3', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.on('data', (c) => chunks.push(c));
  return new Promise((resolve, reject) => {
    p.on('error', reject);              // ffmpeg not installed
    p.on('close', (code) => code === 0
      ? resolve(Buffer.concat(chunks))
      : reject(new Error('audio extraction failed')));
    setTimeout(() => { p.kill(); reject(new Error('audio extraction timed out')); }, 120000).unref?.();
  });
}

export default {
  name: 'ttmp3',
  aliases: ['tmp3', 'ttaudio', 'tiktokmp3'],
  category: 'download',
  description: 'Download a TikTok as MP3 audio. Usage: .ttmp3 <tiktok url> (or reply to a TikTok link)',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let url = args[0]?.trim() || m.quoted?.text?.match(/https?:\/\/\S*tiktok\.com\S*/i)?.[0];

    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}ttmp3 <tiktok url>\`\n\nExample: \`${p}ttmp3 https://vt.tiktok.com/xxxxxx\`\nOr reply to a message containing a TikTok link.`,
        'TIKTOK MP3'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching TikTok audio');
      try {
        const data = await tiktokDownload(url);
        await progress.done('✅ Got it! Sending audio...');

        // ── 1. backend audio URL (preferred path) ───────────────────────
        if (data.audio) {
          const size = await contentLength(data.audio);
          if (size > MAX_AUDIO) {
            await sock.sendMessage(m.from, {
              document: { url: data.audio },
              fileName: `${(data.title || 'tiktok-audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}.mp3`,
              mimetype: 'audio/mpeg',
            }, { quoted: m });
          } else {
            await sock.sendMessage(m.from, {
              audio: { url: data.audio }, mimetype: 'audio/mpeg', ptt: false,
            }, { quoted: m });
          }
        } else if (data.video) {
          // ── 2. ffmpeg fallback: extract audio from the video ───────────
          const buf = await ffmpegExtract(data.video);
          if (buf.length > MAX_AUDIO) {
            await sock.sendMessage(m.from, {
              document: buf, fileName: 'tiktok-audio.mp3', mimetype: 'audio/mpeg',
            }, { quoted: m });
          } else {
            await sock.sendMessage(m.from, {
              audio: buf, mimetype: 'audio/mpeg', ptt: false,
            }, { quoted: m });
          }
        } else {
          throw new Error('TikTok returned no downloadable media for that link.');
        }

        // ── follow-up info card ───────────────────────────────────────────
        const sent = await mixedCard(sock, m.from, {
          text: `🎵 *${(data.title || 'TikTok Audio').slice(0, 60)}*\n${data.author ? `👤 ${String(data.author).slice(0, 40)}\n` : ''}\n🔊 Extracted from TikTok — no watermark, full quality.`,
          footer: '© NEXORA-MD by Aizen',
        }, [
          { kind: 'url',  label: '▶️ Watch Original', value: url },
          { kind: 'copy', label: '📋 Copy Audio Link', value: data.audio || '(extracted locally)' },
        ], { quoted: m });
        if (!sent) {
          await sock.sendMessage(m.from, {
            text: `🎵 *${(data.title || 'TikTok Audio').slice(0, 60)}*${data.author ? `\n👤 ${String(data.author).slice(0, 40)}` : ''}`,
          }, { quoted: m });
        }
      } catch (err) {
        await m.reply.error(`TikTok MP3 failed: ${err.message}`);
        throw err;
      }
    });
  },
};
