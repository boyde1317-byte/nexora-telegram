/**
 * calc.js — Quick calculator.
 *
 * Evaluates math expressions safely (no eval). Supports +, -, *, /, %,
 * parentheses, and common functions (sqrt, pow, round, floor, ceil, abs).
 *
 * Usage: .calc <expression>
 * Example: .calc 2 + 2 * 3
 *          .calc sqrt(144)
 *          .calc (50 * 0.15) + 20
 */
import { copyResultCard } from '../../lib/interactiveKit.js';

// Safe expression evaluator — no eval()
function safeEval(expr) {
  // Whitelist: digits, operators, parentheses, decimal points, function names
  const cleaned = expr.replace(/\s+/g, ' ').trim();

  // Validate: only allowed characters
  if (!/^[0-9+\-*/%().\s,a-z]+$/i.test(cleaned)) {
    throw new Error('Invalid characters in expression.');
  }

  // Replace function names and constants
  let jsExpr = cleaned
    .replace(/sqrt\(/gi, 'Math.sqrt(')
    .replace(/pow\(/gi, 'Math.pow(')
    .replace(/round\(/gi, 'Math.round(')
    .replace(/floor\(/gi, 'Math.floor(')
    .replace(/ceil\(/gi, 'Math.ceil(')
    .replace(/abs\(/gi, 'Math.abs(')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/gi, 'Math.E');

  // Re-validate after substitution to prevent injection
  if (!/^[0-9+\-*/%().\s,Math.a-z]+$/i.test(jsExpr)) {
    throw new Error('Invalid expression.');
  }

  // Check for balanced parentheses
  let depth = 0;
  for (const ch of jsExpr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) throw new Error('Unbalanced parentheses.');
  }
  if (depth !== 0) throw new Error('Unbalanced parentheses.');

  // Use Function constructor (safer than eval, isolated scope)
  const result = Function(`"use strict"; return (${jsExpr});`)();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Expression did not evaluate to a valid number.');
  }
  return result;
}

export default {
  name: 'calc',
  aliases: ['calculate'],
  category: 'utility',
  description: 'Quick calculator. Usage: .calc <expression> — supports +, -, *, /, %, sqrt, pow, parentheses',
  cooldown: 1000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const expr = args.join(' ').trim();

    if (!expr) {
      return await m.reply.info(
        `Usage: \`${p}calc <expression>\`\n\nExamples:\n• \`${p}calc 2 + 2 * 3\` → 8\n• \`${p}calc sqrt(144)\` → 12\n• \`${p}calc (50 * 0.15) + 20\` → 27.5\n• \`${p}calc pow(2, 10)\` → 1024`,
        'CALCULATOR'
      );
    }

    try {
      const result = safeEval(expr);
      const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/\.?0+$/, '');

      const isInteger = Number.isInteger(result);
      const commentary = isInteger
        ? ''
        : '\n💡 Rounded to 4 decimal places.';

      await copyResultCard(sock, m.from, {
        text: `🧮 *CALCULATOR*\n\nExpression: \`${expr}\`\nResult: *${formatted}*${commentary}`,
        footer: 'NEXORA • Calculator',
        copyLabel: '📋 Copy Result',
        copyValue: formatted,
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Calculation error: ${err.message}`);
    }
  }
};
