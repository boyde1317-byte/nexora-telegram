import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'database', 'images.json');

const ensureDatabaseAndDirs = () => {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Ensure high-level folders exist
  const baseFolders = [
    './media/images/menu/menu1',
    './media/images/menu/menu2',
    './media/images/menu/menu3',
    './media/images/menu/menu4',
    './media/images/menu/menu5',
    './media/images/menu/menu6',
    './media/images/menu/menu7',
    './media/images/menu/menu8',
    './media/images/menu/menu9',
    './media/images/menu/menu10',
    './media/images/menu/menu11',
    './media/images/menu/menu12',
    './media/images/commands',
    './media/images/profile',
    './media/images/banners',
    './media/thumbnails'
  ];

  baseFolders.forEach(folder => {
    const fullPath = path.join(process.cwd(), folder);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  const defaultConfig = {
    menu: {
      style: "1",
      mode: "random",
      menu1: { images: [], currentIndex: 0 },
      menu2: { images: [], currentIndex: 0 },
      menu3: { images: [], currentIndex: 0 },
      menu4: { images: [], currentIndex: 0 },
      menu5: { images: [], currentIndex: 0 },
      menu6: { images: [], currentIndex: 0 },
      menu7: { images: [], currentIndex: 0 },
      menu8: { images: [], currentIndex: 0 },
      menu9: { images: [], currentIndex: 0 },
      menu10: { images: [], currentIndex: 0 },
      menu11: { images: [], currentIndex: 0 },
      menu12: { images: [], currentIndex: 0 }
    }
  };

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return;
  }

  // File exists but may be empty/corrupt (e.g. an empty file committed to the
  // repo, or a crash mid-write) — without this check, load() would silently
  // re-fall-back to defaults and log a JSON parse error on every single call
  // forever, since existsSync() alone can't tell a valid file from a blank one.
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    if (!raw.trim()) {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    } else {
      JSON.parse(raw);
    }
  } catch (err) {
    console.error('[IMAGE CONFIG] Corrupt config detected, resetting to defaults:', err.message);
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }
};

ensureDatabaseAndDirs();

export const imageConfig = {
  load() {
    try {
      ensureDatabaseAndDirs();
      const content = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[IMAGE CONFIG] Failed to load config:', err);
      return {
        menu: {
          style: "1",
          mode: "random"
        }
      };
    }
  },

  save(configData) {
    try {
      ensureDatabaseAndDirs();
      fs.writeFileSync(DB_PATH, JSON.stringify(configData, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[IMAGE CONFIG] Failed to save config:', err);
      return false;
    }
  },

  getMenuMode() {
    const data = this.load();
    return data.menu?.mode || 'random';
  },

  setMenuMode(mode) {
    const data = this.load();
    if (!data.menu) data.menu = {};
    data.menu.mode = mode;
    this.save(data);
  },

  getStyleConfig(styleId) {
    const data = this.load();
    const key = `menu${styleId}`;
    if (!data.menu) data.menu = {};
    if (!data.menu[key]) {
      data.menu[key] = { images: [], currentIndex: 0 };
    }
    return data.menu[key];
  },

  setStyleConfig(styleId, updates) {
    const data = this.load();
    const key = `menu${styleId}`;
    if (!data.menu) data.menu = {};
    data.menu[key] = { ...(data.menu[key] || { images: [], currentIndex: 0 }), ...updates };
    this.save(data);
  }
};

export default imageConfig;
