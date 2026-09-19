/**
 * @file src/lib/interactiveKit.js
 * Context-aware interactive message dispatcher for NEXORA-MD.
 *
 * Maps task semantics → correct fork button type, then dispatches via
 * baileysBridge.sendNativeFlow with a graceful plain-text fallback.
 *
 * BUTTON TYPE SEMANTICS (fork's prepareNativeFlowButtons — 26 types):
 *
 * Core buttons:
 *   quick_reply   { text, id }           → run a bot command on tap
 *   cta_url       { text, url, useWebview? } → open an external URL
 *   cta_copy      { text, copy }          → copy a value to clipboard
 *   cta_call      { text, call }          → dial a phone number
 *   single_select { text, sections }      → open a list picker / dropdown
 *
 * Location/phone buttons:
 *   cta_request_location { location }     → request user's location
 *   cta_request_phone     { phone }        → request user's phone number
 *   send_location         { sendLocation } → send a location pin
 *   cta_address           { address, addressTitle?, addressDescription?, addressForm? }
 *   cta_copy_address      { copyAddress }  → copy an address to clipboard
 *
 * Flow/auth buttons:
 *   flow           { flow: { token, id, ctaText, action, actionPayload, callback, version, expiresAt, xToken } }
 *   cta_sign_in    { signIn: { token, expiresAt } }
 *   cta_sign_up   { signUp: { token, expiresAt } }
 *   cta_sign_contract { signContract: { token, expiresAt } }
 *
 * Payment buttons:
 *   cta_payment              { payment: { token, amount, currency, reference } }
 *   cta_complete_payment     { completePayment: { token, reference } }
 *   cta_review_and_pay       { reviewAndPay: { orderId, token, reference } }
 *   cta_payment_verification { paymentVerification: { token, reference } }
 *
 * Social/utility buttons:
 *   cta_subscribe  { subscribe: { id, expiration } }
 *   cta_reminder   { reminder: { id, title, time } }
 *   cta_open_chat  { openChat: { jid, message } }
 *   cta_schedule   { schedule: { title, description, startTime, endTime } }
 *   cta_amazon_link { amazonLink: { url } }
 *   cta_delete_message { deleteMessage: { id } }
 *   target         { targetCta: { text } }
 *   custom (raw)  { name, paramsJson }     → pass-through to nativeFlow
 *
 * Message-level overlays:
 *   bottom_sheet    optionText/optionTitle props → collapse all rows into a WA modal sheet
 *   limited_time_offer  offerText/offerUrl/offerCode/offerExpiration → promo banner
 *
 * Every button also accepts an optional `icon` field (uppercase string).
 *
 * RICH CONTENT (botForwardedMessage / richResponseMessage):
 *   richTableCard → native WA table bubble (falls back to ASCII)
 *   richCodeCard  → syntax-highlighted code block (falls back to cta_copy card)
 *
 * Every exported function falls back to sock.sendMessage({ text }) so commands
 * never go silent even on clients that don't support interactive messages.
 *
 * Usage in a plugin:
 *   import { mixedCard, selectMenu, richTableCard, copyResultCard } from '../lib/interactiveKit.js'
 */

import capabilities from '../core/capabilities.js';
import { baileysBridge } from '../core/baileysBridge.js';
import { buildAdReplyContext } from './waUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** WA nativeFlow allows a max of 10 buttons per message. */
const cap = (arr) => arr.slice(0, 10);

/**
 * Smart dispatch — tries nativeFlow first, then plain text.
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {object} payload  Passed directly to baileysBridge.sendNativeFlow
 * @param {object} [opts]
 */
