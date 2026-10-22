import fs from 'node:fs';
import path from 'node:path';
import { ASSET_URLS } from './assetUrls.js';
import { ensureDefaultAssets, DEFAULT_PATHS } from './defaultAssets.js';
import { assetValidator } from './assetValidator.js';
import { aiAssetGenerator } from './aiAssetGenerator.js';

const ASSETS_DB_PATH = path.join(process.cwd(), 'database', 'assets.json');

// Required asset configurations with prompts (for AI generation if enabled)
// and CDN URL fallbacks. The URL fallback is always available — no local files needed.
export const REQUIRED_AI_ASSETS = {
  menu1: {
    prompt: 'Professional tech document card background, dark slate background with neon cyan vector geometric lines, abstract, minimalist digital art, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/menu/menu1/menu1_generated.jpg',
    defaultUrl: ASSET_URLS.menuBanner,
  },
  menu2: {
    prompt: 'Premium payment style card background, elegant dark charcoal canvas with luxurious metallic rose gold accents, abstract, minimalist digital art, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/menu/menu2/menu2_generated.jpg',
    defaultUrl: ASSET_URLS.menuBanner,
  },
  menu3: {
    prompt: 'Event announcement background, deep purple and ultraviolet glow with floating abstract particles, vibrant, futuristic digital render, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/menu/menu3/menu3_generated.jpg',
    defaultUrl: ASSET_URLS.menuBanner,
  },
  menu4: {
    prompt: 'Modern interactive bot dashboard background, clean futuristic glassmorphism interface with dark slate and holographic green highlights, digital art, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/menu/menu4/menu4_generated.jpg',
    defaultUrl: ASSET_URLS.menuBanner,
  },
  welcome: {
    prompt: 'Group welcome banner, welcoming serene nature forest at dawn with majestic glowing mountains, warm golden hour light, beautiful digital illustration, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/greetings/welcome_generated.jpg',
    defaultUrl: ASSET_URLS.welcome,
  },
  goodbye: {
    prompt: 'Group goodbye banner, peaceful starry night sky with a warm crescent moon over quiet hills, gentle retro palette, beautiful digital illustration, featuring the branding text "NEXORA MD" and "By Aizen" clearly, 16:9',
    targetPath: './media/images/greetings/goodbye_generated.jpg',
    defaultUrl: ASSET_URLS.goodbye,
  }
};

