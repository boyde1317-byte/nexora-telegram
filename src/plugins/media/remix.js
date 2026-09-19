/**
 * @file src/plugins/media/remix.js
 *
 * .remix — reply to a voice note, get it back rewritten in a style of
 * your choosing, AS A VOICE NOTE.
 *
 * Pipeline:
 *   quoted voice note → Groq whisper-large-v3 (STT, one key, free tier)
 *                     → gpt-oss-120b style rewrite (via aiClient's
 *                       proven provider walk)
 *                     → Google Translate TTS (keyless neural voice,
 *                       sentence-chunked + mp3-concatenated)
 *                     → native ptt voice note back into the chat
 *
 * TTS history: Groq decommissioned playai-tts (2026) — every TTS model
 * on their roster is gone, so the synthesis moved to the keyless
 * translate_tts endpoint (sentence chunks ≤200 chars, concatenated —
 * mp3 frames join cleanly).
 *
 * Graceful degradation at every stage: no Groq key → explains how to
 * get one; STT fails → error; TTS fails → the remixed TEXT is still
 * delivered as a reply (the rewrite is the fun part, the voice is the
 * cherry). Styles are kept short so even a long rant stays under the
 * TTS input limits.
 */
import { getAiClient } from '../../assets/aiClient.js';
import { baileysBridge } from '../../core/baileysBridge.js';

const STYLES = {
  shakespeare: 'Rewrite this as if William Shakespeare dictated it to a friend. Early Modern English, dramatic flourish, thee/thou/thy. Keep it roughly the same length.',
  corporate:   'Rewrite this as a soul-crushing corporate email. Buzzwords, "circling back", passive aggression, ending with a fake-positive close. Keep it short.',
  genz:        'Rewrite this in maximal Gen Z internet speak. Lowercase, slang, zero punctuation energy, emoji sparingly but devastatingly. Keep it short.',
  pirate:      'Rewrite this as a pirate captain briefing the crew. Arr, nautical threats, dramatic pauses. Keep it roughly the same length.',
  yoda:        'Rewrite this as Yoda explaining it to a young Jedi. Inverted grammar, wisdom, hmm. Keep it short.',
  gordon:      'Rewrite this as an angry British celebrity chef yelling about it in a kitchen. Insults about the state of the kitchen, but keep it PG. Keep it short.',
};

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const STT_MODEL = 'whisper-large-v3';

async function groqTranscribe(buffer, key) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', STT_MODEL);
  fd.append('response_format', 'json');
  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Transcription failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.text || !data.text.trim()) throw new Error('The voice note was silent — nothing to remix.');
  return data.text.trim();
}

/**
 * Keyless neural TTS via Google Translate: split into sentence chunks
 * (endpoint caps ~200 chars per request), fetch each chunk's mp3 and
 * concatenate — mp3 frames join cleanly into one playable file.
 * Returns null on any failure so the caller falls back to text mode.
 */
async function synthSpeech(text) {
  const clean = text.replace(/[*_`~#>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
  if (!clean) return null;
  // Sentence-ish chunking with a 200-char hard ceiling
  const rough = clean.match(/[^.!?\n]+[.!?]?/g) || [clean];
  const chunks = [];
  for (const r of rough) {
    const t = r.trim();
    if (!t) continue;
    if (t.length <= 200) { chunks.push(t); continue; }
    for (let i = 0; i < t.length; i += 190) chunks.push(t.slice(i, i + 190));
  }
  const parts = [];
  for (const chunk of chunks.slice(0, 20)) {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=' +
      encodeURIComponent(chunk);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) throw new Error(`TTS chunk failed (${res.status})`);
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  const out = Buffer.concat(parts);
  return out.length > 1000 ? out : null;
}

export default {
  name: 'remix',
  aliases: ['style', 'redub'],
  category: 'media',
  description: 'Reply to a voice note to get it back rewritten in a style, as a new voice note. Usage: .remix <style> — styles: shakespeare, corporate, genz, pirate, yoda, gordon',
  cooldown: 30000,
  async execute({ m, sock, args, prefix }) {
    const p = prefix || '.';
    const groqKey = process.env.GROQ_API_KEY;

    // ── Validate shape before doing anything expensive ──────────────────
    const target = m.quoted?.type === 'audioMessage' ? m.quoted : (m.type === 'audioMessage' ? m : null);
    if (!target) {
      return await m.reply.info(
        `🎤 *REMIX A VOICE NOTE*\n\nReply to a voice note with \`${p}remix <style>\`:\n\n` +
        Object.keys(STYLES).map(s => `• \`${s}\``).join('\n') +
        `\n\nExample: reply to a rambling voice note with \`${p}remix corporate\` 😌`,
        'REMIX'
      );
    }
    if (!groqKey) {
      return await m.reply.error(`*Remix needs GROQ_API_KEY set* — grab a free key at console.groq.com and add it to the bot's environment.`);
    }

    const styleName = (args[0] || '').toLowerCase();
    if (!styleName || !STYLES[styleName]) {
      return await m.reply.info(
        `Pick a style: ${Object.keys(STYLES).map(s => `\`${s}\``).join(' · ')}\n\nExample: \`${p}remix ${Object.keys(STYLES)[0]}\` (reply to a voice note).`,
        'REMIX'
      );
    }

    await m.react('🎙️');
    try {
      // 1. Download the voice note
      const buffer = await target.download().catch(() => null);
      if (!buffer || !buffer.length) throw new Error('Could not download that voice note — it may have expired. Ask them to send it again.');

      // 2. Transcribe
      const transcript = await groqTranscribe(buffer, groqKey);

      // 3. Rewrite via the proven aiClient provider walk
      const ai = getAiClient();
      const prompt =
        `${STYLES[styleName]}\n\n---\nTranscript of the voice note (may have transcription noise, infer intent):\n"${transcript.slice(0, 3000)}"\n---\n` +
        `Output ONLY the rewritten speech, no preamble, no quotes, no stage directions.`;
      // Model name in the proven summary.js convention: the aiClient
      // adapter maps/ignores it per provider (its provider walk is what
      // actually picks the working model).
      const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const rewritten = (res.text || '').trim();
      if (!rewritten) throw new Error('The rewrite came back empty — try again.');

      // 4. TTS — fall back to text if the voice fails
      let voiceBuffer = null;
      try {
        voiceBuffer = await synthSpeech(rewritten);
      } catch (ttsErr) {
        console.warn('[remix] TTS failed, delivering text:', ttsErr.message || ttsErr);
      }

      if (voiceBuffer && voiceBuffer.length > 1000) {
        await baileysBridge.sendMedia(sock, m.from, {
          type: 'audio',
          buffer: voiceBuffer,
          mimetype: 'audio/mpeg',
          ptt: true,
        }, { quoted: m });
      } else {
        await m.reply(
          `🎤 *REMIXED — ${styleName.toUpperCase()}*\n\n"${rewritten}"\n\n_{target: ${target.key?.id ? 'voice note' : 'voice note'} · voice synthesis unavailable, text mode_`
        );
      }
    } catch (err) {
      console.error('[remix] error:', err.message || err);
      return await m.reply.error(`Remix failed: ${err.message || err}`);
    }
  },
};
