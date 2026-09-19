/**
 * media.js — Smart auto-detect downloader.
 *
 * Paste any social media URL and the bot figures out which platform it's from
 * and downloads it automatically. No need to remember which command to use.
 *
 * Supported: YouTube, TikTok, Instagram, Facebook, Twitter/X, Spotify, Pinterest
 *
 * Usage:
 *   .download <url>        — auto-detect and download
 *   .media audio <url>     — force audio-only (for YouTube)
 *   .media video <url>     — force video (for YouTube)
 */
import { withReactionStatus} from '../../lib/cosmetics.js';

import { youtubeDownload, tiktokDownload, instagramDownload, facebookDownload, twitterDownload, spotifyDownload, isUrl} from '../../lib/downloader.js';
import { DownloadProgress} from '../../lib/progress.js';

function detectPlatform(url) {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com') || lower.includes('vt.tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'facebook';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('spotify.com')) return 'spotify';
  if (lower.includes('pinterest.com') || lower.includes('pin.it')) return 'pinterest';
  return null;
}

export default {
  name: 'download',
  aliases: ['dl', 'autodl'],
  category: 'download',
  description: 'Smart downloader — paste any URL and it auto-detects the platform. Usage: .download <url>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    // Parse: optional "audio"/"video" mode prefix, then URL
    let mode = 'auto';
    let url = null;
    for (const arg of args) {
      const lower = arg.toLowerCase();
      if (lower === 'audio' || lower === 'video') mode = lower;
      else if (isUrl(arg)) url = arg.trim();
    }

    if (!url) {
      return await m.reply.info(
        `Usage: \`${p}media <url>\`\n\nAuto-detects: YouTube, TikTok, Instagram, Facebook, X/Twitter, Spotify, Pinterest\n\nExamples:\n• \`${p}media https://youtu.be/dQw4w9WgXcQ\`\n• \`${p}media audio https://youtube.com/watch?v=xxx\` — force audio\n• \`${p}media https://vt.tiktok.com/xxx\``,
        'SMART DOWNLOADER'
      );
    }

    const platform = detectPlatform(url);
    if (!platform) {
      return await m.reply.error(
        `Could not detect the platform from that URL.\n\nSupported: YouTube, TikTok, Instagram, Facebook, X/Twitter, Spotify, Pinterest\n\nOr use a specific command: \`${p}play\`, \`${p}tiktok\`, \`${p}ig\`, etc.`
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start(`Downloading from ${platform}`);
      try {
        switch (platform) {
          // ── YouTube ──────────────────────────────────────────────────
          case 'youtube': {
            // mode 'video' → mp4 job on the loader.to fallback; anything else → mp3
            const data = await youtubeDownload(url, { preferMp4: mode === 'video' || mode === 'auto' });
            const wantAudio = mode === 'audio' || (!mode.includes('video') && true);
            // Default to video for ytmp4-style, audio for play-style
            // If mode is 'auto', prefer video
            if (mode === 'video' || (mode === 'auto' && data.mp4)) {
              if (!data.mp4) throw new Error('No video stream available.');
              await progress.done(`✅ ${data.title || 'Video ready'}!`);
              await sock.sendMessage(m.from, {
                video: { url: data.mp4 },
                caption: `🎬 *${data.title || 'YouTube Video'}*${data.author ? `\n👤 ${data.author}` : ''}`,
              }, { quoted: m });
            } else {
              if (!data.mp3) throw new Error('No audio stream available.');
              await progress.done(`✅ ${data.title || 'Audio ready'}!`);
              await sock.sendMessage(m.from, {
                audio: { url: data.mp3 },
                mimetype: 'audio/mpeg',
              }, { quoted: m });
            }
            break;
          }

          // ── TikTok ───────────────────────────────────────────────────
          case 'tiktok': {
            const data = await tiktokDownload(url);
            await progress.done('✅ Got it! Sending video...');
            await sock.sendMessage(m.from, {
              video: { url: data.video },
              caption: `🎬 *${data.title || 'TikTok Video'}*\n_No watermark_`,
            }, { quoted: m });
            break;
          }

          // ── Instagram ────────────────────────────────────────────────
          case 'instagram': {
            const items = await instagramDownload(url);
            await progress.done(`✅ Found ${items.length} item${items.length !== 1 ? 's' : ''}. Sending...`);
            for (let i = 0; i < Math.min(items.length, 10); i++) {
              const item = items[i];
              const isVideo = /\.mp4(\?|$)/i.test(item.url) || (item.resolution || '').toLowerCase().includes('video');
              const caption = i === 0 ? `📥 *Instagram Download* (${items.length} items)` : `📥 Item ${i + 1} of ${items.length}`;
              if (isVideo) {
                await sock.sendMessage(m.from, { video: { url: item.url }, caption }, { quoted: i === 0 ? m : undefined });
              } else {
                await sock.sendMessage(m.from, { image: { url: item.url }, caption }, { quoted: i === 0 ? m : undefined });
              }
            }
            break;
          }

          // ── Facebook ─────────────────────────────────────────────────
          case 'facebook': {
            const data = await facebookDownload(url);
            const best = data.hd || data.sd;
            const quality = data.hd ? 'HD' : 'SD';
            await progress.done(`✅ Got it! Sending ${quality} video...`);
            await sock.sendMessage(m.from, {
              video: { url: best },
              caption: `🎬 *Facebook Video* (${quality})`,
            }, { quoted: m });
            break;
          }

          // ── Twitter/X ────────────────────────────────────────────────
          case 'twitter': {
            const data = await twitterDownload(url);
            await progress.done('✅ Got it! Sending video...');
            await sock.sendMessage(m.from, {
              video: { url: data.url },
              caption: data.title ? `🎬 *${data.title}*` : '🎬 X / Twitter Video',
            }, { quoted: m });
            break;
          }

          // ── Spotify ──────────────────────────────────────────────────
          case 'spotify': {
            const data = await spotifyDownload(url);
            await progress.done('✅ Got it! Sending audio...');
            await sock.sendMessage(m.from, {
              audio: { url: data.url },
              mimetype: 'audio/mpeg',
            }, { quoted: m });
            break;
          }

          // ── Pinterest ────────────────────────────────────────────────
          case 'pinterest': {
            // Pinterest single-pin download
            const { pinterestSearch } = await import('../../lib/downloader.js');
            const results = await pinterestSearch(url);
            if (results.length > 0) {
              await progress.done('✅ Found image. Sending...');
              await sock.sendMessage(m.from, {
                image: { url: results[0].image },
                caption: `📌 *${results[0].title || 'Pinterest Image'}*`,
              }, { quoted: m });
            } else {
              throw new Error('Could not fetch that Pinterest pin.');
            }
            break;
          }
        }
      } catch (err) {
        await progress.fail(`${platform} download failed: ${err.message}`);
      }
    });
  }
};
