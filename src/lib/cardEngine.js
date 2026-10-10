/**
 * @file src/lib/cardEngine.js
 * NEXORA Card Engine — canvas-rendered shareable cards (rank, level-up, music).
 *
 * One shared renderer for every card in the bot so they all share the same
 * brand language: dark glass background, purple→cyan accent gradient,
 * DejaVu Sans typography, NEXORA footer. All builders return a PNG Buffer.
 *
 * Uses @napi-rs/canvas (prebuilt binaries, no compile step) + sharp for
 * remote-image decoding. Network fetches are best-effort with a timeout;
 * every card renders fully even when the profile pic is missing (falls
 * back to a gradient monogram).
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { rankInfo } from '../economy/leveling.js';

const BRAND = {
  bg: '#0b0f1a',
  card: '#111827',
  glass: 'rgba(255,255,255,0.06)',
  stroke: 'rgba(255,255,255,0.12)',
  text: '#f8fafc',
  subtext: '#94a3b8',
  accentA: '#a855f7',
  accentB: '#06b6d4',
  gold: '#fbbf24',
};

const FETCH_TIMEOUT_MS = 8000;

/** Rank tier → accent color for the avatar ring and progress bar. */
const TIER_COLORS = {
  Legend: '#fbbf24',
  Diamond: '#38bdf8',
  Platinum: '#a5b4fc',
  Gold: '#f59e0b',
  Silver: '#cbd5e1',
  Bronze: '#d97706',
};

function tierColor(level) {
  const r = rankInfo(level);
  return TIER_COLORS[r.label] ?? BRAND.accentA;
}

/** Safe remote image load with a timeout; null on any failure. */
async function loadRemote(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const png = await sharp(buf).png().toBuffer();
    return await loadImage(png);
  } catch {
    return null;
  }
}

/** Circular monogram fallback: gradient disc + first letter. */
async function monogramAvatar(name, size, ringColor) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, BRAND.accentA);
  g.addColorStop(1, BRAND.accentB);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.45)}px "DejaVu Sans"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  ctx.fillText(letter, size / 2, size / 2 + size * 0.03);
  return { canvas: c, ringColor };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Circular avatar with a colored ring. Returns the drawn canvas + ring color
 * so the card body can reuse the tier color.
 */
async function avatarWithRing(avatarUrl, name, size, ringColor) {
  const img = await loadRemote(avatarUrl);
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const s = Math.max(size / img.width, size / img.height);
    ctx.drawImage(img, (size - img.width * s) / 2, (size - img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  } else {
    const mono = await monogramAvatar(name, size, ringColor);
    ctx.drawImage(mono.canvas, 0, 0);
  }
  return { canvas: c, ringColor };
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, w, h);
  // Ambient accent glows
  const glow1 = ctx.createRadialGradient(w * 0.85, 0, 0, w * 0.85, 0, h * 1.2);
  glow1.addColorStop(0, 'rgba(168,85,247,0.20)');
  glow1.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);
  const glow2 = ctx.createRadialGradient(0, h, 0, 0, h, h * 1.1);
  glow2.addColorStop(0, 'rgba(6,182,212,0.14)');
  glow2.addColorStop(1, 'rgba(6,182,212,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);
}

function drawFooter(ctx, w, h, note) {
  ctx.font = `600 ${Math.round(h * 0.026)}px "DejaVu Sans"`;
  ctx.fillStyle = BRAND.subtext;
  ctx.textAlign = 'left';
  ctx.fillText('⚡ NEXORA-MD', w * 0.05, h * 0.94);
  if (note) {
    ctx.textAlign = 'right';
    ctx.fillText(note, w * 0.95, h * 0.94);
  }
}

/**
 * Rank card: avatar, name, tier badge, level, XP progress bar, stat chips.
 * data = { name, avatarUrl, level, xp, xpIntoLevel, levelSpan, rankBadge, coins, streak, position }
 */
