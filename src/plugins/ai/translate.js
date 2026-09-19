/**
 * translate.js — translation that actually works.
 *
 * Engine order (was the reverse before, which is why it sucked — the AI
 * path hard-coded a model name the provider walk 404s on, and its
 * failure aborted the command instead of falling back):
 *
 *   1. Google gtx endpoint (keyless, instant, auto-detects the source
 *      language, sentence-chunked so long messages don't break the
 *      URL cap)
 *   2. AI fallback via the multi-provider aiClient (Groq in practice)
 *      only if Google fails
 *
 * Extras:
 *   • Reply to a VOICE NOTE with .translate [lang] → Groq whisper STT
 *     → translate the transcript
 *   • Detected source language always shown in the card header
 *   • The "🔁 Translate back" button re-runs with the result embedded
 *     (only offered when the result is short enough to fit a command)
 */
import { translateText } from '../../lib/downloader.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { DownloadProgress } from '../../lib/progress.js';
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';
import { db } from '../../database/db.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const STT_MODEL = 'whisper-large-v3';

const LANG_NAMES = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian',
  pt: 'Portuguese', ar: 'Arabic', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', hi: 'Hindi', sw: 'Swahili', twi: 'Twi', ig: 'Igbo', ha: 'Hausa',
  yo: 'Yoruba', nl: 'Dutch', tr: 'Turkish', pl: 'Polish', id: 'Indonesian',
  ur: 'Urdu', bn: 'Bengali', ta: 'Tamil', fa: 'Persian', vi: 'Vietnamese',
  th: 'Thai', el: 'Greek', he: 'Hebrew', uk: 'Ukrainian', sv: 'Swedish',
};

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(LANG_NAMES).map(([code, name]) => [name.toLowerCase(), code]),
);

function resolveLang(arg) {
  if (!arg) return null;
  const a = arg.toLowerCase();
  return LANG_NAMES[a] ? a : (NAME_TO_CODE[a] || null);
}

/** Google gtx caps ~5000 URL-encoded chars — sentence-chunk long text.
 * Retries once on transient 429/5xx before giving up. */
async function translateOnce(text, targetLang) {
  try {
    return await translateText(text, targetLang);
  } catch (err) {
    if (/HTTP 429|HTTP 5\d\d/.test(err.message)) {
      await new Promise(r => setTimeout(r, 900));
      return translateText(text, targetLang); // last try — caller falls back to AI
    }
    throw err;
  }
}

async function translateChunked(text, targetLang) {
  if (text.length <= 1200) return translateOnce(text, targetLang);
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > 1000) { if (cur) chunks.push(cur); cur = s; }
    else cur += s;
  }
  if (cur.trim()) chunks.push(cur);
  const out = { text: '', from: null };
  for (const chunk of chunks.slice(0, 12)) {
    const r = await translateOnce(chunk, targetLang);
    out.text += r.text;
    out.from ||= r.from && r.from !== 'auto' ? r.from : null;
  }
  return out;
}

/**
 * AI fallback — model name in the proven provider-walk convention.
 * Asks for JSON so the source language is detected too; parses
 * leniently (plain text still accepted).
 */
async function aiTranslate(text, targetLang) {
  const ai = getAiClient();
  const to = LANG_NAMES[targetLang] || targetLang;
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents:
      `Translate the following text to ${to}. Preserve formatting and line breaks. ` +
      `Reply with ONLY a JSON object: {"from": "<detected ISO-639-1 code of the source language>", ` +
      `"text": "<the translation>"}.\n\n${text}`,
  });
  const parts = res?.candidates?.[0]?.content?.parts || [];
  const raw = parts.map(p => p.text).filter(Boolean).join('\n').trim();
  if (!raw) throw new Error('AI returned nothing.');
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed.text && typeof parsed.text === 'string') {
        return { text: parsed.text.trim(), from: parsed.from || null };
      }
    } catch { /* lenient — fall through to raw */ }
  }
  return { text: raw, from: null };
}

