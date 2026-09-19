/**
 * botDetector.js — signals that a WhatsApp account is a bot.
 *
 * Used by the .antibot guard (strong mode). Two tiers:
 *
 *   TIER 1 — identity (near-certain, instant kick):
 *     - pushName / verified business name matches bot naming patterns
 *       ("xxx-bot", "wa bot", "whatsapp bot", "xxx-MD", ...)
 *
 *   TIER 2 — behavior (scored, corroborated, then struck):
 *     +2  decorated bot "menu" output (box-drawing walls ╭─╮ ━ ║)
 *     +2  multi-line command list mentioning menu/prefix/commands
 *     +1  streak of ≥3 commands with prefixes our own bot doesn't own
 *         (someone is operating another bot in the group)
 *
 *   Score ≥ 4            → identity tier → immediate removal
 *   Score ≥ 3            → strike (shared 3-strike counter)
 *   Score 2 + no pfp     → strike (async corroboration)
 *
 * Exemptions (admins/owner/bot/paired/whitelist) are applied by the caller.
 */

// Identity: "bot" as a delimited word/suffix, or the classic "-MD" suffix
// ("-MD"-style suffixes like NEXORA-MD). Delimiters keep humans safe: "Abbot",
// "Robotics", "Md Ali" (common Bangladeshi name prefix) all pass.
const BOT_NAME_RE =
  /(?:^|[\s\-_.@])(?:bot|wa[\s_-]?bot|whatsapp[\s_-]?bot|whats[\s_-]?app[\s_-]?bot)(?:[\s\-_.@0-9]|$)/i;
const BOT_MD_RE = /[-_]\s*x?md(?:[\s\-_0-9]|$)/i; // "-MD" / "-XMD" / "_md"-style bot suffixes

// Menu walls: baileys bots love ╭─╮ ━ ║ 『』 decorated output
const BOX_CHARS = /[╭╮╰╯━║≡「」]/g;
// Foreign command prefixes humans use on OTHER bots
const FOREIGN_PREFIX_RE = /^[!/$*#]\s*([a-z0-9]+)/i;

export function isBotName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return BOT_NAME_RE.test(n) || BOT_MD_RE.test(n);
}

/**
 * Synchronous behavioral scoring for a message.
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreBotMessage({ pushName, body, knownCommands }) {
  const reasons = [];
  let score = 0;

  if (isBotName(pushName)) {
    score += 4;
    reasons.push(`name "${pushName}" matches bot patterns`);
  }

  const text = body || '';
  if (text) {
    // Decorated menu wall
    const boxHits = (text.match(BOX_CHARS) || []).length;
    if (boxHits >= 6) {
      score += 2;
      reasons.push(`decorated bot menu (${boxHits} box chars)`);
    }

    // Multi-line command list that mentions menu/commands/prefixes
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const cmdLines = lines.filter((l) => /^[.!$#*/]/.test(l)).length;
    if (cmdLines >= 4 && /(menu|command|prefix|cmd)/i.test(text)) {
      score += 2;
      reasons.push(`command list (${cmdLines} command lines)`);
    }
  }

  return { score, reasons };
}

/**
 * Unknown-prefix command streak: a member repeatedly typing commands that
 * OUR bot doesn't register (e.g. "!menu", "/sticker") is operating or
 * probing another bot. One-off tries are harmless — a streak within the
 * window is the signal. Caller passes knownCommands (a Set of our command
 * names + aliases) and gets back whether the streak threshold was crossed.
 */
const CMD_STREAK = new Map(); // `${jid}:${sender}` -> [timestamps]
const STREAK_WINDOW = 300000; // 5 minutes
const STREAK_THRESHOLD = 3;

export function trackForeignCommand(jid, sender, body, knownCommands) {
  const m = body?.match(FOREIGN_PREFIX_RE);
  if (!m) return false;
  const cmd = m[1].toLowerCase();
  if (knownCommands.has(cmd)) return false; // ours — human talking to us

  const k = `${jid}:${sender}`;
  const now = Date.now();
  const stamps = (CMD_STREAK.get(k) || []).filter((t) => now - t < STREAK_WINDOW);
  stamps.push(now);
  CMD_STREAK.set(k, stamps);

  if (CMD_STREAK.size > 500) {
    for (const [key, arr] of CMD_STREAK) {
      if (!arr.length || now - arr[arr.length - 1] > STREAK_WINDOW * 2) CMD_STREAK.delete(key);
    }
  }
  return stamps.length >= STREAK_THRESHOLD;
}

export function resetBotTracker(jid, sender) {
  CMD_STREAK.delete(`${jid}:${sender}`);
}
