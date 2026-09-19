/**
 * define.js — dictionary cards WITH AUDIO PRONUNCIATION.
 *
 * Data: Free Dictionary API (dictionaryapi.dev, keyless) — meanings,
 * examples, synonyms, phonetics, and recorded native pronunciations.
 *
 * Flow:
 *   .define <word>  → meanings TABLE + example/synonyms card, and if
 *                     the API has a recording, the pronunciation
 *                     arrives as an audio message right after —
 *                     tap the card to replay it
 *   .define say <w> → just the pronunciation audio
 *   unknown words (slang…) → AI fallback writes the same shape,
 *                     footer notes it is AI-defined (no audio)
 */
import { richTableCard, mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';

const MAX_ROWS = 6;

async function fetchEntriesOnce(word) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dictionary returned HTTP ${res.status}.`);
  return res.json();
}

/** dictionaryapi.dev is intermittently flaky — retry once before giving up. */
async function fetchEntries(word) {
  try {
    return await fetchEntriesOnce(word);
  } catch (err) {
    if (err.message.includes('HTTP 404')) return null; // definitive: not a word
    await new Promise(r => setTimeout(r, 1500));
    return fetchEntriesOnce(word); // last try — caller handles the failure
  }
}

/** Flatten entries → first N {type, definition} rows + one example + synonyms. */
function distill(entries) {
  const rows = [];
  let example = null;
  const synonyms = new Set();
  for (const entry of entries) {
    for (const meaning of entry.meanings || []) {
      for (const def of meaning.definitions || []) {
        if (rows.length < MAX_ROWS && def.definition) {
          rows.push({ type: meaning.partOfSpeech, definition: def.definition });
        }
        if (!example && def.example) example = def.example;
        if (rows.length >= MAX_ROWS) break;
      }
      (meaning.synonyms || []).slice(0, 5).forEach(s => synonyms.add(s));
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length >= MAX_ROWS) break;
  }
  return { rows, example, synonyms: [...synonyms].slice(0, 8) };
}

function findAudio(entries) {
  for (const entry of entries) {
    for (const ph of entry.phonetics || []) {
      if (ph.audio && /^https/.test(ph.audio)) return { url: ph.audio, text: entry.phonetic || ph.text };
    }
  }
  return null;
}

async function sendPronunciation({ m, sock, url }) {
  try {
    await sock.sendMessage(m.from, { audio: { url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
    return true;
  } catch (err) {
    console.warn('[define] pronunciation send failed:', err.message);
    return false;
  }
}

export default {
  name: 'define',
  aliases: ['definition', 'dict', 'dictionary', 'meaning'],
  category: 'general',
  description: 'Dictionary card with meanings table + audio pronunciation. Usage: .define <word>',
  cooldown: 6000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();

    if (!args.length) {
      return await m.reply.info(
        `Usage: \`${p}define <word>\`\n\nExamples:\n• \`${p}define serendipity\` — meanings table + example, and the pronunciation plays if a recording exists\n• \`${p}define say quixotic\` — just the audio\n\nUnknown words (slang, brand-new terms) fall back to AI definitions.`,
        'NEXORA • Dictionary'
      );
    }

    await withReactionStatus(m, async () => {
      // ── .define say <word> ─────────────────────────────────────────
      if (sub === 'say' && args[1]) {
        const word = args[1].replace(/[^\p{L}\p{N}'-]/gu, '');
        let entries = null;
        try { entries = await fetchEntries(word); } catch { entries = null; }
        const audio = entries ? findAudio(entries) : null;
        if (!audio) {
          return await m.reply.error(`No audio recording for "${word}" in the dictionary — try \`${p}define ${word}\` for the meanings.`);
        }
        const ok = await sendPronunciation({ m, sock, url: audio.url });
        if (!ok) return await m.reply.error('Could not send the pronunciation audio.');
        return;
      }

      // ── .define <word> ─────────────────────────────────────────────
      const word = args.join(' ').replace(/[^\p{L}\p{N}'\s-]/gu, '').trim();
      if (!word) return await m.reply.error('Give me a word to define.');

      let entries = null;
      let unreachable = false;
      try {
        entries = await fetchEntries(word);
      } catch {
        unreachable = true; // dictionaryapi.dev down — AI defines it instead
      }

      if (!entries?.length) {
        // AI fallback — the dictionary is down, or doesn't know slang/new terms
        if (!hasApiKey()) {
          return await m.reply.error(
            unreachable
              ? 'The dictionary service is unreachable right now — and no AI fallback is configured (GROQ_API_KEY).'
              : `"${word}" is not in the dictionary — and no AI fallback is configured (GROQ_API_KEY).`
          );
        }
        try {
          const ai = getAiClient();
          const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents:
              `Define the word or slang term "${word}". Reply with ONLY a JSON object: ` +
              `{"phonetic": "…", "meanings": [{"type": "part of speech", "definition": "…", "example": "…"}], "synonyms": ["…"]}. ` +
              `2-4 meanings. If it is not a real word or term, reply {"error": "not a word"}.`,
          });
          const raw = (res?.candidates?.[0]?.content?.parts || []).map(x => x.text).filter(Boolean).join('').trim();
          const json = JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]);
          if (json.error || !json.meanings?.length) {
            return await m.reply.error(`Even the AI doesn't know "${word}" — is that a typo?`);
          }
          await sock.sendMessage(m.from, {
            text: `📕 *${word.toUpperCase()}*\n_${json.phonetic || 'AI definition'}_`,
          }, { quoted: m });
          try {
            await richTableCard(sock, m.from, {
              title: `📖 MEANINGS — ${word.toUpperCase()}`,
              headers: ['Type', 'Meaning'],
              rows: json.meanings.map(x => [x.type || '—', String(x.definition || '').slice(0, 120)]),
              footer: unreachable ? 'NEXORA • AI Dictionary • dictionary service unreachable' : 'NEXORA • AI Dictionary • not in the standard dictionary',
            }, { quoted: m });
          } catch {
            await sock.sendMessage(m.from, {
              text: json.meanings.map(x => `*${x.type}*\n${x.definition}${x.example ? `\n_“${x.example}”_` : ''}`).join('\n\n'),
            }, { quoted: m });
          }
          const ex = json.meanings.find(x => x.example)?.example;
          if (ex || json.synonyms?.length) {
            await mixedCard(sock, m.from, {
              text: `${ex ? `💬 _“${ex}”_\n\n` : ''}${json.synonyms?.length ? `🔗 *Synonyms:* ${json.synonyms.join(', ')}` : ''}`.trim(),
              footer: 'NEXORA • AI Dictionary',
            }, [], { quoted: m });
          }
          return;
        } catch (err) {
          return await m.reply.error(`Definition failed: ${err.message}`);
        }
      }

      const { rows, example, synonyms } = distill(entries);
      const audio = findAudio(entries);
      const phonetic = entries[0].phonetic || (entries[0].phonetics || []).find(x => x.text)?.text || '';

      await sock.sendMessage(m.from, {
        text: `📕 *${entries[0].word.toUpperCase()}*\n_${phonetic}${audio ? ' • tap the 🔊 button to hear it' : ''}_`,
      }, { quoted: m });

      if (rows.length) {
        try {
          await richTableCard(sock, m.from, {
            title: `📖 MEANINGS — ${entries[0].word.toUpperCase()}`,
            headers: ['Type', 'Meaning'],
            rows: rows.map(r => [r.type, r.definition.length > 120 ? r.definition.slice(0, 117) + '…' : r.definition]),
            footer: `NEXORA • Dictionary • ${rows.length} meanings`,
          }, { quoted: m });
        } catch {
          await sock.sendMessage(m.from, {
            text: rows.map(r => `*${r.type}*\n${r.definition}`).join('\n\n'),
          }, { quoted: m });
        }
      }

      const buttons = [];
      if (audio) buttons.push({ kind: 'action', label: '🔊 Pronounce', cmd: `${p}define say ${entries[0].word}` });
      buttons.push({ kind: 'copy', label: '📋 Copy Meanings', value: rows.map(r => `${r.type}: ${r.definition}`).join('\n') });
      if (entries[0].sourceUrls?.[0]) {
        buttons.push({ kind: 'url', label: '📖 Full Entry', url: entries[0].sourceUrls[0], useWebview: true });
      }

      await mixedCard(sock, m.from, {
        text: `${example ? `💬 _“${example}”_\n\n` : ''}${synonyms.length ? `🔗 *Synonyms:* ${synonyms.join(', ')}\n\n` : ''}${audio ? '🔊 Pronunciation sent above — tap the button to replay.' : '_(No audio recording for this word.)_'}`.trim(),
        footer: 'NEXORA • Dictionary',
      }, buttons, { quoted: m });

      // The pronunciation lands right after the card
      if (audio) await sendPronunciation({ m, sock, url: audio.url });
    });
  },
};