async function _send(sock, jid, payload, opts = {}) {
  // Extract contextInfo so it's forwarded on the plain-text fallback path
  // but NOT passed to sendNativeFlow (which doesn't support it).
  const { contextInfo, ...nativePayload } = payload;
  if (!capabilities.nativeFlow) {
    return sock.sendMessage(jid, {
      text: payload.text || '',
      ...(contextInfo ? { contextInfo } : {}),
    }, opts);
  }
  try {
    return await baileysBridge.sendNativeFlow(sock, jid, nativePayload, opts);
  } catch (err) {
    console.warn('[interactiveKit] nativeFlow failed, plain-text fallback:', err.message);
    return sock.sendMessage(jid, {
      text: payload.text || '',
      ...(contextInfo ? { contextInfo } : {}),
    }, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ACTION CARD — quick_reply buttons that trigger bot commands
//    Best for: command navigations, post-result follow-ups, confirmations.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a nativeFlow card with quick_reply buttons.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, title?: string, image?: Buffer }} content
 * @param {Array<{ label: string, cmd: string }>} actions
 * @param {object} [opts]
 *
 * @example
 * await actionCard(sock, m.from, { text: 'Daily claimed!', footer: 'NEXORA' }, [
 *   { label: '💰 Check Balance', cmd: `${prefix}balance` },
 *   { label: '🏆 Leaderboard',   cmd: `${prefix}top` },
 * ], { quoted: m });
 */
export async function actionCard(sock, jid, content, actions, opts = {}) {
  const buttons = cap(actions.map(a => ({ text: a.label, id: a.cmd, ...(a.icon ? { icon: a.icon } : {}) })));
  return _send(sock, jid, { ...content, buttons }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b. ACTION CARD + AD REPLY — quick_reply buttons AND an externalAdReply
//     thumbnail banner in a single message.
//     `sendNativeFlow`'s declarative buttons have no contextInfo passthrough
//     (see baileysBridge.sendNativeFlow / menu/types/nativeFlow.js, which
//     treats nativeFlow-buttons and adReply-banner as separate fallback
//     tiers, never combined). `sendInteractive` builds the interactiveMessage
//     proto by hand and DOES expose `contextInfo` (supports externalAdReply)
//     alongside real nativeFlowMessage buttons, so this goes through that
//     path instead — one relayMessage call, one message on screen.
//     Falls back to a plain adReply + quick_reply text message if the
//     interactive proto path fails on the client.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, title?: string, thumbnail?: * }} content
 *          thumbnail: optional per-card header image (Buffer/{url}/URL string);
 *          defaults to the same high-quality brand image the menu uses.
 * @param {Array<{ label: string, cmd: string }>} actions
 * @param {import('./waUtils.js').AdReplyOpts} ad   externalAdReply card (title/body/thumbnail)
 * @param {object} [opts]
 *
 * @example
 * await actionCardWithAd(sock, m.from, { text: 'Public mode enabled.', footer: 'Setting saved' }, [
 *   { label: '🔒 Switch to Self', cmd: `${prefix}self` },
 * ], { title: '🌐 PUBLIC MODE', body: 'Setting saved', thumbnail }, { quoted: m });
 */
export async function actionCardWithAd(sock, jid, content, actions, ad, opts = {}) {
  const nativeButtons = cap(actions).map(a => ({
    name:   'quick_reply',
    params: { display_text: a.label, id: a.cmd },
  }));
  const contextInfo = buildAdReplyContext(ad);

  try {
    return await baileysBridge.sendInteractive(sock, jid, {
      body:    content.text,
      footer:  content.footer || '',
      header:  content.title ? { title: content.title } : undefined,
      buttons: nativeButtons,
      contextInfo,
    }, opts);
  } catch (err) {
    console.warn('[interactiveKit.actionCardWithAd] sendInteractive failed, adReply+text fallback:', err.message);
    // Fallback: at least keep the ad banner, drop to plain-text buttons list
    // (single message; loses tappable buttons but not the thumbnail card).
    const buttonList = actions.map(a => `• ${a.label}: ${a.cmd}`).join('\n');
    return sock.sendMessage(jid, {
      text: `${content.text}${buttonList ? `\n\n${buttonList}` : ''}`,
      contextInfo,
    }, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LINK CARD — cta_url buttons for external URLs
//    Best for: dev contact, channel links, docs, source repos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, title?: string, thumbnail?: * }} content
 *          thumbnail: optional per-card header image (Buffer/{url}/URL string);
 *          defaults to the same high-quality brand image the menu uses.
 * @param {Array<{ label: string, url: string }>} links
 * @param {object} [opts]
 */
export async function linkCard(sock, jid, content, links, opts = {}) {
  const buttons = cap(links.map(l => ({ text: l.label, url: l.url, ...(l.useWebview != null ? { useWebview: l.useWebview } : {}), ...(l.icon ? { icon: l.icon } : {}) })));
  return _send(sock, jid, { ...content, buttons }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COPY RESULT CARD — cta_copy button for copyable outputs
//    Best for: base64 results, generated codes, session strings, API outputs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, copyLabel?: string, copyValue: string, extraButtons?: [] }} content
 * @param {object} [opts]
 *
 * @example
 * await copyResultCard(sock, m.from, {
 *   text:       'dGhpcyBpcyBiYXNlNjQ=',
 *   copyLabel:  '📋 Copy Base64',
 *   copyValue:  'dGhpcyBpcyBiYXNlNjQ=',
 *   footer:     'BASE64 ENCODED',
 *   extraButtons: [{ text: '🔁 Decode', id: `${prefix}base64 decode <result>` }],
 * }, { quoted: m });
 */
export async function copyResultCard(sock, jid, { text, footer, copyLabel = '📋 Copy Result', copyValue, extraButtons = [], icon }, opts = {}) {
  const buttons = cap([
    { text: copyLabel, copy: copyValue, ...(icon ? { icon } : {}) },
    ...extraButtons,
  ]);
  return _send(sock, jid, { text, footer, buttons }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MIXED CARD — combine quick_reply / cta_url / cta_copy / cta_call freely
//    Best for: about page, version info, multi-purpose command results.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, title?: string, image?: Buffer }} content
 * @param {Array<
 *   | { kind: 'action', label: string, cmd: string }
 *   | { kind: 'url',    label: string, url: string }
 *   | { kind: 'copy',   label: string, value: string }
 *   | { kind: 'call',   label: string, phone: string }
 * >} specs
 * @param {object} [opts]
 *
 * @example
 * await mixedCard(sock, m.from, { text: body }, [
 *   { kind: 'url',    label: '💬 Contact Dev',  url:   'https://wa.me/233533416608' },
 *   { kind: 'copy',   label: '📋 Copy Prefix',  value: '.' },
 *   { kind: 'action', label: '🤖 System Stats', cmd:   '.menu aiDynamic' },
 * ], { quoted: m });
 */
export async function mixedCard(sock, jid, content, specs, opts = {}) {
  const buttons = cap(specs.map(s => {
    const icon = s.icon;
    switch (s.kind) {
      // Core buttons
      case 'url':         return { text: s.label, url: s.url, ...(s.useWebview != null ? { useWebview: s.useWebview } : {}), ...(icon ? { icon } : {}) };
      case 'copy':        return { text: s.label, copy: s.value, ...(icon ? { icon } : {}) };
      case 'call':        return { text: s.label, call: s.phone, ...(icon ? { icon } : {}) };
      case 'action':      return { text: s.label, id: s.cmd, ...(icon ? { icon } : {}) };
      // Location/phone buttons
      case 'location':    return { text: s.label, location: true, ...(icon ? { icon } : {}) };
      case 'phone':       return { text: s.label, phone: true, ...(icon ? { icon } : {}) };
      case 'sendLocation': return { text: s.label, sendLocation: s.location || true, ...(icon ? { icon } : {}) };
      case 'address':     return { text: s.label, address: true, addressTitle: s.addressTitle, addressDescription: s.addressDescription, addressForm: s.addressForm, ...(icon ? { icon } : {}) };
      case 'copyAddress': return { text: s.label, copyAddress: s.copyAddress, ...(icon ? { icon } : {}) };
      // Flow/auth buttons
      case 'flow':        return { text: s.label, flow: s.flow, ...(icon ? { icon } : {}) };
      case 'signIn':      return { text: s.label, signIn: s.signIn, ...(icon ? { icon } : {}) };
      case 'signUp':      return { text: s.label, signUp: s.signUp, ...(icon ? { icon } : {}) };
      case 'signContract': return { text: s.label, signContract: s.signContract, ...(icon ? { icon } : {}) };
      // Payment buttons
      case 'payment':     return { text: s.label, payment: s.payment, ...(icon ? { icon } : {}) };
      case 'completePayment': return { text: s.label, completePayment: s.completePayment, ...(icon ? { icon } : {}) };
      case 'reviewAndPay': return { text: s.label, reviewAndPay: s.reviewAndPay, ...(icon ? { icon } : {}) };
      case 'paymentVerification': return { text: s.label, paymentVerification: s.paymentVerification, ...(icon ? { icon } : {}) };
      // Social/utility buttons
      case 'subscribe':   return { text: s.label, subscribe: s.subscribe, ...(icon ? { icon } : {}) };
      case 'reminder':    return { text: s.label, reminder: s.reminder, ...(icon ? { icon } : {}) };
      case 'openChat':    return { text: s.label, openChat: s.openChat, ...(icon ? { icon } : {}) };
      case 'schedule':    return { text: s.label, schedule: s.schedule, ...(icon ? { icon } : {}) };
      case 'amazonLink':  return { text: s.label, amazonLink: s.amazonLink, ...(icon ? { icon } : {}) };
      case 'deleteMessage': return { text: s.label, deleteMessage: s.deleteMessage, ...(icon ? { icon } : {}) };
      case 'target':      return { text: s.label, targetCta: s.targetCta, ...(icon ? { icon } : {}) };
      // Custom/raw pass-through
      case 'custom':      return { name: s.name, paramsJson: s.paramsJson };
      // Default: quick_reply (backward compat)
      default:            return { text: s.label, id: s.cmd, ...(icon ? { icon } : {}) };
    }
  }));
  return _send(sock, jid, { ...content, buttons }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SINGLE-SELECT MENU — list picker / dropdown
//    Best for: category pickers, command browsers, multi-option settings,
//              lookup type selection (e.g. checkwa: check ban / check status).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string, title?: string, thumbnail?: * }} content
 *          thumbnail: optional per-card header image (Buffer/{url}/URL string);
 *          defaults to the same high-quality brand image the menu uses.
 * @param {string} pickerLabel           Label on the list-opener button
 * @param {Array<{
 *   title: string,
 *   rows: Array<{ id: string, title: string, description?: string }>
 * }>} sections
 * @param {Array<
 *   | { kind: 'action', label: string, cmd: string }
 *   | { kind: 'url',    label: string, url: string }
 * >} [sideButtons]   Additional quick_reply / url buttons alongside the picker
 * @param {object} [opts]
 *
 * @example
 * await selectMenu(sock, m.from, { text: 'Choose an action:' }, '⚙️ Options', [
 *   { title: 'Anti-Link', rows: [
 *     { id: '.antilink on',  title: '✅ Enable',  description: 'Block all links' },
 *     { id: '.antilink off', title: '❌ Disable', description: 'Allow links' },
 *   ]}
 * ], [], { quoted: m });
 */
export async function selectMenu(sock, jid, content, pickerLabel, sections, sideButtons = [], opts = {}) {
  // Build a single_select picker button in buttonsMessage format.
  // This used to go through sendNativeFlow (nativeFlowMessage), which many
  // WhatsApp client versions reject with "unsupported message type". The
  // single_select mechanism works fine inside buttonsMessage (buttonsMessage
  // is the more widely-supported proto), so we route through sendButtonsCard
  // instead — same picker UX, much better compatibility.
  const { brand } = await import('../menu/types/buttonsCard.js');

  // Flatten sections into a single_select button
  const allRows = sections.flatMap(s =>
    s.rows.map(r => ({
      title:       r.title,
      description: r.description || '',
      id:          r.id,
    }))
  );

  const pickerButton = {
    buttonText: { displayText: pickerLabel },
    buttonId:  'select_menu',
    type:      1,
    nativeFlowInfo: {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: 'Select',
        sections: sections.map(s => ({
          title: s.title,
          rows:  s.rows.map(r => ({
            title:       r.title,
            description: r.description || '',
            id:          r.id,
          })),
        })),
      }),
    },
  };

  const sideBtns = sideButtons.map(s => {
    if (s.kind === 'url') {
      return { displayText: s.label, id: s.url, type: 1 };
    }
    return { displayText: s.label, id: s.cmd, type: 1 };
  });

  const buttons = cap([pickerButton, ...sideBtns]);

  // ── Header thumbnail ──────────────────────────────────────────────────
  // The single_select card renders as a buttonsMessage with a location
  // header (headerType 6). Without a jpegThumbnail that header renders
  // blank — the exact same use case as the menu, so it gets the exact
  // same brand image (imageManager style 5), unless the caller passes
  // their own thumbnail (e.g. a song cover for .play pickers).
  let thumbnail = content.thumbnail || opts.thumbnail || null;
  if (!thumbnail) {
    try {
      const { imageManager } = await import('../images/imageManager.js');
      const imgData = await imageManager.getMenuImage(5);
      if (imgData?.buffer) thumbnail = imgData.buffer;
      else if (imgData?.source?.startsWith?.('http')) thumbnail = imgData.source;
    } catch (_) { /* fall through to static asset */ }
    if (!thumbnail) {
      const { ASSET_URLS } = await import('../assets/assetUrls.js');
      thumbnail = ASSET_URLS.thumbnail;
    }
  }
  const { thumbnail: _ignored, ...relayOpts } = opts;

  return await baileysBridge.sendButtonsCard(sock, jid, {
    body:    content.text,
    footer:  content.footer || '',
    title:   content.title,
    subtitle: content.subtitle,
    thumbnail,
    buttons,
  }, relayOpts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. BOTTOM SHEET CARD — collapses rows into a native WA modal sheet
//    Best for: large command lists, settings menus, bulk item selections.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string }} content
 * @param {string} sheetButtonLabel   Text on the toggle button that opens the sheet
 * @param {string} sheetTitle         Title shown at the top of the open sheet modal
 * @param {Array<{ text: string, id?: string, url?: string, copy?: string }>} sheetRows
 * @param {object} [opts]
 *
 * @example
 * await bottomSheetCard(sock, m.from, { text: body }, '📋 Browse Commands', 'NEXORA', [
 *   { text: 'Ping Bot',     id:  '.ping' },
 *   { text: 'System Stats', id:  '.menu aiDynamic' },
 *   { text: 'Dev Contact',  url: 'https://wa.me/233533416608' },
 * ], { quoted: m });
 */
export async function bottomSheetCard(sock, jid, content, sheetButtonLabel, sheetTitle, sheetRows, opts = {}) {
  const buttons = cap(sheetRows);
  return _send(sock, jid, {
    ...content,
    buttons,
    optionText:  sheetButtonLabel,
    optionTitle: sheetTitle,
  }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. OFFER BANNER CARD — limited_time_offer overlay
//    Best for: premium features, promo announcements, limited-availability items.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{
 *   text:        string,
 *   footer?:     string,
 *   image?:      Buffer,
 *   offerText:   string,
 *   offerUrl?:   string,
 *   offerCode?:  string,
 *   offerExpiry?: number,   // Unix timestamp (seconds) when the offer expires
 *   buttons:     Array
 * }} content
 * @param {object} [opts]
 *
 * @example
 * await offerCard(sock, m.from, {
 *   text:        '*Limited time!*

Premium features at no cost.',
 *   footer:      'NEXORA',
 *   offerText:   '🎁 Free Premium Access — Limited Time',
 *   offerUrl:    'https://wa.me/233533416608',
 *   offerCode:   'NEXORA-FREE-2026',
 *   offerExpiry: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
 *   buttons: [
 *     { text: '💬 Contact Dev',  url:  'https://wa.me/233533416608' },
 *     { text: 'Copy Code',       copy: 'NEXORA-FREE-2026' },
 *     { text: '⚡ Claim Reward',  id:   `${prefix}daily` },
 *   ],
 * }, { quoted: m });
 */
export async function offerCard(sock, jid, content, opts = {}) {
  const buttons = cap(content.buttons || []);
  return _send(sock, jid, { ...content, buttons }, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. RICH TABLE CARD — native WA table bubble (botForwardedMessage)
//    Best for: structured lookup results, system stats, data comparisons.
//    Falls back to an ASCII table card with action buttons.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{
 *   title:     string,
 *   headers?:  string[],
 *   rows:      string[][],
 *   footer?:   string,
 *   buttons?:  Array<{ kind: string, label: string, cmd?: string, url?: string, value?: string }>
 * }} opts
 * @param {object} [sendOptions]
 *
 * @example
 * await richTableCard(sock, m.from, {
 *   title:   '🔎 BAN CHECK',
 *   headers: ['Field', 'Value'],
 *   rows:    [['Number', '+1234'], ['Status', '✅ Clean']],
 *   footer:  'NEXORA',
 *   buttons: [{ kind: 'action', label: '🔁 Check Another', cmd: '.checkwa' }],
 * }, { quoted: m });
 */
export async function richTableCard(sock, jid, { title, headers, rows, footer, buttons = [] }, sendOptions = {}) {
  if (capabilities.richResponse) {
    try {
      const tableRows = [
        ...(headers ? [{ items: headers.map(String), isHeading: true }] : []),
        ...rows.map(r => ({ items: r.map(String) })),
      ];
      // The fork's prepareRichResponseMessage handles flat `table` (array of
      // arrays) in its else branch — auto-marks the first row as heading.
      // We use the richResponse submessage path instead for explicit isHeading
      // control and to combine table + text in a single rich response.
      await baileysBridge.sendRichResponse(sock, jid, {
        richResponse: [
          { title, table: tableRows },
        ],
        footerText: footer || '',
      }, sendOptions);
      if (buttons.length > 0) {
        return await mixedCard(sock, jid, { text: footer || title }, buttons, sendOptions);
      }
      return;
    } catch (err) {
      console.warn('[interactiveKit.richTableCard] richResponse failed, ASCII fallback:', err.message);
    }
  }
  // ASCII table fallback
  const allRows = [...(headers ? [headers] : []), ...rows];
  const widths = (allRows[0] || []).map((_, ci) =>
    Math.min(32, Math.max(...allRows.map(r => String(r[ci] ?? '').length), 4))
  );
  const sep  = c => widths.map(w => c.repeat(w + 2)).join('┼');
  const fmt  = row => '│' + row.map((v, ci) => ` ${String(v ?? '').slice(0, widths[ci]).padEnd(widths[ci])} `).join('│') + '│';
  const lines = [
    `📊 *${title}*`,
    '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐',
    ...(headers ? [fmt(headers), '├' + sep('─') + '┤'] : []),
    ...rows.map(fmt),
    '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘',
    ...(footer ? [`\n_${footer}_`] : []),
  ];
  const text = lines.join('\n');
  if (buttons.length > 0) {
    return mixedCard(sock, jid, { text }, buttons, sendOptions);
  }
  return sock.sendMessage(jid, { text }, sendOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. RICH CODE CARD — syntax-highlighted code block (botForwardedMessage)
//    Best for: code generation results, debug output, generated scripts.
//    Falls back to monospace text + cta_copy button.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} sock
 * @param {string} jid
 * @param {{ code: string, language?: string, caption?: string, footer?: string, copyable?: boolean }} opts
 * @param {object} [sendOptions]
 */
export async function richCodeCard(sock, jid, { code, language = 'javascript', caption, footer, copyable = true }, sendOptions = {}) {
  if (capabilities.richResponse) {
    try {
      // tokenizeCode from the fork — lazy import, falls through to fallback if unavailable
      const { tokenizeCode } = await import('baileys/lib/Utils/rich-message-utils.js');
      const codeBlocks = tokenizeCode(code, language);
      await baileysBridge.sendRichResponse(sock, jid, {
        richResponse: [
          ...(caption ? [{ text: caption }] : []),
          { code: codeBlocks, language },
        ],
        footerText: footer || '',
      }, sendOptions);
      if (copyable && code.length <= 4096) {
        return copyResultCard(sock, jid, {
          text:      footer || `Tap below to copy the ${language} snippet:`,
          copyLabel: '📋 Copy Code',
          copyValue: code,
        }, sendOptions);
      }
      return;
    } catch (err) {
      console.warn('[interactiveKit.richCodeCard] richCode fallback:', err.message);
    }
  }
  // Fallback: monospace + copy button
  const truncated = code.length > 3000 ? code.slice(0, 2997) + '…' : code;
  const text = `${caption ? `*${caption}*\n\n` : ''}\`\`\`\n${truncated}\n\`\`\``;
  if (copyable && code.length <= 4096) {
    return copyResultCard(sock, jid, { text, footer, copyLabel: '📋 Copy Code', copyValue: code }, sendOptions);
  }
  return sock.sendMessage(jid, { text }, sendOptions);
}


// ─────────────────────────────────────────────────────────────────────────────
// 10. RICH CAROUSEL CARD — native WA carousel (botForwardedMessage)
//     Best for: products, posts, item lists.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} sock
 * @param {string} jid
 * @param {Array<{ title: string, text: string }>} items
 * @param {object} [sendOptions]
 */
export async function richCarouselCard(sock, jid, items, sendOptions = {}) {
  if (capabilities.richResponse) {
    // FORK DISPATCH: { items: [...] } alone does NOT trigger the fork's rich
    // response branch (only code/links/table/richResponse do). Must wrap in
    // richResponse array so prepareRichResponseMessage processes each submessage.
    const mappedItems = items.map(i => ({
      title: i.title,
      text: i.text,
    }));
    return await baileysBridge.sendRichResponse(sock, jid, {
      richResponse: [{ items: mappedItems }],
    }, sendOptions);
  }
  const text = items.map(i => `*├ ${i.title}*\n│ ${i.text}`).join('\n\n');
  return sock.sendMessage(jid, { text }, sendOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. RICH MEDIA CARD — inlineImage/inlineVideo
// ─────────────────────────────────────────────────────────────────────────────
export async function richMediaCard(sock, jid, { type = 'image', url, caption, alignment, tapLinkUrl }, sendOptions = {}) {
  if (capabilities.richResponse) {
    if (type === 'video') {
      // FORK LIMITATION: inlineVideo maps to RichSubMessageType.TEXT with
      // messageText='INLINE_VIDEO' — literally renders the string "INLINE_VIDEO"
      // instead of a video. Fall through to the plain media fallback.
      console.warn('[interactiveKit.richMediaCard] inlineVideo is not supported by the fork — using plain video fallback');
    } else {
      // FORK DISPATCH: The fork's generateWAMessageContent only dispatches rich
      // response when code/links/table/richResponse is present as a top-level key.
      // Passing { inlineImage: url } alone does NOT match — it falls through to
      // the text branch and produces an empty message. Must wrap in richResponse.
      const payload = {
        richResponse: [{
          inlineImage: url,
          imageText: caption,
          ...(alignment ? { alignment } : {}),
          ...(tapLinkUrl ? { tapLinkUrl } : {}),
        }],
      };
      return await baileysBridge.sendRichResponse(sock, jid, payload, sendOptions);
    }
  }
  const payload = type === 'image' ? { image: { url }, caption } : { video: { url }, caption };
  return sock.sendMessage(jid, payload, sendOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. RICH ARTICLE CARD — latex, links, header, disclaimer, suggested
// ─────────────────────────────────────────────────────────────────────────────
export async function richArticleCard(sock, jid, { headerText, contentText, footerText, disclaimerText, latex, links = [], suggested }, sendOptions = {}) {
  if (capabilities.richResponse) {
    return await baileysBridge.sendRichResponse(sock, jid, { 
      headerText, contentText, footerText, disclaimerText, latex, links, suggested 
    }, sendOptions);
  }
  let text = '';
  if (headerText) text += `*${headerText}*\n\n`;
  if (contentText) text += `${contentText}\n\n`;
  if (latex) text += `\n${latex.map(l => l.text).join('\n')}\n\n`;
  if (footerText) text += `_${footerText}_\n`;
  return sock.sendMessage(jid, { text: text.trim() }, sendOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Rich combination cards (v0.3.18-r3 — code+table, map+table, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a code block + table combo (V2 native UI).
 * @example
 * await codeTableCard(sock, m.from, {
 *   code: 'const x = 42',
 *   language: 'javascript',
 *   headers: ['Output', 'Value'],
 *   rows: [['stdout', '42']],
 *   headerText: 'Code Results',
 * }, { quoted: m });
 */
export async function codeTableCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    const text = '```' + (content.language || '') + '\n' + content.code + '\n```\n' +
      (content.rows || []).map(r => r.join(' | ')).join('\n');
    return sock.sendMessage(jid, { text }, opts);
  }
  return baileysBridge.sendCodeWithTable(sock, jid, content, opts);
}

/**
 * Sends a map card + stats table combo (V2 native UI).
 * @example
 * await mapTableCard(sock, m.from, {
 *   latitude: 37.7749, longitude: -122.4194,
 *   headers: ['Population', 'Area'],
 *   rows: [['870K', '121 km²']],
 *   headerText: 'San Francisco',
 * }, { quoted: m });
 */
export async function mapTableCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    return sock.sendMessage(jid, { text: (content.headerText || 'Location') + ': ' + (content.latitude || '') + ',' + (content.longitude || '') }, opts);
  }
  return baileysBridge.sendMapWithTable(sock, jid, content, opts);
}

/**
 * Sends text + inline image combo (V2 native UI).
 * @example
 * await textImageCard(sock, m.from, {
 *   text: 'Check out this image:',
 *   imageUrl: 'https://example.com/img.jpg',
 *   caption: 'Sample',
 * }, { quoted: m });
 */
export async function textImageCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    return sock.sendMessage(jid, { text: content.text + '\n' + (content.imageUrl || '') }, opts);
  }
  return baileysBridge.sendTextWithImage(sock, jid, content, opts);
}

/**
 * Sends multiple inline images as a native gallery (V2).
 * @example
 * await multiImageCard(sock, m.from, {
 *   images: [{ imageUrl: 'https://a.jpg', imageText: 'A' }, { imageUrl: 'https://b.jpg', imageText: 'B' }],
 *   headerText: 'Gallery',
 * }, { quoted: m });
 */
export async function multiImageCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    const text = (content.images || []).map(img => (img.imageText || '') + ': ' + (img.imageUrl || '')).join('\n');
    return sock.sendMessage(jid, { text }, opts);
  }
  return baileysBridge.sendMultiImages(sock, jid, content, opts);
}

/**
 * Sends a grid image gallery + table combo (V2 native UI).
 */
export async function gridTableCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    return sock.sendMessage(jid, { text: content.headerText || 'Gallery' }, opts);
  }
  return baileysBridge.sendGridImageWithTable(sock, jid, content, opts);
}

/**
 * Sends a dynamic (animated) + table combo (V2 native UI).
 */
export async function dynamicTableCard(sock, jid, content, opts = {}) {
  if (!capabilities.richResponse) {
    return sock.sendMessage(jid, { text: content.headerText || 'Dynamic' }, opts);
  }
  return baileysBridge.sendDynamicWithTable(sock, jid, content, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW BUTTON TYPE HELPERS (v0.3.18-r4 — full fork button API)
//
// ⚠️ DEVICE AUDIT 2026-09-13 (.testmessage all, real device): the CTA types
// below render as PLAIN TEXT — the client paints no native button for them:
//   flow*, subscribe, reminder, schedule, openChat, payment,
//   reviewAndPay, location, signIn, signUp, amazonLink, custom,
//   phone (requestPhoneNumberMessage — renders only an inert 'requested
//   phone number' system line with NO tappable action; also not shipped
//   by the Moonson/NIXCODE/itsliaaa proven reference).
// (*flow is protocol-supported but requires a Meta-registered flow token.)
// Builders are kept for API compatibility but should NOT be used in
// production until a device test proves them.
// Proven-rendering CTAs: quick_reply, cta_url, cta_copy, single_select,
// bottom_sheet (optionText/Title), limited_time_offer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a card with a WhatsApp Flow button.
 * @param {object} sock
 * @param {string} jid
 * @param {{ text: string, footer?: string }} content
 * @param {{ token: string, id: string, ctaText?: string, action?: string, actionPayload?: object, callback?: string, version?: number, expiresAt?: number, xToken?: string }} flow
 * @param {object} [opts]
 * @example
 * await flowCard(sock, m.from, { text: 'Fill out this form:' }, {
 *   token: 'flow_token', id: 'flow_id', ctaText: 'Open Form', version: 4,
 * }, { quoted: m });
 */
export async function flowCard(sock, jid, content, flow, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: flow.ctaText || '📝 Open Form', flow }] }, opts);
}

/**
 * Sends a card with a subscribe button (newsletter/channel).
 * @example
 * await subscribeCard(sock, m.from, { text: 'Subscribe to updates:' }, { id: 'sub_id', expiration: 0 }, { quoted: m });
 */
export async function subscribeCard(sock, jid, content, subscribe, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '🔔 Subscribe', subscribe }] }, opts);
}

/**
 * Sends a card with a reminder button.
 * @example
 * await reminderCard(sock, m.from, { text: 'Set a reminder:' }, { id: 'rem_1', title: 'Meeting', time: '2026-08-06T10:00:00Z' }, { quoted: m });
 */
export async function reminderCard(sock, jid, content, reminder, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '⏰ Set Reminder', reminder }] }, opts);
}

/**
 * Sends a card with a schedule button.
 * @example
 * await scheduleCard(sock, m.from, { text: 'Schedule an event:' }, { title: 'Team Sync', description: 'Weekly', startTime: '2026-08-06T10:00:00Z', endTime: '2026-08-06T11:00:00Z' }, { quoted: m });
 */
export async function scheduleCard(sock, jid, content, schedule, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '📅 Schedule', schedule }] }, opts);
}

