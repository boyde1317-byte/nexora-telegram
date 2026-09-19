import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { walkDirSync } from '../lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const client = {
  commands:  new Map(),
  aliases:   new Map(),
  cooldowns: new Map(),
  socket:    null,

  // ── Plugin lifecycle tracking ──────────────────────────────────────────────
  _pluginStats: new Map(),
  _pluginContext: null,

  /**
   * Get per-plugin usage statistics.
   * @returns {Record<string, {executions: number, errors: number, lastUsed: number|null}>}
   */
  getPluginStats() {
    const result = {};
    for (const [name, stats] of this._pluginStats) {
      result[name] = { ...stats };
    }
    return result;
  },

  /**
   * Record a plugin execution for stats tracking.
   * @param {string} name - Plugin name
   * @param {boolean} hadError - Whether the execution threw an error
   */
  recordExecution(name, hadError = false) {
    if (!this._pluginStats.has(name)) {
      this._pluginStats.set(name, { executions: 0, errors: 0, lastUsed: null });
    }
    const stats = this._pluginStats.get(name);
    stats.executions++;
    if (hadError) stats.errors++;
    stats.lastUsed = Date.now();
  },

  /**
   * Build and cache the plugin context object passed to onLoad hooks.
   */
  _getPluginContext() {
    if (this._pluginContext) return this._pluginContext;
    this._pluginContext = Object.freeze({
      client: this,
      db: null, // Will be lazily imported to avoid circular deps
      config: null,
      brand: null,
      logger: {
        info: (...args) => console.log('[PLUGIN]', ...args),
        warn: (...args) => console.warn('[PLUGIN]', ...args),
        error: (...args) => console.error('[PLUGIN]', ...args),
        debug: (...args) => console.debug('[PLUGIN]', ...args),
      },
    });
    return this._pluginContext;
  },

  async loadPlugins() {
    this.commands.clear();
    this.aliases.clear();
    // Don't clear _pluginStats — preserve across reloads

    const pluginsDir = path.resolve(__dirname, '../plugins');
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }

    const files = walkDirSync(pluginsDir).filter(f => f.endsWith('.js'));
    console.log(`\n=== Loading Plugins (${files.length} files found) ===`);

    const failed = [];
    const lifecycleHooks = [];
    const dependencyWarnings = [];
    const loadedPlugins = new Map(); // name -> { plugin, filePath }

    // ── Pass 1: Load all plugins ──────────────────────────────────────────────
    for (const filePath of files) {
      const file = path.relative(pluginsDir, filePath);
      try {
        const fileUrl  = new URL(`file://${filePath}`);
        const isDev = process.env.NODE_ENV === 'development';
        const importUrl = isDev ? `${fileUrl.href}?t=${Date.now()}` : fileUrl.href;
        const mod    = await import(importUrl);
        const plugin = mod.default;

        if (!plugin || typeof plugin !== 'object') {
          const reason = 'No default export found';
          console.warn(`[PLUGIN WARN] Skipping ${file}: ${reason}`);
          failed.push({ file, reason });
          continue;
        }

        if (!plugin.name || typeof plugin.name !== 'string') {
          const reason = 'Missing or invalid "name" field';
          console.warn(`[PLUGIN WARN] Skipping ${file}: ${reason}`);
          failed.push({ file, reason });
          continue;
        }

        if (typeof plugin.execute !== 'function') {
          const reason = 'Missing "execute" function';
          console.warn(`[PLUGIN WARN] Skipping ${file}: ${reason}`);
          failed.push({ file, reason });
          continue;
        }

        const cmdName = plugin.name.toLowerCase();
        // Last registration wins — that silently shadowed the good
        // translate plugin for weeks (web/translate.js overwrote
        // ai/translate.js). Warn so duplicate names are loud, not silent.
        if (this.commands.has(cmdName)) {
          const prev = loadedPlugins.get(cmdName);
          console.warn(
            `[PLUGIN WARN] Duplicate command "${cmdName}": ${filePath} overwrites ${prev?.filePath || '(unknown)'}`
          );
        }
        this.commands.set(cmdName, plugin);
        loadedPlugins.set(cmdName, { plugin, filePath });

        if (Array.isArray(plugin.aliases)) {
          for (const alias of plugin.aliases) {
            this.aliases.set(alias.toLowerCase(), cmdName);
          }
        }

        // Track lifecycle hooks
        const hooks = [];
        if (typeof plugin.onLoad === 'function') hooks.push('onLoad');
        if (typeof plugin.onUnload === 'function') hooks.push('onUnload');
        if (typeof plugin.onError === 'function') hooks.push('onError');
        if (hooks.length > 0) {
          lifecycleHooks.push({ name: cmdName, hooks, file });
        }

        // Check dependencies
        if (Array.isArray(plugin.dependencies)) {
          for (const dep of plugin.dependencies) {
            if (!this.commands.has(dep.toLowerCase())) {
              // Will check after all plugins loaded
              dependencyWarnings.push({ plugin: cmdName, missing: dep, file });
            }
          }
        }

        if (plugin.category) {
          console.log(`[OK] Loaded command: ${plugin.name} (${plugin.category})${hooks.length > 0 ? ' [lifecycle: ' + hooks.join(', ') + ']' : ''}`);
        } else {
          console.log(`[OK] Loaded hidden command: ${plugin.name}${hooks.length > 0 ? ' [lifecycle: ' + hooks.join(', ') + ']' : ''}`);
        }
      } catch (err) {
        const reason = err.message || String(err);
        console.error(`[PLUGIN ERROR] Failed to load ${file}: ${reason}`);
        failed.push({ file, reason });
      }
    }

    // ── Pass 2: Verify dependencies (now that all plugins are loaded) ────────
    const resolvedWarnings = [];
    for (const warn of dependencyWarnings) {
      if (!this.commands.has(warn.missing.toLowerCase())) {
        resolvedWarnings.push(warn);
      }
    }

    // ── Pass 3: Call onLoad hooks ─────────────────────────────────────────────
    const context = this._getPluginContext();
    for (const [name, { plugin }] of loadedPlugins) {
      if (typeof plugin.onLoad === 'function') {
        try {
          await plugin.onLoad(context);
        } catch (err) {
          console.error(`[PLUGIN LIFECYCLE] onLoad failed for ${name}:`, err.message);
        }
      }
    }

    // ── Startup summary ───────────────────────────────────────────────────────
    const loaded = this.commands.size;
    console.log(`\n=== Plugin Load Summary ===`);
    console.log(`  Total found : ${files.length}`);
    console.log(`  Successful  : ${loaded}`);
    console.log(`  Aliases     : ${this.aliases.size}`);
    console.log(`  Failed      : ${failed.length}`);
    console.log(`  Lifecycle   : ${lifecycleHooks.length} plugins with hooks`);
    if (resolvedWarnings.length > 0) {
      console.warn(`  Dependencies: ${resolvedWarnings.length} warning(s)`);
      for (const w of resolvedWarnings) {
        console.warn(`    ⚠ ${w.plugin} depends on missing "${w.missing}" (${w.file})`);
      }
    }
    if (failed.length > 0) {
      console.warn(`  Failed files:`);
      for (const { file, reason } of failed) {
        console.warn(`    ✗ ${file} — ${reason}`);
      }
    }
    console.log(`===========================\n`);
  },

  /**
   * Reload a single plugin by name. Calls onUnload on the old plugin,
   * re-imports the file, calls onLoad on the new plugin.
   * @param {string} pluginName - Plugin name (case-insensitive)
   * @returns {Promise<boolean>} - True if reload succeeded
   */
  async reloadPlugin(pluginName) {
    const name = pluginName.toLowerCase();
    const oldPlugin = this.commands.get(name);
    if (!oldPlugin) return false;

    // Find the plugin file
    const pluginsDir = path.resolve(__dirname, '../plugins');
    const files = walkDirSync(pluginsDir).filter(f => f.endsWith('.js'));

    let pluginFile = null;
    for (const filePath of files) {
      try {
        // Cache-bust to get fresh module
        const fileUrl = new URL(`file://${filePath}`);
        const importUrl = `${fileUrl.href}?t=${Date.now()}`;
        const mod = await import(importUrl);
        if (mod.default?.name?.toLowerCase() === name) {
          pluginFile = { filePath, mod };
          break;
        }
      } catch (_) {
        continue;
      }
    }

    if (!pluginFile) {
      console.error(`[PLUGIN RELOAD] Could not find source file for ${pluginName}`);
      return false;
    }

    // Call onUnload on old plugin
    if (typeof oldPlugin.onUnload === 'function') {
      try {
        await oldPlugin.onUnload();
      } catch (err) {
        console.error(`[PLUGIN RELOAD] onUnload failed for ${name}:`, err.message);
      }
    }

    // Remove old aliases
    for (const [alias, target] of this.aliases) {
      if (target === name) this.aliases.delete(alias);
    }

    // Install new plugin
    const newPlugin = pluginFile.mod.default;
    this.commands.set(name, newPlugin);

    if (Array.isArray(newPlugin.aliases)) {
      for (const alias of newPlugin.aliases) {
        this.aliases.set(alias.toLowerCase(), name);
      }
    }

    // Call onLoad on new plugin
    if (typeof newPlugin.onLoad === 'function') {
      try {
        await newPlugin.onLoad(this._getPluginContext());
      } catch (err) {
        console.error(`[PLUGIN RELOAD] onLoad failed for ${name}:`, err.message);
      }
    }

    console.log(`[PLUGIN RELOAD] Successfully reloaded: ${name}`);
    return true;
  },

  /**
   * Reload all plugins in a category.
   * @param {string} category - Category name (case-insensitive)
   * @returns {Promise<{success: number, fail: number, total: number}>}
   */
  async reloadCategory(category) {
    const plugins = [];
    this.commands.forEach((cmd, name) => {
      if (cmd.category?.toLowerCase() === category.toLowerCase()) {
        plugins.push(name);
      }
    });

    let success = 0, fail = 0;
    for (const name of plugins) {
      try {
        const r = await this.reloadPlugin(name);
        if (r) success++;
        else fail++;
      } catch {
        fail++;
      }
    }
    return { success, fail, total: plugins.length };
  },

  /**
   * Count commands by category.
   * @returns {Record<string, number>}
   */
  commandsCount() {
    const counts = {};
    this.commands.forEach((cmd) => {
      const cat = cmd.category || 'hidden';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  },
};

export default client;
