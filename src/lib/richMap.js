/**
 * richMap.js — Production rich map cards (first live consumers of the
 * fork's OSM-tile map generators, device-audited shapes from richTestKit).
 *
 * Shapes used (baileys fork >= v0.3.18-r6):
 *   generateMapContent   — location card: OSM tile + pin(s) + info text
 *   generateMapWithTable — map card followed by a stats table
 *
 * IMPORTANT: relay via generateWAMessageFromContent + sock.relayMessage
 * (bypasses sendMessage's content processing so the raw
 * botForwardedMessage structure reaches WA servers untouched) and never
 * pass `quoted` into the generators twice — generators embed quoted
 * context themselves; double-setting contextInfo makes WhatsApp drop
 * native rendering.
 *
 * Every helper returns true on success so callers can fall back to plain
 * text. Nothing here throws to the user-facing layer.
 */

import { generateWAMessageFromContent, generateMapContent, generateMapWithTable } from 'baileys';
import capabilities from '../core/capabilities.js';

export async function relayGenerated(sock, jid, generated) {
  const message = await generateWAMessageFromContent(jid, generated.message, {
    userJid: sock.user?.id || '0@s.whatsapp.net',
  });
  await sock.relayMessage(jid, message.message, { messageId: message.key.id });
  return message;
}

/**
 * Location card with one pin. Falls back to caller's plain text on
 * any failure. @returns {Promise<boolean>}
 */
export async function sendLocationCard(sock, jid, quoted, { name, address, latitude, longitude, footer }) {
  if (!capabilities.richResponse) return false;
  try {
    const generated = await generateMapContent(
      {
        centerLatitude: latitude,
        centerLongitude: longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
        annotations: [
          {
            latitude,
            longitude,
            title: String(name).slice(0, 40),
            body: String(address || '').slice(0, 60),
          },
        ],
        showInfoList: true,
      },
      quoted,
      {
        headerText: `📍 ${String(name).slice(0, 50)}`,
        footer: footer || 'NEXORA • OpenStreetMap',
      }
    );
    await relayGenerated(sock, jid, generated);
    return true;
  } catch (err) {
    console.warn('[richMap] location card failed:', err.message);
    return false;
  }
}

/**
 * Map card + stats table combo (map then table, one card).
 * @returns {Promise<boolean>}
 */
export async function sendMapWithTable(sock, jid, quoted, {
  name, latitude, longitude, tableTitle, tableHeaders, tableRows, headerText, footer,
}) {
  if (!capabilities.richResponse) return false;
  try {
    const generated = await generateMapWithTable(
      {
        map: {
          centerLatitude: latitude,
          centerLongitude: longitude,
          annotations: [
            { latitude, longitude, title: String(name).slice(0, 40) },
          ],
        },
        tableTitle,
        tableHeaders,
        tableRows,
      },
      quoted,
      {
        headerText: headerText || `📍 ${String(name).slice(0, 50)}`,
        footer: footer || 'NEXORA • OpenStreetMap',
      }
    );
    await relayGenerated(sock, jid, generated);
    return true;
  } catch (err) {
    console.warn('[richMap] map+table failed:', err.message);
    return false;
  }
}

export default { relayGenerated, sendLocationCard, sendMapWithTable };

/**
 * REAL location card — a native WhatsApp locationMessage.
 *
 * The generateMapContent / generateMapWithTable helpers above embed a
 * static OSM tile PNG (an image of a map). A locationMessage is the
 * genuine article: the interactive map card WhatsApp renders itself,
 * tappable, opens in the maps app, pin at the exact coordinates.
 * Production commands (.locate / .weather / .airquality) ship this;
 * the tile generators stay only for .testrich primitive audits.
 *
 * Returns true on success. Callers fall back to their own text path.
 */
export async function sendRealLocationCard(sock, jid, quoted, { name, address, latitude, longitude }) {
  try {
    await sock.sendMessage(jid, {
      location: {
        degreesLatitude: Number(latitude),
        degreesLongitude: Number(longitude),
        name: String(name || '').slice(0, 60),
        address: String(address || '').slice(0, 70),
      },
    }, quoted ? { quoted } : {});
    return true;
  } catch (err) {
    console.warn('[richMap] real location card failed:', err.message);
    return false;
  }
}