/**
 * Sends a card with an open_chat button (opens a chat with a specific JID).
 * @example
 * await openChatCard(sock, m.from, { text: 'Contact support:' }, { jid: '233533416608@s.whatsapp.net', message: 'Hi, I need help' }, { quoted: m });
 */
export async function openChatCard(sock, jid, content, openChat, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '💬 Open Chat', openChat }] }, opts);
}

/**
 * Sends a card with a payment button.
 * @example
 * await paymentCard(sock, m.from, { text: 'Pay for premium:' }, { token: 'pay_token', amount: '500', currency: 'USD', reference: 'ref_1' }, { quoted: m });
 */
export async function paymentCard(sock, jid, content, payment, opts = {}) {
  // requestPaymentMessage is a standalone proto message type — route through
  // baileysBridge.sendPayment() which builds it directly, NOT through
  // nativeFlowMessage (cta_payment button). This ensures the payment card
  // renders on all clients that support WhatsApp Payments.
  try {
    return await baileysBridge.sendPayment(sock, jid, {
      amount: payment.amount || 10000,
      currency: payment.currency || 'USD',
      note: content.text || 'Payment Request',
      ...(payment.reference ? { reference: payment.reference } : {}),
    }, opts);
  } catch (err) {
    // Fallback to nativeFlow cta_payment if standalone fails
    console.warn('[paymentCard] sendPayment failed, trying nativeFlow:', err.message);
    return _send(sock, jid, { ...content, buttons: [{ text: '💳 Pay', payment }] }, opts);
  }
}

