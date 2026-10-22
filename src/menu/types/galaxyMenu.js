import crypto from 'crypto';
import { generateWAMessageFromContent } from 'baileys';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { getChannelPill } from '../../lib/menuContext.js';

/**
 * Galaxy Menu (id: 19) — full Moongod .menu port.
 *
 * Replicates Moongod's flagship menu envelope:
 *   - viewOnceMessage + interactiveMessage, sent via relayMessage
 *   - GIF/video header (env-gated) with banner-image fallback
 *   - zero-width body + ASCII info footer
 *   - channel-forwarded pill contextInfo (forwardingScore 97410)
 *   - messageParamsJson galaxy bar (limited_time_offer) + bottom_sheet
 *   - ~20-button nativeFlow stack unlocked by the has_multiple_buttons
 *     opener pair (single_select + call_permission_request)
 *   - decorative galaxy_message lines framing functional buttons
 *   - single_select sections whose rows re-run NEXORA commands
 *   - cta_call / view_catalog / request_contact_info / reminders / location
 *   - BloksWidget A2UI "Nexora Graphiq" card (skipped when unavailable)
 *   - optional PTT voice follow-up (env-gated)
 *
 * Optional env:
 *   NEXORA_MENU_GIF_URL — looping mp4 for the header (falls back to banner image)
 *   NEXORA_MENU_PTT_URL — voice note sent right after the menu (skipped when unset)
 *
 * Renderer errors bubble to runWithFallback → plain-text menu (never a dead .menu).
 */

const ZWSP = '\u200b';
const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326';
const GITHUB_URL = 'https://github.com/boyde1317-byte/NEXORA-MD';
const PANEL_URL = 'https://nexora-telegram.fly.dev';

// Math-alphanumeric mapper — must be code-point aware (surrogate pairs!)
const FANCY_UPPER = Array.from('𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙');
const FANCY_LOWER = Array.from('𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳');
const fancy = (s) =>
  Array.from(String(s))
    .map((c) => {
      const i = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(c);
      if (i >= 0) return FANCY_UPPER[i];
      const j = 'abcdefghijklmnopqrstuvwxyz'.indexOf(c);
      if (j >= 0) return FANCY_LOWER[j];
      return c;
    })
    .join('');

const infoBlock = (p) =>
  `▢ ./Informação
└──
 ├─ ▢ Author: #Aizen
 ├─ ▢ Prefix: ${p === '.' ? 'Multi' : p}
 ├─ ▢ Action: ${brand.name}
 ├─ ▢ Version: ${brand.version}
 ├─ ▢ Generation: 3
 ├─ ▢ Type: ( ES Modules )
 ├─ ▢ Library: Baileys 0.3.18
 │
 ├─./ThàñkTó.js_
 │  ├─ ./#Aizen
 │  └─ ./NexoraGraphiq ⚡
 └─ ${brand.name} ⚡`;

/** The A2UI spec card riding the bloksWidget (Moongod "Graphiq" card, NEXORA-branded). */
const buildA2uiSpec = (uuid, bannerUrl) => {
  // Single root — A2UI validation walks from `root`; a duplicate root id makes
  // referenced children (header_image) unreachable and the widget fails with
  // A2UIValidationException (seen live on device 2026-10-22).
  const rootChildren = bannerUrl
    ? ['header_image', 'information', 'button2']
    : ['information', 'button2'];
  const components = [
    { id: 'root', component: 'Column', children: rootChildren },
    ...(bannerUrl
      ? [{ id: 'header_image', component: 'Image', url: bannerUrl, variant: 'header', fit: 'cover' }]
      : []),
    { id: 'information', component: 'Card', child: 'information_card' },
    { id: 'information_card', component: 'Column', children: ['title_text', 'Divider8', 'infor_text'] },
    { id: 'title_text', component: 'Text', text: `The ${fancy(brand.name)} Graphiq`, variant: 'h3' },
    { id: 'Divider8', component: 'Divider' },
    { id: 'infor_text', component: 'Text', text: infoBlock('.'), variant: 'body' },
    { id: 'nexora_channel', component: 'Text', text: 'NEXORA Channel' },
    {
      id: 'button2',
      component: 'Button',
      child: 'nexora_channel',
      variant: 'borderless',
      action: { call: 'openUrl', args: { url: CHANNEL_URL } },
    },
  ];
  return {
    version: 'v0.9',
    createSurface: {
      surfaceId: 'starcore-widget=' + uuid,
      catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      components,
    },
  };
};