export async function renderRankCard(data) {
  const W = 900, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, W, H);

  // Glass card body
  const P = 26;
  ctx.fillStyle = BRAND.card;
  roundRect(ctx, P, P, W - P * 2, H - P * 2, 28);
  ctx.fill();
  ctx.strokeStyle = BRAND.stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, P, P, W - P * 2, H - P * 2, 28);
  ctx.stroke();

  const tier = tierColor(data.level);

  // Avatar with tier ring
  const A = 170;
  const ax = 76, ay = (H - A) / 2 - 10;
  const ringW = 8;
  ctx.beginPath();
  ctx.arc(ax + A / 2, ay + A / 2, A / 2 + ringW, 0, Math.PI * 2);
  ctx.strokeStyle = tier;
  ctx.lineWidth = ringW;
  ctx.stroke();
  const av = await avatarWithRing(data.avatarUrl, data.name, A, tier);
  ctx.drawImage(av.canvas, ax, ay, A, A);

  // Right column
  const rx = ax + A + 46;
  let y = 96;

  // Name
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.text;
  const name = (data.name || 'User').slice(0, 22);
  ctx.font = `bold 42px "DejaVu Sans"`;
  ctx.fillText(name, rx, y);

  // Tier badge pill
  const badge = data.rankBadge || '';
  ctx.font = `600 24px "DejaVu Sans"`;
  const bw = ctx.measureText(badge).width + 44;
  const by = y + 18;
  roundRect(ctx, rx, by, bw, 46, 23);
  ctx.fillStyle = BRAND.glass;
  ctx.fill();
  ctx.strokeStyle = tier;
  ctx.lineWidth = 1.5;
  roundRect(ctx, rx, by, bw, 46, 23);
  ctx.stroke();
  ctx.fillStyle = tier;
  ctx.fillText(badge, rx + 22, by + 31);

  // Level chip (right side)
  ctx.textAlign = 'right';
  ctx.fillStyle = BRAND.text;
  ctx.font = `bold 30px "DejaVu Sans"`;
  ctx.fillText(`LVL ${data.level}`, W - P - 42, y + 6);
  if (data.position) {
    ctx.font = `600 20px "DejaVu Sans"`;
    ctx.fillStyle = BRAND.subtext;
    ctx.fillText(`#${data.position} in this chat`, W - P - 42, y + 34);
  }

  // XP progress bar
  y = 236;
  const barX = rx, barW = W - P - 42 - barX, barH = 22;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, barX, y, barW, barH, barH / 2);
  ctx.fill();
  const fillW = Math.max(barH, Math.min(1, data.xpIntoLevel / Math.max(1, data.levelSpan)) * barW);
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, tier);
  grad.addColorStop(1, BRAND.accentB);
  ctx.fillStyle = grad;
  roundRect(ctx, barX, y, fillW, barH, barH / 2);
  ctx.fill();
  ctx.font = `600 20px "DejaVu Sans"`;
  ctx.fillStyle = BRAND.subtext;
  ctx.textAlign = 'left';
  ctx.fillText(`${data.xpIntoLevel.toLocaleString()} / ${(data.xpIntoLevel + data.xpToNextLevel).toLocaleString()} XP`, barX, y + 46);
  ctx.textAlign = 'right';
  ctx.fillText(`${data.xpToNextLevel.toLocaleString()} to next`, barX + barW, y + 46);

  // Stat chips: total xp, coins, streak
  y = 316;
  const chips = [
    `✨ ${Math.round(data.xp).toLocaleString()} XP`,
    `🪙 ${(data.coins ?? 0).toLocaleString()}`,
    `🔥 ${data.streak ?? 0}-day streak`,
  ].filter(Boolean);
  let cx = barX;
  for (const chip of chips) {
    ctx.font = `600 21px "DejaVu Sans"`;
    const cw = ctx.measureText(chip).width + 36;
    roundRect(ctx, cx, y, cw, 42, 21);
    ctx.fillStyle = BRAND.glass;
    ctx.fill();
    ctx.strokeStyle = BRAND.stroke;
    roundRect(ctx, cx, y, cw, 42, 21);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = BRAND.text;
    ctx.textAlign = 'left';
    ctx.fillText(chip, cx + 18, y + 28);
    cx += cw + 14;
  }

  drawFooter(ctx, W, H, `rank card • ${new Date().toISOString().slice(0, 10)}`);
  return canvas.toBuffer('image/png');
}

/**
 * Music card: Spotify-style now-playing card from a cover image.
 * data = { title, artist, coverUrl | coverBuffer, requesterName }
 */