/**
 * Sends a card with a review_and_pay button.
 * @example
 * await reviewAndPayCard(sock, m.from, { text: 'Review your order:' }, { orderId: 'ord_1', token: 'pay_token', reference: 'ref_1' }, { quoted: m });
 */
export async function reviewAndPayCard(sock, jid, content, reviewAndPay, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '🧾 Review & Pay', reviewAndPay }] }, opts);
}

/**
 * Sends a card requesting the user's location.
 * @example
 * await locationRequestCard(sock, m.from, { text: 'Share your location:' }, { quoted: m });
 */
export async function locationRequestCard(sock, jid, content, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '📍 Share Location', location: true }] }, opts);
}

/**
 * Sends a card requesting the user's phone number.
 * @example
 * await phoneRequestCard(sock, m.from, { text: 'Share your phone:' }, { quoted: m });
 */
export async function phoneRequestCard(sock, jid, content, opts = {}) {
  // requestPhoneNumberMessage is a standalone proto message type — it does NOT
  // need nativeFlowMessage. DEVICE AUDIT 2026-09-13: it renders only an inert
  // 'requested phone number' system line — no tappable share action for a
  // peer/bot sender, and nothing at all fires in self-chat. Not shipped by
  // Moonson/NIXCODE/itsliaaa. Do not use in production.
  // The fork handles it: sock.sendMessage(jid, { requestPhoneNumber: true })
  // → m.requestPhoneNumberMessage = {}
  try {
    return await sock.sendMessage(jid, {
      requestPhoneNumber: true,
      ...(content.contextInfo ? { contextInfo: content.contextInfo } : {}),
    }, opts);
  } catch (err) {
    // Fallback to nativeFlow if standalone fails
    console.warn('[phoneRequestCard] standalone failed, trying nativeFlow:', err.message);
    return _send(sock, jid, { ...content, buttons: [{ text: '📱 Share Phone', phone: true }] }, opts);
  }
}

