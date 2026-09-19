import fs from 'node:fs';
import path from 'node:path';
import { layoutConfig } from '../../config/layout.js';

const THEME_DB_PATH = path.join(process.cwd(), 'database', 'theme.json');

const ensureThemeDatabase = () => {
  const dir = path.dirname(THEME_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(THEME_DB_PATH)) {
    const defaultTheme = {
      style: 'modern',
      border: 'rounded',
      customThemes: {}
    };
    fs.writeFileSync(THEME_DB_PATH, JSON.stringify(defaultTheme, null, 2), 'utf-8');
  }
};

ensureThemeDatabase();

export const themeManager = {
  load() {
    try {
      ensureThemeDatabase();
      const content = fs.readFileSync(THEME_DB_PATH, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[THEME MANAGER] Load failed, resetting to defaults:', err);
      const defaults = {
        style: 'modern',
        border: 'rounded',
        customThemes: {}
      };
      try { fs.writeFileSync(THEME_DB_PATH, JSON.stringify(defaults, null, 2), 'utf-8'); } catch (_) {}
      return defaults;
    }
  },

  save(themeData) {
    try {
      ensureThemeDatabase();
      fs.writeFileSync(THEME_DB_PATH, JSON.stringify(themeData, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[THEME MANAGER] Save failed:', err);
      return false;
    }
  },

  getTheme() {
    const data = this.load();
    return data.style || 'modern';
  },

  setTheme(styleName) {
    const data = this.load();
    const styleLower = styleName.toLowerCase();
    
    // Support modern, classic, minimal
    if (['modern', 'classic', 'minimal'].includes(styleLower)) {
      data.style = styleLower;
      this.save(data);
      return true;
    }
    
    // Check if it's a registered custom theme
    if (data.customThemes && data.customThemes[styleLower]) {
      data.style = styleLower;
      this.save(data);
      return true;
    }

    return false;
  },

  registerTheme(name, themeObj) {
    const data = this.load();
    if (!data.customThemes) data.customThemes = {};
    data.customThemes[name.toLowerCase()] = themeObj;
    this.save(data);
  },

  getBorders() {
    const activeStyle = this.getTheme();
    
    // Check standard built-in layoutConfig borders
    if (layoutConfig.borders[activeStyle]) {
      return layoutConfig.borders[activeStyle];
    }

    // Check custom registered themes
    const data = this.load();
    if (data.customThemes && data.customThemes[activeStyle]) {
      return data.customThemes[activeStyle];
    }

    // Default fallback is modern
    return layoutConfig.borders.modern;
  }
};

export default themeManager;
