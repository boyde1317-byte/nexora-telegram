/**
 * groupinfo.js (.ginfo) — group metadata rendered in the .testrich V2 rich
 * style: the group's OWN profile picture inline + a facts table + text,
 * relayed as a base64 unifiedResponse (Meta AI format).
 *
 * Identity hygiene: NEVER prints raw JIDs/LIDs. The old version showed the
 * group JID as "Group ID" and listed admins' LIDs as if they were phone
 * numbers. Now every member reference goes through resolveDisplayIdentity
 * (@username > +number > "hidden account"), and the group JID is dropped
 * in favour of the invite link.
 *
 * Group chats only (permissions.groupOnly).
 */
import { generateWAMessageFromContent, generateInlineImageWithTableV2 } from 'baileys';
import { withReactionStatus, getBrandThumbnail, replyTable } from '../../lib/cosmetics.js';
import { resolveDisplayIdentity } from '../../lib/identity.js';

export default {
  name: 'groupinfo',
  aliases: ['ginfo', 'gcinfo', 'groupdetails'],
  category: 'group',
  description: 'Rich info card for the current group: photo, members, admins, settings.',
  permissions: { groupOnly: true },
  cooldown: 5000,
  execute: async ({ m, sock }) => {
    await withReactionStatus(m, async () => {
      const meta = await sock.groupMetadata(m.from);
      if (!meta?.participants?.length) throw new Error('Could not retrieve group metadata.');

      const total       = meta.participants.length;
      const adminList   = meta.participants.filter(p => p.admin);
      const owner       = meta.participants.find(p => p.admin === 'superadmin');
      const createdAt   = meta.creation
        ? new Date(meta.creation * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;
      const groupAge = meta.creation
        ? (() => {
            const days = Math.floor((Date.now() - meta.creation * 1000) / 86400000);
            if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
            if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''}`;
            return `${Math.floor(days / 365)} year${Math.floor(days / 365) !== 1 ? 's' : ''}`;
          })()
        : null;

      // ── Identity-safe admin labels (no LIDs, no raw JIDs) ───────────────
      const [ownerId, ...topAdmins] = await Promise.all([
        owner ? resolveDisplayIdentity(sock, owner.id) : Promise.resolve(null),
        ...adminList.filter(p => p !== owner).slice(0, 3).map(p => resolveDisplayIdentity(sock, p.id)),
      ]);
      // compact identity labels: @username > +number > unlisted (never a LID)
      const compact = i => (i?.username ? `@${i.username}` : i?.number ? `+${i.number}` : 'unlisted');
      const nice = [ownerId, ...topAdmins].filter(Boolean).map(compact);
      const named    = nice.filter(l => l !== 'unlisted');
      const unlisted = nice.length - named.length;
      const extra    = adminList.length - nice.length;
      const parts    = [named.join(', '), unlisted ? `${unlisted} unlisted` : '', extra ? `+${extra} more` : ''].filter(Boolean);
      const adminCell = !adminList.length
        ? 'None'
        : `${adminList.length}${parts.length ? ` (${parts.join(', ')})` : ''}`;

      const restrict = meta.restrict ? '🔒 Admins only' : '🌐 All members';
      const announce = meta.announce ? '🔒 Admins only' : '🌐 All members';
      const invite   = meta.inviteCode ? `https://chat.whatsapp.com/${meta.inviteCode}` : null;

      // ── Group photo — brand thumbnail fallback for photo-less groups ───
      let groupPhoto = null;
      try { groupPhoto = await sock.profilePictureUrl(m.from, 'image'); } catch { /* no dp */ }
      const photo = groupPhoto || await getBrandThumbnail();

      const desc = (meta.desc || '_No description set._').replace(/\n+/g, ' ').trim();
      const descShort = desc.length > 280 ? desc.slice(0, 277) + '...' : desc;

      const rows = [
        ['Owner',       ownerId ? compact(ownerId) : 'Unlisted'],
        ['Created',     createdAt ? `${createdAt} (${groupAge} old)` : 'Unknown'],
        ['Members',     `${total} (${total - adminList.length} regular, ${adminList.length} admin${adminList.length !== 1 ? 's' : ''})`],
        ['Admins',      adminCell],
        ['Send messages', announce],
        ['Edit info',   restrict],
        ['Ephemeral',   meta.ephemeralDuration ? `${meta.ephemeralDuration / 86400}d` : 'Off'],
        ['Invite',      invite ? `Code: ${meta.inviteCode}` : '🔒 Admins only'],
      ];

      // ── V2 inline image + table + text (testrich style, direct relay) ───
      const generated = generateInlineImageWithTableV2(
        {
          image: {
            imageUrl: { imagePreviewUrl: photo, imageHighResUrl: photo, sourceUrl: invite || '' },
            imageText:  meta.subject,
            alignment:   0,
            tapLinkUrl:  invite || '',
          },
          tableHeaders: ['Info', 'Details'],
          tableRows: rows,
        },
        m,
        {
          primitiveStyle: 'nixcode',
          headerText: `👥 *${meta.subject}*\n\n${descShort}`,
          footer: invite
            ? `Join: ${invite}\nSource: WhatsApp group metadata`
            : 'Source: WhatsApp group metadata',
        },
      );

      try {
        const message = await generateWAMessageFromContent(m.from, generated.message, {
          userJid: sock.user?.id || '0@s.whatsapp.net',
        });
        await sock.relayMessage(m.from, message.message, { messageId: message.key.id });
      } catch (err) {
        console.warn('[ginfo] V2 rich relay failed, table fallback:', err.message);
        await replyTable(m, sock, {
          caption: `📋 GROUP INFO — ${meta.subject}`,
          rows,
          footer: invite ? `🔗 Invite: ${invite}` : undefined,
        });
      }
    });
  }
};
