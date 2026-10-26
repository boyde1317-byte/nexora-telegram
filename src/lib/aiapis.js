/**
 * aiapis.js — keyless AI chat APIs fished out of OURIN DELUXE V3.4.1
 * (simi + muslimai + feelbetter), consolidated into one module so every
 * command shares the same fetch/timeout/error plumbing.
 *
 * All endpoints live-verified 2026-10-23:
 *  - api.nexray.eu.cc/ai/simisimi     → SimiSimi-style chat, keyless
 *  - www.muslimai.io/api/chat         → Islamic AI with Quran/Hadith sources
 *  - feelbetterbot.com/               → empathetic "healing" chat (streamed)
 */
const MUSLIMAI_API = 'https://www.muslimai.io/api/chat';

/** SimiSimi chat — returns a short sassy reply. */
/** Islamic AI chat — returns { reply, sources[] }. Server is slow and
 * streams NDJSON ({"type":"sources",...} then {"type":"text","data":"W"...}
 * tokens); one retry on failure. */
export async function muslimAi(query) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(MUSLIMAI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`muslimai HTTP ${res.status}`);
      const raw = await res.text();
      let reply = '';
      const sources = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk;
        try { chunk = JSON.parse(trimmed); } catch { continue; }
        if (chunk.type === 'sources' && Array.isArray(chunk.data)) {
          for (const s of chunk.data.slice(0, 5)) {
            if (s?.surah_title) sources.push(s.surah_title);
          }
        } else if (chunk.type === 'text' && typeof chunk.data === 'string') {
          reply += chunk.data;
        } else if (typeof chunk.message === 'string' && !reply) {
          reply = chunk.message;
        }
      }
      if (reply.trim()) return { reply: reply.trim(), sources };
      if (sources.length) return { reply: sources.join('\n'), sources };
      throw new Error('muslimai returned no answer');
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

/** Feel-better bot — streamed empathetic chat. memoryId keeps per-user context. */
export async function feelBetter(messages, memoryId) {
  const res = await fetch('https://feelbetterbot.com/', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
      'Content-Type': 'application/json',
      'Origin': 'https://feelbetterbot.com',
      'Referer': 'https://feelbetterbot.com/',
      'Cookie': `feelbet-memory=${memoryId}`,
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`feelbetter HTTP ${res.status}`);
  // Plain-text stream — read it fully
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  if (!out.trim()) throw new Error('feelbetter returned nothing');
  return out.trim();
}
