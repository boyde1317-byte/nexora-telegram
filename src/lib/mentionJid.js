/**
 * Resolve an outgoing mention to a phone-number JID when WhatsApp supplied an
 * opaque LID. Visible text should use the phone number, while `mentions` must
 * use the same resolved JID so the label and notification target agree.
 */
function normaliseJid(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const at = raw.lastIndexOf('@');
  const domain = at >= 0 ? raw.slice(at) : '@s.whatsapp.net';
  const user = (at >= 0 ? raw.slice(0, at) : raw).split(':')[0];
  return `${user}${domain}`;
}

export async function resolveMentionJid(sock, jid, groupJid) {
  const norm = normaliseJid(jid);
  if (!norm || !norm.endsWith('@lid')) return norm;

  try {
    const metadata = groupJid ? await sock?.groupMetadata(groupJid) : null;
    const participant = metadata?.participants?.find((p) =>
      normaliseJid(p?.id) === norm || normaliseJid(p?.lid) === norm
    );
    const phone = participant?.phoneNumber || participant?.phone_number;
    if (phone) return normaliseJid(String(phone).includes('@') ? phone : `${phone}@s.whatsapp.net`);
  } catch (_) {
    // Fall through to the socket's session mapping.
  }

  try {
    const mapped = await sock?.signalRepository?.lidMapping?.getPNForLID(norm);
    const phone = typeof mapped === 'string' ? mapped : (mapped?.pn || mapped?.jid || mapped?.id || '');
    if (phone) return normaliseJid(phone);
  } catch (_) {
    // A fresh session may not have this mapping yet; retain the valid LID.
  }

  return norm;
}

export function mentionLabel(jid) {
  return `@${normaliseJid(jid).split('@')[0].split(':')[0]}`;
}