export async function renderMusicCard(data) {
  const W = 1000, H = 320;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, W, H);
  ctx.fillStyle = BRAND.card;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.fill();
  ctx.strokeStyle = BRAND.stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();

  // Cover art with shadow
  const S = 210, sx = 62, sy = (H - S) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24;
  let cover = null;
  try {
    cover = data.coverBuffer
      ? await loadImage(await sharp(data.coverBuffer).png().toBuffer())
      : await loadRemote(data.coverUrl);
  } catch (_) { cover = null; }
  if (cover) {
    ctx.drawImage(cover, sx, sy, S, S);
  } else {
    const g = ctx.createLinearGradient(sx, sy, sx + S, sy + S);
    g.addColorStop(0, BRAND.accentA);
    g.addColorStop(1, BRAND.accentB);
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, S, S);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 90px "DejaVu Sans"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎵', sx + S / 2, sy + S / 2);
  }
  ctx.restore();

  const rx = sx + S + 48;
  let y = 92;
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.text;
  ctx.font = `bold 44px "DejaVu Sans"`;
  ctx.fillText((data.title || 'Unknown Track').slice(0, 26), rx, y);
  y += 44;
  ctx.fillStyle = BRAND.subtext;
  ctx.font = `600 28px "DejaVu Sans"`;
  ctx.fillText((data.artist || 'Unknown Artist').slice(0, 34), rx, y);

  // Now playing bar
  y = 216;
  ctx.fillStyle = BRAND.accentB;
  ctx.beginPath();
  ctx.arc(rx + 6, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, rx + 24, y - 5, W - rx - 90, 10, 5);
  ctx.fill();
  const pg = ctx.createLinearGradient(rx + 24, 0, rx + 24 + (W - rx - 90) * 0.72, 0);
  pg.addColorStop(0, BRAND.accentA);
  pg.addColorStop(1, BRAND.accentB);
  ctx.fillStyle = pg;
  roundRect(ctx, rx + 24, y - 5, (W - rx - 90) * 0.72, 10, 5);
  ctx.fill();

  drawFooter(ctx, W, H, data.requesterName ? `requested by ${data.requesterName.slice(0, 18)}` : 'now playing');
  return canvas.toBuffer('image/png');
}

/**
 * Level-up card: a celebration splash variant of the rank card.
 * data = { name, avatarUrl, level, rankBadge, avatarUrl }
 */
export async function renderLevelUpCard(data) {
  const W = 900, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, W, H);
  ctx.fillStyle = BRAND.card;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.fill();
  ctx.strokeStyle = BRAND.stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();

  const tier = tierColor(data.level);

  // Avatar
  const A = 160, ax = 70, ay = (H - A) / 2;
  ctx.beginPath();
  ctx.arc(ax + A / 2, ay + A / 2, A / 2 + 8, 0, Math.PI * 2);
  ctx.strokeStyle = tier;
  ctx.lineWidth = 8;
  ctx.stroke();
  const av = await avatarWithRing(data.avatarUrl, data.name, A, tier);
  ctx.drawImage(av.canvas, ax, ay, A, A);

  const rx = ax + A + 48;
  const cy = H / 2;
  ctx.textAlign = 'left';
  // LEVEL UP!
  const lg = ctx.createLinearGradient(rx, 0, rx + 420, 0);
  lg.addColorStop(0, BRAND.accentA);
  lg.addColorStop(1, BRAND.accentB);
  ctx.fillStyle = lg;
  ctx.font = `bold 58px "DejaVu Sans"`;
  ctx.fillText('⚡ LEVEL UP!', rx, cy - 44);
  ctx.fillStyle = BRAND.text;
  ctx.font = `bold 34px "DejaVu Sans"`;
  ctx.fillText(`${(data.name || 'You').slice(0, 20)} reached level ${data.level}`, rx, cy + 8);
  ctx.fillStyle = tier;
  ctx.font = `600 26px "DejaVu Sans"`;
  ctx.fillText(data.rankBadge || '', rx, cy + 54);

  drawFooter(ctx, W, H, `+${data.coinBonus ?? 0} coins earned`);
  return canvas.toBuffer('image/png');
}

export default { renderRankCard, renderLevelUpCard, renderMusicCard };
