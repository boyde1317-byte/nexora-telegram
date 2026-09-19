import fs from 'node:fs';
import path from 'node:path';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limit for images

export const detectMimetype = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
};

export const imageBuilder = {
  /**
   * Validates local file.
   */
  validateLocalFile(filePath) {
    try {
      const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(resolved)) {
        return { valid: false, error: 'File not found' };
      }
      const stats = fs.statSync(resolved);
      if (!stats.isFile()) {
        return { valid: false, error: 'Not a file' };
      }
      if (stats.size > MAX_IMAGE_SIZE) {
        return { valid: false, error: 'File exceeds size limit' };
      }
      return { valid: true, resolvedPath: resolved, size: stats.size };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  },

  /**
   * Loads local file to Buffer.
   */
  async loadLocal(filePath) {
    const check = this.validateLocalFile(filePath);
    if (!check.valid) {
      throw new Error(check.error);
    }
    const buffer = fs.readFileSync(check.resolvedPath);
    return {
      buffer,
      mimetype: detectMimetype(filePath)
    };
  },

  /**
   * Loads remote URL to Buffer.
   */
  async loadUrl(url) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error('Remote image exceeds size limit');
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';

      return {
        buffer,
        mimetype: contentType
      };
    } catch (err) {
      throw new Error(`Failed to download remote image: ${err.message}`);
    }
  },

  /**
   * Generates a tiny mock jpeg thumbnail to bypass WhatsApp upload constraints
   */
  getMockThumbnail() {
    // Standard minimal valid 1x1 black pixel JPEG
    return Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64'
    );
  }
};

export default imageBuilder;
