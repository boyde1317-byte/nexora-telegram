/**
 * antibot.js — STRONG anti-bot protection for a group.
 *
 * Three enforcement layers (see lib/botDetector.js):
 *   1. Join gate   — verified bot names (onWhatsApp lookup) are removed
 *                    the moment they join
 *   2. Identity    — a member whose pushName matches bot patterns is
 *                    removed immediately on their next message
 *   3. Behavior    — bot menu walls, command lists and foreign-command
 *                    streaks are scored; 3+ → strike (shared 3-strike
 *                    counter), borderline scores corroborated with a
 *                    no-profile-picture check
 *
 * Subcommands:
 *   .antibot                          → selectMenu picker
 *   .antibot on/off/status
 *   .antibot scan                     → audit current members for bot names
 *   .antibot whitelist @user          → exempt a human or an approved bot
 *   .antibot unwhitelist @user
 *   .antibot list                     → show whitelist
 *
 * Admins, the bot owner and paired sessions are always exempt.
 */
import { selectMenu, actionCardWithAd, richTableCard } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { isBotName } from '../../lib/botDetector.js';
import { getLinkedBotPhones } from '../../core/sessionManager.js';

const getWhitelist = (groupData) =>
  (Array.isArray(groupData.antibot?.whitelist) ? groupData.antibot.whitelist : []);

