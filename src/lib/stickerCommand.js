/**
    * @file src/lib/stickerCommand.js
    * Sticker to command mapping, stored under db.data.stickerCommands.
    * Shares the same in-memory cache and db.json as users/groups/settings.
    * No separate JSON file, no manual fs I/O.
    */

    import { db } from '../database/db.js'

    function store() {
    if (!db.data.stickerCommands) db.data.stickerCommands = {}
    return db.data.stickerCommands
    }

    /**
    * Resolve the best available identifier from a stickerMessage proto object.
    * Prefers fileSha256 (content hash, stable across re-sends) then falls back
    * to mediaKey (encryption key, changes per upload).
    */
    function hashFromProto(stickerMsg) {
    if (!stickerMsg) return null
    const raw = stickerMsg.fileSha256 ?? stickerMsg.mediaKey ?? null
    if (!raw) return null
    return Buffer.isBuffer(raw) ? raw.toString('base64') : String(raw)
    }

    /**
    * Extract a stable hash from an incoming message.
    * Handles direct stickers, quoted stickers, and stickers inside a
    * documentWithCaptionMessage envelope (some WA clients send them that way).
    */
    export function getStickerHash(m) {
    if (!m?.message) return null
    const msg = m.message
    const stickerMsg =
      msg.stickerMessage ??
      msg.documentWithCaptionMessage?.message?.stickerMessage ??
      null
    return hashFromProto(stickerMsg)
    }

    /**
    * Extract hash from a quoted sticker.
    * Used by addsticker / delsticker when the user replies to an existing sticker.
    */
    export function getQuotedStickerHash(m) {
    return hashFromProto(m?.quoted?.message?.stickerMessage ?? null)
    }

    /** Register a sticker to command mapping. */
    export function addStickerCommand(stickerHash, command, addedBy) {
    if (!stickerHash || !command) return false
    const cmd = command.toLowerCase().replace(/^\./, '')
    store()[stickerHash] = { command: cmd, addedBy, addedAt: Date.now() }
    db.save()
    return true
    }

    /**
    * Remove a sticker to command mapping by hash.
    * Returns true if deleted, false if it was not registered.
    */
    export function deleteStickerCommand(stickerHash) {
    if (!stickerHash) return false
    const s = store()
    if (!s[stickerHash]) return false
    delete s[stickerHash]
    db.save()
    return true
    }

    /** Look up the command entry for a given hash. */
    export function getStickerCommand(stickerHash) {
    if (!stickerHash) return null
    return store()[stickerHash] ?? null
    }

    /**
    * One-shot check: return the mapped command name if m is a registered sticker,
    * otherwise null. Used directly in the message handler.
    */
    export function checkStickerCommand(m) {
    const hash = getStickerHash(m)
    if (!hash) return null
    return store()[hash]?.command ?? null
    }

    /** Return all registered mappings as a display-friendly array. */
    export function listStickerCommands() {
    return Object.entries(store()).map(([hash, data]) => ({
      shortHash: hash.slice(0, 10) + '...',
      command: data.command,
      addedBy: data.addedBy,
      addedAt: data.addedAt,
    }))
    }

    /** Reverse lookup: find which sticker hash maps to a given command name. */
    export function findByCommand(commandName) {
    const target = commandName.toLowerCase().replace(/^\./, '')
    for (const [hash, data] of Object.entries(store())) {
      if (data.command === target) return { hash, ...data }
    }
    return null
    }
    