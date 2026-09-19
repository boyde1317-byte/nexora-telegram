/**
 * testrich.js — owner-only test party for OURIN-baileys rich message generators.
 *
 * This is NOT attached to any real command or menu. It's a sandbox for
 * testing the V1 (submessage-based) and V2 (base64 unifiedResponse) rich
 * message generators ported from OURIN-baileys into the fork.
 *
 * Usage:
 *   .testrich              → native select picker with all tests
 *   .testrich v1table       → run V1 table generator
 *   .testrich v2code        → run V2 code block generator
 *   .testrich all           → run every test in sequence
 *   .testrich list          → text list of all available tests
 *
 * All tests relay via sock.relayMessage (raw proto) — bypassing the fork's
 * sendMessage content processing — so the exact botForwardedMessage
 * structure reaches WA servers untouched for accurate testing.
 */
import { selectMenu } from '../../lib/interactiveKit.js';
import { RICH_TESTS, runRichTest, runAllRichTests } from '../../lib/richTestKit.js';

export default {
  name: 'testrich',
  aliases: ['testrichmsg', 'richdebug'],
  category: 'owner',
  description: '🧪 Test party for OURIN-baileys rich message generators (V1 + V2).',
  permissions: { owner: true },
  cooldown: 5000,

  execute: async ({ sock, m, args, prefix }) => {
    const p    = prefix || '.';
    const type = args[0]?.toLowerCase();

    // ── No arg — show a select picker with all tests ──────────────────────
    if (!type) {
      const groups = {};
      for (const t of RICH_TESTS) {
        if (!groups[t.group]) groups[t.group] = [];
        groups[t.group].push(t);
      }

      const sections = Object.entries(groups).map(([groupName, tests]) => ({
        title: groupName + ' Generators',
        rows: tests.map(t => ({
          id:    p + 'testrich ' + t.id,
          title: t.label,
          description: 'Test ID: ' + t.id,
        })),
      }));

      // Add "run all" and "list" as a separate section
      sections.push({
        title: 'Batch',
        rows: [
          { id: p + 'testrich all',  title: '🚀 Run All Tests',  description: 'Execute every generator test in sequence' },
          { id: p + 'testrich list', title: '📄 List All Tests',  description: 'Show a text list of all available tests' },
        ],
      });

      return await selectMenu(sock, m.from, {
        text:   '🧪 *NEXORA Rich Message Test Party*\n\nSelect a generator test to run:\n\n• V1 = submessage-based\n• V2 = base64 unifiedResponse (Meta AI format)\n• Links = citation content\n• Unit = tokenizer/parser validation\n• Capture = unified response round-trip',
        footer: 'OURIN-baileys port • not wired to real commands',
      }, '⚙️ Choose Test', sections, [], { quoted: m });
    }

    // ── List all tests ────────────────────────────────────────────────────
    if (type === 'list') {
      const lines = ['🧪 *Available Rich Message Tests*\n'];
      const groups = {};
      for (const t of RICH_TESTS) {
        if (!groups[t.group]) groups[t.group] = [];
        groups[t.group].push(t);
      }
      for (const [groupName, tests] of Object.entries(groups)) {
        lines.push('*' + groupName + ':*');
        for (const t of tests) {
          lines.push('  • `' + t.id + '` — ' + t.label);
        }
        lines.push('');
      }
      lines.push('_Usage: ' + p + 'testrich <id> | all | list_');
      return await m.reply(lines.join('\n'));
    }

    // ── Run all tests ──────────────────────────────────────────────────────
    if (type === 'all') {
      await m.reply('🧪 Running all ' + RICH_TESTS.length + ' rich message tests...\n_This will take ~' + (RICH_TESTS.length * 0.5 + 2) + 's_');

      const results = await runAllRichTests(sock, m.from, m);

      const lines = ['🧪 *Rich Message Test Results*\n'];
      for (const r of results) {
        const icon = r.ok ? '✅' : '❌';
        lines.push(icon + ' ' + r.label + ' — ' + r.result);
      }
      const passed = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;
      lines.push('\n*Summary:* ' + passed + ' passed, ' + failed + ' failed (' + RICH_TESTS.length + ' total)');

      return await m.reply(lines.join('\n'));
    }

    // ── Run specific test ──────────────────────────────────────────────────
    const validIds = RICH_TESTS.map(t => t.id);
    if (!validIds.includes(type)) {
      return await m.reply.error(
        'Unknown test: *"' + type + '"*\n\nValid: ' + validIds.join(', ') + ', all, list'
      );
    }

    try {
      const result = await runRichTest(sock, m.from, type, m);
      console.log('[testrich] ' + type + ': ' + result);
    } catch (err) {
      await m.reply.error('Test "' + type + '" failed: ' + err.message);
      console.error('[testrich] ' + type + ' error:', err);
    }
  },
};