export const assetManager = {
  /**
   * Loads assets database
   */
  loadAssetsDb() {
    try {
      const dir = path.dirname(ASSETS_DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(ASSETS_DB_PATH)) {
        fs.writeFileSync(ASSETS_DB_PATH, JSON.stringify({}, null, 2), 'utf-8');
      }
      const content = fs.readFileSync(ASSETS_DB_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[ASSET MANAGER] Load DB failed, returning empty:', err);
      return {};
    }
  },

  /**
   * Saves assets database
   */
  saveAssetsDb(data) {
    try {
      const dir = path.dirname(ASSETS_DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ASSETS_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[ASSET MANAGER] Save DB failed:', err);
      return false;
    }
  },

  /**
   * Registers a manual override asset (e.g. set by owner command).
   * Accepts either a URL (https://...) or a local file path.
   */
  registerManualAsset(key, urlOrPath) {
    const db = this.loadAssetsDb();
    db[key] = { source: 'manual', path: urlOrPath };
    this.saveAssetsDb(db);
    console.log(`[ASSET MANAGER] Asset "${key}" registered with MANUAL source: ${urlOrPath}`);
  },

  /**
   * Registers an AI generated asset
   */
  registerAIAsset(key, localPath) {
    const db = this.loadAssetsDb();
    db[key] = { source: 'ai', path: localPath };
    this.saveAssetsDb(db);
    console.log(`[ASSET MANAGER] Asset "${key}" registered with AI source: ${localPath}`);
  },

  /**
   * Resolves the highest priority active asset for the given key.
   * Returns a URL or local path usable as `thumbnailUrl` or `image: { url }`.
   *
   * Priority: User custom (manual) → AI generated → CDN default URL
   *
   * @param {string} key - e.g. menu1, welcome, goodbye
   * @returns {string} - URL or local path
   */
  getAsset(key) {
    const db = this.loadAssetsDb();
    const config = REQUIRED_AI_ASSETS[key];
    const defaultUrl = config ? config.defaultUrl : ASSET_URLS.menuBanner;

    // 1. Check database for custom or AI paths
    if (db[key]) {
      const entry = db[key];
      // If it's a URL, return it directly — no file validation needed
      if (typeof entry.path === 'string' && /^https?:\/\//.test(entry.path)) {
        return entry.path;
      }
      // If it's a local file path, validate it exists
      if (typeof entry.path === 'string') {
        try {
          if (fs.existsSync(entry.path)) return entry.path;
        } catch (_) {}
      }
      console.warn(`[ASSET MANAGER] DB entry for "${key}" is invalid. Falling back to CDN default.`);
    }

    // 2. Fall back to AI generated path if it exists on disk
    if (config?.targetPath) {
      try {
        if (fs.existsSync(config.targetPath)) return config.targetPath;
      } catch (_) {}
    }

    // 3. Fall back to CDN-hosted default URL — always available, no disk needed
    return defaultUrl;
  },

  /**
   * Main startup execution flow.
   * With CDN-hosted defaults, this is lightweight — AI generation only runs
   * if Gemini is explicitly enabled. All visuals work without it.
   */
  async init() {
    console.log('[ASSET MANAGER] Initializing smart asset management system...');

    await ensureDefaultAssets();

    const db = this.loadAssetsDb();
    const geminiAvailable = aiAssetGenerator.isEnabled();

    console.log(`[ASSET MANAGER] Gemini AI generation: ${geminiAvailable ? 'ENABLED' : 'DISABLED'}`);
    console.log('[ASSET MANAGER] All default visuals are CDN-hosted URLs — no local files required.');

    if (!geminiAvailable) {
      console.log('[ASSET MANAGER] Initialization complete. Using CDN defaults.');
      return;
    }

    for (const [key, config] of Object.entries(REQUIRED_AI_ASSETS)) {
      let needGeneration = true;

      if (db[key]) {
        const entry = db[key];
        if (entry.source === 'manual') {
          const isUrl = typeof entry.path === 'string' && /^https?:\/\//.test(entry.path);
          if (isUrl || (typeof entry.path === 'string' && fs.existsSync(entry.path))) {
            needGeneration = false;
          }
        } else if (entry.source === 'ai') {
          if (typeof entry.path === 'string' && fs.existsSync(entry.path)) {
            needGeneration = false;
          }
        }
      } else {
        if (config.targetPath && fs.existsSync(config.targetPath)) {
          this.registerAIAsset(key, config.targetPath);
          needGeneration = false;
        }
      }

      if (needGeneration) {
        console.log(`[ASSET MANAGER] Asset "${key}" missing. Requesting AI generation...`);
        try {
          const buffer = await aiAssetGenerator.generateImage(config.prompt, '16:9');
          const optimized = assetValidator.optimize(buffer);

          const targetFullPath = path.isAbsolute(config.targetPath)
            ? config.targetPath
            : path.resolve(process.cwd(), config.targetPath);

          const dir = path.dirname(targetFullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          fs.writeFileSync(targetFullPath, optimized);
          this.registerAIAsset(key, config.targetPath);
          console.log(`[ASSET MANAGER] AI image generated for "${key}".`);
        } catch (err) {
          console.error(`[ASSET MANAGER] AI generation failed for "${key}":`, err.message || err);
          console.log(`[ASSET MANAGER] Asset "${key}" will use CDN default URL.`);
        }
      }
    }

    console.log('[ASSET MANAGER] Initialization complete.');
  },

  /**
   * Regenerates all AI assets (leaves manual overrides untouched)
   */
  async regenerateAll() {
    const geminiAvailable = aiAssetGenerator.isEnabled();
    if (!geminiAvailable) {
      throw new Error('Gemini API is not configured or GENERATE_ASSETS is not set to true.');
    }

    const db = this.loadAssetsDb();

    for (const [key, config] of Object.entries(REQUIRED_AI_ASSETS)) {
      if (db[key]?.source === 'manual') {
        console.log(`[ASSET MANAGER] Skipping "${key}" — MANUAL override.`);
        continue;
      }

      console.log(`[ASSET MANAGER] Regenerating AI asset "${key}"...`);
      try {
        const buffer = await aiAssetGenerator.generateImage(config.prompt, '16:9');
        const optimized = assetValidator.optimize(buffer);

        const targetFullPath = path.isAbsolute(config.targetPath)
          ? config.targetPath
          : path.resolve(process.cwd(), config.targetPath);

        const dir = path.dirname(targetFullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(targetFullPath, optimized);
        this.registerAIAsset(key, config.targetPath);
        console.log(`[ASSET MANAGER] AI image regenerated for "${key}".`);
      } catch (err) {
        console.error(`[ASSET MANAGER] Failed to regenerate "${key}":`, err.message || err);
      }
    }

    console.log('[ASSET MANAGER] Regeneration complete.');
  },
};

export default assetManager;
