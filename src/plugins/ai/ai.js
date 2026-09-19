/**
 * ai.js — Nexora AI chat (Google Gemini).
 *
 * Improvements:
 *  - Handles `.ai reset` / `.ai clear` to clear conversation context
 *  - DownloadProgress feedback during Gemini API call
 *  - Follow-up card with context info and action buttons
 */
import { aiTextGenerator, clearConversation, getConversationInfo } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { sendAIRichReply } from '../../lib/aiRichReply.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'ai',
  aliases: ['gpt', 'ask', 'chat'],
  category: 'ai',
  description: 'Chat with Nexora AI. Usage: .ai <message> | .ai reset',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error(
        'AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env to enable this command.'
      );
    }

    const prompt = args.join(' ').trim();

    // ── Handle reset/clear subcommand ──────────────────────────────────
    const sub = args[0]?.toLowerCase();
    if (sub === 'reset' || sub === 'clear') {
      clearConversation(m.sender);
      return await m.reply.success('🧹 Context wiped. Fresh start — ask me anything. ✦');
    }

    if (!prompt) {
      return await m.reply.info(
        `Usage: \`${p}ai <message>\`\n\nExamples:\n• \`${p}ai explain quantum computing simply\`\n• \`${p}ai write a haiku about coffee\`\n• \`${p}ai debug this code\` (reply to a code block)\n\n\`${p}ai reset\` — wipe context and start fresh`,
        'NEXORA • AI Chat'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Thinking');
      try {
        const reply = await aiTextGenerator.generateText(prompt, { senderJid: m.sender });
        await progress.done();

        // ── Single message: AI response + follow-up buttons in one card ──
        try {
          const shortPrompt = prompt.length > 80 ? prompt.slice(0, 77) + '…' : prompt;

          const info = getConversationInfo(m.sender);
          const ctxNote = info.hasContext
            ? `\n💬 Context: ${info.turns} turn${info.turns !== 1 ? 's' : ''} active • I remember our conversation`
            : `\n💡 No context yet — I'll remember what we discuss`;
          const depthBadge = info.turns >= 10 ? '🧠 Deep Thinker' : info.turns >= 5 ? '💭 In Conversation' : '✨ Fresh Start';

          // ── Rich tier: Meta-AI native rendering of markdown/code/tables ──
          // (Moonson msping anatomy; latex disabled per device-audit verdict).
          const richSent = await sendAIRichReply(sock, m.from, m, {
            markdown: reply,
            tips:     [`${ctxNote.slice(2)} • ${depthBadge}`],
            suggest:  [`.ai ${shortPrompt}`, `.brainstorm ${shortPrompt}`, '.ai reset', '.menu'],
            footer:   'NEXORA • Gemini ✦',
          });
          if (richSent) return;

          // ── Fallback: plain interactive card ──
          await mixedCard(sock, m.from, {
            text:   `${reply}\n\n---\n🤖 *What next?*${ctxNote}\n📊 ${depthBadge}`,
            footer: 'NEXORA • Gemini ✦',
          }, [
            { kind: 'action', label: '🔁 Ask Again',      cmd: `${p}ai ${shortPrompt}` },
            { kind: 'copy',   label: '📋 Copy My Prompt',  value: prompt },
            { kind: 'action', label: '💡 Brainstorm',      cmd: `${p}brainstorm ${shortPrompt}` },
            { kind: 'action', label: '🧹 Clear Context',  cmd: `${p}ai reset` },
          ], { quoted: m });
        } catch (_) {}
      } catch (err) {
        await m.reply.error(`AI error: ${err.message}`);
        throw err;
      }
    });
  }
};