export const galaxyMenu = {
  id: 19,
  name: 'galaxyMenu',
  description: 'Galaxy menu — relayed viewOnce envelope, galaxy bar, 24-button native-flow stack, BloksWidget card',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage', 'bloksWidget'],

  renderer: async ({ sock, m, menuData }) => {
    const jid = m.from || m.key?.remoteJid || m.chat;
    const prefix = menuData.prefix || '.';
    const uuid = crypto.randomUUID();
    const pill = getChannelPill();

    // ── Header media: configured GIF first, banner image second, none last ──
    let header = { hasMediaAttachment: false };
    let bannerUrl = null;
    try {
      const { generateWAMessageContent } = await import('baileys');
      if (process.env.NEXORA_MENU_GIF_URL) {
        const media = await generateWAMessageContent(
          { video: { url: process.env.NEXORA_MENU_GIF_URL } },
          { upload: sock.waUploadToServer }
        );
        header = { hasMediaAttachment: true, videoMessage: { ...media.videoMessage, gifPlayback: true } };
      } else {
        const { imageManager } = await import('../../images/imageManager.js');
        const img = await imageManager.getMenuImage(19);
        if (img?.source?.startsWith?.('http')) {
          bannerUrl = img.source;
          const media = await generateWAMessageContent(
            { image: { url: img.source } },
            { upload: sock.waUploadToServer }
          );
          header = { hasMediaAttachment: true, imageMessage: media.imageMessage };
        }
      }
    } catch {
      header = { hasMediaAttachment: false };
    }

    // ── Data-driven category section (rows re-run `.help <category>`) ──
    const cats = Object.keys(menuData.categories || {});
    const preferred = ['owner', 'downloader', 'media', 'games', 'economy', 'ai', 'fun', 'group', 'general'];
    const picked = preferred.filter((c) => cats.includes(c)).slice(0, 5);
    const categorySection = {
      title: `⭑̤⟅̊༑ ▾⿻ ${fancy(brand.name)} ⿻ ▾ ༑̴⟆̊⭑̤`,
      highlight_label: fancy('Nexora') + ' ' + fancy('Crasher'),
      rows: picked.map((c) => ({
        title: fancy(c.charAt(0).toUpperCase() + c.slice(1)) + ' ' + '📖',
        description: `${(menuData.categories[c] || []).length} commands`,
        id: `${prefix}help ${c}`,
      })),
    };

    // ── The galaxy bar + bottom sheet (messageParamsJson) ──
    const messageParamsJson = JSON.stringify({
      limited_time_offer: {
        text: `⟅̊ ▾⿻ ${fancy(brand.name)} ⿻ ▾ ⟆̊`,
        url: CHANNEL_URL,
        copy_code: '( 𖥂 ) - Nexora ',
        expiration_time: Date.now() * 999,
      },
      bottom_sheet: {
        in_thread_buttons_limit: 0,
        divider_indices: [1, 2, 3, 4, 5, 999],
        list_title: `⭑̤⟅̊༑ ▾⿻ ${fancy(brand.name)} ⿻ ▾ ༑̴⟆̊⭑̤`,
        button_title: ' ',
      },
    });

    const sel = (params) => ({ name: 'single_select', buttonParamsJson: JSON.stringify(params) });
    const gx = (flowCta, flowId) => ({
      name: 'galaxy_message',
      buttonParamsJson: JSON.stringify({ flow_cta: flowCta, flow_message_version: '3', flow_id: flowId }),
    });
    const ctaUrl = (display, url) => ({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: display,
        url,
        landing_page_url: url,
        webview_interaction: true,
        payment_link_preview: false,
        webview_presentation: null,
      }),
    });

    // ── The full ~20-button stack (opener pair unlocks multi-button mode) ──
    const buttons = [
      sel({ has_multiple_buttons: true }),
      { name: 'call_permission_request', buttonParamsJson: JSON.stringify({ has_multiple_buttons: true }) },
      gx(`╭───「 ${fancy(brand.name)} 」───╮`, '.x7'),
      sel({
        icon: 'DOCUMENT',
        title: fancy('Selection') + ' ' + fancy('menu') + '🚀',
        sections: [
          {
            title: fancy(brand.name),
            highlight_label: fancy('Nexora') + ' ' + fancy('Crasher'),
            rows: [
              { title: fancy('All') + ' ' + fancy('menu') + '〽️', description: '', id: `${prefix}menu` },
              { title: fancy('Command') + ' ' + fancy('list') + ' 📚', description: '', id: `${prefix}help` },
              { title: fancy('Bot') + ' ' + fancy('status') + ' 📊', description: '', id: `${prefix}status` },
              { title: fancy('Menu') + ' ' + fancy('styles') + ' 🎨', description: '', id: `${prefix}menulist` },
            ],
          },
          categorySection,
        ],
        has_multiple_buttons: true,
      }),
      gx('╰────────────────────────╯', `${prefix}menu`),
      sel({
        icon: 'REVIEW',
        title: fancy('Periview') + '💞',
        sections: [
          {
            title: `⭑̤⟅̊༑ ▾⿻ ${fancy(brand.name)} ⿻ ▾ ༑̴⟆̊⭑̤`,
            highlight_label: fancy('Nexora') + ' ' + fancy('Crasher'),
            rows: [
              {
                title: fancy('About') + ' 💞',
                description: `${brand.name} — by ${brand.creator}`,
                id: `${prefix}owner`,
              },
            ],
          },
        ],
        has_multiple_buttons: true,
      }),
      sel({
        icon: 'PROMOTION',
        title: fancy('Get') + ' ' + fancy('Script') + '🐉',
        sections: [
          {
            title: `⭑̤⟅̊༑ ▾⿻ ${fancy(brand.name)} ⿻ ▾ ༑̴⟆̊⭑̤`,
            highlight_label: fancy('Nexora') + ' ' + fancy('Crasher'),
            rows: [
              {
                title: fancy('Get') + ' ' + fancy('Script') + '🐉',
                description: brand.description,
                id: `${prefix}help`,
              },
            ],
          },
        ],
        has_multiple_buttons: true,
      }),
      gx('╰────────────────────────╯', `${prefix}menu`),
      gx(`╭───「 ${fancy('Action')} ${fancy('The')} ${fancy('Script')} 」───╮`, '.x7'),
      {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({ display_text: `Call ${brand.creator}`, id: `call_${owner.ownerNumber}` }),
      },
      {
        name: 'automated_greeting_message_view_catalog',
        buttonParamsJson: JSON.stringify({ business_phone_number: owner.ownerNumber, catalog_product_id: '12345' }),
      },
      { name: 'request_contact_info', buttonParamsJson: '' },
      { name: 'cta_reminder', buttonParamsJson: JSON.stringify({ display_text: 'Reminder', id: 'message' }) },
      { name: 'cta_cancel_reminder', buttonParamsJson: JSON.stringify({ display_text: 'cta_cancel_reminder', id: 'message' }) },
      { name: 'send_location', buttonParamsJson: '' },
      gx('╰────────────────────────╯', `${prefix}menu`),
      ctaUrl('# ./NexoraEngine', GITHUB_URL),
      ctaUrl('# ./NexoraPanel', PANEL_URL),
      ctaUrl('# ./NexoraChannel', CHANNEL_URL),
      gx('╰────────────────────────╯', `${prefix}menu`),
      gx(`╭───「 ${fancy('Made')} ${fancy('By')} ${fancy('Aizen')} 」───╮`, '.x7'),
      gx('› # Aizen', '.x7'),
      gx('› # NexoraGraphiq', '.x7'),
      gx(`╰───「 ${fancy(brand.name)} ${fancy('v') + brand.version} 」───╯`, `${prefix}menu`),
    ];

    // ── BloksWidget card (skipped when the proto lacks it) ──
    let bloksWidget;
    try {
      const { proto } = await import('baileys');
      const InteractiveMessage = proto.Message.InteractiveMessage;
      if (InteractiveMessage?.BloksWidget) {
        bloksWidget = InteractiveMessage.BloksWidget.create({
          uuid,
          type: 'im_a2ui',
          data: JSON.stringify(buildA2uiSpec(uuid, bannerUrl)),
        });
      }
    } catch {
      bloksWidget = undefined;
    }

    // ── Status-broadcast product-card quote (Moongod "Paxley Catalyze" header) ──
    // A quoted message keyed to status@broadcast with a review_and_pay button
    // renders as the "WhatsApp • Status" product card above the menu (title,
    // Quantity 1, price, thumbnail). NEXORA-branded with the glitch font.
    const GLITCH_NEXORA = '𝐍̸̋̋͡𝐄̶͢𝐗͠𝐎̶͢𝐑̶͠𝐀 ͢𝐌̸̋̋͡𝐃';
    let thumbBytes = null;
    try {
      const { imageManager } = await import('../../images/imageManager.js');
      const img = await imageManager.getMenuImage(19);
      if (img?.buffer) thumbBytes = img.buffer;
      else if (img?.source?.startsWith?.('http')) {
        thumbBytes = Buffer.from(await (await fetch(img.source)).arrayBuffer());
      }
    } catch {
      thumbBytes = null;
    }
    const quoted = {
      key: {
        remoteJid: 'status@broadcast',
        participant: '0@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        interactiveMessage: {
          header: {
            hasMediaAttachment: true,
            ...(thumbBytes ? { jpegThumbnail: thumbBytes } : {}),
            title: GLITCH_NEXORA,
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'review_and_pay',
                buttonParamsJson: JSON.stringify({
                  currency: 'GBP',
                  payment_configuration: 'payment_settings',
                  payment_type: 'payment_method',
                  total_amount: { value: 72000000, offset: 100 },
                  reference_id: GLITCH_NEXORA,
                  type: 'physical-goods',
                  order: {
                    status: 'payment_requested',
                    description: '',
                    subtotal: { value: 0, offset: 100 },
                    order_type: 'PAYMENT_REQUEST',
                    items: [
                      {
                        retailer_id: 'X',
                        name: GLITCH_NEXORA,
                        amount: { value: 72000000, offset: 100 },
                        quantity: 1,
                      },
                    ],
                  },
                  additional_note: GLITCH_NEXORA,
                  native_payment_methods: [],
                  share_payment_status: false,
                }),
              },
            ],
          },
        },
      },
    };

    // ── Envelope assembly ──
    const interactiveMessage = {
      header,
      body: { text: ZWSP },
      footer: {
        text: `${infoBlock(prefix)}\n\n \`「 Iñfòrmação úpdåté 」\`\n${CHANNEL_URL} \n\n \`「 NEXORA panel 」\`\n${PANEL_URL}\n`,
      },
      contextInfo: {
        isForwarded: true,
        forwardingScore: 97410,
        ...(pill || {}),
      },
      nativeFlowMessage: {
        messageParamsJson,
        buttons,
        messageVersion: 1,
      },
      ...(bloksWidget ? { bloksWidget } : {}),
    };

    const generated = generateWAMessageFromContent(
      jid,
      { viewOnceMessage: { message: { interactiveMessage } } },
      {
        ...(sock.user?.id ? { userJid: sock.user.id } : {}),
        quoted,
      }
    );
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });

    // ── Optional PTT voice follow-up (Moongod sends one after the menu) ──
    if (process.env.NEXORA_MENU_PTT_URL) {
      try {
        await sock.sendMessage(jid, {
          audio: { url: process.env.NEXORA_MENU_PTT_URL },
          mimetype: 'audio/mp4',
          ptt: true,
          contextInfo: {
            forwardingScore: 92829291,
            isForwarded: true,
            ...(pill || {}),
          },
        });
      } catch (err) {
        console.warn('[galaxyMenu] PTT follow-up skipped:', err.message);
      }
    }

    return true;
  },
};

export default galaxyMenu;
