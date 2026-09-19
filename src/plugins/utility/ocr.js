/**
 * ocr.js — Extract text from an image using OCR.
 *
 * Fixed: hardcoded '!ocr' in usage message → uses prefix variable.
 * Improved: copy button for extracted text.
 */
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'ocr',
  aliases: ['readtext', 'textfromimage', 'extract'],
  category: 'utility',
  description: 'Extracts text from an image. Reply to or send a photo with `.ocr`.',
  cooldown: 6000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    const isImage = m.type === 'imageMessage' || m.quoted?.type === 'imageMessage';
    if (!isImage) {
      return await m.reply.info(
        `Send or reply to an image with \`${p}ocr\` to extract any text in it.`,
        'OCR — TEXT FROM IMAGE'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const target = m.type === 'imageMessage' ? m : m.quoted;
        const imgBuffer = await target.download().catch(() => null);

        if (!imgBuffer) throw new Error('Could not download the image. Try again.');

        const b64       = imgBuffer.toString('base64');
        const mimeType  = (target.msg ?? target.message?.imageMessage)?.mimetype ?? 'image/jpeg';

        const formData = new FormData();
        formData.append('base64Image', `data:${mimeType};base64,${b64}`);
        formData.append('language',    'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine',   '2');

        const res = await fetch('https://api.ocr.space/parse/image', {
          method:  'POST',
          headers: { apikey: 'helloworld' },
          body:    formData,
          signal:  AbortSignal.timeout(20000),
        });

        if (!res.ok) throw new Error(`OCR service returned ${res.status}`);
        const data = await res.json();

        if (data.IsErroredOnProcessing) {
          throw new Error(data.ErrorMessage?.[0] ?? 'OCR processing failed.');
        }

        const text = data.ParsedResults?.[0]?.ParsedText?.trim();
        if (!text) {
          return await m.reply.warn('No readable text found in the image.');
        }

        const displayText = text.slice(0, 1200);
        try {
          await copyResultCard(sock, m.from, {
            text:       `🔍 *OCR RESULT*\n\n${displayText}`,
            footer:     'NEXORA • OCR',
            copyLabel:  '📋 Copy Text',
            copyValue:  text,
          }, { quoted: m });
        } catch (_) {
          await m.reply(`🔍 *OCR RESULT*\n\n${displayText}`, { contextInfo: buildEnrichedContextInfo() });
        }
      } catch (err) {
        await m.reply.error(`OCR failed: ${err.message}`);
      }
    });
  }
};
