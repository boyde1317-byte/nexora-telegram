import crypto from 'crypto';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'password',
  aliases: ['genpass', 'pwgen'],
  category: 'utility',
  description: 'Generates a secure random password.',
  cooldown: 3000,
  execute: async ({ m, sock, args }) => {
    const length = parseInt(args[0]) || 16;
    if (length < 8 || length > 128) {
      return await m.reply.error('Length must be between 8 and 128 characters.');
    }
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i] % chars.length];
    }
    
    // Simple strength meter
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    const strength = length >= 16 && variety === 4 ? '💪 Strong'
      : length >= 12 && variety >= 3 ? '✅ Good'
      : '⚠️ Fair — consider a longer password';

    await copyResultCard(sock, m.from, {
      text: `🔑 *SECURE PASSWORD*\n\nLength: ${length} • Strength: ${strength}\n\n*${password}*`,
      footer: 'NEXORA • Password Gen',
      copyLabel: '📋 Copy Password',
      copyValue: password
    }, { quoted: m });
  }
};
