/**
 * base64.js — encode / decode base64 strings.
 *
 * Fixed: broken template literals in fallback usage message.
 */
import { copyResultCard, mixedCard, selectMenu } from '../../lib/interactiveKit.js';

export default {
  name: 'base64',
  aliases: ['b64', 'encode', 'decode'],
  category: 'utility',
  description: 'Encodes or decodes base64. .base64 encode <text> | .base64 decode <b64>',
  cooldown: 1500,
  execute: async ({ m, sock, args, body, prefix }) => {
    const p = prefix || '.';
    const [mode, ...rest] = args;
    const input = rest.join(' ').trim();

    const rawCmd = body.slice(p.length).trim().split(/\s+/)[0].toLowerCase();
    let op = mode?.toLowerCase();
    if (rawCmd === 'encode') op = 'encode';
    if (rawCmd === 'decode') op = 'decode';

    if (!op || !['encode', 'decode'].includes(op)) {
      try {
        return await selectMenu(sock, m.from, {
          text:   '🔐 *BASE64 UTILITY*\n\nChoose an operation:',
          footer: 'Supports plain text and any UTF-8 input',
        }, '⚡ Choose Operation', [
          { title: 'Encoding', rows: [
            { id: `${p}base64 encode `, title: '📤 Encode to Base64', description: 'Convert plain text → base64 string' },
          ]},
          { title: 'Decoding', rows: [
            { id: `${p}base64 decode `, title: '📥 Decode from Base64', description: 'Convert base64 string → plain text' },
          ]},
        ], [], { quoted: m });
      } catch (_) {}
      return await m.reply.info(
        `Usage:\n• \`${p}base64 encode <text>\` — convert text to base64\n• \`${p}base64 decode <base64>\` — decode base64 to text`,
        'BASE64'
      );
    }

    const subject = op === mode?.toLowerCase() ? input : args.join(' ').trim();
    if (!subject) {
      return await m.reply.error('Please provide text to encode/decode.');
    }
    if (subject.length > 2000) {
      return await m.reply.error('Input too long (max 2000 characters).');
    }

    try {
      let result;
      if (op === 'encode') {
        result = Buffer.from(subject, 'utf-8').toString('base64');
      } else {
        const buf = Buffer.from(subject, 'base64');
        result = buf.toString('utf-8');
        if (!/[\x20-\x7E\n\r\t]/.test(result)) {
          throw new Error('Decoded result contains non-printable characters — input may not be valid base64 text.');
        }
      }

      const preview   = result.length > 200 ? result.slice(0, 197) + '…' : result;
      const bodyText  = `🔐 *BASE64 ${op.toUpperCase()}*\n\n📥 *Input:*\n${subject.length > 80 ? subject.slice(0, 77) + '…' : subject}\n\n📤 *Result:*\n\`${preview}\``;
      const flipOp    = op === 'encode' ? 'decode' : 'encode';
      const flipLabel = op === 'encode' ? '📥 Decode It Back' : '📤 Encode Again';

      try {
        return await copyResultCard(sock, m.from, {
          text:       bodyText,
          footer:     `BASE64 ${op.toUpperCase()} • ${result.length} chars`,
          copyLabel:  `📋 Copy ${op === 'encode' ? 'Base64' : 'Decoded Text'}`,
          copyValue:  result,
          extraButtons: [
            { text: flipLabel,        id: `${p}base64 ${flipOp} ${result.slice(0, 200)}` },
            { text: '🔐 New Encode',  id: `${p}encode` },
          ],
        }, { quoted: m });
      } catch (err) {
        console.warn('[base64] Tier 1 (copyResultCard) failed:', err.message);
      }

      const { asciiBuilder } = await import('../../ui/asciiBuilder.js');
      await m.reply(asciiBuilder.box(`BASE64 ${op.toUpperCase()}`, [
        `📥 Input  : ${subject.length > 60 ? subject.slice(0, 57) + '...' : subject}`,
        ``,
        `📤 Result:`,
        result.length > 800 ? result.slice(0, 797) + '...' : result,
      ]));
    } catch (err) {
      await m.reply.error(`${op === 'decode' ? 'Invalid base64 input: ' : ''}${err.message}`);
    }
  },
};
