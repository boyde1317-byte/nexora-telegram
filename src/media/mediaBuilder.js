import fs from 'node:fs';
import path from 'node:path';

// Define a maximum file size limit (e.g., 25MB for safety)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Detects the correct mimetype based on file extension or a fallback
 */
export const detectMimetype = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
    case '.opus':
      return 'audio/ogg; codecs=opus';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.mp4':
      return 'video/mp4';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
};

/**
 * Detects media type from mimetype
 */
export const getMediaType = (mimetype) => {
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype === 'application/pdf') return 'document';
  return 'document';
};

/**
 * High-fidelity builder for media messages with fallback & validation safety checks
 */
export const mediaBuilder = {
  /**
   * Validates if a file exists, is readable, and is within safe sizing limits.
   */
  validateFile(filePath) {
    if (!filePath) {
      return { valid: false, error: 'Path is undefined' };
    }

    try {
      // Resolve path relative to process root if relative
      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      
      if (!fs.existsSync(resolvedPath)) {
        return { valid: false, error: `File not found at ${resolvedPath}` };
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        return { valid: false, error: 'Target is not a file' };
      }

      if (stats.size === 0) {
        return { valid: false, error: 'File is empty' };
      }

      if (stats.size > MAX_FILE_SIZE) {
        return { valid: false, error: `File exceeds max limit of 25MB (Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB)` };
      }

      return { valid: true, resolvedPath, size: stats.size };
    } catch (err) {
      return { valid: false, error: `Validation error: ${err.message}` };
    }
  },

  /**
   * Reads a file securely into a Buffer
   */
  readFileToBuffer(filePath) {
    const check = this.validateFile(filePath);
    if (!check.valid) {
      throw new Error(check.error);
    }
    return fs.readFileSync(check.resolvedPath);
  },

  /**
   * Builds an audio payload containing high fidelity metadata
   */
  buildAudioPayload(filePath, { ptt = false, waveform = null, duration = 30 } = {}) {
    const buffer = this.readFileToBuffer(filePath);
    const mimetype = detectMimetype(filePath);

    // Build standard audioMessage options
    const payload = {
      audio: buffer,
      mimetype: mimetype,
      ptt: !!ptt,
      seconds: duration
    };

    // Include dummy or parsed waveform array if requested and supported
    if (waveform && Array.isArray(waveform)) {
      payload.waveform = new Uint8Array(waveform);
    } else if (ptt) {
      // Generate standard clean dummy voice waveform
      payload.waveform = new Uint8Array([0, 4, 8, 12, 16, 20, 24, 28, 30, 28, 24, 20, 16, 12, 8, 4, 0]);
    }

    return payload;
  },

  /**
   * Builds an image payload
   */
  buildImagePayload(filePath, { caption = '' } = {}) {
    const buffer = this.readFileToBuffer(filePath);
    const mimetype = detectMimetype(filePath);
    return {
      image: buffer,
      mimetype: mimetype,
      caption: caption
    };
  },

  /**
   * Builds a video payload
   */
  buildVideoPayload(filePath, { caption = '' } = {}) {
    const buffer = this.readFileToBuffer(filePath);
    const mimetype = detectMimetype(filePath);
    return {
      video: buffer,
      mimetype: mimetype,
      caption: caption
    };
  },

  /**
   * Builds a document payload
   */
  buildDocumentPayload(filePath, { caption = '', fileName = 'document.pdf' } = {}) {
    const buffer = this.readFileToBuffer(filePath);
    const mimetype = detectMimetype(filePath);
    return {
      document: buffer,
      mimetype: mimetype,
      fileName: fileName,
      caption: caption
    };
  }
};

export default mediaBuilder;
