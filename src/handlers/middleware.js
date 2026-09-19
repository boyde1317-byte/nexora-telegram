import { config } from '../../config/index.js';
import { client } from '../core/client.js';
import { db } from '../database/db.js';
import { getRandomResponse } from '../nexora-messages.js';
import { suggestCommand } from '../lib/fuzzyMatch.js';
import { actionCard } from '../lib/interactiveKit.js';

/**
 * MiddlewareRegistry manages pipeline middleware functions and their priorities (0-100).
 * Lower priority values execute first.
 */
export class MiddlewareRegistry {
  constructor() {
    this.middlewares = [];
  }

  /**
   * Register a middleware function.
   * Supports multiple call signatures:
   * - register(name, fn, priority)
   * - register(fn, priority)
   * - register({ name, fn, priority })
   */
  register(name, fn, priority = 50) {
    let mwName = name;
    let mwFn = fn;
    let mwPriority = priority;

    if (typeof name === 'function') {
      mwPriority = typeof fn === 'number' ? fn : 50;
      mwFn = name;
      mwName = mwFn.name || 'anonymous';
    } else if (typeof name === 'object' && name !== null) {
      mwPriority = name.priority ?? 50;
      mwFn = name.fn;
      mwName = name.name || 'anonymous';
    }

    if (typeof mwFn !== 'function') {
      throw new TypeError('Middleware must be a function');
    }

    mwPriority = Math.max(0, Math.min(100, Number(mwPriority) || 50));

    // Replace if a middleware with the same name exists
    this.middlewares = this.middlewares.filter(m => m.name !== mwName);

    this.middlewares.push({ name: mwName, fn: mwFn, priority: mwPriority });
    this.sort();
  }

  unregister(name) {
    this.middlewares = this.middlewares.filter(m => m.name !== name);
  }

