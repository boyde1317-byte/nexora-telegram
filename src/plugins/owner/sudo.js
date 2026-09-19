/**
 * sudo.js — Sudo/Owner management system for NEXORA-MD.
 *
 * Allows runtime owners (configured via OWNER_NUMBERS env) to add/remove
 * additional owners via WhatsApp commands. Sudo owners have the same access
 * as env owners — they can run owner-only commands, bypass private mode,
 * etc. Sudo owners are persisted in the database and survive restarts.
 *
 * Root owners (from OWNER_NUMBERS env) cannot be removed.
 *
 * Commands:
 *   .addowner <number>   — Add a sudo owner by phone number
 *   .addowner @user      — Add a sudo owner by mention
 *   .delowner <number>   — Remove a sudo owner by phone number
 *   .delowner @user      — Remove a sudo owner by mention
 *   .owners              — List all owners (env + sudo)
 *   .sudo                — Alias for .owners
 *
 * Owner-only: Yes (only existing owners can manage sudo owners)
 */

import { config } from '../../../config/index.js';
import { db } from '../../database/db.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sanitize a phone number: digits only, no + or @s.whatsapp.net */
function sanitizeNumber(input) {
  if (!input) return '';
  return String(input).replace(/[^0-9]/g, '');
}

/** Convert a raw number to a JID */
function numberToJid(num) {
  return `${num}@s.whatsapp.net`;
}

/** Get the current sudo owners list from the database */
function getSudoOwners() {
  const settings = db.getSettings();
  if (!Array.isArray(settings.sudoOwners)) {
    db.setSettings({ sudoOwners: [] });
    return [];
  }
  return settings.sudoOwners;
}

/** Save the sudo owners list to the database */
function setSudoOwners(list) {
  db.setSettings({ sudoOwners: list });
}

/** Check if a number is a root owner (from env) */
function isRootOwner(num) {
  return config.owner.includes(num);
}

/** Check if a number is already a sudo owner */
function isSudoOwner(num) {
  return getSudoOwners().some(o => o.number === num);
}

/** Resolve the target JID from args or mention or quoted message */
function resolveTarget(args, m) {
  // Priority: mentioned JID > quoted sender > raw number from args
  if (m.mentioned?.length > 0) {
    const jid = m.mentioned[0];
    const num = sanitizeNumber(jid.split('@')[0]);
    return { jid, number: num };
  }

  if (m.quoted) {
    const jid = m.quoted.sender;
    const num = sanitizeNumber(jid.split('@')[0]);
    return { jid, number: num };
  }

  // Try to parse a raw number from args
  const rawArg = args[0] || '';
  const num = sanitizeNumber(rawArg);
  if (num.length < 7 || num.length > 15) return null;
  return { jid: numberToJid(num), number: num };
}

// ── Sub-command handlers ─────────────────────────────────────────────────────

async function handleAddOwner({ m, args }) {
  const target = resolveTarget(args, m);
  if (!target) {
    return await m.reply.error(
      'Usage: `.addowner <number>` or `.addowner @user`\nExample: `.addowner 2335XXXXXXXXX`'
    );
  }

  const { number, jid } = target;

  // Can't add yourself (you're already an owner if you can run this)
  if (number === sanitizeNumber(m.sender.split('@')[0])) {
    return await m.reply.error("You're already an owner.");
  }

  // Already a root owner
  if (isRootOwner(number)) {
    return await m.reply.warn(`${number} is already a root owner (configured in .env).`);
  }

  // Already a sudo owner
  if (isSudoOwner(number)) {
    return await m.reply.warn(`${number} is already a sudo owner.`);
  }

  // Add to database
  const owners = getSudoOwners();
  const addedBy = sanitizeNumber(m.sender.split('@')[0]);
  owners.push({
    number,
    name: '',
    addedBy,
    addedDate: Date.now(),
  });
  setSudoOwners(owners);

  const lines = [
    `✅ New sudo owner added`,
    ``,
    `👤 Number  : ${number}`,
    `🎟️ Added by : ${addedBy}`,
    `📅 Date    : ${new Date().toLocaleString()}`,
    ``,
    `_This owner now has full access to all owner commands._`,
  ];

  return await m.reply(asciiBuilder.box('Sudo Owner Added', lines), {
    mentions: jid ? [jid] : [],
    contextInfo: buildEnrichedContextInfo(),
  });
}

