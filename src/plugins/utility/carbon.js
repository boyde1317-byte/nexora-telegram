/**
 * carbon.js — code screenshots in Carbon style (ported from OURIN DELUXE
 * V3.4.1 tools/carbon.js, rendered through the keyless microlink.io API
 * instead of the @microlink/mql package — same engine, zero dependencies).
 *
 *   .carbon <code>            → rendered Carbon image
 *   .carbon <theme> <code>    → pick a theme: dracula-pro, monokai, nord,
 *                                solarized-dark/light, one-dark, material,
 *                                panda-syntax, night-owl, cobalt2
 *   reply to a message with .carbon to render its text
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const THEMES = [
  'dracula-pro', 'monokai', 'nord', 'solarized-dark', 'solarized-light',
  'one-dark', 'material', 'panda-syntax', 'night-owl', 'cobalt2',
];

function buildCarbonUrl(code, theme = 'dracula-pro') {
  const t = THEMES.includes(theme) ? theme : 'dracula-pro';
  const params = new URLSearchParams({
    bg: 'rgba(226,233,239,1)',
    t,
    wt: 'none',
    l: 'auto',
    ds: 'false',
    dsyoff: '20px',
    dsblur: '68px',
    wc: 'true',
    wa: 'true',
    pv: '56px',
    ph: '56px',
    ln: 'true',
    fl: '1',
    fm: 'Fira Code',
    fs: '14px',
    lh: '152%',
    si: 'false',
    es: '2x',
    wm: 'false',
  });
  params.append('code', code);
  return `https://carbon.now.sh/?${params.toString()}`;
}

/** Screenshot a carbon.now.sh render via the keyless microlink API. */
async function renderCarbon(code, theme) {
  const target = buildCarbonUrl(code, theme);
  const url = `https://api.microlink.io/?url=${encodeURIComponent(target)}` +
    `&screenshot=true&screenshot.type=jpeg&meta=false&embed=screenshot.url`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`microlink returned HTTP ${res.status}.`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1024) throw new Error('microlink returned an empty image.');
  return buffer;
}

export default {
  name: 'carbon',
  aliases: ['carbonify', 'codeimg'],
  category: 'utility',
  description: '🖥️ Turn code into a Carbon-style image. Usage: .carbon [theme] <code>',
  cooldown: 15_000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let code = args.join(' ');
    let theme = 'dracula-pro';

    // Optional leading theme: .carbon nord const x = 1
    if (args.length > 1 && THEMES.includes(args[0]?.toLowerCase())) {
      theme = args[0].toLowerCase();
      code = args.slice(1).join(' ');
    }

    if (!code && m.quoted?.text) code = m.quoted.text;

    if (!code) {
      return await m.reply.info(
        `Turns code into a shareable Carbon image.\n\n` +
        `\`${p}carbon <code>\` — default theme (dracula-pro)\n` +
        `\`${p}carbon <theme> <code>\` — pick a theme\n` +
        `reply to a code message with \`${p}carbon\`\n\n` +
        `Themes: ${THEMES.join(', ')}`,
        'CARBON'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const image = await renderCarbon(code, theme);
        await sock.sendMessage(m.from, {
          image,
          caption: `🖥️ *CARBON* — theme: ${theme}`,
        }, { quoted: m });
      } catch (err) {
        console.error('[carbon]', err.message);
        return await m.reply.error(`Carbon render failed: ${err.message}`);
      }
    });
  },
};
