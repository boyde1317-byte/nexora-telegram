import { aiTextGenerator } from '../../assets/aiTextGenerator.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { DownloadProgress } from '../../lib/progress.js';
import { downloadMediaMessage } from 'baileys';

export default {
  name: 'vision',
  aliases: ['analyze', 'imageai'],
  category: 'ai',
  description: 'Analyzes an image using AI. Reply to an image with .vision [prompt].',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix, rawMessage }) => {
    const p = prefix || '.';
    if (!aiTextGenerator.isEnabled()) {
      return await m.reply.error('AI is not configured. Set GEMINI_API_KEY / NEXORA_API_KEY (Google) or GROQ_API_KEY (free, console.groq.com) in .env.');
    }
    
    // Ensure there is an image to analyze
    const isImage = m.msg?.mimetype?.includes('image') || m.quoted?.mimetype?.includes('image');
    if (!isImage) {
      return await m.reply.info(`Usage: Reply to an image with \`${p}vision <optional prompt>\``, 'NEXORA • Vision');
    }

    const prompt = args.join(' ').trim() || 'Describe this image in detail.';

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Analyzing image');
      try {
        const targetMessage = m.quoted ? rawMessage.message.extendedTextMessage.contextInfo.quotedMessage : rawMessage.message;
        const targetType = Object.keys(targetMessage)[0];
        
        const buffer = await downloadMediaMessage(
          { key: m.quoted ? m.msg.contextInfo.stanzaId : m.key, message: targetMessage },
          'buffer',
          {},
          { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer) throw new Error('Failed to download image.');

        // Use actual detected mime type instead of hardcoding jpeg
        const detectedMime = m.quoted?.mimetype || m.msg?.mimetype || 'image/jpeg';
        const reply = await aiTextGenerator.analyzeImage(buffer, prompt, detectedMime);
        await progress.done();
        
        await mixedCard(sock, m.from, {
          text: `👁️ *AI VISION ANALYSIS*\n\n*Prompt:* ${prompt}\n\n${reply}`,
          footer: 'NEXORA • Vision ✦',
        }, [
          { kind: 'copy',   label: '📋 Copy Analysis',     value: reply },
          { kind: 'action', label: '👁️ Analyze Another',  cmd: `${p}vision` },
          { kind: 'action', label: '🤖 Ask AI',           cmd: `${p}ai` },
        ], { quoted: m });
      } catch (err) {
        await progress.fail(`Failed to analyze image: ${(err.message || '').replace(/key=[A-Za-z0-9_-]+/gi, 'key=[REDACTED]')}`);
      }
    });
  }
};
