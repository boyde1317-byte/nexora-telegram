import { db } from '../database/db.js';

class MenuManager {
  constructor() {
    this.menus = new Map();
  }

  /**
   * Registers a new menu style definition
   */
  register(menu) {
    if (!menu || !menu.id || !menu.name || !menu.renderer) {
      console.error(`[MENU ENGINE] Skipping invalid registration:`, menu);
      return;
    }
    
    // Register by string ID and lowercase name for flexible lookup
    this.menus.set(String(menu.id).toLowerCase(), menu);
    this.menus.set(menu.name.toLowerCase(), menu);
  }

  /**
   * Look up a registered menu style
   */
  getMenu(key) {
    if (!key) return null;
    return this.menus.get(String(key).toLowerCase()) || null;
  }

  /**
   * Get the active menu style. Defaults to style ID '1' (documentInteractive —
   * full command directory: every command on its own line, grouped under
   * UPPERCASE category headers, inside the interactive menu card).
   * Owner-directed 2026-09-18: the menu must LIST the commands; the
   * category-picker drill-down (17) stays available via `.setmenu 17`.
   * A previously persisted settings.activeMenu still wins, so owners who
   * deliberately picked a style keep it.
   */
  getActiveMenu() {
    const activeId = db.data.settings?.activeMenu || '1';
    return this.getMenu(activeId) || this.getMenu('1') || this.getMenu('17');
  }

  /**
   * Persists a change in the active menu style
   */
  setActiveMenu(key, username) {
    const target = this.getMenu(key);
    if (!target) return null;

    if (!db.data.settings) {
      db.data.settings = {};
    }
    
    db.data.settings.activeMenu = String(target.id);
    db.data.settings.activeMenuName = target.name;
    db.data.settings.menuChangedBy = username;
    db.data.settings.menuUpdatedAt = new Date().toISOString();
    db.save();
    
    return target;
  }

  /**
   * Returns all unique registered menu definitions sorted by ID
   */
  getRegisteredMenus() {
    const uniqueList = [];
    const idSet = new Set();

    this.menus.forEach(menu => {
      if (!idSet.has(menu.id)) {
        idSet.add(menu.id);
        uniqueList.push(menu);
      }
    });

    return uniqueList.sort((a, b) => Number(a.id) - Number(b.id));
  }
}

export const menuManager = new MenuManager();
export default menuManager;
