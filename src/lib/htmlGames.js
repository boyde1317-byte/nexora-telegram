/**
 * htmlGames.js — in-chat HTML games & tools via GenAIaeacdsnwHtmlPrimitive.
 *
 * Ported from the "Moongod/Paxley" scene envelope (v0.3.18-r16 gem): the
 * payload is a full HTML5 document rendered inside WhatsApp's sandboxed
 * webview — canvas games with localStorage persistence, a calculator,
 * and a live server-monitor card. Payloads are VENDORED in
 * src/assets/htmlgames/ (never hot-linked: a third party could swap a
 * payload for malicious JS and every user would execute it on open).
 *
 * Wire shape (matches the scene-proven relays 1:1):
 *   messageContextInfo { deviceListMetadata, botMetadata {
 *     botResponseId, verificationMetadata { proofs [{ version: 1,
 *       useCase: 1, signature, certificateChain }] } } }
 *   botForwardedMessage { message: { richResponseMessage {
 *     messageType: 1,
 *     submessages: [{ messageType: 2, messageText: title }],
 *     unifiedResponse: { data: base64({ response_id, sections: [{
 *       view_model: { primitive: {
 *         __typename: 'GenAIaeacdsnwHtmlPrimitive',
 *         payload: <html>, trusted_sources: [...] },
 *       __typename: 'GenAISingleLayoutViewModel' } }] }) },
 *     contextInfo: { forwardingScore: 1, isForwarded: true,
 *       forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
 *       forwardOrigin: 4 } } } }
 *
 * Device status: GenAIaeacdsnwHtmlPrimitive renders in the AI-rich card on
 * modern clients (proven in the wild by the Paxley/Moongod scene bots).
 * Older clients show the submessage text fallback (the game title).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import { generateWAMessageFromContent } from 'baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = path.join(__dirname, '..', 'assets', 'htmlgames');

// Scene-proven static verification blob (same data every scene bot ships).
const VERIFICATION_SIGNATURE =
  'TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LVZlcmlmaWNhdGlvblNpZ25hdHVyZS5NZXRhZGF0YeN55YRyad2+ZA==';

function loadCertificateChain() {
  try {
    const raw = fs.readFileSync(path.join(GAMES_DIR, 'certificate.json'), 'utf-8');
    const chain = JSON.parse(raw);
    return Array.isArray(chain) ? chain : [];
  } catch (_) {
    return [];
  }
}

/**
 * Registry of vendored HTML payloads.
 * `template: true` → payload contains %VARS% replaced with live host stats.
 */
export const HTML_GAMES = {
  dino:    { file: 'dino.html',    title: 'Dino Runner 🦖',       desc: 'Endless runner — tap to jump' },
  chess:   { file: 'chess.html',   title: 'Mini Chess ♟️',        desc: '2-player chess board' },
  mbim:    { file: 'mbim.html',    title: 'Highway Rush 🏎️',     desc: 'Dodge traffic at full speed', alias: 'highway' },
  plane:   { file: 'plane.html',   title: 'Space Rush 🚀',        desc: 'Pilot through the asteroid field', alias: 'spacerush' },
  ttc:     { file: 'ttc.html',     title: 'Tic-Tac-Toe Premium ❌⭕', desc: 'Classic 3-in-a-row' },
  calc:    { file: 'calc.html',    title: 'NEXORA Calc 🧮',       desc: 'Full calculator in chat' },
  monitor: { file: 'monitor.html', title: 'Server Monitor 📡',    desc: 'Live bot host stats', template: true, alias: 'serverinfo' },
};

function resolveGame(name) {
  const key = (name || '').toLowerCase().trim();
  if (HTML_GAMES[key]) return [key, HTML_GAMES[key]];
  for (const [k, g] of Object.entries(HTML_GAMES)) {
    if (g.alias === key) return [k, g];
  }
  return null;
}

/** Fill %VARS% in the monitor template with live host statistics. */
function hydrateTemplate(html) {
  const mem = process.memoryUsage();
  return html
    .replace(/%LATENCY%/g, Date.now() % 1000)
    .replace(/%PLATFORM%/g, os.platform())
    .replace(/%OS_INFO%/g, `${os.platform()} ${os.release()}`)
    .replace(/%ARCH_INFO%/g, os.arch())
    .replace(/%CPU_CORES%/g, String(os.cpus()?.length || 1))
    .replace(/%HEAP_USED%/g, (mem.heapUsed / 1024 / 1024).toFixed(2))
    .replace(/%RSS_MEM%/g, (mem.rss / 1024 / 1024).toFixed(2))
    .replace(/%NODE_INFO%/g, `Node ${process.version}`)
    .replace(/%BOTUPTIME%/g, Math.floor(process.uptime()))
    .replace(/%SYSTEMUPTIME%/g, Math.floor(os.uptime()));
}

/**
 * Relay an in-chat HTML game card.
 * @param {object} sock
 * @param {string} jid
 * @param {{ game: string, quoted?: object }} opts
 * @returns {Promise<{ ok: boolean, key?: object, reason?: string, game?: string }>}
 */
export async function sendHtmlGame(sock, jid, { game, quoted }) {
  const resolved = resolveGame(game);
  if (!resolved) {
    return { ok: false, reason: `unknown game "${game}"` };
  }
  const [key, meta] = resolved;

  let payload;
  try {
    payload = fs.readFileSync(path.join(GAMES_DIR, meta.file), 'utf-8');
  } catch (_) {
    return { ok: false, reason: `payload missing: ${meta.file}` };
  }
  if (meta.template) payload = hydrateTemplate(payload);

  const responseId = crypto.randomUUID();
  const unified = Buffer.from(
    JSON.stringify({
      response_id: responseId,
      sections: [
        {
          view_model: {
            primitive: {
              __typename: 'GenAIaeacdsnwHtmlPrimitive',
              payload,
              trusted_sources: ['nexora.dev'],
            },
            __typename: 'GenAISingleLayoutViewModel',
          },
        },
      ],
    })
  ).toString('base64');

  const certificateChain = loadCertificateChain();
  const content = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: '',
        botResponseId: responseId,
        ...(certificateChain.length
          ? {
              verificationMetadata: {
                proofs: [
                  {
                    version: 1,
                    useCase: 1,
                    signature: VERIFICATION_SIGNATURE,
                    certificateChain,
                  },
                ],
              },
            }
          : {}),
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: meta.title }],
          unifiedResponse: { data: unified },
          contextInfo: {
            ...(quoted && typeof quoted === 'object'
              ? {
                  stanzaId: quoted.key?.id,
                  participant: quoted.key?.participant || quoted.participant,
                  quotedMessage: quoted.message ?? quoted,
                }
              : {}),
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4,
          },
        },
      },
    },
  };

  const message = await generateWAMessageFromContent(jid, content, {
    userJid: sock.user?.id || '0@s.whatsapp.net',
  });
  await sock.relayMessage(jid, message.message, { messageId: message.key.id });
  return { ok: true, key: message.key, game: key };
}

/** Resolve a game name → registry entry (for menus). */
export { resolveGame as findHtmlGame };
