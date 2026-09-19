/**
 * @file src/lib/cosmetics.js
 * Reusable command-lifecycle polish for NEXORA-MD.
 *
 * waUtils.js answers "what quote/card renders" (fake quotes, ad-reply cards).
 * baileysBridge.js answers "how do I build a raw proto payload" (interactive,
 * carousel, product...). This file answers "how does a command's *lifecycle*
 * look" — reaction status while work runs, a native table for structured
 * output, an animated reveal for a single message, and a cached brand
 * thumbnail so every card looks consistent without re-reading disk.
 *
 * Nothing here duplicates an existing export — see the collision check in
 * waUtils.js / baileysBridge.js before adding new names to this file.
 *
 * Usage in a plugin:
 *   import { withReactionStatus, sendTable, animateReveal, getBrandThumbnail } from '../lib/cosmetics.js'
 */

import fs from 'node:fs'
import path from 'node:path'
import { baileysBridge } from '../core/baileysBridge.js'
import capabilities from '../core/capabilities.js'
import { asciiBuilder } from '../ui/asciiBuilder.js'
import { DEFAULT_PATHS } from '../assets/defaultAssets.js'

// ─────────────────────────────────────────────────────────────────────────────
// 1.  REACTION STATUS LIFECYCLE
//     React with a "working" emoji, run the task, react with success/error.
//     Generalises the ⏳ → ✅ / ❌ pattern already used ad-hoc in menu/types/reaction.js
//     so any plugin doing async work (downloads, generation, group ops...) gets
//     the same lifecycle without hand-rolling m.react() calls.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ReactionStatusOpts
 * @property {string}  [processing='⏳']  Emoji shown while `task` is running
 * @property {string}  [success='✅']     Emoji shown if `task` resolves
 * @property {string}  [error='❌']       Emoji shown if `task` throws
 * @property {boolean} [clearOnSuccess]   Remove the reaction entirely on success instead of showing `success`
 */

/**
 * Run an async task wrapped in a reaction-emoji lifecycle on the triggering message.
 * Reaction failures are swallowed (some clients / chat types reject reactions) —
 * they must never mask the real task result.
 *
 * @param {object}              m     Serialised message (must expose m.react)
 * @param {() => Promise<any>}  task  Work to perform
 * @param {ReactionStatusOpts} [opts]
 * @returns {Promise<any>} Whatever `task` resolves to. Rethrows on failure after reacting ❌.
 *
 * @example
 * await withReactionStatus(m, async () => {
 *   const buffer = await m.quoted.download()
 *   await sock.sendMessage(m.from, { image: buffer }, { quoted: m })
 * })
 */
