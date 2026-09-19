/**
 * @file src/lib/richTestKit.js
 *
 * Test harness for the OURIN-baileys rich message generators ported into
 * the fork's lib/Utils/rich-message-utils.js.  These generators build
 * botForwardedMessage / richResponseMessage content directly — a different
 * approach from the fork's native prepareRichResponseMessage path used by
 * baileysBridge.sendRichResponse().
 *
 * This module is ONLY for testing.  It is not wired into any real command
 * or menu.  Use the `.testrich` owner-only plugin to exercise every generator.
 */

import {
  generateWAMessageFromContent,
} from 'baileys';
import { AIRich } from './NIXCODE.js';

// ── V1 + V2 generators (imported from the fork's rich-message-utils.js) ─────
import {
  generateTableContent,
  generateListContent,
  generateCodeBlockContent,
  generateLatexContent,
  captureUnifiedResponse,
  generateUnifiedResponseContent,
  generateRichMessageContent,
  // V2 generators (base64-encoded unifiedResponse — Meta AI format)
  tokenizeCodeV2,
  toTableMetadataV2,
  generateTableContentV2,
  generateCodeBlockContentV2,
  generateLinkContent,
  generateLinkContentV2,
  generateReelContent,
  generateReelWithStats,
  generateMapContent,
  generateInlineImageWithTable,
  generateInlineVideoWithStats,
  // V2 generators (base64-encoded unifiedResponse — Meta AI format)
  generateListContentV2,
  generateLatexContentV2,
  generateMapContentV2,
  generateReelContentV2,
  generateReelWithStatsV2,
  generateInlineImageWithTableV2,
  generateInlineVideoWithStatsV2,
  // GRID_IMAGE + DYNAMIC (V1 + V2)
  generateGridImageContent,
  generateDynamicContent,
  generateGridImageContentV2,
  generateDynamicContentV2,
  // LaTeX image rendering (with default mathjax-node renderer)
  defaultRenderLatexToPng,
  generateLatexImageContent,
  generateLatexInlineImageContent,
  generateLatexImageContentV2,
  // NEW: Combination generators (v0.3.18-r3)
  generateCodeWithTable,
  generateMapWithTable,
  generateTextWithInlineImage,
  generateMultiInlineImages,
  generateGridImageWithTable,
  generateDynamicWithTable,
  generateCodeWithTableV2,
  generateMapWithTableV2,
  generateTextWithInlineImageV2,
  generateMultiInlineImagesV2,
  generateGridImageWithTableV2,
  generateDynamicWithTableV2,
} from 'baileys';

// ─────────────────────────────────────────────────────────────────────────────
// Relay helper — takes a { message, messageId } from any generator and
// sends it via sock.relayMessage (bypasses sendMessage's content processing
// so the raw botForwardedMessage structure reaches WA servers untouched).
// ─────────────────────────────────────────────────────────────────────────────

// LaTeX primitives don't typeset client-side — the device paints the
// latex_image.url. Pre-render via codecogs (no local deps needed).
const _codecogsUrl = (expr) =>
  'https://latex.codecogs.com/png.image?\\dpi{150}%20' + encodeURIComponent(expr);

