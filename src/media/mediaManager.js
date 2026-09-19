import path from 'node:path';
import fs from 'node:fs';
import { generateWAMessage } from 'baileys';
import { mediaConfig } from './mediaConfig.js';
import { mediaBuilder, detectMimetype, getMediaType } from './mediaBuilder.js';

/**
 * In-memory cache for uploaded audio protos, keyed by resolved file path.
 * Entry: { mtime: number, proto: proto.Message.IAudioMessage }
 * Invalidated automatically when the file's mtime changes (owner ran .setmenuaudio).
 */
const _audioProtoCache = new Map();

/**
 * Queue system to handle outbound media messages sequentially and asynchronously
 * to prevent race conditions or connection saturation.
 */
class MediaQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        await task();
      } catch (err) {
        console.error('[MEDIA QUEUE] Error processing task:', err);
      }
    }

    this.processing = false;
  }
}

const mediaQueue = new MediaQueue();

export const mediaManager = {
  /**
   * Helper to execute a media operation inside a safety container
   */
  async runSafe(operation, fallbackMsg = 'Media operation failed') {
    try {
      return await mediaQueue.add(operation);
    } catch (err) {
      console.error(`[MEDIA MANAGER] ${fallbackMsg}:`, err.message || err);
      return null;
    }
  },

  /**
   * Upload the configured menu audio to WhatsApp's media servers and return
   * the resulting audioMessage proto (real CDN URL + mediaKey + waveform etc.).
   *
   * This proto is used as the fake quoted context on every menu card so the
   * reply bar shows the actual voice note preview — playable, with the real
   * waveform — rather than plain text or a zeroed-out shell.
   *
   * Results are cached by resolved file path + mtime so the upload only
   * happens once per file change, not on every .menu invocation.
   *
   * Returns null when audio is disabled, the file is missing, or upload fails.
   *
   * @param {import('baileys').WASocket} sock
   * @param {string} jid  Destination JID (needed by generateWAMessage for upload)
   * @returns {Promise<import('baileys').proto.Message.IAudioMessage|null>}
   */
  async getMenuAudioProto(sock, jid) {
    if (!mediaConfig.get('menuAudio')) return null;

    const menuData = mediaConfig.getMenuConfig();
    const audioPath = menuData.audio || './media/audio/menu.mp3';

    const validation = mediaBuilder.validateFile(audioPath);
    if (!validation.valid) {
      console.warn('[MEDIA MANAGER] Menu audio missing, skipping audio quote:', validation.error);
      return null;
    }

    // Cache hit: same file, same mtime → reuse proto without re-uploading
    const mtime = fs.statSync(validation.resolvedPath).mtimeMs;
    const cached = _audioProtoCache.get(validation.resolvedPath);
    if (cached && cached.mtime === mtime) {
      return cached.proto;
    }

    try {
      const buffer   = mediaBuilder.readFileToBuffer(audioPath);
      const mimetype = detectMimetype(audioPath);
      const ptt      = !!mediaConfig.get('autoVoiceNote');

      // generateWAMessage with upload: produces a fully-formed proto with
      // valid CDN url, mediaKey, fileSha256, fileEncSha256, directPath, seconds.
      // The result is what makes the reply bar show the real waveform (playable).
      const msg = await generateWAMessage(
        jid,
        { audio: buffer, mimetype, ptt },
        {
          upload:   sock.waUploadToServer,
          userJid:  sock.user?.id || '0@s.whatsapp.net',
        },
      );

      const proto = msg?.message?.audioMessage ?? null;
      if (proto) {
        _audioProtoCache.set(validation.resolvedPath, { mtime, proto });
        console.log('[MEDIA MANAGER] Menu audio proto uploaded and cached for reply-bar quote.');
      }
      return proto;
    } catch (err) {
      console.warn('[MEDIA MANAGER] Could not upload menu audio for quote proto:', err.message);
      return null;
    }
  },

  /**
   * Automatically sends the configured menu audio beneath the menu if enabled.
   */
  async sendMenuAudio(sock, jid, quotedMessage = null) {
    const isAudioEnabled = mediaConfig.get('menuAudio');
    if (!isAudioEnabled) {
      console.log('[MEDIA MANAGER] Menu audio is globally disabled.');
      return null;
    }

    const menuData = mediaConfig.getMenuConfig();
    const audioPath = menuData.audio || './media/audio/menu.mp3';

    // Validate the file exists and is correct size
    const validation = mediaBuilder.validateFile(audioPath);
    if (!validation.valid) {
      console.warn(`[MEDIA MANAGER] Skipped menu audio: ${validation.error}`);
      return null;
    }

    return this.runSafe(async () => {
      // Always send as an audio file (ptt: false) so WhatsApp shows the
      // headphone-icon style with duration — not a PTT voice-note waveform.
      const payload = mediaBuilder.buildAudioPayload(audioPath, {
        ptt: false,
        duration: 5 // Placeholder duration metadata
      });

      console.log(`[MEDIA MANAGER] Sending menu audio: ${audioPath} (ptt: false)`);
      return await sock.sendMessage(jid, payload, { quoted: quotedMessage });
    }, `Failed to send menu audio from ${audioPath}`);
  },

  /**
   * Updates a default media file type by saving a buffer
   */
  async saveRepliedMedia(type, buffer, originalMimetype) {
    let subfolder = 'images';
    let filename = 'menu.jpg';

    if (type === 'audio') {
      subfolder = 'audio';
      filename = originalMimetype.includes('ogg') ? 'menu.opus' : 'menu.mp3';
    } else if (type === 'image') {
      subfolder = 'images';
      filename = originalMimetype.includes('png') ? 'menu.png' : 'menu.jpg';
    } else if (type === 'thumbnail') {
      subfolder = 'thumbnails';
      filename = 'menu.jpg';
    } else if (type === 'video') {
      subfolder = 'videos';
      filename = 'menu.mp4';
    } else if (type === 'document') {
      subfolder = 'documents';
      filename = 'menu.pdf';
    }

    const relativePath = `./media/${subfolder}/${filename}`;
    const absolutePath = path.join(process.cwd(), 'media', subfolder, filename);

    // Ensure the folder exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to disk
    fs.writeFileSync(absolutePath, buffer);
    console.log(`[MEDIA MANAGER] Successfully saved replenished media: ${relativePath}`);

    // Update settings
    if (type === 'audio') {
      mediaConfig.setMenuConfig({ audio: relativePath });
    } else if (type === 'image') {
      mediaConfig.setMenuConfig({ image: relativePath });
    } else if (type === 'thumbnail') {
      mediaConfig.setMenuConfig({ thumbnail: relativePath });
    }

    return relativePath;
  }
};

export default mediaManager;
