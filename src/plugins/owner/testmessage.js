/**
 * testmessage.js — owner-only interactive UI debug console.
 *
 * Rewritten to use the fork's full button API via interactiveKit:
 *   • selectMenu → pick which test to run from a native WA list
 *   • actionCard, mixedCard, copyResultCard, bottomSheetCard, offerCard
 *   • richTableCard, richCodeCard
 *   • Single specific test when args[0] is given (backward-compatible)
 *
 * DEVICE AUDIT 2026-09-13 (.testmessage all, real device, ~moonson4 chat):
 * Only device-PROVEN tests remain in this suite. Removed as proven
 * non-working (all rendered plain text, no native button):
 *   flow (needs a real Meta-registered flow token to render),
 *   subscribe, reminder, schedule, openchat, payment, reviewpay,
 *   location, address, signin, signup, amazon, custom, newsletter,
 *   phone (requestPhoneNumberMessage — renders only an inert 'requested
 *   phone number' system line; no tappable action, not shipped by
 *   Moonson/NIXCODE/itsliaaa either).
 * Proven working: quickreply, url, copy, select, bottomsheet, offer,
 *   table, code, codetable, maptable (experimental: caption-only), and
 *   the media combos (textimage/multiimages/gridtable/dynamictable —
 *   nixcode primitives).
 */
import { baileysBridge } from '../../core/baileysBridge.js';
import capabilities from '../../core/capabilities.js';
import {
  selectMenu, actionCard, mixedCard,
  copyResultCard, bottomSheetCard, offerCard,
  richTableCard, richCodeCard,
  codeTableCard, mapTableCard, textImageCard,
  multiImageCard, gridTableCard, dynamicTableCard,
} from '../../lib/interactiveKit.js';

// ─── Test runners ─────────────────────────────────────────────────────────────

async function runQuickReply(sock, m, prefix) {
  const p = prefix || '.';
  await actionCard(sock, m.from, {
    text:   '⚡ *QUICK REPLY TEST*\n\nTap a button — the bot will execute that command.',
    footer: 'quick_reply: { text, id }',
  }, [
    { label: 'Ping Bot',         cmd: `${p}ping` },
    { label: 'About Bot',        cmd: `${p}about` },
    { label: 'Browse Menus',     cmd: `${p}menulist` },
    { label: 'System Stats',     cmd: `${p}menu aiDynamic` },
  ], { quoted: m });
  return 'quick_reply ✓';
}

