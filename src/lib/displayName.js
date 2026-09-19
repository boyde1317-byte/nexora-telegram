/**
 * Shared display-name helper.
 *
 * Looks up the WhatsApp push name for a JID.  Falls back to the local part of
 * the JID, stripping any device-suffix (`:0`, `:1`, …) so LID-style JIDs
 * produce a clean number string rather than a raw opaque identifier.
 *
 * Both src/handlers/group.js and src/handlers/message.js previously contained
 * private copies of this function; they now import from here instead.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid  - full JID, e.g. "12345678901@s.whatsapp.net"
 * @returns {Promise<string>}
 */
export async function getDisplayName(sock, jid) {
  try {
    const contact = await sock.onWhatsApp(jid.split('@')[0]);
    return contact?.[0]?.notify || jid.split('@')[0].split(':')[0];
  } catch {
    return jid.split('@')[0].split(':')[0];
  }
}