async function handleDelOwner({ m, args }) {
  const target = resolveTarget(args, m);
  if (!target) {
    return await m.reply.error(
      'Usage: `.delowner <number>` or `.delowner @user`\nExample: `.delowner 2335XXXXXXXXX`'
    );
  }

  const { number, jid } = target;

  // Can't remove root owners
  if (isRootOwner(number)) {
    return await m.reply.error(
      `${number} is a root owner (configured in .env) and cannot be removed.\nRemove them from OWNER_NUMBERS in your .env file instead.`
    );
  }

  // Not a sudo owner
  if (!isSudoOwner(number)) {
    return await m.reply.warn(`${number} is not a sudo owner.`);
  }

  // Remove from database
  const owners = getSudoOwners().filter(o => o.number !== number);
  setSudoOwners(owners);

  const removedBy = sanitizeNumber(m.sender.split('@')[0]);
  const lines = [
    `🗑️ Sudo owner removed`,
    ``,
    `👤 Number   : ${number}`,
    `🎟️ Removed by : ${removedBy}`,
    `📅 Date     : ${new Date().toLocaleString()}`,
  ];

  return await m.reply(asciiBuilder.box('Sudo Owner Removed', lines), {
    mentions: jid ? [jid] : [],
    contextInfo: buildEnrichedContextInfo(),
  });
}

async function handleListOwners({ m }) {
  const rootOwners = config.owner;
  const sudoOwners = getSudoOwners();

  const lines = [];

  // Root owners
  lines.push('═══ Root Owners (.env) ═══');
  if (rootOwners.length === 0) {
    lines.push('  (none configured)');
  } else {
    rootOwners.forEach((num, i) => {
      lines.push(`  ${i + 1}. ${num} ← root`);
    });
  }

  // Sudo owners
  lines.push('');
  lines.push('═══ Sudo Owners (runtime) ═══');
  if (sudoOwners.length === 0) {
    lines.push('  (none added)');
  } else {
    sudoOwners.forEach((o, i) => {
      const date = o.addedDate ? new Date(o.addedDate).toLocaleDateString() : 'unknown';
      const by = o.addedBy || 'unknown';
      lines.push(`  ${i + 1}. ${o.number}`);
      lines.push(`     added by ${by} on ${date}`);
    });
  }

  lines.push('');
  lines.push(`Total: ${rootOwners.length} root + ${sudoOwners.length} sudo = ${rootOwners.length + sudoOwners.length} owners`);

  return await m.reply(asciiBuilder.box('Owner List', lines), {
    contextInfo: buildEnrichedContextInfo(),
  });
}

// ── Plugin export ────────────────────────────────────────────────────────────

export default {
  name: 'sudo',
  aliases: ['addowner', 'delowner', 'rmowner', 'owners', 'sudolist'],
  category: 'owner',
  description: 'Manage sudo owners. Sub-commands: .addowner <number|@user>, .delowner <number|@user>, .owners',
  cooldown: 2000,
  permissions: { owner: true },

  execute: async (ctx) => {
    const { m, args } = ctx;

    // Determine which sub-command was used based on the alias/first arg
    const cmdText = m.body?.trim().split(/\s+/)[0]?.toLowerCase() || '';
    // Strip prefix from cmdText
    const prefixMatch = config.prefix.find(p => cmdText.startsWith(p));
    const subCmd = prefixMatch ? cmdText.slice(prefixMatch.length) : cmdText;

    // If the command itself is an alias like .addowner or .delowner, use that
    if (subCmd === 'addowner' || subCmd === 'add') {
      return await handleAddOwner(ctx);
    }

    if (subCmd === 'delowner' || subCmd === 'rmowner' || subCmd === 'del' || subCmd === 'remove') {
      return await handleDelOwner(ctx);
    }

    // Default: if first arg looks like a number or @mention, treat as addowner
    if (args.length > 0 || m.mentioned?.length > 0 || m.quoted) {
      const firstArg = args[0] || '';
      const subAction = firstArg.toLowerCase();

      if (subAction === 'add' || subAction === 'a') {
        return await handleAddOwner({ ...ctx, args: args.slice(1) });
      }

      if (subAction === 'del' || subAction === 'remove' || subAction === 'rm' || subAction === 'd') {
        return await handleDelOwner({ ...ctx, args: args.slice(1) });
      }

      if (subAction === 'list' || subAction === 'ls' || subAction === 'all') {
        return await handleListOwners(ctx);
      }

      // No sub-action keyword — default to addowner
      return await handleAddOwner(ctx);
    }

    // No args — show the list
    return await handleListOwners(ctx);
  },
};