  sort() {
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  getMiddlewares() {
    return [...this.middlewares];
  }

  clear() {
    this.middlewares = [];
  }
}

// ── Built-in Middlewares ───────────────────────────────────────────────────

/**
 * logger (priority 1)
 * Logs command execution with timestamp, user, command, and chat.
 */
export async function logger(ctx, next) {
  const startTime = Date.now();
  await next();
  if (ctx.command) {
    const timestamp = new Date().toISOString();
    const user = (ctx.sender || ctx.m?.sender || 'unknown').split('@')[0];
    const chat = ctx.isGroup ? (ctx.jid || ctx.m?.from) : 'DM';
    console.log(`[${timestamp}] [CMD] ${ctx.command.name} ← ${user} in ${chat} (${Date.now() - startTime}ms)`);
  }
}

/**
 * bannedCheck (priority 5)
 * Checks if user is banned in db. Silently returns if banned.
 */
export async function bannedCheck(ctx, next) {
  const sender = ctx.sender || ctx.m?.sender;
  if (sender) {
    const dbInst = ctx.db || db;
    const userData = dbInst.getUser ? dbInst.getUser(sender) : null;
    if (userData?.banned) {
      // Silently return to stop the pipeline
      return;
    }
  }
  await next();
}

/**
 * rateLimiter (priority 10)
 * Per-user rate limiting. Max 15 commands per 30 seconds per user (configurable).
 * Returns a warning message when exceeded.
 */
const rateLimitMap = new Map();

export async function rateLimiter(ctx, next) {
  const max = ctx.config?.rateLimit?.max ?? rateLimiter.max ?? 15;
  const windowMs = ctx.config?.rateLimit?.windowMs ?? rateLimiter.windowMs ?? 30000;

  const sender = ctx.sender || ctx.m?.sender;
  const isOwner = ctx.isOwner ?? ctx.m?.isOwner ?? false;

  if (sender && !isOwner) {
    const body = ctx.body || ctx.m?.body || '';
    const prefixes = ctx.config?.prefix || config.prefix || ['.'];
    const isPrefixed = prefixes.some(p => body.startsWith(p));

    if (isPrefixed) {
      const now = Date.now();
      const userTimestamps = (rateLimitMap.get(sender) || []).filter(t => now - t < windowMs);

      if (userTimestamps.length >= max) {
        const msg = `⚠️ Rate limit exceeded! You can only use ${max} commands per ${Math.round(windowMs / 1000)} seconds. Please slow down.`;
        if (typeof ctx.reply === 'function') {
          await ctx.reply(msg);
        } else if (ctx.m?.reply) {
          await ctx.m.reply(msg);
        }
        return; // Stop pipeline
      }

      userTimestamps.push(now);
      rateLimitMap.set(sender, userTimestamps);
    }
  }

  await next();
}

rateLimiter.max = 15;
rateLimiter.windowMs = 30000;
rateLimiter.reset = () => rateLimitMap.clear();

/**
 * prefixGuard (priority 15)
 * Checks if message starts with a configured prefix.
 * If not, passes through (non-command messages still flow through for passive features).
 */
export async function prefixGuard(ctx, next) {
  const body = ctx.m?.body ?? ctx.body ?? '';
  const prefixes = ctx.config?.prefix || config.prefix || ['.'];
  const prefix = prefixes.find(p => body.startsWith(p));

  if (prefix) {
    ctx.prefix = prefix;
    ctx.body = body;
    const args = body.slice(prefix.length).trim().split(/\s+/);
    ctx.commandName = args.shift()?.toLowerCase();
    ctx.args = args;
    ctx.isCommand = true;
  } else {
    ctx.isCommand = false;
  }

  await next();
}

/**
 * cooldownGuard (priority 20)
 * Per-command, per-user cooldown enforcement using client.cooldowns.
 */
export async function cooldownGuard(ctx, next) {
  if (!ctx.isCommand || !ctx.commandName) {
    return await next();
  }

  const clientInst = ctx.client || client;
  const resolvedName = clientInst.aliases.get(ctx.commandName) || ctx.commandName;
  const command = clientInst.commands.get(resolvedName);

  if (!command) {
    return await next();
  }

  const now = Date.now();
  const sender = ctx.sender || ctx.m?.sender;
  const cooldownKey = `${sender}_${resolvedName}`;
  const cooldownMs = command.cooldown ?? ctx.config?.cooldownTime ?? config.cooldownTime ?? 3000;
  const lastUsed = clientInst.cooldowns.get(cooldownKey);

  if (lastUsed && now - lastUsed < cooldownMs) {
    const remainingMs = cooldownMs - (now - lastUsed);
    const remainingSec = remainingMs / 1000;
    let timeStr;
    if (remainingSec >= 60) {
      const mins = Math.floor(remainingSec / 60);
      const secs = Math.floor(remainingSec % 60);
      timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    } else {
      timeStr = `${remainingSec.toFixed(1)}s`;
    }

    const cooldownMsg = getRandomResponse('cooldown', command.name, timeStr);
    const sameCategory = [...clientInst.commands.values()]
      .filter(c => c.category === command.category && c.name !== command.name)
      .slice(0, 3)
      .map(c => c.name);

    if (sameCategory.length > 0 && typeof actionCard === 'function') {
      try {
        await actionCard(ctx.sock, ctx.jid, {
          text: `${cooldownMsg}\n\nWhile you wait, try:`,
          footer: `${ctx.config?.botName || config.botName} • Cooldown`,
        }, sameCategory.map(c => ({ label: `▶️ ${ctx.prefix}${c}`, cmd: `${ctx.prefix}${c}` })), { quoted: ctx.rawMessage || ctx.m });
      } catch (_) {
        if (typeof ctx.reply === 'function') await ctx.reply(cooldownMsg);
        else if (ctx.m?.reply) await ctx.m.reply(cooldownMsg);
      }
    } else {
      if (typeof ctx.reply === 'function') await ctx.reply(cooldownMsg);
      else if (ctx.m?.reply) await ctx.m.reply(cooldownMsg);
    }
    return; // Stop pipeline
  }

  await next();

  // Record cooldown timestamp after command passes execution
  clientInst.cooldowns.set(cooldownKey, Date.now());
  setTimeout(() => clientInst.cooldowns.delete(cooldownKey), cooldownMs);
}

/**
 * permissionCheck (priority 25)
 * Checks command permissions (owner, groupOnly, admin, botAdmin).
 */
export async function permissionCheck(ctx, next) {
  if (!ctx.isCommand || !ctx.commandName) {
    return await next();
  }

  const clientInst = ctx.client || client;
  const resolvedName = clientInst.aliases.get(ctx.commandName) || ctx.commandName;
  const command = clientInst.commands.get(resolvedName);

  if (!command) {
    return await next();
  }

  const perms = command.permissions || {};
  const ownerOnly = perms.owner ?? command.ownerOnly ?? false;
  const groupOnly = perms.groupOnly ?? command.groupOnly ?? false;
  const adminOnly = perms.admin ?? command.adminOnly ?? false;
  const botAdminRequired = perms.botAdmin ?? command.botAdmin ?? false;

  const ownerCheck = ctx.isOwner ?? ctx.m?.isOwner ?? false;

  // 1. Owner-only guard
  if (ownerOnly && !ownerCheck) {
    const replyFn = ctx.reply || ctx.m?.reply;
    if (replyFn) await replyFn(getRandomResponse('owner_only'));
    return;
  }

  // 2. Private mode guard
  const dbInst = ctx.db || db;
  const publicMode = dbInst.getSettings?.().publicMode ?? ctx.config?.publicMode ?? config.publicMode;
  if (!publicMode && !ownerCheck) {
    if (typeof ctx.reply?.warn === 'function') {
      await ctx.reply.warn('This bot is running in private mode. Only the owner can use commands.');
    } else if (typeof ctx.m?.reply?.warn === 'function') {
      await ctx.m.reply.warn('This bot is running in private mode. Only the owner can use commands.');
    } else {
      const replyFn = ctx.reply || ctx.m?.reply;
      if (replyFn) await replyFn('This bot is running in private mode. Only the owner can use commands.');
    }
    return;
  }

  // 3. Group-only guard
  if (groupOnly && !ctx.isGroup) {
    const replyFn = ctx.reply || ctx.m?.reply;
    if (replyFn) await replyFn(getRandomResponse('group_only'));
    return;
  }

  // 4. Admin guard
  if (adminOnly && ctx.isGroup) {
    const senderIsAdmin = ctx.m?.isAdmin ? await ctx.m.isAdmin() : false;
    if (!senderIsAdmin && !ownerCheck) {
      const replyFn = ctx.reply || ctx.m?.reply;
      if (replyFn) await replyFn(getRandomResponse('permission_denied'));
      return;
    }
  }

  // 5. Bot-admin guard
  if (botAdminRequired && ctx.isGroup) {
    const botIsAdmin = ctx.m?.isBotAdmin ? await ctx.m.isBotAdmin() : false;
    if (!botIsAdmin) {
      const replyFn = ctx.reply || ctx.m?.reply;
      if (replyFn) await replyFn(getRandomResponse('bot_not_admin'));
      return;
    }
  }

  await next();
}

/**
 * commandResolver (priority 30)
 * Resolves command name (including aliases) and attaches the resolved plugin to the context.
 */
export async function commandResolver(ctx, next) {
  if (!ctx.isCommand || !ctx.commandName) {
    return await next();
  }

  const clientInst = ctx.client || client;
  const resolvedName = clientInst.aliases.get(ctx.commandName) || ctx.commandName;
  const command = clientInst.commands.get(resolvedName);

  if (command) {
    ctx.command = command;
    ctx.resolvedName = resolvedName;
    await next();
  } else {
    // Fuzzy suggestion or command not found
    const allNames = [...clientInst.commands.keys(), ...clientInst.aliases.keys()];
    const suggestion = suggestCommand(ctx.commandName, allNames);
    const p = ctx.prefix || ctx.config?.prefix?.[0] || '.';

    if (suggestion) {
      try {
        await actionCard(ctx.sock, ctx.jid, {
          text: `${getRandomResponse('not_found', `${p}${ctx.commandName}`)}\n\nDid you mean: *${p}${suggestion}*?`,
          footer: `${ctx.config?.botName || config.botName} • Did you mean?`,
        }, [
          { label: `▶️ Run ${p}${suggestion}`, cmd: `${p}${suggestion}` },
          { label: '📖 View Help', cmd: `${p}help` },
        ], { quoted: ctx.rawMessage || ctx.m });
      } catch (_) {
        const replyFn = ctx.reply || ctx.m?.reply;
        if (replyFn) await replyFn(`${getRandomResponse('not_found', `${p}${ctx.commandName}`)}\n\nDid you mean: *${p}${suggestion}*?`);
      }
    } else {
      const replyFn = ctx.reply || ctx.m?.reply;
      if (replyFn) await replyFn(`${getRandomResponse('not_found', `${p}${ctx.commandName}`)}\n\nType *${p}help* to see all commands, or *${p}menu* for the interactive console.`);
    }
    // Do not call next() as command was not found
  }
}

// ── Instantiate Singleton Registry & Default Registration ─────────────────

export const middlewareRegistry = new MiddlewareRegistry();
export const registry = middlewareRegistry;

middlewareRegistry.register('logger', logger, 1);
middlewareRegistry.register('bannedCheck', bannedCheck, 5);
middlewareRegistry.register('rateLimiter', rateLimiter, 10);
middlewareRegistry.register('prefixGuard', prefixGuard, 15);
middlewareRegistry.register('cooldownGuard', cooldownGuard, 20);
middlewareRegistry.register('permissionCheck', permissionCheck, 25);
middlewareRegistry.register('commandResolver', commandResolver, 30);

/**
 * executePipeline(context)
 * Runs all registered middlewares in priority order, then calls the resolved command's execute function.
 * Includes an error boundary wrapping execution to prevent unhandled crashes.
 */
export async function executePipeline(context) {
  const m = context.m;
  const sock = context.sock;
  const rawMessage = context.rawMessage;

  const ctx = {
    ...context,
    m,
    sock,
    rawMessage,
    jid: context.jid || m?.from,
    sender: context.sender || m?.sender,
    isGroup: context.isGroup ?? m?.isGroup ?? false,
    isOwner: context.isOwner ?? m?.isOwner ?? false,
    db: context.db || db,
    client: context.client || client,
    config: context.config || config,
    reply: context.reply || m?.reply,
    react: context.react || m?.react,
  };

  try {
    const middlewares = middlewareRegistry.getMiddlewares();
    let index = -1;

    async function dispatch(i) {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      if (i < middlewares.length) {
        const mw = middlewares[i];
        ctx.next = () => dispatch(i + 1);
        return await mw.fn(ctx, ctx.next);
      } else {
        // End of pipeline: call resolved command's execute function if attached
        if (ctx.command && typeof ctx.command.execute === 'function') {
          try {
            await ctx.sock?.sendPresenceUpdate('composing', ctx.jid).catch(() => {});
          } catch (_) {}

          await ctx.command.execute(ctx);

          // Track command usage statistics
          try {
            const dbInst = ctx.db || db;
            if (!dbInst.data) dbInst.data = {};
            if (!dbInst.data.stats) dbInst.data.stats = {};
            if (!dbInst.data.stats.commandsUsed) dbInst.data.stats.commandsUsed = {};
            dbInst.data.stats.commandsUsed[ctx.command.name] = (dbInst.data.stats.commandsUsed[ctx.command.name] || 0) + 1;
            dbInst.save?.();
          } catch (_) {}
        }
      }
    }

    return await dispatch(0);
  } catch (err) {
    console.error('[PIPELINE ERROR]', err.message || err);
    try {
      const p = ctx.prefix || ctx.config?.prefix?.[0] || config.prefix?.[0] || '.';
      const cmdName = ctx.command?.name || ctx.commandName;
      let errText;
      if (cmdName) {
        errText = getRandomResponse('exec_error', cmdName, err.message || 'Unknown error');
        errText += `\n\n_Type \`${p}help ${cmdName}\` for usage info, or try again._`;
      } else {
        errText = '⚠️ An unexpected error occurred while processing your message.';
      }
      if (typeof ctx.reply === 'function') {
        await ctx.reply(errText);
      } else if (ctx.m?.reply) {
        await ctx.m.reply(errText);
      }
    } catch (replyErr) {
      console.error('[PIPELINE ERROR BOUNDARY] Failed to send error message:', replyErr.message || replyErr);
    }
  } finally {
    if (ctx.command && ctx.sock && ctx.jid) {
      try {
        await ctx.sock.sendPresenceUpdate('paused', ctx.jid).catch(() => {});
      } catch (_) {}
    }
  }
}

export default {
  MiddlewareRegistry,
  middlewareRegistry,
  registry,
  executePipeline,
  logger,
  bannedCheck,
  rateLimiter,
  prefixGuard,
  cooldownGuard,
  permissionCheck,
  commandResolver,
};