/**
 * Sends a card requesting the user's address.
 * @example
 * await addressRequestCard(sock, m.from, { text: 'Share your address:' }, { addressTitle: 'Delivery Address', addressDescription: 'Where should we deliver?' }, { quoted: m });
 */
export async function addressRequestCard(sock, jid, content, addressOpts = {}, opts = {}) {
  return _send(sock, jid, {
    ...content,
    buttons: [{ text: '📍 Share Address', address: true, addressTitle: addressOpts.addressTitle || 'Address', addressDescription: addressOpts.addressDescription || '', addressForm: addressOpts.addressForm || {} }],
  }, opts);
}

/**
 * Sends a card with a sign-in button.
 * @example
 * await signInCard(sock, m.from, { text: 'Sign in to continue:' }, { token: 'signin_token', expiresAt: 0 }, { quoted: m });
 */
export async function signInCard(sock, jid, content, signIn, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '🔐 Sign In', signIn }] }, opts);
}

/**
 * Sends a card with a sign-up button.
 * @example
 * await signUpCard(sock, m.from, { text: 'Create an account:' }, { token: 'signup_token', expiresAt: 0 }, { quoted: m });
 */
export async function signUpCard(sock, jid, content, signUp, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '📝 Sign Up', signUp }] }, opts);
}

