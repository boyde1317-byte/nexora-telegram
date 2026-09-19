import fs from 'node:fs';
import path from 'node:path';
import { imageConfig } from './imageConfig.js';
import { imageSelector } from './imageSelector.js';
import { imageBuilder } from './imageBuilder.js';
import { assetManager } from '../assets/assetManager.js';

// Simple RAM Cache for image buffers to prevent constant I/O
const imageCache = new Map();

export const imageManager = {
  /**
   * Clears the memory cache for a specific style or globally
   */
  clearCache(styleId = null) {
    if (styleId) {
      const keysToRemove = Array.from(imageCache.keys()).filter(k => k.startsWith(`menu_${styleId}_`));
      keysToRemove.forEach(k => imageCache.delete(k));
    } else {
      imageCache.clear();
    }
  },

  /**
   * Retrieves the dynamic image for the requested menu style
   */
  async getMenuImage(styleId) {
    try {
      const source = imageSelector.selectImage(styleId);
      const cacheKey = `menu_${styleId}_${source}`;

      if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
      }

      let loaded;
      if (source.startsWith('http://') || source.startsWith('https://')) {
        console.log(`[IMAGE MANAGER] Loading remote image for style ${styleId}: ${source}`);
        loaded = await imageBuilder.loadUrl(source);
      } else {
        console.log(`[IMAGE MANAGER] Loading local image for style ${styleId}: ${source}`);
        loaded = await imageBuilder.loadLocal(source);
      }

      const thumbnail = imageBuilder.getMockThumbnail();
      const payload = {
        buffer: loaded.buffer,
        mimetype: loaded.mimetype,
        thumbnail: thumbnail,
        source: source
      };

      // Implement memory limit cleanup if cache exceeds 30 entries
      if (imageCache.size > 30) {
        const firstKey = imageCache.keys().next().value;
        imageCache.delete(firstKey);
      }

      imageCache.set(cacheKey, payload);
      return payload;
    } catch (err) {
      console.error(`[IMAGE MANAGER] Failed to load image for style ${styleId}:`, err.message || err);
      
      // Graceful fallback to black pixel mock thumbnail and null buffer to prevent crashes
      return {
        buffer: null,
        mimetype: 'image/jpeg',
        thumbnail: imageBuilder.getMockThumbnail(),
        source: 'fallback'
      };
    }
  },

  /**
   * Saves a newly replied image buffer for the active style.
   * Named uniquely using a timestamp to support rich random and rotate modes.
   */
  async saveRepliedImage(styleId, buffer, originalMimetype) {
    const isPng = originalMimetype.includes('png');
    const isWebp = originalMimetype.includes('webp');
    const ext = isPng ? '.png' : (isWebp ? '.webp' : '.jpg');
    
    const filename = `img_${Date.now()}${ext}`;
    const relativePath = `./media/images/menu/menu${styleId}/${filename}`;
    const absolutePath = path.join(process.cwd(), 'media', 'images', 'menu', `menu${styleId}`, filename);

    // Write file securely to disk
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(absolutePath, buffer);
    console.log(`[IMAGE MANAGER] Saved replied image for style ${styleId}: ${relativePath}`);

    // Register as manual asset inside assetManager
    assetManager.registerManualAsset(`menu${styleId}`, relativePath);

    // Update database configuration registered list
    const styleConf = imageConfig.getStyleConfig(styleId);
    const updatedImages = Array.from(new Set([...(styleConf.images || []), relativePath]));
    imageConfig.setStyleConfig(styleId, { images: updatedImages });

    // Clear memory cache so the new image takes effect instantly
    this.clearCache(styleId);

    return relativePath;
  }
};

export default imageManager;
