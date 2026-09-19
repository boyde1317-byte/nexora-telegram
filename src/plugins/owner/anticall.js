/**
 * anticall.js — owner toggle for automatically rejecting incoming WhatsApp
 * calls (voice or video) made to the bot's number.
 *
 * Styled after antilink.js/antitag.js: a selectMenu (single_select) picker
 * when called with no subcommand, and an actionCard with follow-up owner
 * settings buttons after a status check or on/off change.
 *
 * This is a bot-wide (not per-group) setting since calls are placed to the
 * bot's own account, so it is persisted via db.getSettings()/setSettings()
 * the same way public/private mode is.
 *
 * Actual call rejection is wired into src/core/connection.js, which listens
 * for the socket's `call` event and calls sock.rejectCall(id, from) — see
 * the "Anti-call" block there.
 */
import { selectMenu, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'anticall',
  aliases: ['blockcalls'],
  category: 'owner',
  description: 'Toggle automatic rejection of incoming calls to the bot.',
  permissions: { owner: true },
  cooldown: 2000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p = prefix || '.';
    const settings = db.getSettings();
    const sub      = args[0]?.toLowerCase();

    // ── No subcommand — show a single_select picker ───────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const status = settings.anticall ? '✅ ON' : '❌ OFF';
      return await selectMenu(sock, m.from, {
        text:   `📵 *ANTI-CALL*\n\nCurrent status: *${status}*\n\nSelect an action from the list below:`,
        footer: 'Auto-rejects every incoming voice/video call',
      }, `⚙️ Anti-Call Settings (${status})`, [
        { title: 'Call Control', rows: [
          { id: `${p}anticall on`,     title: '✅ Enable Anti-Call',  description: 'Auto-reject every incoming call' },
          { id: `${p}anticall off`,    title: '❌ Disable Anti-Call', description: 'Allow calls through normally' },
          { id: `${p}anticall status`, title: '📊 Check Status',      description: 'Show current setting' },
        ]},
        { title: 'Related Settings', rows: [
          { id: `${p}self`,   title: '🔒 Private Mode', description: 'Owner-only command mode' },
          { id: `${p}public`, title: '🌐 Public Mode',  description: 'Everyone can use commands' },
        ]},
      ], [], { quoted: m });
    }

    // ── status ─────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const enabled = settings.anticall;
      const status  = enabled ? '✅ Enabled' : '❌ Disabled';
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   `📵 *ANTI-CALL STATUS*\n\nAnti-call is currently *${status}*.`,
        footer: enabled ? 'Incoming calls are being rejected automatically.' : 'Calls ring through normally.',
      }, [
        { label: enabled ? 'Disable Now' : 'Enable Now', cmd: `${p}anticall ${enabled ? 'off' : 'on'}` },
        { label: '🔒 Private Mode', cmd: `${p}self` },
        { label: '🌐 Public Mode',  cmd: `${p}public` },
      ], {
        title: 'ANTI-CALL',
        body:  status,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
      }, { quoted: m });
    }

    // ── on / off ───────────────────────────────────────────────────────────
    const enable = sub === 'on';
    db.setSettings({ anticall: enable });

    const resultText = enable
      ? '📵 *Anti-call ENABLED*\n\nIncoming calls will be rejected automatically.'
      : '📵 *Anti-call DISABLED*\n\nCalls will ring through normally.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved',
    }, [
      { label: enable ? '❌ Disable Again' : '✅ Re-enable', cmd: `${p}anticall ${enable ? 'off' : 'on'}` },
      { label: '🔒 Private Mode', cmd: `${p}self` },
      { label: '🌐 Public Mode',  cmd: `${p}public` },
    ], {
      title: 'ANTI-CALL',
      body:  'Setting saved',
      thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
    }, { quoted: m });
  },
};