export async function withReactionStatus(m, task, opts = {}) {
  const { processing = '⏳', success = '✅', error = '❌', clearOnSuccess = false } = opts

  if (processing) { try { await m.react(processing) } catch (_) {} }
  // Send "composing" presence so the user sees the bot is working
  try { await m.sock?.sendPresenceUpdate?.('composing', m.from).catch(() => {}); } catch (_) {}

  try {
    const result = await task()
    if (clearOnSuccess) { try { await m.react('') } catch (_) {} }
    else if (success) { try { await m.react(success) } catch (_) {} }
    return result
  } catch (err) {
    if (error) { try { await m.react(error) } catch (_) {} }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  NATIVE TABLE CARD
//     Renders structured rows as an actual WhatsApp table bubble
//     (richResponseMessage.tableMetadata) instead of a padded text block.
//     Not every client renders richResponseMessage — falls back to an
//     asciiBuilder box on any relay failure so the command never goes silent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} TableOpts
 * @property {string}   [caption]  Table heading shown above the rows
 * @property {string[][]} rows     Array of row cells, e.g. [['Number', '+1 555 0100'], ['Status', 'Clean']]
 * @property {string}   [footer]   Plain text appended below the table (rendered as a follow-up line in the fallback)
 */

/**
 * Send a native WhatsApp table message. Falls back to a styled ascii box
 * (same visual language as messageFormatter templates) if the client/fork
 * rejects richResponseMessage.
 *
 * @param {import('baileys').WASocket} sock
 * @param {string}    jid
 * @param {TableOpts} table
 * @param {object}   [options]  Forwarded to relayMessage / sendMessage (e.g. { quoted: m })
 *
 * @example
 * await sendTable(sock, m.from, {
 *   caption: 'WHATSAPP BAN CHECK',
 *   rows: [['Number', '+1 555 0100'], ['Status', '✅ Clean']],
 * }, { quoted: m })
 */
export async function sendTable(sock, jid, { caption, rows = [], footer } = {}, options = {}) {
  // GATE: richResponseMessage/botForwardedMessage requires a Meta-signed
  // bot certificate (see core/capabilities.js). Without it the send itself
  // SUCCEEDS and clients silently render the "your version of WhatsApp
  // doesn't support it" placeholder — the catch below never fires. Skip
  // straight to the ASCII box unless the capability is actually available.
  if (capabilities.richResponse) {
  try {
    // Route through sendRichResponse which wraps richResponseMessage in the
    // required botForwardedMessage + botMetadata proof chain so WA clients
    // actually render the table bubble (plain relayMessage({richResponseMessage}) fails).
    //
    // NOTE: prepareRichResponseMessage now handles `table` both in the
    // richResponse array (as submessage.table -> TABLE type) and in the
    // flat content path. This was fixed in fork commit ae26d2e.
    // Including table as a submessage inside the richResponse array is
    // still the recommended approach for multi-section rich messages.
    const richResponse = [];
    if (caption) richResponse.push({ text: caption });
    richResponse.push({
      title: caption || undefined,
      table: rows.map(r => ({ items: r.map(String) })),
    });
    const sent = await baileysBridge.sendRichResponse(sock, jid, {
      richResponse,
      footerText: footer || '',
    }, options)
    return sent
  } catch (err) {
    console.warn('[cosmetics.sendTable] richResponse tier failed, ASCII fallback:', err.message)
  }
  } // end capabilities.richResponse gate

  {
    // Fallback tier — plain styled box, same rows rendered as "Label : Value"
    const lines = rows.map(([label, value]) => `${label} : ${value ?? ''}`)
    if (footer) lines.push('', footer)
    return sock.sendMessage(jid, { text: asciiBuilder.box(caption || 'TABLE', lines) }, options)
  }
}

/**
 * Convenience wrapper — auto-quotes the triggering message.
 * @param {object} m
 * @param {import('baileys').WASocket} sock
 * @param {TableOpts} table
 * @param {object} [options]
 */
export async function replyTable(m, sock, table, options = {}) {
  return sendTable(sock, m.from, table, { quoted: m, ...options })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  ANIMATED REVEAL
//     Sends an initial frame then progressively edits the same message bubble
//     through subsequent frames — a typewriter / step-reveal effect.
//     Generalises the tiered live-edit-with-fallback pattern from
//     menu/types/reaction.js: Tier 1 = live edit, Tier 2 = fresh message if
//     the client/fork rejects message edits.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} AnimateRevealOpts
 * @property {number} [delayMs=350]  Pause between frames
 */

/**
 * @param {import('baileys').WASocket} sock
 * @param {string}   jid
 * @param {string[]} frames   Ordered text frames; the last frame is the final state
 * @param {object}  [options] Forwarded to the initial sendMessage (e.g. { quoted: m })
 * @param {AnimateRevealOpts} [animOpts]
 *
 * @example
 * await animateReveal(sock, m.from, [
 *   '🔄 Working.',
 *   '🔄 Working..',
 *   '🔄 Working...',
 *   '✅ *Done!*',
 * ], { quoted: m })
 */
export async function animateReveal(sock, jid, frames = [], options = {}, animOpts = {}) {
  const { delayMs = 350 } = animOpts
  if (!frames.length) return null

  const first = await sock.sendMessage(jid, { text: frames[0] }, options)

  for (let i = 1; i < frames.length; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))

    if (first?.key) {
      try {
        await sock.sendMessage(jid, { text: frames[i], edit: first.key })
        continue
      } catch (editErr) {
        // Tier 2 — client/fork rejected the edit; finish by sending the
        // remaining frames as fresh messages instead of failing silently.
        console.warn('[cosmetics] animateReveal edit failed, falling back to fresh sends:', editErr.message)
      }
    }
    await sock.sendMessage(jid, { text: frames[i] }, options)
  }

  return first
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  BRAND THUMBNAIL URL
//     Every ad-reply / fake-quote card looks best with a consistent brand
//     image. Returns a CDN-hosted URL (link-preview format) — no local file
//     I/O, always available even on ephemeral filesystems.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the bot's brand thumbnail as a CDN URL for use in ad-reply
 * `thumbnailUrl` (link-preview format). No local file I/O — the URL is
 * always available, even on ephemeral filesystems.
 * @returns {Promise<string>} CDN URL of the brand thumbnail image
 */
export async function getBrandThumbnail() {
  return DEFAULT_PATHS.thumbnail
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  BADGED STICKER
//     Attaches WhatsApp's own "premium" / "AI-generated" sticker flags to an
//     already-built stickerMessage. Purely cosmetic metadata — only wire this
//     into commands that are genuinely premium/AI-generated so the badge
//     stays truthful.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {Buffer} stickerBuffer  Already-encoded WebP sticker buffer
 * @param {object} [flags]
 * @param {boolean} [flags.premium=false]
 * @param {boolean} [flags.isAiSticker=false]
 * @param {object} [options]
 *
 * @example
 * await sendBadgedSticker(sock, m.from, webpBuffer, { isAiSticker: true }, { quoted: m })
 */
export async function sendBadgedSticker(sock, jid, stickerBuffer, flags = {}, options = {}) {
  const { premium = false, isAiSticker = false } = flags
  if (!premium && !isAiSticker) {
    return sock.sendMessage(jid, { sticker: stickerBuffer }, options)
  }

  const prepared = await sock.sendMessage(jid, { sticker: stickerBuffer }, { ...options, sendMediaAsSticker: true })
  // The fork's sendMessage already uploads/relays; re-relay only when a proto
  // handle with the raw stickerMessage is available so we can add the flags.
  if (prepared?.message?.stickerMessage) {
    return baileysBridge.relayMessage(sock, jid, {
      stickerMessage: {
        ...prepared.message.stickerMessage,
        ...(premium ? { premium: 1 } : {}),
        ...(isAiSticker ? { isAiSticker: true } : {}),
      },
    }, options)
  }
  return prepared
}

export default {
  withReactionStatus,
  sendTable,
  replyTable,
  animateReveal,
  getBrandThumbnail,
  sendBadgedSticker,
}
