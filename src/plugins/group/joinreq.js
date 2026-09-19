/**
 * joinreq.js — Group join-request management.
 *
 * Works with WhatsApp's "member approval" flow: when the gate is on,
 * people tapping the invite link land in a pending-requests queue and
 * an admin has to approve them.
 *
 *   .joinreq | list            → table of pending requests (+ gate state)
 *   .joinreq approve @user|all → admit one / everyone
 *   .joinreq reject  @user|all → turn away one / everyone
 *   .joinreq gate on|off       → toggle the join-approval gate
 *
 * Uses the fork's groupRequestParticipantsList / groupRequestParticipantsUpdate
 * (approve | reject) / groupJoinApprovalMode primitives.
 */
import { actionCardWithAd } from '../../lib/interactiveKit.js';

const bare = (jid) => String(jid).split('@')[0].split(':')[0];

const asJid = (x) => {
  if (!x) return null;
  if (String(x).includes('@')) return `${bare(x)}@s.whatsapp.net`;
  const digits = String(x).replace(/[^0-9]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
};

export default {
  name: 'joinreq',
  aliases: ['joinrequests', 'jreq', 'jr', 'pending'],
  category: 'group',
  description: 'Manage pending join requests. Usage: .joinreq list | approve @user|all | reject @user|all | gate on/off',
  permissions: { groupOnly: true, admin: true },
  cooldown: 4000,
  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const sub = args[0]?.toLowerCase() || 'list';

    // ── resolve the request queue once ────────────────────────────────────
    const getRequests = async () => {
      try {
        const rows = await sock.groupRequestParticipantsList(m.from);
        return Array.isArray(rows) ? rows : [];
      } catch (_) { return []; }
    };

    // ── gate on/off ───────────────────────────────────────────────────────
    if (sub === 'gate') {
      const mode = args[1]?.toLowerCase();
      if (mode !== 'on' && mode !== 'off') {
        return await m.reply.warn(`Usage: \`${p}joinreq gate on|off\` — controls whether new joiners need admin approval.`);
      }
      if (!(await m.isBotAdmin())) {
        return await m.reply.warn('I need to be a group *admin* to change the join-approval gate.');
      }
      try {
        await sock.groupJoinApprovalMode(m.from, mode);
        return await actionCardWithAd(sock, m.from, {
          text: `🚪 *JOIN GATE ${mode === 'on' ? 'ENABLED' : 'DISABLED'}*\n\n${mode === 'on'
            ? 'New members now need admin approval before joining. Pending requests appear in `.joinreq list`.'
            : 'New members can join directly again — no approval needed.'}`,
          footer: '© NEXORA-MD by Aizen',
        }, [
          { label: 'View Requests', cmd: `${p}joinreq list` },
          { label: mode === 'on' ? 'Disable Gate' : 'Enable Gate', cmd: `${p}joinreq gate ${mode === 'on' ? 'off' : 'on'}` },
        ], { title: 'JOIN REQUESTS', body: 'Gate setting' }, { quoted: m });
      } catch (err) {
        return await m.reply.error(`Could not change the join gate: ${err.message}`);
      }
    }

    // ── approve / reject ──────────────────────────────────────────────────
    if (sub === 'approve' || sub === 'reject') {
      const action = sub;
      const who    = args[1]?.toLowerCase();

      if (!(await m.isBotAdmin())) {
        return await m.reply.warn('I need to be a group *admin* to approve or reject join requests.');
      }

      const requests = await getRequests();
      if (!requests.length) {
        return await m.reply.info('No pending join requests right now. ✨', 'JOIN REQUESTS');
      }

      let targets = [];
      if (!who || who === 'all') {
        targets = requests.map((r) => r.jid).filter(Boolean);
      } else {
        const wanted  = asJid(m.msg?.contextInfo?.mentionedJid?.[0] || who);
        const matched = requests.find((r) => bare(r.jid) === bare(wanted));
        if (!matched) {
          return await m.reply.warn(`That number isn't in the pending queue. Use \`${p}joinreq list\` to see requests.`);
        }
        targets = [matched.jid];
      }

      try {
        const results = await sock.groupRequestParticipantsUpdate(m.from, targets, action);
        const ok   = (results || []).filter((r) => !r.status || String(r.status) === '200');
        const fail = (results || []).filter((r) => String(r.status) !== '200');
        await m.react(action === 'approve' ? '✅' : '🚫');

        const lines = [
          `${action === 'approve' ? '✅' : '🚫'} *${action.toUpperCase()}D ${ok.length} REQUEST${ok.length !== 1 ? 'S' : ''}*`,
          '',
          ...ok.slice(0, 15).map((r) => `• ${bare(r.jid)}`),
          ...(ok.length > 15 ? [`… and ${ok.length - 15} more`] : []),
          ...(fail.length ? ['', `⚠️ ${fail.length} could not be processed (already handled or not pending).`] : []),
        ];

        return await actionCardWithAd(sock, m.from, {
          text: lines.join('\n'),
          footer: '© NEXORA-MD by Aizen',
        }, [
          { label: 'View Remaining', cmd: `${p}joinreq list` },
        ], { title: 'JOIN REQUESTS', body: `${action} queue` }, { quoted: m });
      } catch (err) {
        return await m.reply.error(`${action} failed: ${err.message}`);
      }
    }

    // ── list (default) ────────────────────────────────────────────────────
    const requests = await getRequests();
    let gateOn = null;
    try {
      const meta = await m.getGroupMetadata();
      gateOn = meta?.joinApprovalMode ?? null;
    } catch (_) { /* metadata unavailable — skip the gate line */ }

    if (!requests.length) {
      return await actionCardWithAd(sock, m.from, {
        text: `📋 *JOIN REQUEST QUEUE*\n\nEmpty — nobody is waiting for approval.${gateOn === false ? '\n\n⚠️ The join gate is *off*: members join directly without approval.' : ''}`,
        footer: '© NEXORA-MD by Aizen',
      }, [
        { label: 'Enable Gate', cmd: `${p}joinreq gate on` },
      ], { title: 'JOIN REQUESTS', body: 'Queue empty' }, { quoted: m });
    }

    const rows = requests.map((r) => [
      bare(r.jid),
      (r.name || r.pushName || '-').slice(0, 24),
      (r.method || r.addMethod || '-').replace(/_/g, ' ').slice(0, 16),
    ]);

    return await actionCardWithAd(sock, m.from, {
      text: `📋 *JOIN REQUEST QUEUE* — *${requests.length}* waiting\n\n${rows.slice(0, 12).map((r) => `• ${r[0]}${r[1] !== '-' ? ` — ${r[1]}` : ''}`).join('\n')}${requests.length > 12 ? `\n… and ${requests.length - 12} more` : ''}${gateOn === false ? '\n\n⚠️ Gate is *off* — approve anyway to let them in now.' : ''}`,
      footer: '© NEXORA-MD by Aizen',
    }, [
      { label: '✅ Approve All',  cmd: `${p}joinreq approve all` },
      { label: '🚫 Reject All',   cmd: `${p}joinreq reject all` },
      { label: 'Toggle Gate',     cmd: `${p}joinreq gate ${gateOn === false ? 'on' : 'off'}` },
    ], { title: 'JOIN REQUESTS', body: `${requests.length} pending` }, { quoted: m });
  },
};