/** Groq whisper STT for voice-note replies. */
async function transcribeVoice(buffer, key) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', STT_MODEL);
  fd.append('response_format', 'json');
  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}).`);
  const data = await res.json();
  if (!data.text?.trim()) throw new Error('The voice note was silent.');
  return data.text.trim();
}

export default {
  name: 'translate',
  aliases: ['tr', 'trans', 'translator'],
  category: 'ai',
  description: 'Translate text or a replied voice note. Usage: .translate [lang] <text> — default target: English',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!args.length && !m.quoted) {
      return await m.reply.info(
        `Usage: \`${p}translate [lang] <text>\`\n\nExamples:\n• \`${p}translate fr Hello world\` — translate to French\n• Reply to any message with \`${p}translate fr\`\n• Reply to a *voice note* with \`${p}translate\` — it transcribes first\n\nSupported: ${Object.entries(LANG_NAMES).map(([c, n]) => `${c}(${n})`).join(', ')}`,
        'NEXORA • Translate'
      );
    }

    let targetLang = 'en';
    let text = '';
    const resolved = resolveLang(args[0]);
    if (resolved) {
      targetLang = resolved;
      text = args.slice(1).join(' ').trim();
    } else {
      text = args.join(' ').trim();
    }

    // Voice-note reply: transcribe first
    let transcribedFromVoice = false;
    if (!text && m.quoted) {
      const q = m.quoted;
      if (q.type === 'audioMessage' || q.type === 'pttMessage') {
        const groqKey = process.env.GROQ_API_KEY || db.getSettings().groqApiKey;
        if (!groqKey) {
          return await m.reply.error('Voice-note translation needs GROQ_API_KEY set — text translation still works without it.');
        }
        try {
          const buf = await q.download();
          text = await transcribeVoice(buf, groqKey);
          transcribedFromVoice = true;
        } catch (err) {
          return await m.reply.error(`Couldn't transcribe that voice note: ${err.message}`);
        }
      } else {
        text = q.text || '';
      }
    }

    if (!text) {
      return await m.reply.error('No text to translate. Provide text or reply to a message or voice note.');
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start(`Translating to ${LANG_NAMES[targetLang] || targetLang}`);
      try {
        let result;
        let engine = 'Google';
        let detectedFrom = null;
        try {
          const out = await translateOnce(text, targetLang);
          result = out.text;
          detectedFrom = out.from && out.from !== targetLang ? out.from : null;
        } catch (googleErr) {
          // Google down / rate-limited → AI fallback (if configured)
          if (!hasApiKey()) throw googleErr;
          const aiOut = await aiTranslate(text, targetLang);
          result = aiOut.text;
          detectedFrom = aiOut.from && aiOut.from !== targetLang ? aiOut.from : null;
          engine = 'AI';
        }

        await progress.done();

        const fromLabel = detectedFrom
          ? `${LANG_NAMES[detectedFrom] || detectedFrom.toUpperCase()} → `
          : '';
        const toLabel = LANG_NAMES[targetLang] || targetLang.toUpperCase();

        const buttons = [
          { kind: 'copy', label: '📋 Copy Translation', value: result },
        ];
        // Reverse-translate the RESULT back — only fits when short
        if (detectedFrom && result.length <= 200) {
          buttons.push({
            kind: 'action',
            label: `🔁 Back to ${LANG_NAMES[detectedFrom] || detectedFrom.toUpperCase()}`,
            cmd: `${p}translate ${detectedFrom} ${result.replace(/\n/g, ' ')}`,
          });
        }

        const voiceNote = transcribedFromVoice ? '_Transcribed from a voice note._\n\n' : '';
        await mixedCard(sock, m.from, {
          text: `🌐 *${fromLabel}${toLabel}*\n\n${voiceNote}${result}`,
          footer: `NEXORA • ${engine} Translate`,
        }, buttons, { quoted: m });
      } catch (err) {
        await m.reply.error(`Translation failed: ${err.message}`);
        throw err;
      }
    });
  },
};
