/**
 * fakeprofile.js — fake WhatsApp profile screenshot card.
 *
 * Renders the replied photo as a profile avatar on a pixel-accurate
 * WhatsApp profile page template (canvas-drawn, @napi-rs/canvas).
 * Ported from Yorumi-MD's `fakeprofil`, NEXORA-ified:
 *  - template ships in-repo (media/images/profile/fakeprofile-template.jpg)
 *    instead of a third-party image host that can rot
 *  - menu-identity framing on usage errors
 *  - graceful fallbacks when no photo is replied to
 *
 * Usage: reply to (or send with) a photo, then:
 *   .fakeprofile Sammy|+234xxxxxxxxxx|Just vibing ✨
 */
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

// Repo-root relative (bot always launches from the repo root — same
// convention as tempDir in tovn.js / backupService).
const TEMPLATE_PATH = path.join(process.cwd(), 'media/images/profile/fakeprofile-template.jpg');

export const render = async (photoBuffer, username, nomor, bio) => {
  // @napi-rs/canvas loadImage wants a URL or buffer, not a bare path.
  const background = await loadImage(fs.readFileSync(TEMPLATE_PATH));
  const canvas = createCanvas(1125, 2436);
  const ctx = canvas.getContext('2d');

  // Template is 740x1600 — same aspect, stretch to the 1125x2436 canvas.
  ctx.drawImage(background, 0, 0, 1125, 2436);

  // Avatar: circular-clipped at the template's profile photo position.
  const profileImg = await loadImage(photoBuffer);
  const avatarX = 562.5;
  const avatarY = 450;
  const radius = 172;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(profileImg, avatarX - radius, avatarY - radius, radius * 2, radius * 2);
  ctx.restore();

  // Text overlays, centered like a real profile page.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = 'bold 74px Arial, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(username.slice(0, 26), 562.5, 680);

  ctx.font = '500 44px Arial, sans-serif';
  ctx.fillStyle = '#8E8E93';
  ctx.fillText(nomor.slice(0, 24), 562.5, 775);

  ctx.textAlign = 'left';
  ctx.font = '44px Arial, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(bio.slice(0, 38), 95, 1160);

  return canvas.toBuffer('image/jpeg');
};

export default {
  name: 'fakeprofile',
  aliases: ['fakeprofil', 'fprof'],
  category: 'media',
  description: 'Renders a fake WhatsApp profile screenshot. Reply to a photo with: .fakeprofile Name|+number|bio',
  cooldown: 12000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const usage = `Reply to a photo, then:\n\`${p}fakeprofile Name|+234xxxxxxxxxx|Your bio\``;

    const raw = args.join(' ').trim();
    const [username, nomor, bio] = raw.split('|').map((x) => (x || '').trim());
    if (!username || !nomor || !bio) {
      return await m.reply.error(`Wrong format — all three fields are required.\n\n${usage}`);
    }

    const q = m.hasMedia ? m : m.quoted;
    const mime = q ? (q.msg?.mimetype || q.mimetype || '') : '';
    if (!q || !/image/.test(mime)) {
      return await m.reply.error(`No photo found — reply to the photo you want as the profile picture.\n\n${usage}`);
    }

    try {
      const photo = await q.download();
      const buffer = await render(photo, username, nomor, bio);
      await sock.sendMessage(m.from, {
        image: buffer,
        caption: `✦ *Fake profile ready!*\n👤 ${username}\n📱 ${nomor}\n📝 ${bio}`,
      }, { quoted: m });
    } catch (err) {
      console.error('[fakeprofile] render failed:', err.message);
      await m.reply.error(`Could not render the profile card: ${err.message}`);
    }
  },
};
