/**
 * pair.js — link another WhatsApp number as an extra bot session.
 *
 * .pair <number>      → SUPER OWNER: pairs immediately (code follows).
 *                       Anyone else: files a pairing REQUEST — an
 *                       interactive Approve/Deny card lands in the super
 *                       owner's DM (.pairapprove / .pairdeny).
 * .pair list           → same as .sessions
 *
 * The request flow works even in private mode (command.requestable): the
 * request itself grants nothing — every pairing still needs the super
 * owner's approval. The pairing code always lands in a PRIVATE chat (the
 * requester's DM), never in the group where the command ran.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { pairSession, addPairRequest, MAX_EXTRA_SESSIONS } from '../../core/sessionManager.js';
import { listAndSend } from './sessions.js';
import { config } from '../../../config/index.js';
import { client } from '../../core/client.js';

/** Super owner DM target for approval cards. */
function superOwnerJid() {
  const num = config.superOwner?.[0];
  return num ? `${num}@s.whatsapp.net` : null;
}

/** Send the interactive Approve/Deny card to the super owner's DM via the
 *  MAIN socket (a request may arrive through a paired session's socket).
 *  Returns true when the card (or a plain fallback) got delivered. */
async function sendApprovalCard(req) {
  const target = superOwnerJid();
  if (!target) return false;
  const sock = client.socket;
  if (!sock?.user) return false;
  const expires = 'Requests expire after ~15 minutes.';
  const body =
    `📶 *PAIRING REQUEST*\n\n` +
    `Number: +${req.phone}\n` +
    `Requested by: ${req.name || 'unknown'}\n\n` +
    `Approving opens a pairing channel — the code goes to the requester's DM. ${expires}`;
  try {
    await actionCard(sock, target, {
      text: body,
      footer: `${config.botName} • Pairing approval`,
    }, [
      { label: '✅ Approve', cmd: `.pairapprove ${req.phone}` },
      { label: '❌ Deny',    cmd: `.pairdeny ${req.phone}` },
    ]);
    return true;
  } catch (err) {
    console.warn('[pair] approval card failed, plain fallback:', err.message || err);
    try {
      await sock.sendMessage(target, { text: `${body}\n\nApprove: .pairapprove ${req.phone}\nDeny: .pairdeny ${req.phone}` });
      return true;
    } catch (_) {
      return false;
    }
  }
}

export default {
  name: 'pair',
  aliases: ['addsession', 'linksession'],
  category: 'owner',
  description: 'Link another number as a bot session. Super owner pairs directly; others file a request for approval. Usage: .pair <number>',
  cooldown: 10000,
  permissions: { owner: false },
  requestable: true, // passes the private-mode gate — approval still required
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'list' || sub === 'sessions') {
      return await listAndSend(sock, m, p);
    }
    if (!args.length) {
      return await m.reply.info(
        `*LINK ANOTHER WHATSAPP NUMBER*\n\n\`${p}pair <number with country code>\`\n\n• *Super owner:* pairs immediately — the code follows here (in groups it arrives in your DM instead, codes are never posted to a group).\n• *Anyone else:* files a request — the owner gets an Approve/Deny card, and the pairing code comes to your DM once approved.\n\nA linked number runs as its own NEXORA bot (max ${MAX_EXTRA_SESSIONS}). Requests expire after ~15 minutes.\n\n\`${p}sessions\` — list linked sessions\n\`${p}pairrequests\` — pending requests (super owner)`,
        'PAIR SESSION'
      );
    }

    const raw = args[0];
    const isSuper = await m.isSuperOwner;

    // ── Super owner: direct pairing, no approval needed ──────────────────
    if (isSuper) {
      // Codes go to a PRIVATE chat even when the command ran in a group.
      const codeJid = m.isGroup ? m.sender : m.from;
      const postingToDm = m.isGroup;
      return await withReactionStatus(m, async () => {
        try {
          await pairSession(raw, { notifyJid: codeJid });
          return await m.reply(
            `🔌 *Opening a pairing channel for +${raw.replace(/[^0-9]/g, '')}…*\n\n` +
            (postingToDm
              ? `The pairing code will arrive in your DM (codes never go to a group). `
              : `The pairing code will arrive here in a few seconds. `) +
            `It is valid for a couple of minutes — enter it on the other phone as soon as it appears.\n\nI'll confirm once the number links.`
          );
        } catch (err) {
          return await m.reply.error(`*Pairing failed:* ${err.message || err}`);
        }
      });
    }

    // ── Everyone else: interactive approval flow ──────────────────────────
    // Works from the main bot, a group, or even a paired session.
    const dmJid = m.isGroup ? m.sender : m.from;
    const name = m.pushName || m.sender?.split('@')[0] || 'unknown';
    let req;
    try {
      ({ req } = addPairRequest(raw, { dmJid, chatJid: m.from, name }));
    } catch (err) {
      return await m.reply.error(`*Pairing request rejected:* ${err.message || err}`);
    }
    const phone = (req && req.phone) || raw.replace(/[^0-9]/g, '');

    const delivered = await sendApprovalCard({ phone, dmJid, chatJid: m.from, name });
    if (!delivered) {
      return await m.reply.error(
        `*Request filed, but the owner could not be reached right now.* They will see it in \`${p}pairrequests\`.`
      );
    }
    return await m.reply.success(
      `📨 *Pairing request sent for +${phone}.*\n\nThe owner was notified and will approve or deny it. Once approved, the pairing code arrives here in your DM — requests expire after ~15 minutes.`
    );
  },
};
