import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'database', 'media.json');

// Ensure database directory and default media.json exist
const ensureDatabase = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(DB_PATH)) {
    const defaultConfig = {
      menuAudio: true,
      menuImage: true,
      menuThumbnail: true,
      autoVoiceNote: false,
      menu: {
        audio: './media/audio/menu.mp3',
        image: './media/images/menu/menu_default.jpg',
        thumbnail: './media/thumbnails/default.jpg',
        enabled: true
      }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
};

// Create the standard media directories
const ensureMediaDirectories = () => {
  const dirs = [
    './media/images',
    './media/images/menu',
    './media/videos',
    './media/audio',
    './media/thumbnails',
    './media/documents'
  ];
  dirs.forEach(d => {
    const fullPath = path.join(process.cwd(), d);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};

ensureDatabase();
ensureMediaDirectories();

export const mediaConfig = {
  load() {
    try {
      ensureDatabase();
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[MEDIA CONFIG] Load failed, resetting to defaults:', err);
      const defaults = {
        menuAudio: true,
        menuImage: true,
        menuThumbnail: true,
        autoVoiceNote: false,
        menu: {
          audio: './media/audio/menu.mp3',
          image: './media/images/menu/menu_default.jpg',
          thumbnail: './media/thumbnails/default.jpg',
          enabled: true
        }
      };
      try { fs.writeFileSync(DB_PATH, JSON.stringify(defaults, null, 2), 'utf-8'); } catch (_) {}
      return defaults;
    }
  },

  save(configData) {
    try {
      ensureDatabase();
      fs.writeFileSync(DB_PATH, JSON.stringify(configData, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[MEDIA CONFIG] Save failed:', err);
      return false;
    }
  },

  get(key) {
    const data = this.load();
    return data[key];
  },

  set(key, value) {
    const data = this.load();
    data[key] = value;
    this.save(data);
  },

  getMenuConfig() {
    const data = this.load();
    return data.menu || {
      audio: './media/audio/menu.mp3',
      image: './media/images/menu/menu_default.jpg',
      thumbnail: './media/thumbnails/default.jpg',
      enabled: true
    };
  },

  setMenuConfig(updates) {
    const data = this.load();
    data.menu = { ...data.menu, ...updates };
    this.save(data);
  }
};

export default mediaConfig;