/**
 * Sends a card with an Amazon link button.
 * @example
 * await amazonLinkCard(sock, m.from, { text: 'View on Amazon:' }, { url: 'https://amazon.com/dp/B123' }, { quoted: m });
 */
export async function amazonLinkCard(sock, jid, content, amazonLink, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [{ text: '🛒 View on Amazon', amazonLink }] }, opts);
}

/**
 * Sends a card with a custom/raw nativeFlow button (pass-through).
 * @example
 * await customButtonCard(sock, m.from, { text: 'Custom action:' }, { name: 'my_custom_cta', paramsJson: { display_text: 'Custom', foo: 'bar' } }, { quoted: m });
 */
export async function customButtonCard(sock, jid, content, customButton, opts = {}) {
  return _send(sock, jid, { ...content, buttons: [customButton] }, opts);
}

export default {
  richCarouselCard,
  richMediaCard,
  richArticleCard,
  actionCard,
  actionCardWithAd,
  linkCard,
  copyResultCard,
  mixedCard,
  selectMenu,
  bottomSheetCard,
  offerCard,
  richTableCard,
  richCodeCard,
  // New combination cards
  codeTableCard,
  mapTableCard,
  textImageCard,
  multiImageCard,
  gridTableCard,
  dynamicTableCard,
  // New button type helpers
  flowCard,
  subscribeCard,
  reminderCard,
  scheduleCard,
  openChatCard,
  paymentCard,
  reviewAndPayCard,
  locationRequestCard,
  phoneRequestCard,
  addressRequestCard,
  signInCard,
  signUpCard,
  amazonLinkCard,
  customButtonCard,
};
