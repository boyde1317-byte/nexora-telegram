/**
 * tovn.js — convert audio/video into a WhatsApp voice note (ported from
 * OURIN DELUXE V3.4.1 tools/tovn.js).
 *
 * Reply to an audio or video (or send one with the caption .tovn) and it
 * comes back as a recordable voice-note bubble. Encoded with libopus,
 * 48kHz mono voip profile — the same profile WhatsApp itself uses.
 *
 *   .tovn            → reply to an audio/video
 *   .tovn <caption>  → send audio/video with .tovn in the caption
 */
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { withReactionStatus } from '../../lib/cosmetics.js';

const execFileAsync = promisify(execFile);

/** Encode any media buffer into a ptt-ready opus/ogg buffer via ffmpeg. */
export async function encodeVoiceNote(inputBuffer, inputExt) {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const inputPath = path.join(tempDir, `tovn_in_${stamp}.${inputExt}`);
  const outputPath = path.join(tempDir, `tovn_out_${stamp}.ogg`);

  try {
    fs.writeFileSync(inputPath, inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-ar', '48000',
      '-ac', '1',
      '-application', 'voip',
      outputPath,
    ], { timeout: 120_000 });
    if (!fs.existsSync(outputPath)) throw new Error('ffmpeg produced no output.');
    return fs.readFileSync(outputPath);
  } finally {
    fs.rmSync(inputPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
}

export default {
  name: 'tovn',
  aliases: ['voice', 'voice-note'],
  category: 'media',
  description: '🎙️ Convert audio/video into a WhatsApp voice note. Reply with .tovn',
  cooldown: 8000,

  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';

    const selfAudio = m.type === 'audioMessage' || m.type === 'pttMessage';
    const selfVideo = m.type === 'videoMessage';
    const quotedAudio = m.quoted && (m.quoted.type === 'audioMessage' || m.quoted.type === 'pttMessage');
    const quotedVideo = m.quoted && m.quoted.type === 'videoMessage';

    if (!selfAudio && !selfVideo && !quotedAudio && !quotedVideo) {
      return await m.reply.info(
        `Converts audio or video into a voice-note bubble.\n\n` +
        `Reply to an audio/video with \`${p}tovn\`, or send one with the caption \`${p}tovn\`.`,
        'TO VOICE NOTE'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const isVideo = selfVideo || quotedVideo;
        const buffer = selfAudio || selfVideo ? await m.download() : await m.quoted.download();
        if (!buffer || buffer.length === 0) {
          return await m.reply.error('Could not download the media — it may have expired.');
        }
        const vnBuffer = await encodeVoiceNote(buffer, isVideo ? 'mp4' : 'mp3');
        await sock.sendMessage(m.from, {
          audio: vnBuffer,
          ptt: true,
          mimetype: 'audio/ogg; codecs=opus',
        }, { quoted: m });
      } catch (err) {
        console.error('[tovn]', err.message);
        return await m.reply.error(`Conversion failed: ${err.message}. Is ffmpeg installed?`);
      }
    });
  },
};