export default {
  name: 'antibot',
  aliases: ['nobots'],
  category: 'group',
  description: 'STRONG anti-bot: join gate + name detection + behavior scoring. Usage: .antibot on | scan | whitelist @user',
  permissions: { groupOnly: true, admin: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, db, prefix }) => {
    const p         = prefix || '.';
    const groupData  = db.getGroup(m.from);
    const sub        = args[0]?.toLowerCase();

    // ── whitelist / unwhitelist @user ──────────────────────────────────────
    if (sub === 'whitelist' || sub === 'unwhitelist') {
      const target = m.msg?.contextInfo?.mentionedJid?.[0] || m.quoted?.sender
        || (args[1]?.replace(/[^0-9]/g, '') ? `${args[1].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
      if (!target) {
        return await m.reply.warn(`Usage: \`${p}antibot ${sub} @user\` (mention or reply to them).`);
      }
      const wl    = getWhitelist(groupData);
      const has    = wl.includes(target);
      const nextWl = sub === 'whitelist'
        ? (has ? wl : [...wl, target])
        : wl.filter((x) => x !== target);

      if (sub === 'whitelist' && has) {
        return await m.reply.warn(`@${target.split('@')[0]} is already whitelisted.`, { mentions: [target] });
      }
      if (sub === 'unwhitelist' && !has) {
        return await m.reply.warn(`@${target.split('@')[0]} is not on the antibot whitelist.`, { mentions: [target] });
      }

      const on = groupData.antibot?.on ?? false;
      db.setGroup(m.from, { antibot: { on, whitelist: nextWl } });

      const resultText = sub === 'whitelist'
        ? `✅ *@${target.split('@')[0]} is now EXEMPT from anti-bot enforcement.*\n\nThey will never be flagged as a bot in this group.`
        : `⚠️ *@${target.split('@')[0]} is no longer whitelisted.*\n\nAnti-bot scoring applies to them again.`;

      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text:   resultText,
        footer: `${on ? 'Protection is ON' : '⚠️ Protection is OFF — ' + p + 'antibot on'}`,
      }, [
        { label: 'View Whitelist', cmd: `${p}antibot list` },
        { label: on ? 'Disable Protection' : 'Enable Protection', cmd: `${p}antibot ${on ? 'off' : 'on'}` },
      ], { title: 'ANTI-BOT', body: sub === 'whitelist' ? 'Whitelisted' : 'Unwhitelisted', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m, mentions: [target] });
    }

    // ── list ────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const wl = getWhitelist(groupData);
      if (!wl.length) {
        return await m.reply.info(`No antibot whitelist yet. Add someone with \`${p}antibot whitelist @user\`.`);
      }
      return await richTableCard(sock, m.from, {
        title: '✅ ANTI-BOT WHITELIST',
        headers: ['#', 'Member'],
        rows: wl.map((j, i) => [String(i + 1), `+${j.split('@')[0]}`]),
        footer: groupData.antibot?.on ? 'Protection is ON' : 'Protection is OFF',
      }, { quoted: m });
    }

    // ── scan: audit current members for bot identities ─────────────────────
    if (sub === 'scan') {
      await m.react('🔍');
      const meta = await m.getGroupMetadata();
      const members = meta?.participants || [];
      const adminIds = new Set(members.filter((x) => x.admin).map((x) => x.id));
      // Never flag our own sessions — the main bot AND every paired
      // session are "bot-named" by definition but obviously wanted.
      const selfNums = new Set([
        sock.user?.id?.split('@')[0]?.split(':')[0],
        ...getLinkedBotPhones().map((x) => String(x).split('@')[0]),
      ].filter(Boolean));

      const suspects = [];
      for (const part of members) {
        const jid = part.id;
        const num = jid.split('@')[0].split(':')[0]; // strip the :N device suffix
        if (adminIds.has(jid) || selfNums.has(num)) continue;
        try {
          const [info] = await sock.onWhatsApp(jid);
          const vName  = info?.verifiedName || info?.verifiedBizName || '';
          if (vName && isBotName(vName)) suspects.push([num, vName]);
        } catch (_) { /* lookup failed — skip member */ }
      }

      if (!suspects.length) {
        return await actionCardWithAd(sock, m.from, {
          text:   `🔍 *ANTI-BOT SCAN COMPLETE*\n\nScanned *${members.length}* members — no bot accounts found. ✨`,
          footer: groupData.antibot?.on ? 'Protection is ON — the gate stays shut.' : 'Protection is OFF — enable it to keep bots out.',
        }, [
          { label: groupData.antibot?.on ? 'Disable Protection' : 'Enable Protection', cmd: `${p}antibot ${groupData.antibot?.on ? 'off' : 'on'}` },
        ], { title: 'ANTI-BOT', body: 'Clean group' }, { quoted: m });
      }

      return await richTableCard(sock, m.from, {
        title: `🤖 BOT ACCOUNTS FOUND (${suspects.length})`,
        headers: ['Number', 'Bot name'],
        rows: suspects,
        footer: 'Remove them with the kick command, or whitelist any that are wanted',
      }, { quoted: m });
    }

    // ── picker / status / on / off ─────────────────────────────────────────
    if (!sub || !['on', 'off', 'status'].includes(sub)) {
      const on = groupData.antibot?.on ? '✅ ON' : '❌ OFF';
      const wl = getWhitelist(groupData);
      return await selectMenu(sock, m.from, {
        text: `🤖 *ANTI-BOT PROTECTION*\n\nStatus: *${on}*\nWhitelisted: *${wl.length}*\n\nThree layers: join gate (verified bot names), identity scan (pushName patterns), behavior scoring (bot menus, command streaks). Verified bots are removed instantly.`,
        footer: 'Keeps bot accounts out of the group',
      }, `⚙️ Anti-Bot Settings (${on})`, [
        { title: 'Protection Control', rows: [
          { id: `${p}antibot on`,     title: '✅ Enable Protection',  description: 'Join gate + instant name removal + behavior scoring' },
          { id: `${p}antibot off`,    title: '❌ Disable Protection', description: 'Bots may join and stay' },
          { id: `${p}antibot status`, title: '📊 Check Status',       description: 'Show current protection state' },
          { id: `${p}antibot scan`,   title: '🔍 Scan Members',     description: 'Audit current members for bot accounts' },
        ]},
        { title: 'Whitelist', rows: [
          { id: `${p}antibot whitelist `, title: '➕ Whitelist a Member', description: `Use: ${p}antibot whitelist @user` },
          { id: `${p}antibot list`,        title: '📜 View Whitelist',    description: 'Show exempted members' },
        ]},
      ], [], { quoted: m });
    }

    if (sub === 'status') {
      const on = groupData.antibot?.on;
      const wl = getWhitelist(groupData);
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text: `🤖 *ANTI-BOT STATUS*\n\nProtection: *${on ? '✅ Enabled' : '❌ Disabled'}*\nWhitelisted members: *${wl.length}*\n\n_Layers: join gate → identity removal → behavior scoring (shared 3-strike counter)._`,
        footer: on ? 'Bot accounts are detected and removed.' : 'No bot filtering in place.',
      }, [
        { label: on ? 'Disable Now' : 'Enable Now', cmd: `${p}antibot ${on ? 'off' : 'on'}` },
        { label: 'Scan Members',                     cmd: `${p}antibot scan` },
      ], { title: 'ANTI-BOT', body: on ? 'Enabled' : 'Disabled', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
    }

    const enable = sub === 'on';
    const wl     = getWhitelist(groupData);
    db.setGroup(m.from, { antibot: { on: enable, whitelist: wl } });

    const resultText = enable
      ? '🤖 *Anti-bot protection ENABLED — STRONG mode*\n\nLayer 1: verified bot names are turned away on join.\nLayer 2: bot-named members are removed instantly.\nLayer 3: bot behavior (menu walls, command streaks) is scored and struck — 3 strikes = removal.\n\nAdmins, the owner and whitelisted members are always exempt.'
      : '🤖 *Anti-bot protection DISABLED*\n\nBot accounts may join and stay.';

    const thumbnailUrl = await getBrandThumbnail();
    return await actionCardWithAd(sock, m.from, {
      text:   resultText,
      footer: 'Setting saved for this group',
    }, [
      { label: enable ? 'Disable Again' : 'Re-enable', cmd: `${p}antibot ${enable ? 'off' : 'on'}` },
      { label: 'Scan Members',                            cmd: `${p}antibot scan` },
      { label: 'Group Info',                            cmd: `${p}groupinfo` },
    ], { title: 'ANTI-BOT', body: 'Setting saved', thumbnailUrl, originalImageUrl: thumbnailUrl }, { quoted: m });
  },
};