async function runCtaUrl(sock, m) {
  await mixedCard(sock, m.from, {
    text:   '🌐 *CTA URL TEST*\n\nButtons below open external URLs in the browser.',
    footer: 'cta_url: { text, url }',
  }, [
    { kind: 'url', label: 'WhatsApp',      url: 'https://wa.me/233533416608' },
    { kind: 'url', label: 'Channel',        url: 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326' },
    { kind: 'url', label: 'GitHub (Fork)',  url: 'https://github.com/boyde1317-byte/NEXORA-MD' },
  ], { quoted: m });
  return 'cta_url ✓';
}

async function runCtaCopy(sock, m) {
  await copyResultCard(sock, m.from, {
    text:       '*CTA COPY TEST*\n\nTap the button to copy the sample code.',
    footer:     'cta_copy: { text, copy }',
    copyLabel:  'Copy Sample Code',
    copyValue:  'const nexora = require("nexora-md"); nexora.start();',
    extraButtons: [{ text: 'Another Copy', copy: 'git clone https://github.com/boyde1317-byte/NEXORA-MD' }],
  }, { quoted: m });
  return 'cta_copy ✓';
}

async function runSingleSelect(sock, m, prefix) {
  const p = prefix || '.';
  await selectMenu(sock, m.from, {
    text:   '*SINGLE SELECT TEST*\n\nOpen the list to pick a category.',
    footer: 'single_select: { text, sections: [{title, rows}] }',
  }, 'Open Command Browser', [
    { title: 'General', rows: [
      { id: `${p}ping`,    title: 'Ping',    description: 'Measure bot latency' },
      { id: `${p}about`,   title: 'About',   description: 'System information' },
      { id: `${p}version`, title: 'Version', description: 'Runtime version details' },
    ]},
    { title: 'Utility', rows: [
      { id: `${p}encode`,   title: 'Base64 Encode',  description: 'Encode text to base64' },
      { id: `${p}decode`,   title: 'Base64 Decode',  description: 'Decode base64 text' },
      { id: `${p}checkchid`,title: 'Chat ID',        description: 'Get current chat JID' },
    ]},
    { title: 'Economy', rows: [
      { id: `${p}daily`,   title: 'Daily Reward', description: 'Claim your daily XP and coins' },
      { id: `${p}balance`, title: 'Balance',      description: 'Check your coin balance' },
    ]},
  ], [
    { kind: 'action', label: 'Full Menu',    cmd: `${p}menu` },
  ], { quoted: m });
  return 'single_select ✓';
}

async function runBottomSheet(sock, m, prefix) {
  const p = prefix || '.';
  await bottomSheetCard(sock, m.from, {
    text:   '*BOTTOM SHEET TEST*\n\nTap the button below to open the command sheet.\nAll rows collapse into a native WA modal.',
    footer: 'optionText + optionTitle → bottom_sheet overlay',
  }, 'Browse All Commands', 'NEXORA', [
    { text: 'Ping Bot',          id: `${p}ping` },
    { text: 'About',              id: `${p}about` },
    { text: 'Menu Styles',        id: `${p}menulist` },
    { text: 'Daily Reward',       id: `${p}daily` },
    { text: 'Encode Base64',      id: `${p}encode` },
    { text: 'Contact Developer',  url: 'https://wa.me/233533416608' },
    { text: 'Official Channel',   url: 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326' },
  ], { quoted: m });
  return 'bottom_sheet ✓';
}

async function runOffer(sock, m, prefix) {
  const p = prefix || '.';
  await offerCard(sock, m.from, {
    text:        '*OFFER BANNER TEST*\n\nThis card has a limited_time_offer banner at the top with an expiration countdown.',
    footer:      'offerText + offerUrl + offerCode + offerExpiry → limited_time_offer',
    offerText:   '🎁 Free Premium Access — Limited Time',
    offerUrl:    'https://wa.me/233533416608',
    offerCode:   'NEXORA-FREE-2026',
    offerExpiry: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // expires in 24h
    buttons: [
      { text: '💬 Contact Dev',   url:  'https://wa.me/233533416608' },
      { text: 'Copy Code',     copy: 'NEXORA-FREE-2026' },
      { text: '⚡ Claim Reward',  id:   `${p}daily` },
    ],
  }, { quoted: m });
  return 'offer_banner ✓';
}

async function runRichTable(sock, m) {
  await richTableCard(sock, m.from, {
    title:   '🧪 RICH TABLE TEST',
    headers: ['Feature', 'Status', 'Type'],
    rows: [
      ['quick_reply',     '✅ Active', 'quick_reply'],
      ['cta_url',         '✅ Active', 'cta_url'],
      ['cta_copy',        '✅ Active', 'cta_copy'],
      ['single_select',   '✅ Active', 'single_select'],
      ['bottom_sheet',    '✅ Active', 'optionText/Title'],
      ['limited_offer',   '✅ Active', 'offerText/Url/Code/Expiry'],
      ['richResponse',    capabilities.richResponse ? '✅ Yes' : '⚠️ No', 'botForwarded'],
      ['nativeFlow',      capabilities.nativeFlow   ? '✅ Yes' : '⚠️ No', 'interactiveMsg'],
    ],
    footer: 'NEXORA-MD itsliaaa 0.3.18-final fork',
  }, { quoted: m });
  return 'rich_table ✓';
}

async function runRichCode(sock, m) {
  const code = `// NEXORA-MD — itsliaaa 0.3.18-final fork
import { baileysBridge } from './src/core/baileysBridge.js';
import { mixedCard } from './src/lib/interactiveKit.js';

await mixedCard(sock, m.from, { text: 'Hello!', footer: 'NEXORA' }, [
  { kind: 'url',  label: '💬 Contact', url: 'https://wa.me/233533416608' },
  { kind: 'copy', label: '📋 Prefix',  value: '.' },
]);`;
  await richCodeCard(sock, m.from, {
    code,
    language:  'javascript',
    caption:   '🧪 RICH CODE TEST',
    footer:    'Syntax-highlighted code block via botForwardedMessage',
    copyable:  true,
  }, { quoted: m });
  return 'rich_code ✓';
}


// ─── New combo test runners (v0.3.18-r3) ─────────────────────────────────────

async function runCodeTable(sock, m) {
  await codeTableCard(sock, m.from, {
    code: 'const results = await db.query("SELECT * FROM plugins WHERE active = 1");\nconsole.log(results.length + " active plugins");',
    language: 'javascript',
    headers: ['Plugin', 'Category', 'Status'],
    rows: [['ping', 'general', '✅'], ['sticker', 'media', '✅'], ['daily', 'economy', '✅']],
    tableTitle: 'Active Plugins',
    headerText: '🧪 *CODE+TABLE TEST*',
    footer: 'Code block + results table combo',
  }, { quoted: m });
  return 'code+table ✓';
}

async function runMapTable(sock, m) {
  await mapTableCard(sock, m.from, {
    latitude: 5.6037,
    longitude: -0.1870,
    annotations: [{ latitude: 5.6037, longitude: -0.1870, title: 'Accra' }],
    headers: ['Population', 'Area', 'Timezone'],
    rows: [['2.5M', '225 km²', 'GMT+0']],
    tableTitle: 'City Stats',
    headerText: '🧪 *MAP+TABLE TEST*',
    footer: 'Map card + stats table combo — EXPERIMENTAL: maps render caption-only on current clients',
  }, { quoted: m });
  return 'map+table ✓';
}

async function runTextImage(sock, m) {
  await textImageCard(sock, m.from, {
    text: 'This is a text + inline image combo test:',
    imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png',
    caption: 'NEXORA Test Image',
    tapLinkUrl: 'https://github.com/boyde1317-byte',
    headerText: '🧪 *TEXT+IMAGE TEST*',
    footer: 'Text + inline image combo',
    primitiveStyle: 'nixcode',
  }, { quoted: m });
  return 'text+image ✓';
}

async function runMultiImages(sock, m) {
  await multiImageCard(sock, m.from, {
    images: [
      { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'Image 1' },
      { imageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png', imageText: 'Image 2' },
    ],
    headerText: '🧪 *MULTI-IMAGE TEST*',
    footer: 'Stacked inline image gallery',
    primitiveStyle: 'nixcode',
  }, { quoted: m });
  return 'multi-images ✓';
}

async function runGridTable(sock, m) {
  await gridTableCard(sock, m.from, {
    gridImageUrl: 'https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png',
    imageUrls: ['https://cdn.nekos.life/wallpaper/EU3bZjTsl9Q.png'],
    headers: ['Count', 'Resolution'],
    rows: [['1', '1080p']],
    tableTitle: 'Gallery Stats',
    headerText: '🧪 *GRID+TABLE TEST*',
    footer: 'Image grid + data table combo',
    primitiveStyle: 'nixcode',
  }, { quoted: m });
  return 'grid+table ✓';
}

async function runDynamicTable(sock, m) {
  await dynamicTableCard(sock, m.from, {
    dynamicType: 'GIF',
    dynamicUrl: 'https://media.giphy.com/media/example.gif',
    headers: ['Type', 'Loop'],
    rows: [['GIF', 'Infinite']],
    tableTitle: 'GIF Info',
    headerText: '🧪 *DYNAMIC+TABLE TEST*',
    footer: 'Animated content + table combo',
    primitiveStyle: 'nixcode',
  }, { quoted: m });
  return 'dynamic+table ✓';
}

// ─── New button type test runners (v0.3.18-r4) ──────────────────────────────


// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  name: 'testmessage',
  aliases: ['testmsg', 'msgdebug'],
  category: 'owner',
  description: 'Test all interactive message types via a native WA list picker.',
  permissions: { owner: true },
  cooldown: 3000,

  execute: async ({ sock, m, args, prefix }) => {
    const p    = prefix || '.';
    const type = args[0]?.toLowerCase();

    const ALL_TYPES = [
      'quickreply', 'url', 'copy', 'select', 'bottomsheet',
      'offer', 'table', 'code',
      'codetable', 'maptable', 'textimage', 'multiimages', 'gridtable', 'dynamictable',
      'all',
    ];

    // ── No arg — show a single_select test type picker ────────────────────
    if (!type) {
      return await selectMenu(sock, m.from, {
        text:   '🧪 *✦ NEXORA ✦*\n\nSelect a test to run:',
        footer: `${capabilities.nativeFlow ? '✅' : '⚠️'} nativeFlow | ${capabilities.richResponse ? '✅' : '⚠️'} richResponse`,
      }, '⚙️ Choose Test Type', [
        { title: 'Button Types', rows: [
          { id: `${p}testmessage quickreply`,  title: '⚡ Quick Reply',      description: '{ text, id } → trigger a bot command' },
          { id: `${p}testmessage url`,          title: '🌐 CTA URL',          description: '{ text, url } → open an external link' },
          { id: `${p}testmessage copy`,         title: '📋 CTA Copy',         description: '{ text, copy } → copy to clipboard' },
          { id: `${p}testmessage select`,       title: '📋 Single Select',    description: '{ text, sections } → list picker' },
          { id: `${p}testmessage bottomsheet`,  title: '📑 Bottom Sheet',     description: 'optionText/optionTitle modal overlay' },
          { id: `${p}testmessage offer`,        title: '🎁 Offer Banner',     description: 'offerText/offerUrl banner overlay' },
        ]},
        { title: 'Rich Content', rows: [
          { id: `${p}testmessage table`,       title: '📊 Rich Table',       description: 'Native WA table (botForwardedMessage)' },
          { id: `${p}testmessage code`,        title: '💻 Rich Code',        description: 'Syntax-highlighted code block' },
        ]},
        { title: 'New Combos (v0.3.18-r3)', rows: [
          { id: `${p}testmessage codetable`,    title: '💻 Code+Table',       description: 'Code block + results table combo' },
          { id: `${p}testmessage maptable`,     title: '📍 Map+Table',        description: 'Map card + stats table combo' },
          { id: `${p}testmessage textimage`,    title: '🖼️ Text+Image',     description: 'Text + inline image combo' },
          { id: `${p}testmessage multiimages`,  title: '🖼️ Multi-Images',   description: 'Stacked inline image gallery' },
          { id: `${p}testmessage gridtable`,    title: '🖼️ Grid+Table',     description: 'Image grid + data table combo' },
          { id: `${p}testmessage dynamictable`, title: '🎞️ Dynamic+Table',  description: 'Animated content + table combo' },
        ]},
        { title: 'Run', rows: [
          { id: `${p}testmessage all`,          title: '🚀 Run All Tests',   description: 'Execute every test in sequence' },
        ]},
      ], [], { quoted: m });
    }

    if (!ALL_TYPES.includes(type)) {
      return await m.reply.error(`Unknown test: *"${type}"*\n\nValid: ${ALL_TYPES.join(', ')}`);
    }

    // ── Run specific test or all ───────────────────────────────────────────
    const results = [];
    const run = async (fn) => { try { results.push(await fn()); } catch (e) { results.push(`✗ ${e.message}`); } };

    if (type === 'all') {
      await m.reply('🚀 *Running all tests...*');
      await run(() => runQuickReply(sock, m, p));
      await run(() => runCtaUrl(sock, m));
      await run(() => runCtaCopy(sock, m));
      await run(() => runSingleSelect(sock, m, p));
      await run(() => runBottomSheet(sock, m, p));
      await run(() => runOffer(sock, m, p));
      await run(() => runRichTable(sock, m));
      await run(() => runRichCode(sock, m));
      await run(() => runCodeTable(sock, m));
      await run(() => runMapTable(sock, m));
      await run(() => runTextImage(sock, m));
      await run(() => runMultiImages(sock, m));
      await run(() => runGridTable(sock, m));
      await run(() => runDynamicTable(sock, m));
      return await m.reply(`✅ *All tests complete!*\n\n${results.join('\n')}`);
    }

    const runners = {
      quickreply:   () => runQuickReply(sock, m, p),
      url:          () => runCtaUrl(sock, m),
      copy:         () => runCtaCopy(sock, m),
      select:       () => runSingleSelect(sock, m, p),
      bottomsheet:  () => runBottomSheet(sock, m, p),
      offer:        () => runOffer(sock, m, p),
      table:        () => runRichTable(sock, m),
      code:         () => runRichCode(sock, m),
      codetable:    () => runCodeTable(sock, m),
      maptable:     () => runMapTable(sock, m),
      textimage:    () => runTextImage(sock, m),
      multiimages:  () => runMultiImages(sock, m),
      gridtable:    () => runGridTable(sock, m),
      dynamictable: () => runDynamicTable(sock, m),
    };

    const result = await runners[type]();
    await m.reply(`✅ *Test complete:* ${result}`);
  },
};