async function _relayGenerated(sock, jid, generated, options = {}) {
  // Generators embed quoted context via buildRichContextInfo / buildV2ContextInfo.
  // Do NOT pass quoted here — it would double-set contextInfo at the wrong level
  // and cause WhatsApp to drop native rendering on the message.
  const message = await generateWAMessageFromContent(jid, generated.message, {
    userJid: sock.user?.id || '0@s.whatsapp.net',
  });
  await sock.relayMessage(jid, message.message, { messageId: message.key.id });
  return message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test definitions — each returns a human-readable label + the relay result.
// All are async because some generators are async (latex image upload).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1 Table — submessage-based table with heading row.
 */
export async function testV1Table(sock, jid, quoted) {
  const generated = generateTableContent(
    'NEXORA Feature Matrix',
    ['Feature', 'Status', 'Notes'],
    [
      ['Interactive Buttons', '✅', 'nativeFlow'],
      ['Carousels',          '✅', 'albumMessage'],
      ['Rich Tables',        '🧪', 'V1 submessage'],
      ['Rich Code',          '🧪', 'V1 submessage'],
      ['LaTeX',              '🧪', 'requires renderer'],
    ],
    quoted,
    { headerText: '🧪 V1 Table Generator Test', footer: 'NEXORA-MD • itsliaaa fork + OURIN port' },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 table ✓';
}

/**
 * V1 List — flat list as a single-column table.
 */
export async function testV1List(sock, jid, quoted) {
  const generated = generateListContent(
    'Command Categories',
    [
      ['General', 'ping, about, menu'],
      ['Utility', 'encode, decode, qr'],
      ['Media',   'sticker, toimg, tourl'],
      ['Economy', 'daily, balance, top'],
      ['Owner',   'eval, restart, testmessage'],
      ['AI',      'ai, gpt, dalle'],
    ],
    quoted,
    { headerText: '🧪 V1 List Generator Test', footer: 'NEXORA-MD' },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 list ✓';
}

/**
 * V1 Code block — syntax-highlighted JavaScript.
 */
export async function testV1Code(sock, jid, quoted) {
  const code = [
    "import { baileysBridge } from './src/core/baileysBridge.js';",
    '',
    '// Send an interactive card with quick_reply buttons',
    'await baileysBridge.sendInteractive(sock, jid, {',
    "  body: 'Hello from NEXORA!',",
    "  footer: 'Powered by itsliaaa fork',",
    '  buttons: [',
    "    { name: 'quick_reply', params: { text: 'Ping', id: '.ping' } },",
    "    { name: 'cta_url',     params: { text: 'GitHub', url: 'https://github.com/boyde1317-byte' } },",
    '  ],',
    '});',
  ].join('\n');
  const generated = generateCodeBlockContent(code, quoted, {
    title: '🧪 V1 Code Block Test',
    footer: 'Syntax: JavaScript',
    language: 'javascript',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 code ✓';
}

/**
 * V1 Code block — Python (exercises extended keyword sets).
 */
export async function testV1Python(sock, jid, quoted) {
  const code = [
    'import asyncio',
    'from nexora import Bot',
    '',
    'async def main():',
    '    bot = Bot(prefix=".")',
    '    await bot.start()',
    '    print("NEXORA-MD is running!")',
    '',
    'if __name__ == "__main__":',
    '    asyncio.run(main())',
  ].join('\n');
  const generated = generateCodeBlockContent(code, quoted, {
    title: '🧪 V1 Python Code Test',
    footer: 'Syntax: Python — extended keywords',
    language: 'python',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 python ✓';
}

/**
 * V1 LaTeX — inline expression (no image upload, just the metadata).
 */
export async function testV1Latex(sock, jid, quoted) {
  const generated = generateLatexContent(quoted, {
    text: '🧪 V1 LaTeX Test — quadratic formula:',
    expressions: [
      {
        latexExpression: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
        url: _codecogsUrl('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'),
        width: 200,
        height: 60,
      },
    ],
    headerText: 'LaTeX Expression',
    footer: 'NEXORA-MD • codecogs PNG — FIXED 2026-09-14: GenAILatexItem inline entities, re-verify',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 latex ✓';
}

/**
 * V1 Rich Message — raw submessages (manual construction).
 */
export async function testV1Raw(sock, jid, quoted) {
  const submessages = [
    { messageType: 2, messageText: '🧪 V1 Raw Submessage Test' },
    { messageType: 2, messageText: 'This message was built from manually-constructed submessages.' },
    {
      messageType: 4,
      tableMetadata: {
        title: 'Submessage Types',
        rows: [
          { items: ['Type', 'ID', 'Description'], isHeading: true },
          { items: ['TEXT', '2', 'Plain text line'] },
          { items: ['TABLE', '4', 'Structured table'] },
          { items: ['CODE', '5', 'Syntax-highlighted code'] },
          { items: ['LATEX', '8', 'LaTeX expression'] },
        ],
      },
    },
    { messageType: 2, messageText: '_NEXORA-MD_ — testing raw submessage assembly.' },
  ];
  const generated = generateRichMessageContent(submessages, quoted);
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 raw ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Generators (base64-encoded unifiedResponse — Meta AI format)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V2 Table — uses toTableMetadataV2 string parsing + base64 unifiedResponse.
 */
export async function testV2Table(sock, jid, quoted) {
  // Format: [title, "header1|header2|header3", "row1col1,row1col2;;row2col1,row2col2"]
  const table = [
    'NEXORA V2 Table',
    'Plugin | Category | Status',
    'ping | general | ✅\n;; about | general | ✅\n;; menu | general | ✅\n;; sticker | media | ✅\n;; daily | economy | ✅\n;; eval | owner | 🔒',
  ];
  const generated = generateTableContentV2(table, quoted, {
    headerText: '🧪 V2 Table Generator',
    footer: 'base64 unifiedResponse — Meta AI format',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 table ✓';
}

/**
 * V2 Code block — base64-encoded code with improved tokenizer.
 */
export async function testV2Code(sock, jid, quoted) {
  const code = [
    '// V2 Code Block — improved tokenizer with Python/Go/Lua/Bash support',
    "const { tokenizeCodeV2 } = require('baileys');",
    '',
    "const { codeBlock, unified_codeBlock } = tokenizeCodeV2(code, 'javascript');",
    'console.log(unified_codeBlock);',
    '// → [{ content: "const", type: "KEYWORD" }, { content: " ", type: "DEFAULT" }, ...]',
  ].join('\n');
  const generated = generateCodeBlockContentV2(code, quoted, {
    title: '🧪 V2 Code Block',
    language: 'javascript',
    footer: 'base64 unifiedResponse — improved tokenizer',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 code ✓';
}

/**
 * V2 Code block — Go (exercises Go keyword set).
 */
export async function testV2Go(sock, jid, quoted) {
  const code = [
    'package main',
    '',
    'import "fmt"',
    '',
    'func main() {',
    '    fmt.Println("NEXORA-MD — V2 Go syntax test")',
    '}',
  ].join('\n');
  const generated = generateCodeBlockContentV2(code, quoted, {
    title: '🧪 V2 Go Code',
    language: 'go',
    footer: 'Go keyword highlighting — V2 tokenizer',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 go ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// Link content with citations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1 Link — inline link entities with citations and proofs.
 */
export async function testV1Link(sock, jid, quoted) {
  const generated = generateLinkContent(
    'NEXORA-MD uses a custom Baileys fork with rich message support. The fork extends itsliaaa/Baileys with OURIN-baileys generators for tables, code blocks, and LaTeX.',
    [
      { url: 'https://github.com/boyde1317-byte/baileys', displayName: 'Baileys Fork' },
      { url: 'https://github.com/boyde1317-byte/NEXORA-MD', displayName: 'NEXORA-MD' },
    ],
    quoted,
    {
      footer: 'NEXORA-MD • link content with citations',
      citations: [
        { sourceTitle: 'GitHub — boyde1317-byte/baileys', sourceQuery: 'baileys fork rich messages', citationNumber: 1 },
        { sourceTitle: 'GitHub — boyde1317-byte/NEXORA-MD', sourceQuery: 'NEXORA MD bot', citationNumber: 2 },
      ],
    },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 link ✓';
}

/**
 * V2 Link — search-engine-style citations with GenAISearchCitationItem.
 */
export async function testV2Link(sock, jid, quoted) {
  const generated = generateLinkContentV2(
    'NEXORA-MD is a next-gen WhatsApp bot built on a custom Baileys fork. It supports nativeFlow interactive messages, carousels, sticker packs, and rich response messages.',
    [
      {
        url: 'https://github.com/boyde1317-byte/NEXORA-MD',
        displayName: 'NEXORA-MD on GitHub',
        sourceDisplayName: 'GitHub',
        sourceSubtitle: 'boyde1317-byte/NEXORA-MD',
      },
      {
        url: 'https://github.com/boyde1317-byte/baileys',
        displayName: 'Baileys Fork on GitHub',
        sourceDisplayName: 'GitHub',
        sourceSubtitle: 'boyde1317-byte/baileys',
      },
    ],
    quoted,
    {
      footer: 'NEXORA-MD • V2 search citations',
      searchEngine: 'MAME',
    },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 link ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer unit tests (no relay — just validates output)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokenizer V2 — validate that tokenizeCodeV2 produces correct highlight types.
 */
export async function testTokenizerV2(sock, jid, quoted) {
  const code = 'const x = 42; // comment\nfunction hello(name) { return "world"; }';
  const { codeBlock, unified_codeBlock } = tokenizeCodeV2(code, 'javascript');

  const hasKeyword  = unified_codeBlock.some(t => t.type === 'KEYWORD');
  const hasString   = unified_codeBlock.some(t => t.type === 'STRING');
  const hasNumber   = unified_codeBlock.some(t => t.type === 'NUMBER');
  const hasComment  = unified_codeBlock.some(t => t.type === 'COMMENT');
  const hasMethod   = unified_codeBlock.some(t => t.type === 'METHOD');

  const report = [
    '🧪 *V2 Tokenizer Test*',
    '',
    '*Code:*',
    '```' + code + '```',
    '',
    '*Results:*',
    '• KEYWORD detected: ' + (hasKeyword ? '✅' : '❌'),
    '• STRING detected:  ' + (hasString ? '✅' : '❌'),
    '• NUMBER detected:  ' + (hasNumber ? '✅' : '❌'),
    '• COMMENT detected: ' + (hasComment ? '✅' : '❌'),
    '• METHOD detected:  ' + (hasMethod ? '✅' : '❌'),
    '• Total tokens:     ' + codeBlock.length,
    '• Unified entries:  ' + unified_codeBlock.length,
    '',
    '_All checks ' + (hasKeyword && hasString && hasNumber && hasComment && hasMethod ? 'PASSED ✅' : 'FAILED ❌') + '_',
  ].join('\n');

  await sock.sendMessage(jid, { text: report }, { quoted });
  return 'tokenizer V2 ✓';
}

/**
 * Table metadata V2 — validate string parsing with | and ;; delimiters.
 */
export async function testTableMetadataV2(sock, jid, quoted) {
  const input = [
    'Test Table',
    'A | B | C',
    '1,2,3;;4,5,6;;7,8,9',
  ];
  const result = toTableMetadataV2(input);

  const report = [
    '🧪 *V2 Table Metadata Parser Test*',
    '',
    '*Input:*',
    '```' + JSON.stringify(input, null, 2) + '```',
    '',
    '*Output:*',
    '```' + JSON.stringify(result, null, 2) + '```',
    '',
    '• Title:      ' + result.title,
    '• Row count:  ' + result.rows.length,
    '• Has header: ' + (result.rows[0]?.isHeading ? '✅' : '❌'),
  ].join('\n');

  await sock.sendMessage(jid, { text: report }, { quoted });
  return 'table metadata V2 ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified response capture & relay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture & relay — builds a V1 message, captures the unified response,
 * and regenerates it. This tests the captureUnifiedResponse and
 * generateUnifiedResponseContent round-trip.
 */
export async function testCaptureRelay(sock, jid, quoted) {
  // Build a V1 table
  const original = generateTableContent(
    'Capture & Relay Test',
    ['Field', 'Value'],
    [
      ['Generator', 'V1 table'],
      ['Method', 'captureUnifiedResponse -> generateUnifiedResponseContent'],
      ['Round-trip', 'should preserve submessages'],
    ],
    quoted,
    { headerText: '🧪 Capture & Relay Round-Trip' },
  );

  // Simulate receiving this message (build a fake msg object)
  const fakeMsg = original.message;

  // Capture
  const captured = captureUnifiedResponse(fakeMsg);
  if (!captured) {
    await sock.sendMessage(jid, {
      text: '🧪 *Capture & Relay Test*\n\n❌ captureUnifiedResponse returned null — no unifiedResponse data found.\n\n_Note: Since fork commit ae26d2e, V1 generators also embed unifiedResponse.data (protobuf-encoded). If this fails, the message may predate that fix._',
    }, { quoted });
    return 'capture relay — no unifiedResponse found';
  }

  // Regenerate
  const regenerated = generateUnifiedResponseContent(quoted, captured);
  await _relayGenerated(sock, jid, regenerated, { quoted });
  return 'capture relay ✓';
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Reel / Content Items generators (video + thumbnail carousel)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reel content — video carousel using contentItemsMetadata + ReelItem proto.
 * Each item has a thumbnail, video URL, profile icon, and title.
 */
export async function testReelContent(sock, jid, quoted) {
  const reels = [
    {
      title:          'NEXORA-MD Demo Video',
      profileIconUrl: 'https://i.pravatar.cc/150?img=12',
      thumbnailUrl:   'https://picsum.photos/id/237/400/600',
      videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
    },
    {
      title:          'Interactive Menu Showcase',
      profileIconUrl: 'https://i.pravatar.cc/150?img=13',
      thumbnailUrl:   'https://picsum.photos/id/238/400/600',
      videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
    },
  ];
  const generated = generateReelContentV2(reels, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 Reel Content Test — Video Carousel',
    footer: 'NEXORA-MD • contentItemsMetadata (type 9)',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'reel content ✓';
}

/**
 * Reel + Stats — the TikTok download pattern: video carousel + stats table
 * combined in a single botForwardedMessage.
 */
export async function testReelWithStats(sock, jid, quoted) {
  const params = {
    reels: [
      {
        title:          'TikTok @user/video/123456',
        profileIconUrl: 'https://i.pravatar.cc/150?img=14',
        thumbnailUrl:   'https://picsum.photos/id/239/400/600',
        videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
      },
    ],
    tableTitle: 'Download Stats',
    tableHeaders: ['Metric', 'Value'],
    tableRows: [
      ['Views',     '1,234,567'],
      ['Likes',     '45,678'],
      ['Comments',  '1,234'],
      ['Shares',    '3,210'],
      ['Downloads', '890'],
      ['Duration',  '00:58'],
      ['Quality',   'HD (720p)'],
    ],
  };
  const generated = generateReelWithStatsV2(params, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 Reel + Stats Table — TikTok Download Pattern',
    footer: 'NEXORA-MD • contentItems (type 9) + table (type 4) combined',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'reel + stats ✓';
}
/**
 * Location Card — AIRichResponseMapMetadata (messageType 7). Renders a
 * map preview with one or more pins, matching Meta AI's "Location Card"
 * component (e.g. "coffee shops near me in Accra").
 */
export async function testMapContent(sock, jid, quoted) {
  const generated = generateMapContent(
    {
      centerLatitude: 5.6037,
      centerLongitude: -0.1870,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
      annotations: [
        { latitude: 5.6050, longitude: -0.1880, title: 'Cafe One', body: 'Independence Ave' },
        { latitude: 5.6020, longitude: -0.1860, title: 'Cafe Two', body: 'Ring Road Central' },
      ],
      showInfoList: true,
    },
    quoted,
    {
      headerText: '🧪 Location Card Test — Coffee shops near Accra',
      footer: 'NEXORA-MD • FIXED 2026-09-14: OSM tile (ImaginePrimitive) + info text — re-verify on device',
    }
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'map content ✓';
}

/**
 * Inline Video + Table — ContentType.DEFAULT (not CAROUSEL). This is the
 * exact layout Meta AI showed us: a single embedded video player sitting
 * above a stats table, not a swipeable carousel. Uses the same proto
 * contentItemsMetadata but with contentType=0 instead of 1.
 */
export async function testInlineVideoWithStats(sock, jid, quoted) {
  const generated = generateInlineVideoWithStatsV2(
    {
      video: {
        title:          'TikTok @user/video/123456',
        profileIconUrl: 'https://i.pravatar.cc/150?img=14',
        thumbnailUrl:   'https://picsum.photos/id/239/400/600',
        videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
      },
      tableHeaders: ['Metric', 'Value'],
      tableRows: [
        ['Views',     '1,234,567'],
        ['Likes',     '45,678'],
        ['Comments',  '1,234'],
        ['Shares',    '3,210'],
        ['Downloads', '890'],
        ['Duration',  '00:58'],
        ['Quality',   'HD (720p)'],
      ],
    },
    quoted,
    { primitiveStyle: 'nixcode',
      headerText: '\ud83e\uddea Inline Video + Table \u2014 Meta AI layout (V2)',
      footer: 'NEXORA-MD \u2022 contentItems (V2) + table (V2)',
    }
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'inline video + stats \u2713';
}

/**
 * Inline Image + Table — INLINE_IMAGE (type 3) + TABLE (type 4) submessages.
 * Combines an image preview with a stats table — ideal for search results,
 * weather cards, and download info with thumbnails.
 */
export async function testInlineImageWithTable(sock, jid, quoted) {
  const generated = generateInlineImageWithTableV2(
    {
      image: {
        imageUrl: {
          imagePreviewUrl: 'https://picsum.photos/id/237/400/300',
          imageHighResUrl: 'https://picsum.photos/id/237/800/600',
          sourceUrl: 'https://picsum.photos',
        },
        imageText: 'NEXORA-MD Test Image',
        alignment: 0,
        tapLinkUrl: 'https://github.com/boyde1317-byte/NEXORA-MD',
      },
      tableHeaders: [ 'Property', 'Value' ],
      tableRows: [
        [ 'Resolution',   '800x600'  ],
        [ 'Format',       'JPEG'     ],
        [ 'Source',       'picsum.photos' ],
        [ 'License',      'Unsplash'  ],
      ],
    },
    quoted,
    { primitiveStyle: 'nixcode',
      headerText: '🧪 Inline Image + Table — search result card layout',
      footer: 'NEXORA-MD • inlineImage (type 3) + table (type 4)',
    }
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'inline image + table ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Generators — new generators added in fork commit b9f5c84
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V2 List — base64-encoded list with no header row (list vs table distinction).
 */
export async function testV2List(sock, jid, quoted) {
  const generated = generateListContentV2(
    'NEXORA Plugins',
    [
      ['ping',    'general',  '✅'],
      ['about',   'general',  '✅'],
      ['sticker', 'media',    '✅'],
      ['daily',   'economy',  '✅'],
      ['eval',    'owner',    '🔒'],
      ['ai',      'ai',       '🧪'],
    ],
    quoted,
    { headerText: '🧪 V2 List Generator', footer: 'base64 unifiedResponse — no header row' },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 list ✓';
}

/**
 * V2 LaTeX — base64-encoded LaTeX expression.
 */
export async function testV2Latex(sock, jid, quoted) {
  const generated = generateLatexContentV2(quoted, {
    text: '🧪 V2 LaTeX Test — Euler identity:',
    expressions: [
      { latexExpression: 'e^{i\\pi} + 1 = 0', url: _codecogsUrl('e^{i\\pi} + 1 = 0'), width: 180, height: 50 },
    ],
    headerText: 'LaTeX V2',
    footer: 'NEXORA-MD • base64 unifiedResponse • codecogs PNG — FIXED 2026-09-14: GenAILatexItem inline entities, re-verify',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 latex ✓';
}

/**
 * V2 Map — base64-encoded location card.
 */
export async function testV2Map(sock, jid, quoted) {
  const generated = generateMapContentV2(
    {
      centerLatitude: 5.6037,
      centerLongitude: -0.1870,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
      annotations: [
        { latitude: 5.6050, longitude: -0.1880, title: 'Cafe V2 One', body: 'Independence Ave' },
        { latitude: 5.6020, longitude: -0.1860, title: 'Cafe V2 Two', body: 'Ring Road Central' },
      ],
      showInfoList: true,
    },
    quoted,
    {
      headerText: '🧪 V2 Location Card — Accra',
      footer: 'NEXORA-MD • FIXED 2026-09-14: OSM tile + info text (base64) — re-verify on device',
    },
  );
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 map ✓';
}

/**
 * V2 Reel — base64-encoded video carousel.
 */
export async function testV2Reel(sock, jid, quoted) {
  const reels = [
    {
      title:          'V2 Reel Demo',
      profileIconUrl: 'https://i.pravatar.cc/150?img=20',
      thumbnailUrl:   'https://picsum.photos/id/240/400/600',
      videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
    },
    {
      title:          'V2 Reel Demo 2',
      profileIconUrl: 'https://i.pravatar.cc/150?img=21',
      thumbnailUrl:   'https://picsum.photos/id/241/400/600',
      videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
    },
  ];
  const generated = generateReelContentV2(reels, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V2 Reel Content — Video Carousel',
    footer: 'NEXORA-MD • base64 unifiedResponse',
    contentType: 'CAROUSEL',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 reel ✓';
}

/**
 * V2 Reel + Stats — base64-encoded video carousel + stats table.
 */
export async function testV2ReelWithStats(sock, jid, quoted) {
  const generated = generateReelWithStatsV2(
    {
      reels: [
        {
          title:          'V2 TikTok Download',
          profileIconUrl: 'https://i.pravatar.cc/150?img=22',
          thumbnailUrl:   'https://picsum.photos/id/242/400/600',
          videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
        },
      ],
      tableHeaders: ['Metric', 'Value'],
      tableRows: [
        ['Views',     '2,345,678'],
        ['Likes',     '56,789'],
        ['Comments',  '2,345'],
        ['Shares',    '4,321'],
        ['Duration',  '01:12'],
        ['Quality',   'HD (1080p)'],
      ],
    },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V2 Reel + Stats — TikTok Download',
      footer: 'NEXORA-MD • base64 unifiedResponse',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 reel + stats ✓';
}

/**
 * V2 Inline Image + Table — base64-encoded image preview + stats table.
 */
export async function testV2InlineImageWithTable(sock, jid, quoted) {
  const generated = generateInlineImageWithTableV2(
    {
      image: {
        imageUrl: {
          imagePreviewUrl: 'https://picsum.photos/id/237/400/300',
          imageHighResUrl: 'https://picsum.photos/id/237/800/600',
          sourceUrl: 'https://picsum.photos',
        },
        imageText: 'V2 Image Preview',
        alignment: 0,
        tapLinkUrl: 'https://github.com/boyde1317-byte/NEXORA-MD',
      },
      tableHeaders: ['Property', 'Value'],
      tableRows: [
        ['Resolution', '800x600'],
        ['Format',     'JPEG'],
        ['Source',     'picsum.photos'],
        ['License',    'Unsplash'],
      ],
    },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V2 Inline Image + Table',
      footer: 'NEXORA-MD • base64 unifiedResponse',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 inline image + table ✓';
}

/**
 * V2 Inline Video + Stats — base64-encoded single video + stats table.
 */
export async function testV2InlineVideoWithStats(sock, jid, quoted) {
  const generated = generateInlineVideoWithStatsV2(
    {
      video: {
        title:          'V2 Inline Video',
        profileIconUrl: 'https://i.pravatar.cc/150?img=23',
        thumbnailUrl:   'https://picsum.photos/id/243/400/600',
        videoUrl:       'https://www.w3schools.com/html/mov_bbb.mp4',
      },
      tableHeaders: ['Metric', 'Value'],
      tableRows: [
        ['Views',     '3,456,789'],
        ['Likes',     '67,890'],
        ['Comments',  '3,456'],
        ['Shares',    '5,432'],
        ['Duration',  '01:30'],
        ['Quality',   'HD (1080p)'],
      ],
    },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V2 Inline Video + Stats',
      footer: 'NEXORA-MD • base64 unifiedResponse',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 inline video + stats ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID_IMAGE + DYNAMIC generators (fork commit b9f5c84)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1 Grid Image — image gallery grid using gridImageMetadata (messageType 1).
 * Shows a main grid image + collection of thumbnails.
 */
export async function testV1GridImage(sock, jid, quoted) {
  const generated = generateGridImageContent(
    {
      gridImageUrl: {
        imagePreviewUrl: 'https://picsum.photos/id/237/400/400',
        imageHighResUrl: 'https://picsum.photos/id/237/800/800',
        sourceUrl: 'https://picsum.photos',
      },
      imageUrls: [
        { imagePreviewUrl: 'https://picsum.photos/id/238/200/200', imageHighResUrl: 'https://picsum.photos/id/238/400/400', sourceUrl: 'https://picsum.photos' },
        { imagePreviewUrl: 'https://picsum.photos/id/239/200/200', imageHighResUrl: 'https://picsum.photos/id/239/400/400', sourceUrl: 'https://picsum.photos' },
        { imagePreviewUrl: 'https://picsum.photos/id/240/200/200', imageHighResUrl: 'https://picsum.photos/id/240/400/400', sourceUrl: 'https://picsum.photos' },
        { imagePreviewUrl: 'https://picsum.photos/id/241/200/200', imageHighResUrl: 'https://picsum.photos/id/241/400/400', sourceUrl: 'https://picsum.photos' },
      ],
    },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V1 Grid Image — Photo Gallery',
      footer: 'NEXORA-MD • gridImageMetadata (type 1)',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 grid image ✓';
}

/**
 * V1 Dynamic — animated GIF/image using dynamicMetadata (messageType 6).
 */
export async function testV1Dynamic(sock, jid, quoted) {
  const generated = generateDynamicContent(
    { type: 'gif', url: 'https://media.giphy.com/media/3oEjI6SIIHBdIwqEoI/giphy.gif', loopCount: 3, version: 1 },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V1 Dynamic — Animated GIF',
      footer: 'NEXORA-MD • dynamicMetadata (type 6, GIF)',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 dynamic ✓';
}

/**
 * V2 Grid Image — base64-encoded image gallery grid.
 */
export async function testV2GridImage(sock, jid, quoted) {
  const generated = generateGridImageContentV2(
    {
      gridImageUrl: {
        imagePreviewUrl: 'https://picsum.photos/id/237/400/400',
        imageHighResUrl: 'https://picsum.photos/id/237/800/800',
        sourceUrl: 'https://picsum.photos',
      },
      imageUrls: [
        { imagePreviewUrl: 'https://picsum.photos/id/238/200/200', imageHighResUrl: 'https://picsum.photos/id/238/400/400', sourceUrl: 'https://picsum.photos' },
        { imagePreviewUrl: 'https://picsum.photos/id/239/200/200', imageHighResUrl: 'https://picsum.photos/id/239/400/400', sourceUrl: 'https://picsum.photos' },
      ],
    },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V2 Grid Image — Photo Gallery',
      footer: 'NEXORA-MD • base64 unifiedResponse',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 grid image ✓';
}

/**
 * V2 Dynamic — base64-encoded animated content.
 */
export async function testV2Dynamic(sock, jid, quoted) {
  const generated = generateDynamicContentV2(
    { type: 'image', url: 'https://picsum.photos/id/300/400/300', loopCount: 0, version: 1 },
    quoted,
    {
      primitiveStyle: 'nixcode',
      headerText: '🧪 V2 Dynamic — Animated Image',
      footer: 'NEXORA-MD • base64 unifiedResponse',
    },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 dynamic ✓';
}

// ─────────────────────────────────────────────────────────────────────────────
// LaTeX Image Rendering (Item G — mathjax-node default renderer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1 LaTeX Image — renders LaTeX to PNG via defaultRenderLatexToPng, uploads,
 * and sends. Requires mathjax-node to be installed in the bot's node_modules.
 */
export async function testV1LatexImage(sock, jid, quoted) {
  // Use sock.waUploadToServer as the upload function if available
  const uploadFn = sock.waUploadToServer || sock.uploadToServer;
  if (!uploadFn) {
    await sock.sendMessage(jid, { text: '🧪 *V1 LaTeX Image Test*\n\n❌ No upload function available (sock.waUploadToServer missing).' }, { quoted });
    return 'V1 latex image — no upload fn';
  }
  try {
    const generated = await generateLatexImageContent(quoted, {
      text: '🧪 V1 LaTeX Image Test — rendered to PNG:',
      expressions: [
        { latexExpression: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}' },
        { latexExpression: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      ],
      headerText: 'LaTeX Image Rendering',
      footer: 'NEXORA-MD • mathjax-node default renderer',
    }, uploadFn);
    await _relayGenerated(sock, jid, generated, { quoted });
    return 'V1 latex image ✓';
  } catch (err) {
    // mathjax-node not installed — fall back to the codecogs pre-rendered URL
    const expr = '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}';
    const generated = generateLatexContent(quoted, {
      text: '🧪 V1 LaTeX Image Test — codecogs fallback (mathjax-node unavailable):',
      expressions: [
        { latexExpression: expr, url: _codecogsUrl(expr), width: 300, height: 50 },
      ],
      headerText: 'LaTeX Image (fallback)',
      footer: 'NEXORA-MD • codecogs PNG — FIXED 2026-09-14: GenAILatexItem inline entities, re-verify',
    });
    await _relayGenerated(sock, jid, generated, { quoted });
    return 'V1 latex image — codecogs fallback (mathjax-node: ' + err.message + ')';
  }
}

/**
 * V2 LaTeX Image — base64-encoded unifiedResponse with rendered PNG LaTeX.
 */
export async function testV2LatexImage(sock, jid, quoted) {
  const uploadFn = sock.waUploadToServer || sock.uploadToServer;
  if (!uploadFn) {
    await sock.sendMessage(jid, { text: '🧪 *V2 LaTeX Image Test*\n\n❌ No upload function available.' }, { quoted });
    return 'V2 latex image — no upload fn';
  }
  try {
    const generated = await generateLatexImageContentV2(quoted, {
      text: '🧪 V2 LaTeX Image Test — Euler identity:',
      expressions: [
        { latexExpression: 'e^{i\\pi} + 1 = 0' },
      ],
      headerText: 'LaTeX V2 Image',
      footer: 'NEXORA-MD • base64 + mathjax-node',
    }, uploadFn);
    await _relayGenerated(sock, jid, generated, { quoted });
    return 'V2 latex image ✓';
  } catch (err) {
    // mathjax-node not installed — fall back to the codecogs pre-rendered URL
    const expr = 'e^{i\\pi} + 1 = 0';
    const generated = generateLatexContentV2(quoted, {
      text: '🧪 V2 LaTeX Image Test — codecogs fallback (mathjax-node unavailable):',
      expressions: [
        { latexExpression: expr, url: _codecogsUrl(expr), width: 180, height: 50 },
      ],
      headerText: 'LaTeX V2 Image (fallback)',
      footer: 'NEXORA-MD • base64 unifiedResponse • codecogs PNG — FIXED 2026-09-14: GenAILatexItem inline entities, re-verify',
    });
    await _relayGenerated(sock, jid, generated, { quoted });
    return 'V2 latex image — codecogs fallback (mathjax-node: ' + err.message + ')';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Combination generators (v0.3.18-r3 — code+table, map+table, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V1 Code + Table — code block followed by a results table.
 */
export async function testV1CodeWithTable(sock, jid, quoted) {
  const generated = generateCodeWithTable({
    code: [
      'const results = await db.query("SELECT * FROM plugins");',
      'console.log(results.length + " plugins loaded");',
    ].join('\n'),
    language: 'javascript',
    tableTitle: 'Query Results',
    tableHeaders: ['Plugin', 'Category', 'Status'],
    tableRows: [
      ['ping', 'general', '✅'],
      ['sticker', 'media', '✅'],
      ['daily', 'economy', '✅'],
    ],
  }, quoted, {
    headerText: '🧪 V1 Code+Table Combo',
    footer: 'NEXORA-MD • new combination generator',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 code+table ✓';
}

/**
 * V1 Map + Table — map card followed by a stats table.
 */
export async function testV1MapWithTable(sock, jid, quoted) {
  const generated = generateMapWithTable({
    map: {
      centerLatitude: 5.6037,
      centerLongitude: -0.1870,
      annotations: [
        { latitude: 5.6037, longitude: -0.1870, title: 'Accra', body: 'Ghana capital' },
      ],
    },
    tableTitle: 'City Stats',
    tableHeaders: ['Population', 'Area', 'Timezone'],
    tableRows: [['2.5M', '225 km²', 'GMT+0']],
  }, quoted, {
    headerText: '🧪 V1 Map+Table Combo',
    footer: 'NEXORA-MD • FIXED 2026-09-14: OSM tile + info + table — re-verify on device',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 map+table ✓';
}

/**
 * V1 Text + Inline Image — text followed by a single image.
 */
export async function testV1TextWithImage(sock, jid, quoted) {
  const generated = generateTextWithInlineImage(
    'Here is an inline image rendered natively:',
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'NEXORA Test Image', tapLinkUrl: 'https://github.com/boyde1317-byte' },
    quoted,
    {
      primitiveStyle: 'nixcode', headerText: '🧪 V1 Text+Image Combo', footer: 'NEXORA-MD' },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 text+image ✓';
}

/**
 * V1 Multi Inline Images — stacked image gallery.
 */
export async function testV1MultiImages(sock, jid, quoted) {
  const generated = generateMultiInlineImages([
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'Image 1' },
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'Image 2' },
  ], quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V1 Multi-Image Gallery',
    footer: 'NEXORA-MD • stacked inline images',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 multi-images ✓';
}

/**
 * V1 Grid Image + Table — image grid followed by a table.
 */
export async function testV1GridWithTable(sock, jid, quoted) {
  const generated = generateGridImageWithTable({
    gridImage: {
      gridImageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png',
      imageUrls: ['https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png'],
    },
    tableTitle: 'Gallery Stats',
    tableHeaders: ['Count', 'Resolution'],
    tableRows: [['1', '1080p']],
  }, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V1 Grid+Table Combo',
    footer: 'NEXORA-MD',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 grid+table ✓';
}

/**
 * V1 Dynamic + Table — animated content followed by a table.
 */
export async function testV1DynamicWithTable(sock, jid, quoted) {
  const generated = generateDynamicWithTable({
    dynamic: { type: 'GIF', url: 'https://media.giphy.com/media/example.gif', loopCount: 0 },
    tableTitle: 'GIF Info',
    tableHeaders: ['Type', 'Loop'],
    tableRows: [['GIF', 'Infinite']],
  }, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V1 Dynamic+Table Combo',
    footer: 'NEXORA-MD',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V1 dynamic+table ✓';
}

/**
 * V2 Code + Table — base64-encoded combo.
 */
export async function testV2CodeWithTable(sock, jid, quoted) {
  const generated = generateCodeWithTableV2({
    code: [
      '// V2 Code+Table — base64 unifiedResponse',
      "import { generateCodeWithTableV2 } from 'baileys';",
      "const result = generateCodeWithTableV2(params, quoted, opts);",
    ].join('\n'),
    language: 'javascript',
    tableTitle: 'V2 Features',
    tableHeaders: ['Generator', 'Format', 'Renders'],
    tableRows: [
      ['Code+Table V2', 'base64', '✅'],
      ['Map+Table V2', 'base64', '✅'],
      ['Text+Image V2', 'base64', '✅'],
    ],
  }, quoted, {
    headerText: '🧪 V2 Code+Table Combo',
    footer: 'base64 unifiedResponse — Meta AI format',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 code+table ✓';
}

/**
 * V2 Map + Table — base64-encoded combo.
 */
export async function testV2MapWithTable(sock, jid, quoted) {
  const generated = generateMapWithTableV2({
    map: {
      centerLatitude: 5.6037,
      centerLongitude: -0.1870,
      annotations: [
        { latitude: 5.6037, longitude: -0.1870, title: 'Accra' },
      ],
    },
    tableTitle: 'Location Stats',
    tableHeaders: ['City', 'Country'],
    tableRows: [['Accra', 'Ghana']],
  }, quoted, {
    headerText: '🧪 V2 Map+Table Combo',
    footer: 'NEXORA-MD • FIXED 2026-09-14: OSM tile + info + table (base64) — re-verify on device',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 map+table ✓';
}

/**
 * V2 Text + Inline Image — base64-encoded combo.
 */
export async function testV2TextWithImage(sock, jid, quoted) {
  const generated = generateTextWithInlineImageV2(
    'V2 text+image combo — base64 unifiedResponse:',
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'V2 Test Image' },
    quoted,
    {
      primitiveStyle: 'nixcode', headerText: '🧪 V2 Text+Image Combo', footer: 'NEXORA-MD' },
  );

  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 text+image ✓';
}

/**
 * V2 Multi Inline Images — base64-encoded gallery.
 */
export async function testV2MultiImages(sock, jid, quoted) {
  const generated = generateMultiInlineImagesV2([
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'V2 Image 1' },
    { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'V2 Image 2' },
  ], quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V2 Multi-Image Gallery',
    footer: 'NEXORA-MD • base64',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 multi-images ✓';
}

/**
 * V2 Grid Image + Table — base64-encoded combo.
 */
export async function testV2GridWithTable(sock, jid, quoted) {
  const generated = generateGridImageWithTableV2({
    gridImage: {
      gridImageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png',
      imageUrls: ['https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png'],
    },
    tableTitle: 'V2 Grid Stats',
    tableHeaders: ['Images', 'Format'],
    tableRows: [['1', 'base64']],
  }, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V2 Grid+Table Combo',
    footer: 'NEXORA-MD',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 grid+table ✓';
}

/**
 * V2 Dynamic + Table — base64-encoded combo.
 */
export async function testV2DynamicWithTable(sock, jid, quoted) {
  const generated = generateDynamicWithTableV2({
    dynamic: { type: 'GIF', url: 'https://media.giphy.com/media/example.gif' },
    tableTitle: 'V2 Dynamic Info',
    tableHeaders: ['Type', 'Format'],
    tableRows: [['GIF', 'base64']],
  }, quoted, { primitiveStyle: 'nixcode',
    headerText: '🧪 V2 Dynamic+Table Combo',
    footer: 'NEXORA-MD',
  });
  await _relayGenerated(sock, jid, generated, { quoted });
  return 'V2 dynamic+table ✓';
}

// Master test registry
// ─────────────────────────────────────────────────────────────────────────────

// ─── Moonson-proven AIRich combos (vendored NIXCODE builder) ─────────────────
// These replicate the exact multi-section payload composition Moonson ships in
// production: .ping (addProduct banner → addText × N → addTip → addSuggest)
// and .facebookdl (addVideo → addText → addTip → setFooter). Unlike the
// single-primitive generators above, AIRich stacks several primitives in ONE
// unifiedResponse message. Device-proven by Moonson + NIXCODE + itsliaaa.

export async function testMoonsonPingCombo(sock, jid, quoted) {
  const os = await import('node:os');
  const start = performance.now();
  await fetch('https://httpbin.org/get').catch(() => null);
  const apiLatency = (performance.now() - start).toFixed(0);

  const totalRam = os.totalmem();
  const usedRam  = totalRam - os.freemem();
  const ramPct   = ((usedRam / totalRam) * 100).toFixed(1);
  const cores    = os.cpus().length;
  const cpuModel = os.cpus()[0]?.model?.trim() || 'Unknown';

  const fmtRam = (b) => { const mb = b / 1024 / 1024; return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB'; };
  const bar = (p, size = 10) => '█'.repeat(Math.round((p / 100) * size)) + '░'.repeat(size - Math.round((p / 100) * size));

  const thumb = 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png';

  await new AIRich(sock)
    .addProduct({
      title:      'NEXORA-MD',
      brand:      'System Monitor',
      price:      apiLatency + ' ms',
      sale_price: 'Excellent',
      product_url: 'https://github.com/boyde1317-byte/NEXORA-MD',
      image_url:  thumb,
      icon_url:   thumb,
    })
    .addText(
      '## ◈ Latency\n\n' +
      '› API Ping : **' + apiLatency + ' ms**\n' +
      '› Uptime   : device-proven combo from Moonson .ping'
    )
    .addText(
      '## ◈ Memory\n\n' +
      '› Used : **' + fmtRam(usedRam) + '** / ' + fmtRam(totalRam) + '\n' +
      '› Load : `' + bar(ramPct) + '` ' + ramPct + '%'
    )
    .addText(
      '## ◈ Processor\n\n' +
      '› Model : ' + cpuModel + '\n' +
      '› Cores : ' + cores + ' core'
    )
    .addTip('Platform : ' + os.type() + ' ' + os.arch() + ' · Node.js : ' + process.version)
    .addSuggest(['.menu', '.ping', '.stats'])
    .send(jid, { quoted });
  return 'Moonson ping combo ✓';
}

/**
 * Moonson .facebookdl combo — addVideo + addText + addTip + setFooter.
 * addVideo emits a GenAIImaginePrimitive (ANIMATE) like Moonson ships.
 */
export async function testMoonsonFbCombo(sock, jid, quoted) {
  await new AIRich(sock)
    .addVideo('https://download.samplelib.com/mp4/sample-5s.mp4|5')
    .addText(
      '📝 **Description:**\nNEXORA test video — Moonson .facebookdl combo\n\n' +
      '🔗 **Link:** https://download.samplelib.com/mp4/sample-5s.mp4'
    )
    .addTip('_Tap the video to play_')
    .setFooter('© NEXORA-MD by Aizen')
    .send(jid, { quoted });
  return 'Moonson fb combo ✓';
}

export const RICH_TESTS = [
  // V1 generators (submessage-based)
  { id: 'v1table',    label: '📊 V1 Table',           fn: testV1Table,         group: 'V1' },
  { id: 'v1list',     label: '📋 V1 List',            fn: testV1List,          group: 'V1' },
  { id: 'v1code',     label: '💻 V1 Code (JS)',       fn: testV1Code,          group: 'V1' },
  { id: 'v1python',   label: '🐍 V1 Code (Python)',    fn: testV1Python,        group: 'V1' },
  { id: 'v1latex',    label: '∫ V1 LaTeX',             fn: testV1Latex,        group: 'V1' },
  { id: 'v1raw',      label: '🔧 V1 Raw Submessages',  fn: testV1Raw,           group: 'V1' },
  // V2 generators (base64 unifiedResponse — Meta AI format)
  { id: 'v2table',    label: '📊 V2 Table',           fn: testV2Table,         group: 'V2' },
  { id: 'v2code',     label: '💻 V2 Code (JS)',       fn: testV2Code,          group: 'V2' },
  { id: 'v2go',       label: '🐹 V2 Code (Go)',        fn: testV2Go,            group: 'V2' },
  // Link content
  { id: 'v1link',     label: '🔗 V1 Link+Cit',        fn: testV1Link,          group: 'Links' },
  { id: 'v2link',     label: '🔍 V2 Search Cit',       fn: testV2Link,         group: 'Links' },
  // Tokenizer / parser unit tests
  { id: 'tokenizer',  label: '🔬 Tokenizer V2',       fn: testTokenizerV2,    group: 'Unit' },
  { id: 'tablemeta',  label: '🔬 Table Metadata V2',   fn: testTableMetadataV2, group: 'Unit' },
  // Capture & relay
  { id: "reel",       label: "🎬 Reel Content",       fn: testReelContent,     group: "Reels" },
  { id: "reelstats",  label: "🎬 Reel + Stats Table", fn: testReelWithStats,   group: "Reels" },
  { id: "map",        label: "📍 Location Card",     fn: testMapContent,      group: "Location" },
  { id: "inlinevid",  label: "🎬 Inline Video+Table", fn: testInlineVideoWithStats, group: "Location" },
  { id: "inlineimg",  label: "🖼️ Inline Image+Table", fn: testInlineImageWithTable, group: "Images" },
  { id: "capture",    label: "🔄 Capture & Relay",   fn: testCaptureRelay,    group: "Capture" },
  // V2 generators (new — fork commit b9f5c84)
  { id: 'v2list',     label: '📋 V2 List',            fn: testV2List,          group: 'V2' },
  { id: 'v2latex',    label: '∫ V2 LaTeX',            fn: testV2Latex,        group: 'V2' },
  { id: 'v2map',      label: '📍 V2 Location Card',   fn: testV2Map,           group: 'V2' },
  { id: 'v2reel',     label: '🎬 V2 Reel Carousel',  fn: testV2Reel,          group: 'V2' },
  { id: 'v2reelstats',label: '🎬 V2 Reel + Stats',    fn: testV2ReelWithStats,  group: 'V2' },
  { id: 'v2imgtable', label: '🖼️ V2 Image+Table',   fn: testV2InlineImageWithTable, group: 'V2' },
  { id: 'v2vidtable', label: '🎬 V2 Video+Table',    fn: testV2InlineVideoWithStats, group: 'V2' },
  // GRID_IMAGE + DYNAMIC (new — fork commit b9f5c84)
  { id: 'v1grid',     label: '🖼️ V1 Grid Image',    fn: testV1GridImage,     group: 'Grid/Dynamic' },
  { id: 'v1dyn',      label: '🎞️ V1 Dynamic GIF',    fn: testV1Dynamic,       group: 'Grid/Dynamic' },
  { id: 'v2grid',     label: '🖼️ V2 Grid Image',    fn: testV2GridImage,     group: 'Grid/Dynamic' },
  { id: 'v2dyn',      label: '🎞️ V2 Dynamic Image',  fn: testV2Dynamic,       group: 'Grid/Dynamic' },
  // LaTeX image rendering (requires mathjax-node)
  { id: 'v1lateximg', label: '📐 V1 LaTeX Image',     fn: testV1LatexImage,   group: 'LaTeX Image' },
  { id: 'v2lateximg', label: '📐 V2 LaTeX Image',     fn: testV2LatexImage,   group: 'LaTeX Image' },
  // NEW: Combination generators (v0.3.18-r3)
  { id: 'v1codetable',  label: '💻 V1 Code+Table',     fn: testV1CodeWithTable,     group: 'Combos V1' },
  { id: 'v1maptable',   label: '📍 V1 Map+Table',      fn: testV1MapWithTable,      group: 'Combos V1' },
  { id: 'v1textimg',    label: '🖼️ V1 Text+Image',    fn: testV1TextWithImage,     group: 'Combos V1' },
  { id: 'v1multiimg',   label: '🖼️ V1 Multi-Images',  fn: testV1MultiImages,      group: 'Combos V1' },
  { id: 'v1gridtable',  label: '🖼️ V1 Grid+Table',    fn: testV1GridWithTable,     group: 'Combos V1' },
  { id: 'v1dyntable',   label: '🎞️ V1 Dynamic+Table', fn: testV1DynamicWithTable,  group: 'Combos V1' },
  { id: 'v2codetable',  label: '💻 V2 Code+Table',     fn: testV2CodeWithTable,     group: 'Combos V2' },
  { id: 'v2maptable',   label: '📍 V2 Map+Table',      fn: testV2MapWithTable,      group: 'Combos V2' },
  { id: 'v2textimg',    label: '🖼️ V2 Text+Image',    fn: testV2TextWithImage,     group: 'Combos V2' },
  { id: 'v2multiimg',   label: '🖼️ V2 Multi-Images',  fn: testV2MultiImages,      group: 'Combos V2' },
  { id: 'v2gridtable',  label: '🖼️ V2 Grid+Table',    fn: testV2GridWithTable,     group: 'Combos V2' },
  { id: 'v2dyntable',   label: '🎞️ V2 Dynamic+Table', fn: testV2DynamicWithTable,  group: 'Combos V2' },
  // Moonson-proven AIRich combos (multi-primitive unifiedResponse)
  { id: 'msping',      label: '🏓 Moonson Ping Combo', fn: testMoonsonPingCombo, group: 'Moonson' },
  { id: 'msfb',        label: '📘 Moonson FB Combo',    fn: testMoonsonFbCombo,   group: 'Moonson' },
];

export async function runRichTest(sock, jid, testId, quoted) {
  const test = RICH_TESTS.find(t => t.id === testId);
  if (!test) throw new Error('Unknown test: ' + testId);
  return test.fn(sock, jid, quoted);
}

export async function runAllRichTests(sock, jid, quoted) {
  const results = [];
  for (const test of RICH_TESTS) {
    try {
      const result = await test.fn(sock, jid, quoted);
      results.push({ id: test.id, label: test.label, ok: true, result });
    } catch (err) {
      results.push({ id: test.id, label: test.label, ok: false, result: err.message });
    }
    // Small delay between tests to avoid flooding
    await new Promise(r => setTimeout(r, 500));
  }
  return results;
}
