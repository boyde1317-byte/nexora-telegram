/**
 * logoMaker.js — Shared engine for the logomaker plugin category.
 *
 * One curated prompt per style, all rendered through aiAssetGenerator
 * (Gemini, 1:1) so every command in the category shares validation,
 * loading feedback and error handling. Style registry lives here so
 * `.logo styles` and the thin themed commands never drift apart.
 */
import { aiAssetGenerator } from '../assets/aiAssetGenerator.js';
import { assetValidator } from '../assets/assetValidator.js';

export const STYLES = {
  minimalist: {
    label: 'Minimalist',
    emoji: '⬜',
    hint: 'clean vector wordmark, lots of whitespace',
    prompt: (t) => `A minimalist professional logo for the brand "${t}". Flat vector design, single bold geometric mark paired with a clean modern sans-serif wordmark reading "${t}", generous negative space, one accent color on white background, crisp edges, no photo textures, no watermark. Centered composition.`,
  },
  neon: {
    label: 'Neon',
    emoji: '💡',
    hint: 'glowing neon sign on dark brick',
    prompt: (t) => `A glowing neon sign logo with the text "${t}". The words "${t}" written in bright glowing neon tube lettering, electric blue and pink glow, dark brick wall background, soft light bloom, cinematic night photo look, the text is perfectly legible and centered.`,
  },
  gaming: {
    label: 'Gaming',
    emoji: '🎮',
    hint: 'esports emblem, bold aggressive type',
    prompt: (t) => `An esports gaming team logo emblem for "${t}". Bold aggressive stylized lettering of "${t}", fierce mascot accents, sharp angular shield or badge shape, high-contrast color scheme (dark base with electric accent), modern competitive gaming aesthetic, clean vector style, centered on a dark background.`,
  },
  fire: {
    label: 'Fire',
    emoji: '🔥',
    hint: 'blazing flame text',
    prompt: (t) => `A dramatic fire logo with the text "${t}". The words "${t}" in bold thick lettering engulfed in realistic orange and red flames with glowing embers and sparks, dark smoky background, the text remains perfectly legible and centered.`,
  },
  glass: {
    label: 'Glass',
    emoji: '🔷',
    hint: 'frosted glassmorphism badge',
    prompt: (t) => `A modern glassmorphism tech logo for "${t}". The wordmark "${t}" inside a frosted translucent glass badge, soft gradient purple-blue background, subtle light refractions and glossy edges, premium futuristic SaaS aesthetic, the text is crisp and centered.`,
  },
  metallic: {
    label: '3D Metallic',
    emoji: '🪙',
    hint: 'chrome 3D letters, studio light',
    prompt: (t) => `A premium 3D metallic logo with the text "${t}". Extruded chrome and gold 3D letters spelling "${t}", reflective brushed metal surface, studio lighting with soft reflections, dark elegant background, luxury brand feel, the text is perfectly legible and centered.`,
  },
  mascot: {
    label: 'Wolf Mascot',
    emoji: '🐺',
    hint: 'fierce mascot badge with the name',
    prompt: (t) => `A fierce wolf mascot logo badge for the brand "${t}". Detailed illustrated wolf head facing forward, sharp lines, esports badge composition, the name "${t}" in bold matching lettering under the mascot, dark background with a strong accent color, vector illustration style, centered.`,
  },
  retro: {
    label: 'Retro',
    emoji: '📻',
    hint: 'vintage 70s badge & typography',
    prompt: (t) => `A retro vintage logo badge for "${t}". 1970s style rounded typography spelling "${t}", warm earthy color palette (mustard, rust, cream), sunburst or arc badge elements, subtle aged paper texture, the text is perfectly legible and centered.`,
  },
};

const MAX_LEN = 30;

/** Validate + normalize user text for a logo. Returns { ok, text | error }. */
export function validateLogoText(raw) {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'Please provide a name or text, e.g. `.logo NEXORA`.' };
  if (text.length > MAX_LEN) return { ok: false, error: `Keep it under ${MAX_LEN} characters — logos need short text.` };
  if (/[<>{}\\|`]/.test(text)) return { ok: false, error: 'Only letters, numbers and spaces please.' };
  return { ok: true, text };
}

/**
 * Render + send a styled logo. Shared by every command in the category.
 * Returns true when a logo was delivered.
 */
export async function sendLogo({ m, sock, styleId, text, prefix }) {
  const style = STYLES[styleId];
  const check = validateLogoText(text);
  if (!check.ok) { await m.reply.warn(check.error); return false; }
  if (!aiAssetGenerator.isEnabled()) {
    await m.reply.error('AI image generation is offline. Set GEMINI_API_KEY and GENERATE_ASSETS=true.');
    return false;
  }

  await m.reply.loading(`Rendering your ${style.label.toLowerCase()} logo...`);
  try {
    const buffer = await aiAssetGenerator.generateImage(style.prompt(check.text), '1:1');
    const optimized = assetValidator.optimize(buffer);
    await m.react('✨');
    await sock.sendMessage(m.from, {
      image: optimized,
      caption: `${style.emoji} *${style.label} Logo* — "${check.text}"\n_Style: ${styleId} • try \`${(prefix || '.') + 'logo'} styles\` for more_`,
    }, { quoted: m });
    return true;
  } catch (err) {
    await m.reply.error(`Logo generation failed: ${err.message}`);
    return false;
  }
}
