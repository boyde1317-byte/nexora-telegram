import fs from 'node:fs';
import path from 'node:path';
import { imageConfig } from './imageConfig.js';
import { assetManager } from '../assets/assetManager.js';

const FALLBACK_IMAGE_PATH = 'https://base44.app/api/apps/6ade37ff324c88533b16f8d8/files/mp/public/6ade37ff324c88533b16f8d8/c4ad5ea19_nexora-brand-banner.png';

export const imageSelector = {
  /**
   * Scans a local style directory to discover image files dynamically.
   */
  discoverLocalImages(styleId) {
    const dirPath = path.join(process.cwd(), 'media', 'images', 'menu', `menu${styleId}`);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        return [];
      }

      const files = fs.readdirSync(dirPath);
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
      
      const discovered = files
        .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
        .map(f => `./media/images/menu/menu${styleId}/${f}`);

      return discovered;
    } catch (err) {
      console.error(`[IMAGE SELECTOR] Directory discovery failed for menu${styleId}:`, err);
      return [];
    }
  },

  /**
   * Selects an image source (path or url) based on styleId and mode
   */
  selectImage(styleId) {
    if ([1, 2, 3, 4].includes(Number(styleId))) {
      return assetManager.getAsset('menu' + styleId);
    }

    const mode = imageConfig.getMenuMode();
    const styleConf = imageConfig.getStyleConfig(styleId);
    
    // Discover dynamic files from disk to stay perfectly in-sync
    const diskImages = this.discoverLocalImages(styleId);
    
    // Merge database registered list with actual disk files to avoid desync
    const allImages = Array.from(new Set([...(styleConf.images || []), ...diskImages]));

    // Update config dynamically if we discovered new files
    if (allImages.length !== (styleConf.images || []).length) {
      imageConfig.setStyleConfig(styleId, { images: allImages });
    }

    if (allImages.length === 0) {
      // Return absolute fallback url if no image exists anywhere for this style
      return FALLBACK_IMAGE_PATH;
    }

    if (mode === 'static') {
      // Static Mode: Always return the first discovered image
      return allImages[0];
    } else if (mode === 'random') {
      // Random Mode: Select randomly
      const randomIndex = Math.floor(Math.random() * allImages.length);
      return allImages[randomIndex];
    } else if (mode === 'rotate') {
      // Rotation Mode: Cycle index, save, and return
      let nextIndex = (styleConf.currentIndex || 0);
      if (nextIndex >= allImages.length) {
        nextIndex = 0;
      }
      
      const selected = allImages[nextIndex];
      
      // Advance index for the next call
      const advancedIndex = (nextIndex + 1) % allImages.length;
      imageConfig.setStyleConfig(styleId, { currentIndex: advancedIndex });
      
      return selected;
    }

    // Default Fallback
    return allImages[0] || FALLBACK_IMAGE_PATH;
  }
};

export default imageSelector;
