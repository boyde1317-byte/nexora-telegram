/**
 * capcut.js — render a CapCut template with your media via api.jaky.dev.
 *
 *   .capcut <template url or id> (reply to a photo/video)   → filled mp4
 *   .capcut <template url or id> <media url>                 → filled mp4
 *
 * Template links come from CapCut's template share pages; the media fill
 * is a photo or video (reply to one in chat, or pass a direct URL).
 * Costs API credits — long render, be patient.
 */
import { jaky } from '../../lib/jakyApi.js';

/** Dig a download URL out of whatever envelope the API answers with. */
function extractUrl(data) {
  return data?.url
    || data?.result?.url
    || data?.result?.download_url
    || data?.data?.url
    || data?.download_url
    || data?.video_url
    || null;
}

export default {
  name: 'capcut',
  category: 'media',
  description: 'Render a CapCut template with your media. Usage: .capcut <template link> (reply to media)',
  cooldown: 60000,

  execute: async ({ m, sock, args }) => {
    const template = args[0];
    if (!template || !/^(https?:\/\/|\d+)$/.test(template)) {
      return await m.reply.error('Usage: `.capcut <capcut template link>` while replying to a photo/video');
    }

    if (!jaky.hasKey()) {
      return await m.reply.error('Maker API key is not configured — set `JAKY_API_KEY` in .env.');
    }

    // media: explicit URL arg > quoted/replied media > own media
    let mediaUrl = null;
    if (args[1] && /^https?:\/\//.test(args[1])) {
      mediaUrl = args[1];
    } else {
      try {
        const hasMedia = m.hasMedia || m.quoted?.message;
        if (hasMedia) {
          const buffer = await (m.hasMedia ? m.download() : m.quoted.download());
          if (buffer) {
            const ext = m.hasMedia && !m.quoted ? '' : '';
            const up = await jaky.uploadMedia(buffer, `fill.${ext || 'jpg'}`);
            if (up.ok) mediaUrl = up.url;
          }
        }
      } catch (_) { /* fall through to the no-media error */ }
    }

    if (!mediaUrl) {
      return await m.reply.error('No media to fill the template with — reply to a photo/video, or pass a media URL.');
    }

    await m.react('⏳');
    const body = /^https?:\/\//.test(template)
      ? { url: template, media: mediaUrl }
      : { templateId: template, media: mediaUrl };
    const res = await jaky.post('/v1/maker/capcut', body, 480000);

    const url = extractUrl(res.data);
    if (!res.ok || !url) {
      return await m.reply.error(res.data?.msg || 'The CapCut render failed.');
    }

    const buffer = await jaky.download(url, 240000);
    if (!buffer) return await m.reply.error('Render succeeded but the download failed — try again.');

    return await sock.sendMessage(m.from, {
      video: buffer,
      caption: '🎬 *CapCut render complete*',
    }, { quoted: m });
  },
};
