/**
 * summary.js — AI-powered text/URL summarizer.
 *
 * Summarizes a quoted message, pasted text, or article content from a URL.
 * Uses Gemini's context-aware summarization for high-quality output.
 *
 * Usage:
 *   .summary                    — summarize the replied-to message
 *   .summary <text>             — summarize pasted text
 *   .summary <url>              — summarize an article from a URL
 *   .summary short <text/url>   — 1-2 sentence summary
 *   .summary bullets <text/url>  — bullet-point summary
 */
import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';
import { DownloadProgress } from '../../lib/progress.js';
import { isUrl } from '../../lib/downloader.js';

const STYLES = {
  short:   'Provide a 1-2 sentence summary.',
  bullets: 'Provide a bullet-point summary with the key points (max 5 bullets).',
  default: 'Provide a concise summary in 3-5 sentences, capturing the main points.',
};

async function fetchUrlText(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEXORA-Bot/1.0)' },
    });
    const html = await res.text();
    // Strip HTML tags, scripts, styles
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Truncate to ~4000 chars to fit in Gemini context
    return text.slice(0, 4000);
  } catch (err) {
    throw new Error(`Could not fetch URL: ${err.message}`);
  }
}

export default {
  name: 'summary',
  aliases: ['summarize', 'tldr'],
  category: 'ai',
  description: 'Summarize text, a quoted message, or a URL. Usage: .summary [short|bullets] [text or URL]',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }

    // Parse style and content
    let style = 'default';
    let content = '';

    const firstArg = args[0]?.toLowerCase();
    if (STYLES[firstArg]) {
      style = firstArg;
      content = args.slice(1).join(' ').trim();
    } else {
      content = args.join(' ').trim();
    }

    // If no content, use quoted message
    if (!content && m.quoted) {
      content = m.quoted.text;
    }

    if (!content) {
      return await m.reply.info(
        `Usage: \`${p}summary [style] <text or URL>\`\n\nStyles:\n• (none) — 3-5 sentence summary\n• \`short\` — 1-2 sentences\n• \`bullets\` — bullet points\n\nExamples:\n• \`${p}summary\` (reply to a message)\n• \`${p}summary short https://example.com/article\`\n• \`${p}summary bullets <pasted text>\``,
        'NEXORA • Summary'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Summarizing');
      try {
        let textToSummarize = content;

        // If it's a URL, fetch the content
        if (isUrl(content)) {
          await progress.start('Fetching article');
          textToSummarize = await fetchUrlText(content);
          if (!textToSummarize || textToSummarize.length < 50) {
            throw new Error('Could not extract meaningful text from that URL.');
          }
          await progress.start('Summarizing article');
        }

        const prompt = `Summarize the following text. ${STYLES[style]}\n\nText:\n${textToSummarize}`;
        const reply = await aiTextGenerator.generateText(prompt);
        await progress.done();

        const styleLabel = style === 'default' ? 'Summary' : style === 'short' ? 'TL;DR' : 'Key Points';

        // ── Rich tier: native markdown rendering of the summary ──
        const richSent = await sendAIRichReply(sock, m.from, m, {
          markdown: `## 📝 ${styleLabel.toUpperCase()}\n\n${reply}`,
          tips:    ['NEXORA • Summarizer'],
          suggest: [`${p}summary`, '.menu'],
          footer:  'NEXORA • Summarizer',
        });
        if (richSent) return;

        await mixedCard(sock, m.from, {
          text: `📝 *${styleLabel.toUpperCase()}*\n\n${reply}`,
          footer: 'NEXORA • Summarizer',
        }, [
          { kind: 'copy',   label: '📋 Copy Summary',    value: reply },
          { kind: 'action', label: '🔄 Summarize Again', cmd: `${p}summary` },
          { kind: 'action', label: '🌐 Translate',       cmd: `${p}translate ${reply.slice(0, 80)}` },
        ], { quoted: m });
      } catch (err) {
        await progress.fail(`Summary failed: ${err.message}`);
      }
    });
  }
};
