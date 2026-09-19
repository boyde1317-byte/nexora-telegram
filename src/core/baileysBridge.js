import {
  generateWAMessageFromContent, generateWAMessage, generateMessageID, generateMessageIDV2, proto,
  buildV2Content, buildV2ContextInfo,
  generateCodeBlockContentV2, generateInlineVideoWithStatsV2, generateReelContentV2,
  generateLinkContentV2, generateInlineImageWithTableV2, generateLatexContentV2,
  generateMapContentV2,
  generateCodeWithTableV2, generateMapWithTableV2, generateTextWithInlineImageV2,
  generateMultiInlineImagesV2, generateGridImageWithTableV2, generateDynamicWithTableV2,
} from 'baileys';

// ── Rich message formatting helpers (for parseRichMessage consumption) ─────

const RICH_SUBMESSAGE_TYPES = {
  TEXT: 2, TABLE: 4, CODE: 5, LATEX: 8,
  CONTENT_ITEMS: 9, INLINE_IMAGE: 3, GRID_IMAGE: 1, DYNAMIC: 6, MAP: 7,
};

/**
 * Formats V1 submessages into readable text + structured sections.
 */
function _formatV1Submessages(submessages, sections) {
  let text = '';
  for (const sub of submessages) {
    const type = sub.messageType;
    switch (type) {
      case RICH_SUBMESSAGE_TYPES.TEXT:
        text += (sub.messageText || '') + '\n\n';
        sections.push({ type: 'text', content: sub.messageText });
        break;
      case RICH_SUBMESSAGE_TYPES.TABLE: {
        const meta = sub.tableMetadata || {};
        if (meta.title) text += `*${meta.title}*\n`;
        if (meta.rows) {
          for (const row of meta.rows) {
            text += (row.items || []).join(' │ ') + '\n';
          }
        }
        text += '\n';
        sections.push({ type: 'table', title: meta.title, rows: meta.rows });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.CODE: {
        const meta = sub.codeMetadata || {};
        const codeText = meta.codeBlocks
          ? meta.codeBlocks.map(b => b.codeContent || '').join('')
          : (meta.code || '');
        text += `\`\`\`${meta.codeLanguage || ''}\n${codeText}\n\`\`\`\n\n`;
        sections.push({ type: 'code', language: meta.codeLanguage, code: codeText });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.INLINE_IMAGE: {
        const meta = sub.imageMetadata || {};
        const url = meta.imageUrl?.imageHighResUrl || meta.imageUrl?.imagePreviewUrl || '';
        text += `[🖼️ ${meta.imageText || 'Image'}: ${url}]\n\n`;
        sections.push({ type: 'inlineImage', url, text: meta.imageText });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.GRID_IMAGE: {
        const meta = sub.gridImageMetadata || {};
        const mainUrl = meta.gridImageUrl?.imageHighResUrl || meta.gridImageUrl?.imagePreviewUrl || '';
        const count = meta.imageUrls?.length || 0;
        text += `[🖼️ Grid Image: ${mainUrl}]${count ? ` (${count} thumbnails)` : ''}\n\n`;
        sections.push({ type: 'gridImage', mainUrl, thumbnailCount: count });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.DYNAMIC: {
        const meta = sub.dynamicMetadata || {};
        const typeLabel = meta.type === 2 ? 'GIF' : meta.type === 1 ? 'IMAGE' : 'UNKNOWN';
        text += `[🎞️ Dynamic (${typeLabel}): ${meta.url || ''}]\n\n`;
        sections.push({ type: 'dynamic', kind: typeLabel, url: meta.url });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.MAP: {
        const meta = sub.mapMetadata || {};
        const annotations = (meta.annotations || []).map(a => a.title || '').filter(Boolean);
        text += `[📍 Map: ${meta.centerLatitude || ''},${meta.centerLongitude || ''}]${annotations.length ? ' — ' + annotations.join(', ') : ''}\n\n`;
        sections.push({ type: 'map', lat: meta.centerLatitude, lng: meta.centerLongitude, annotations });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.LATEX: {
        const meta = sub.latexMetadata || {};
        if (meta.text) text += meta.text + '\n';
        if (meta.expressions) {
          for (const expr of meta.expressions) {
            text += `  ${expr.latexExpression || ''}\n`;
          }
        }
        text += '\n';
        sections.push({ type: 'latex', text: meta.text, expressions: meta.expressions });
        break;
      }
      case RICH_SUBMESSAGE_TYPES.CONTENT_ITEMS: {
        const meta = sub.contentItemsMetadata || {};
        const items = meta.itemsMetadata || [];
        text += `[🎬 ${items.length} Reel(s)]\n`;
        for (const item of items) {
          const reel = item.reelItem || {};
          text += `  • ${reel.title || 'Video'}: ${reel.videoUrl || ''}\n`;
        }
        text += '\n';
        sections.push({ type: 'reel', items });
        break;
      }
      default:
        // Unknown submessage type — include raw text if available
        if (sub.messageText) {
          text += sub.messageText + '\n\n';
          sections.push({ type: 'text', content: sub.messageText });
        }
        break;
    }
  }
  return text.trim();
}

/**
 * Formats V2 unified response sections into readable text + structured sections.
 */
function _formatV2Sections(sections, outSections) {
  let text = '';
  for (const section of sections) {
    const vm = section.view_model || {};
    const prim = vm.primitive || {};
    const typename = prim.__typename || '';
    switch (typename) {
      case 'GenAIMarkdownTextUXPrimitive':
        text += (prim.text || '') + '\n\n';
        outSections.push({ type: 'text', content: prim.text });
        break;
      case 'GenATableUXPrimitive':
        if (prim.title) text += `*${prim.title}*\n`;
        if (prim.rows) {
          for (const row of prim.rows) {
            text += (row.items || row.cells || []).join(' │ ') + '\n';
          }
        }
        text += '\n';
        outSections.push({ type: 'table', title: prim.title, rows: prim.rows });
        break;
      case 'GenAICodeBlockUXPrimitive':
        text += `\`\`\`${prim.language || ''}\n${prim.code || ''}\n\`\`\`\n\n`;
        outSections.push({ type: 'code', language: prim.language, code: prim.code });
        break;
      case 'GenAILinkCollectionUXPrimitive':
        if (prim.text) text += prim.text + '\n';
        if (prim.links) {
          for (let i = 0; i < prim.links.length; i++) {
            const l = prim.links[i];
            text += `[${i+1}] ${l.title || l.display_text || 'Link'}: ${l.url}\n`;
          }
        }
        text += '\n';
        outSections.push({ type: 'links', text: prim.text, links: prim.links });
        break;
      case 'GenAIGridImageUXPrimitive':
        text += `[🖼️ Grid Image: ${prim.grid_image_url?.image_high_res_url || prim.grid_image_url?.image_preview_url || ''}]`;
        if (prim.image_urls?.length) text += ` (${prim.image_urls.length} thumbnails)`;
        text += '\n\n';
        outSections.push({ type: 'gridImage', mainUrl: prim.grid_image_url, count: prim.image_urls?.length });
        break;
      case 'GenAIDynamicUXPrimitive':
        text += `[🎞️ Dynamic (${prim.type || 'UNKNOWN'}): ${prim.url || ''}]\n\n`;
        outSections.push({ type: 'dynamic', kind: prim.type, url: prim.url });
        break;
      case 'GenAIAirichMapUXPrimitive':
      case 'GenAIMapUXPrimitive':
        text += `[📍 Map: ${prim.center_latitude || ''},${prim.center_longitude || ''}]`;
        if (prim.annotations?.length) {
          text += ' — ' + prim.annotations.map(a => a.title || '').join(', ');
        }
        text += '\n\n';
        outSections.push({ type: 'map', lat: prim.center_latitude, lng: prim.center_longitude, annotations: prim.annotations });
        break;
      case 'GenAILatexUXPrimitive':
        if (prim.text) text += prim.text + '\n';
        if (prim.expressions) {
          for (const expr of prim.expressions) {
            text += `  ${expr.latex_expression || ''}\n`;
          }
        }
        text += '\n';
        outSections.push({ type: 'latex', text: prim.text, expressions: prim.expressions });
        break;
      case 'GenAIContentItemsUXPrimitive':
      case 'GenAIReelItemUXPrimitive': {
        const items = prim.content_items || (prim.title ? [prim] : []);
        text += `[🎬 ${items.length} Reel(s)]\n`;
        for (const item of items) {
          text += `  • ${item.title || 'Video'}: ${item.video_url || ''}\n`;
        }
        text += '\n';
        outSections.push({ type: 'reel', items });
        break;
      }
      default:
        // Unknown UX primitive — try common fields
        if (prim.text) {
          text += prim.text + '\n\n';
          outSections.push({ type: 'text', content: prim.text });
        } else if (prim.title) {
          text += `*${prim.title}*\n\n`;
          outSections.push({ type: 'unknown', typename, title: prim.title });
        }
        break;
    }
  }
  return text.trim();
}
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * additionalNodes stanza that flags a relayed message as a business
 * "native_flow" interactive card.
 *
 * WITHOUT this stanza, stock WhatsApp clients frequently deliver
 * interactiveMessage/nativeFlowMessage/buttonsMessage payloads with the
 * buttons silently missing (or the card rendering as a bare/broken bubble) —
 * the server/client-side rendering of real tappable pill buttons + the
 * "business card" grey body styling is gated on this <biz><interactive
 * type="native_flow"> stanza being present on the wire, not merely on the
 * message's proto content. This is a wire-protocol detail, not something
 * exclusive to any particular Baileys fork — every fork (including this
 * one) exposes the same `sock.relayMessage(jid, msg, { additionalNodes })`
 * hook; community bots (NIXCODE/BIGST4CK and others) rely on exactly this
 * to get buttons to render reliably on real devices.
 */
const NATIVE_FLOW_ADDITIONAL_NODES = [
  {
    tag: 'biz',
    attrs: {},
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
    ],
  },
];

/** True if this raw message content carries buttons/native-flow/carousel UI. */
function hasNativeFlowContent(messageContent) {
  if (!messageContent || typeof messageContent !== 'object') return false;
  if (messageContent.buttonsMessage) return true;
  const im = messageContent.interactiveMessage;
  if (im && (im.nativeFlowMessage || im.carouselMessage)) return true;
  return false;
}

/**
 * Unified facade for interfacing with the custom Baileys fork.
 * This encapsulates all raw Baileys structures and methods so that
 * the rest of the menu and bot system doesn't rely on raw protobuf constructs.
 */
export const baileysBridge = {
  /**
   * Simple wrapper for sending a message using Baileys sock
   */
  async sendMessage(sock, jid, content, options = {}) {
    return await sock.sendMessage(jid, content, options);
  },

  /**
   * Relays a fully formed proto.IMessage payload directly to WhatsApp servers.
   *
   * IMPORTANT: several message types (eventMessage, pollCreationMessage*,
   * interactiveMessage w/ nativeFlow, productMessage) require a top-level
   * messageContextInfo.messageSecret so WhatsApp clients can decrypt/render
   * them — this is unrelated to viewOnceMessage. Do NOT wrap these types in
   * viewOnceMessage just to get a secret injected; viewOnceMessage carries
   * real self-destruct-after-one-view semantics and most clients drop
   * eventMessage/productMessage/interactiveMessage payloads placed inside it.
   * We inject the secret centrally, keyed off message type, so callers never
   * need the viewOnceMessage workaround.
   */
  async relayMessage(sock, jid, messageContent, options = {}) {
    // Build the messageContextInfo block. When options.aiMessage is true, attach
    // supportPayload so WA clients render the Meta AI badge on the message.
    const _buildContextInfo = (existing) => {
      if (existing) return existing;
      const base = {
        deviceListMetadata:        {},
        deviceListMetadataVersion: 2,
        messageSecret:             randomBytes(32),
      };
      if (options.aiMessage) {
        base.supportPayload = JSON.stringify({
          version:                   2,
          is_ai_message:             true,
          should_show_system_message: true,
          ticket_id:                 randomBytes(16).toString('base64'),
        });
      }
      return base;
    };

    // viewOnceMessage — real view-once sends
    if (messageContent.viewOnceMessage?.message) {
      const inner = messageContent.viewOnceMessage.message;
      inner.messageContextInfo = _buildContextInfo(inner.messageContextInfo);

    // ephemeralMessage — disappearing-message wrapper (same secret injection needed)
    } else if (messageContent.ephemeralMessage?.message) {
      const inner = messageContent.ephemeralMessage.message;
      inner.messageContextInfo = _buildContextInfo(inner.messageContextInfo);

    } else {
      // Flat payload: inject messageSecret for types that require it
      // Message types that need a messageContextInfo.messageSecret so WA clients can
      // decrypt/render them. Extended for new message types in the fork.
      const SECRET_REQUIRED_KEYS = [
        'eventMessage',
        'productMessage',
        'interactiveMessage',
        'pollCreationMessage',
        'pollCreationMessageV2',
        'pollCreationMessageV3',
        'stickerPackMessage',        // new in fork — sticker pack sends
        'lottieStickerMessage',      // new in fork — animated lottie stickers
        'pollResultSnapshotMessage', // new in fork — poll result snapshots
      ];
      const hasSecretRequiredType = SECRET_REQUIRED_KEYS.some(key => key in messageContent);
      if (hasSecretRequiredType) {
        messageContent.messageContextInfo = _buildContextInfo(messageContent.messageContextInfo);
      }
    }

    const message = await generateWAMessageFromContent(jid, messageContent, {
      userJid: sock.user?.id || '0@s.whatsapp.net',
      quoted: options.quoted,
    });

    // sock.relayMessage only accepts MessageRelayOptions — do not spread `options`
    // as it contains `quoted` which is not a valid relay param. We DO forward
    // additionalNodes: callers can override, otherwise button/native-flow/carousel
    // payloads get the native_flow biz stanza by default (see hasNativeFlowContent).
    const additionalNodes = options.additionalNodes
      ?? (hasNativeFlowContent(messageContent) ? NATIVE_FLOW_ADDITIONAL_NODES : undefined);
    await sock.relayMessage(jid, message.message, {
      messageId: message.key.id,
      ...(additionalNodes ? { additionalNodes } : {}),
    });
    return message;
  },

  /**
   * Uploads a raw image payload (buffer/url/stream — the same shape you'd
   * pass to sock.sendMessage({ image: ... })) to WhatsApp's media servers
   * and returns a fully-formed proto.Message.IImageMessage (url, mediaKey,
   * fileEncSha256, directPath, etc). Headers/cards embedding an image MUST
   * use this — passing a raw buffer/url object directly as `imageMessage`
   * produces an invalid proto with hasMediaAttachment:true but no real
   * media behind it, so WhatsApp shows no image (or drops the message).
   */
  async _uploadImageMessage(sock, jid, imageContent, options = {}) {
    // Already an uploaded proto (has fileSha256/mediaKey) — pass through untouched.
    if (imageContent?.fileSha256 || imageContent?.mediaKey) {
      return imageContent;
    }
    const msg = await generateWAMessage(
      jid,
      { image: imageContent },
      {
        upload: sock.waUploadToServer,
        userJid: sock.user?.id || '0@s.whatsapp.net',
        quoted: options.quoted,
      },
    );
    return msg.message.imageMessage;
  },

  /**
   * Uploads a raw video payload to WhatsApp's media servers and returns a fully-formed
   * proto.Message.IVideoMessage. Interactive message headers embedding video MUST use
   * this for the same reason as _uploadImageMessage — raw buffer/url produces an
   * invalid proto with no real media behind hasMediaAttachment:true.
   */
  async _uploadVideoMessage(sock, jid, videoContent, options = {}) {
    if (videoContent?.fileSha256 || videoContent?.mediaKey) {
      return videoContent;
    }
    const msg = await generateWAMessage(
      jid,
      { video: videoContent },
      {
        upload: sock.waUploadToServer,
        userJid: sock.user?.id || '0@s.whatsapp.net',
        quoted: options.quoted,
      },
    );
    return msg.message.videoMessage;
  },

  /**
   * Sends a premium Interactive Message (standard or custom).
   *
   * @param {object} opts
   * @param {string}  opts.body                     Card body text
   * @param {string}  [opts.footer]                 Card footer text
   * @param {object}  [opts.header]                 Header config:
   *   @param {string}  [opts.header.title]
   *   @param {string}  [opts.header.subtitle]
   *   @param {*}       [opts.header.image]          Buffer, {url}, or stream → uploaded automatically
   *   @param {*}       [opts.header.video]          Buffer, {url}, or stream → uploaded automatically
   *   @param {object}  [opts.header.documentMessage] Pre-built document proto
   *   @param {object}  [opts.header.imageMessage]    Pre-built image proto (skips upload)
   *   @param {object}  [opts.header.videoMessage]    Pre-built video proto (skips upload)
   * @param {Array}   [opts.buttons]                nativeFlow buttons [{name, params}]
   * @param {object}  [opts.contextInfo]            contextInfo placed INSIDE interactiveMessage.
   *   Supports: businessMessageForwardInfo, externalAdReply, forwardingScore, mentionedJid, etc.
   *   businessOwnerJid shorthand: pass options.businessOwnerJid instead of building
   *   contextInfo.businessMessageForwardInfo manually.
   *
   * @param {object}  [options]                     sendMessage/relayMessage options
   * @param {object}  [options.quoted]              Quoted message (e.g. buildFakeOrderQuote())
   * @param {string}  [options.businessOwnerJid]    Shorthand: sets businessMessageForwardInfo
   * @param {boolean} [options.aiMessage]           Add supportPayload → Meta AI badge
   */
  async sendInteractive(sock, jid, { body, footer, header, buttons, contextInfo }, options = {}) {
    // ── Header media upload ───────────────────────────────────────────────
    let headerImageMessage = header?.imageMessage;
    if (!headerImageMessage && header?.image) {
      headerImageMessage = await this._uploadImageMessage(sock, jid, header.image, options);
    }

    let headerVideoMessage = header?.videoMessage;
    if (!headerVideoMessage && header?.video) {
      headerVideoMessage = await this._uploadVideoMessage(sock, jid, header.video, options);
    }

    // ── interactiveMessage.contextInfo ───────────────────────────────────
    // Placed INSIDE the interactiveMessage (not top-level messageContextInfo).
    // Enables businessMessageForwardInfo, embedded externalAdReply, stanzaId, etc.
    let interactiveContextInfo;
    if (contextInfo || options.businessOwnerJid) {
      interactiveContextInfo = { ...(contextInfo || {}) };
      if (options.businessOwnerJid && !interactiveContextInfo.businessMessageForwardInfo) {
        interactiveContextInfo.businessMessageForwardInfo = {
          businessOwnerJid: options.businessOwnerJid,
        };
      }
    }

    const msgContent = {
      interactiveMessage: {
        body:   { text: body },
        footer: { text: footer || '' },
        header: header ? {
          title:    header.title    || '',
          subtitle: header.subtitle || '',
          // Auto-derive: true only for actual media (image/video/document).
          // locationMessage header always has hasMediaAttachment: false.
          hasMediaAttachment: !!(
            header.hasMediaAttachment ||
            headerImageMessage        ||
            headerVideoMessage        ||
            header.documentMessage
          ),
          ...(header.documentMessage  ? { documentMessage:  header.documentMessage }  : {}),
          ...(headerImageMessage      ? { imageMessage:     headerImageMessage }      : {}),
          ...(headerVideoMessage      ? { videoMessage:     headerVideoMessage }      : {}),
          ...(header.locationMessage  ? { locationMessage:  header.locationMessage }  : {}),
        } : undefined,
        nativeFlowMessage: buttons ? {
          buttons: buttons.map(btn => ({
            name:             btn.name || 'quick_reply',
            buttonParamsJson: typeof btn.params === 'string'
              ? btn.params
              : JSON.stringify(btn.params || {}),
          })),
        } : undefined,
        ...(interactiveContextInfo ? { contextInfo: interactiveContextInfo } : {}),
      },
    };

    return await this.relayMessage(sock, jid, msgContent, options);
  },

  /**
   * Sends a premium rich interactive card combining media headers, nativeFlow buttons,
   * embedded externalAdReply banners, business forward info, and Meta AI badge support.
   *
   * @param {object} sock                             Baileys socket connection
   * @param {string} jid                              Recipient JID
   * @param {object} card                             Card configuration object
   * @param {string} card.body                        Main card body text
   * @param {string} [card.footer]                    Card footer text
   * @param {string} [card.title]                     Header title
   * @param {string} [card.subtitle]                  Header subtitle
   * @param {*}      [card.image]                     Header image (Buffer, {url}, stream, or imageMessage proto)
   * @param {*}      [card.video]                     Header video (Buffer, {url}, stream, or videoMessage proto)
   * @param {Array}  [card.buttons]                   nativeFlow buttons [{name, params}, {text, id}, etc.]
   * @param {object} [card.contextInfo]               ContextInfo placed inside interactiveMessage
   * @param {object} [card.adReply]                   External ad reply configuration object
   * @param {string} [card.adReply.title]             Ad reply title
   * @param {string} [card.adReply.body]              Ad reply body
   * @param {string} [card.adReply.sourceUrl]         Ad reply source URL
   * @param {number} [card.adReply.mediaType]         Ad reply media type (default: 1)
   * @param {boolean}[card.adReply.renderLargerThumbnail] Render larger thumbnail flag
   * @param {*}      [card.adReply.thumbnail]         Ad reply thumbnail buffer
   * @param {string} [card.adReply.thumbnailUrl]      Ad reply thumbnail URL
   * @param {boolean}[card.adReply.showAdAttribution] Show ad attribution badge
   * @param {string} [card.adReply.originalImageUrl] High-res original image URL
   * @param {string} [card.businessOwnerJid]          Owner JID for businessMessageForwardInfo
   * @param {boolean}[card.aiMessage]                 Attach Meta AI supportPayload badge
   * @param {object} [options]                        sendMessage/relayMessage options
   * @returns {Promise<object>}                       Relayed WAMessage object
   */
  async sendRichCard(
    sock,
    jid,
    {
      body,
      footer,
      title,
      subtitle,
      image,
      video,
      buttons,
      contextInfo,
      adReply,
      businessOwnerJid,
      aiMessage,
    } = {},
    options = {}
  ) {
    // ── Header media upload ───────────────────────────────────────────────
    let headerImageMessage;
    if (image) {
      headerImageMessage = await this._uploadImageMessage(sock, jid, image, options);
    }

    let headerVideoMessage;
    if (video) {
      headerVideoMessage = await this._uploadVideoMessage(sock, jid, video, options);
    }

    // ── interactiveMessage.contextInfo ───────────────────────────────────
    const effectiveBusinessOwnerJid = businessOwnerJid || options.businessOwnerJid;
    let interactiveContextInfo;

    if (contextInfo || adReply || effectiveBusinessOwnerJid) {
      interactiveContextInfo = { ...(contextInfo || {}) };

      if (adReply) {
        const externalAdReply = {
          title:                 adReply.title ?? '',
          body:                  adReply.body ?? '',
          sourceUrl:             adReply.sourceUrl ?? '',
          mediaType:             adReply.mediaType ?? 1,
          renderLargerThumbnail: adReply.renderLargerThumbnail ?? false,
          showAdAttribution:     adReply.showAdAttribution ?? false,
          ...adReply,
        };
        if (adReply.thumbnail !== undefined) externalAdReply.thumbnail = adReply.thumbnail;
        if (adReply.thumbnailUrl !== undefined) externalAdReply.thumbnailUrl = adReply.thumbnailUrl;
        if (adReply.originalImageUrl !== undefined) externalAdReply.originalImageUrl = adReply.originalImageUrl;

        interactiveContextInfo.externalAdReply = externalAdReply;
      }

      if (effectiveBusinessOwnerJid && !interactiveContextInfo.businessMessageForwardInfo) {
        interactiveContextInfo.businessMessageForwardInfo = {
          businessOwnerJid: effectiveBusinessOwnerJid,
        };
      }
    }

    // ── Header construction ──────────────────────────────────────────────
    const hasHeader =
      title !== undefined ||
      subtitle !== undefined ||
      headerImageMessage !== undefined ||
      headerVideoMessage !== undefined;

    const header = hasHeader
      ? {
          title: title || '',
          subtitle: subtitle || '',
          hasMediaAttachment: !!(headerImageMessage || headerVideoMessage),
          ...(headerImageMessage ? { imageMessage: headerImageMessage } : {}),
          ...(headerVideoMessage ? { videoMessage: headerVideoMessage } : {}),
        }
      : undefined;

    // ── interactiveMessage payload ───────────────────────────────────────
    const msgContent = {
      interactiveMessage: {
        body: { text: body || '' },
        footer: { text: footer || '' },
        ...(header ? { header } : {}),
        nativeFlowMessage:
          buttons && buttons.length > 0
            ? {
                buttons: buttons.map((btn) => {
                  let name = btn.name;
                  if (!name) {
                    if (btn.url) name = 'cta_url';
                    else if (btn.copy) name = 'cta_copy';
                    else if (btn.call) name = 'cta_call';
                    else name = 'quick_reply';
                  }

                  let buttonParamsJson = btn.buttonParamsJson;
                  if (!buttonParamsJson) {
                    if (typeof btn.params === 'string') {
                      buttonParamsJson = btn.params;
                    } else if (btn.params && typeof btn.params === 'object') {
                      buttonParamsJson = JSON.stringify(btn.params);
                    } else if (btn.id !== undefined) {
                      buttonParamsJson = JSON.stringify({
                        display_text: btn.text || btn.label || '',
                        id: btn.id,
                      });
                    } else if (btn.url !== undefined) {
                      buttonParamsJson = JSON.stringify({
                        display_text: btn.text || btn.label || '',
                        url: btn.url,
                      });
                    } else if (btn.copy !== undefined) {
                      buttonParamsJson = JSON.stringify({
                        display_text: btn.text || btn.label || '',
                        copy_code: btn.copy,
                      });
                    } else if (btn.call !== undefined) {
                      buttonParamsJson = JSON.stringify({
                        display_text: btn.text || btn.label || '',
                        phone_number: btn.call,
                      });
                    } else {
                      buttonParamsJson = JSON.stringify({});
                    }
                  }

                  return {
                    name,
                    buttonParamsJson,
                  };
                }),
              }
            : undefined,
        ...(interactiveContextInfo ? { contextInfo: interactiveContextInfo } : {}),
      },
    };

    const effectiveAiMessage = aiMessage ?? options.aiMessage;
    const relayOptions = {
      ...options,
      ...(effectiveAiMessage !== undefined ? { aiMessage: effectiveAiMessage } : {}),
    };

    return await this.relayMessage(sock, jid, msgContent, relayOptions);
  },

  /**
   * Sends an advanced Native Flow interactive message with quick replies, buttons, urls
   */
  async sendNativeFlow(sock, jid, {
    text, footer, title, image, video,
    buttons,
    offerText, offerUrl, offerCode, offerExpiry,
    optionText, optionTitle,
  }, options = {}) {
    // Route through sock.sendMessage → generateWAMessageContent (nativeFlow path).
    //
    // Button format — use the fork's simple declarative style (prepareNativeFlowButtons).
    // The fork auto-detects button type from the property key. 26 types supported:
    //
    // Core buttons:
    //   { text, id }              → quick_reply (run a bot command)
    //   { text, url, useWebview? } → cta_url (open URL; useWebview for in-app browser)
    //   { text, copy }            → cta_copy (copy to clipboard)
    //   { text, call }            → cta_call (dial a number)
    //   { text, sections }        → single_select (list picker)
    //
    // Location/phone:
    //   { text, location }        → cta_request_location
    //   { text, phone }           → cta_request_phone
    //   { text, sendLocation }    → send_location
    //   { text, address, addressTitle?, addressDescription?, addressForm? } → cta_address
    //   { text, copyAddress }     → cta_copy_address
    //
    // Flow/auth:
    //   { text, flow: { token, id, ctaText, action, actionPayload, callback, version, expiresAt, xToken } } → flow
    //   { text, signIn: { token, expiresAt } }    → cta_sign_in
    //   { text, signUp: { token, expiresAt } }    → cta_sign_up
    //   { text, signContract: { token, expiresAt } } → cta_sign_contract
    //
    // Payment:
    //   { text, payment: { token, amount, currency, reference } }    → cta_payment
    //   { text, completePayment: { token, reference } }               → cta_complete_payment
    //   { text, reviewAndPay: { orderId, token, reference } }         → cta_review_and_pay
    //   { text, paymentVerification: { token, reference } }           → cta_payment_verification
    //
    // Social/utility:
    //   { text, subscribe: { id, expiration } }    → cta_subscribe
    //   { text, reminder: { id, title, time } }    → cta_reminder
    //   { text, openChat: { jid, message } }       → cta_open_chat
    //   { text, schedule: { title, description, startTime, endTime } } → cta_schedule
    //   { text, amazonLink: { url } }              → cta_amazon_link
    //   { text, deleteMessage: { id } }           → cta_delete_message
    //   { text, targetCta: { text } }              → target
    //   { name, paramsJson }                       → custom raw pass-through
    //
    // Every button also accepts an optional `icon` field (uppercase string).
    //
    // Message-level overlays:
    // offerText    → limited_time_offer overlay banner (messageParamsJson)
    // optionText   → native bottom_sheet button that collapses all rows into a modal sheet
    // optionTitle  → title shown at the top of that sheet
    // image/video  → header media (Buffer or { url: '...' })
    //
    // FORK QUIRK (lib/Utils/messages.js, nativeFlow branch): the header/media
    // block that uploads `image`/`video` into the interactive header is only
    // entered when the body is passed as `caption`. If `text` is present,
    // `interactiveMessage.body = { text }` is set immediately and the entire
    // header branch — the one that calls `hasValidInteractiveHeader(m)` and
    // merges the uploaded image/video into `interactiveMessage.header` — is
    // skipped, even though `image`/`video` was set on the payload. So any
    // caller that passes both `text` and `image` silently loses the image.
    // We must send `caption` (not `text`) whenever media is attached; `title`
    // becomes the header title text in that path.
    //
    // FORK LIMITATION: when no media is attached, `title` is passed but the
    // fork ignores it — the `text` branch sets `body = { text }` and never
    // enters the header branch, so `title` has no effect. The title only
    // renders when `caption` is used (media path). Callers that need a title
    // without media should embed it in the `text` body instead.
    const hasMedia = !!(image || video);
    return await sock.sendMessage(jid, {
      nativeFlow: buttons,
      ...(hasMedia ? { caption: text, title: title || '' } : { text }),
      footer,
      // title without media is silently dropped by the fork — don't pass it
      // to avoid implying it will render. Callers should fold it into `text`.
      ...(image     ? { image }                                             : {}),
      ...(video     ? { video }                                             : {}),
      ...(offerText  ? {
        offerText,
        offerUrl: offerUrl || '',
        ...(offerCode  ? { offerCode }               : {}),
        ...(offerExpiry ? { offerExpiration: offerExpiry } : {}),
      } : {}),
      ...(optionText ? {
        optionText,
        optionTitle: optionTitle || '📄 Options',
      } : {}),
    }, {
      ...options,
      // Buttons render unreliably (or not at all) on stock WhatsApp without
      // this native_flow biz stanza — see NATIVE_FLOW_ADDITIONAL_NODES above.
      additionalNodes: options.additionalNodes || NATIVE_FLOW_ADDITIONAL_NODES,
    });
  },

  /**
   * Sends a Request Payment message using the fork's native capability
   */
  async sendPayment(sock, jid, { amount, currency, note, expiry, background, image }, options = {}) {
    // The fork natively handles requestPaymentMessage inside sendMessage
    return await sock.sendMessage(jid, {
      requestPaymentMessage: {
        amount: amount || 10000, // standard smallest unit * 1000
        currency: currency || 'USD',
        note: note || 'AI Bot Premium Menu Invoice',
        expiry: expiry || Math.floor(Date.now() / 1000) + 86400,
        ...(image ? { background: { image } } : background ? { background } : {})
      }
    }, options);
  },

  /**
   * Sends a custom Event Invitation card.
   * Routes through sock.sendMessage so the fork's handleEvent applies the
   * required viewOnceMessage + supportPayload wrapper before relaying.
   * Relaying a flat eventMessage directly via generateWAMessageFromContent
   * skips this wrapper and WhatsApp clients silently drop the card.
   */
  async sendEvent(sock, jid, { name, description, startTime, minutesAhead, joinLink }, options = {}) {
    // FORK DISPATCH: The fork's generateWAMessageContent dispatches events via
    // `hasNonNullishProperty(message, 'event')` — NOT 'eventMessage'. Passing
    // { eventMessage: {...} } silently falls through to the text branch.
    // The fork also calls `message.event.startDate.getTime()` so startDate
    // must be a Date object, not a unix timestamp number/string.
    const startSeconds = startTime
      ? (typeof startTime === 'string' ? parseInt(startTime, 10) : startTime)
      : Math.floor(Date.now() / 1000) + ((minutesAhead || 30) * 60);

    return await sock.sendMessage(jid, {
      event: {
        name,
        description: description || 'Bot Dynamic Event',
        startDate: new Date(startSeconds * 1000),
        location: { degreesLatitude: 0, degreesLongitude: 0, name: 'Location' },
        // joinLink is set by the fork when event.call + getCallLink are provided;
        // for manual join links we pass it directly in the location field.
        ...(joinLink ? { joinLink } : {}),
        extraGuestsAllowed: true,
        isCancelled: false,
      }
    }, options);
  },

  /**
   * Sends an interactive Poll or a pre-populated Poll Result card
   */
  async sendPoll(sock, jid, { question, options, isResult, pollVotes, pollType }, optionsExtra = {}) {
    if (isResult) {
      // FORK DISPATCH: fork expects { pollResult: { name, votes, pollType } }
      // NOT { pollResultMessage: { name, pollVotes } }. The fork maps
      // pollResult.votes → [{ optionName: vote.name, optionVoteCount: vote.voteCount }]
      // and pollResult.pollType (1=quiz, 0=poll) to the correct snapshot version.
      return await sock.sendMessage(jid, {
        pollResult: {
          name: question,
          votes: (pollVotes || []).map(v => ({
            name: v.name || v.optionName || '',
            voteCount: v.voteCount || v.optionVoteCount || 0,
          })),
          pollType: pollType || 0,
        }
      }, optionsExtra);
    } else {
      // Send standard interactive poll message — fork matches on 'poll' key
      return await sock.sendMessage(jid, {
        poll: {
          name: question,
          values: options || [],
          selectableCount: 1
        }
      }, optionsExtra);
    }
  },

  /**
   * Sends a multi-card Carousel Message structure
   */
  /**
   * Sends a richResponseMessage wrapped in the Meta AI botForwardedMessage
   * envelope — required so WA clients render table/code bubbles with the bot badge.
   *
   * content shape (same keys as prepareRichResponseMessage):
   *   richResponse  → [{ text: '...' } | { code: tokenizedBlocks, language: '...' }]
   *   table         → { title: '...', rows: [{ items: string[] }] }
   *   footerText    → string
   *
   * The bot-metadata proof chain (certificate + signature) is generated inline —
   * we do NOT need to deep-import baileys/lib/Utils/rich-message-utils.js.
   *
   * Falls back to plain text if the proto relay fails (e.g. unsupported client).
   */
      async sendRichResponse(sock, jid, content, sendOptions = {}) {
    try {
      // The Baileys fork natively processes rich properties (e.g. code, links, table, items, etc.)
      // and converts them via prepareRichResponseMessage before relaying.
      return await sock.sendMessage(jid, content, sendOptions);
    } catch (err) {
      console.warn('[baileysBridge.sendRichResponse] relay failed, plain text fallback:', err.message);
      
      let fallbackText = '';
      if (content.headerText) fallbackText += "*" + content.headerText + "*\n\n";
      if (content.contentText) fallbackText += content.contentText + "\n\n";
      if (content.code) fallbackText += "```" + (content.language || '') + "\n" + content.code + "\n```\n\n";
      
      // Handle richResponse array (wrapped submessages)
      if (Array.isArray(content.richResponse)) {
        for (const sub of content.richResponse) {
          if (sub.text) fallbackText += sub.text + "\n\n";
          else if (sub.code) fallbackText += "```" + (sub.language || '') + "\n" + (Array.isArray(sub.code) ? sub.code.map(b => b.codeContent).join('') : sub.code) + "\n```\n\n";
          else if (sub.table && Array.isArray(sub.table)) {
            fallbackText += (sub.title ? `*${sub.title}*\n` : '');
            fallbackText += sub.table.map(r => (r.items || r).join(' │ ')).join('\n') + '\n\n';
          }
          else if (sub.items && Array.isArray(sub.items)) {
            fallbackText += sub.items.map(i => "• " + (i.title || '') + (i.text ? "\n  " + i.text : '')).join('\n\n') + '\n\n';
          }
          else if (sub.inlineImage) {
            // imageUrl can now be an object { imagePreviewUrl, imageHighResUrl, sourceUrl }
            // (fork commit 9b1f70a) or a legacy raw string.
            const img = sub.inlineImage;
            const url = typeof img === 'string' ? img : (img.imageHighResUrl || img.imagePreviewUrl || '');
            fallbackText += `[🖼️ ${sub.imageText || 'Image'}: ${url}]\n\n`;
          }
          else if (sub.inlineVideo) {
            // inlineVideo now sends CONTENT_ITEMS (type 9) with reelItem data.
            const v = sub.inlineVideo;
            fallbackText += `[🎬 ${v.title || 'Video'}: ${v.videoUrl || v.thumbnailUrl || ''}]\n\n`;
          }
          else if (sub.gridImage) {
            // GRID_IMAGE (type 1) — image gallery grid
            const g = sub.gridImage;
            const mainUrl = typeof g.gridImageUrl === 'string' ? g.gridImageUrl : (g.gridImageUrl?.imageHighResUrl || g.gridImageUrl?.imagePreviewUrl || '');
            fallbackText += `[🖼️ Grid Image: ${mainUrl}]`;
            if (g.imageUrls && g.imageUrls.length) {
              fallbackText += ` (${g.imageUrls.length} thumbnails)\n`;
              for (const u of g.imageUrls.slice(0, 4)) {
                const url = typeof u === 'string' ? u : (u.imageHighResUrl || u.imagePreviewUrl || '');
                fallbackText += `  • ${url}\n`;
              }
            }
            fallbackText += '\n\n';
          }
          else if (sub.dynamic) {
            // DYNAMIC (type 6) — animated GIF/image
            const d = sub.dynamic;
            const typeLabel = typeof d.type === 'string' ? d.type.toUpperCase() : (d.type === 2 ? 'GIF' : d.type === 1 ? 'IMAGE' : 'UNKNOWN');
            fallbackText += `[🎞️ Dynamic (${typeLabel}): ${d.url || ''}]\n\n`;
          }
          else if (sub.map) {
            // MAP (type 7) — location card
            const mp = sub.map;
            fallbackText += `[📍 Map: ${mp.centerLatitude || ''},${mp.centerLongitude || ''}]`;
            if (mp.annotations && mp.annotations.length) {
              fallbackText += ` — ${mp.annotations.map(a => a.title || '').join(', ')}`;
            }
            fallbackText += '\n\n';
          }
          else if (sub.latex) {
            // LATEX (type 8) — LaTeX expression
            const lt = sub.latex;
            if (lt.text) fallbackText += lt.text + '\n';
            if (lt.expressions) {
              for (const expr of lt.expressions) {
                fallbackText += `  ${expr.latexExpression || expr.latex || ''}\n`;
              }
            }
            fallbackText += '\n';
          }
          else if (sub.reels || sub.reel) {
            // REEL / CONTENT_ITEMS (type 9) — video carousel
            const reels = sub.reels || [sub.reel];
            fallbackText += `[🎬 ${reels.length} Reel(s)]\n`;
            for (const r of reels) {
              fallbackText += `  • ${r.title || 'Video'}: ${r.videoUrl || ''}\n`;
            }
            fallbackText += '\n';
          }
          else if (sub.list) {
            // LIST — flat list as single-column table
            fallbackText += (sub.list.title ? `*${sub.list.title}*\n` : '');
            if (Array.isArray(sub.list)) {
              fallbackText += sub.list.map(r => Array.isArray(r) ? '• ' + r.join(' — ') : '• ' + r).join('\n') + '\n\n';
            }
          }
          else if (sub.links) {
            // LINK content with citations
            if (sub.text) fallbackText += sub.text + '\n';
            for (let i = 0; i < sub.links.length; i++) {
              const l = sub.links[i];
              fallbackText += `[${i+1}] ${l.displayName || l.title || 'Link'}: ${l.url}\n`;
            }
            fallbackText += '\n';
          }
          else if (sub.products) {
            // PRODUCTS — structured metadata (fork commit 9b1f70a)
            if (sub.products.title) fallbackText += `*${sub.products.title}*\n`;
            if (sub.products.items) {
              for (const p of sub.products.items) {
                fallbackText += `  • ${p.title || p.name || ''}${p.price ? ' — ' + p.price : ''}\n`;
              }
            }
            fallbackText += '\n';
          }
          else if (sub.posts) {
            // POSTS — structured metadata (fork commit 9b1f70a)
            if (sub.posts.items) {
              for (const p of sub.posts.items) {
                fallbackText += `  • ${p.title || ''}${p.url ? ': ' + p.url : ''}\n`;
              }
            }
            fallbackText += '\n';
          }
          else if (sub.suggested) {
            // SUGGESTED — structured metadata (fork commit 9b1f70a)
            if (sub.suggested.items) {
              fallbackText += '*Suggestions:*\n';
              for (const s of sub.suggested.items) {
                fallbackText += `  • ${s.title || s.text || ''}\n`;
              }
            }
            fallbackText += '\n';
          }
        }
      }
      
      // Handle flat (non-array) content
      if (content.table && Array.isArray(content.table)) {
        fallbackText += content.table.map(r => r.join(' │ ')).join('\n') + '\n\n';
      }
      if (content.items && Array.isArray(content.items)) {
        fallbackText += content.items.map(i => "• " + i.title + "\n  " + i.text).join('\n\n') + '\n\n';
      }
      if (content.links && Array.isArray(content.links)) {
        fallbackText += content.links.map((l, i) => "[" + (i+1) + "] " + (l.title || 'Link') + ": " + l.url).join('\n') + '\n\n';
      }
      // New flat content types (fork commit b9f5c84)
      if (content.gridImage) {
        const g = content.gridImage;
        const mainUrl = typeof g.gridImageUrl === 'string' ? g.gridImageUrl : (g.gridImageUrl?.imageHighResUrl || g.gridImageUrl?.imagePreviewUrl || '');
        fallbackText += `[🖼️ Grid Image: ${mainUrl}]\n\n`;
      }
      if (content.dynamic) {
        const d = content.dynamic;
        fallbackText += `[🎞️ Dynamic: ${d.url || ''}]\n\n`;
      }
      if (content.map) {
        const mp = content.map;
        fallbackText += `[📍 Map: ${mp.centerLatitude || ''},${mp.centerLongitude || ''}]\n\n`;
      }
      if (content.latex) {
        if (content.latex.text) fallbackText += content.latex.text + '\n';
        if (content.latex.expressions) {
          for (const expr of content.latex.expressions) {
            fallbackText += `  ${expr.latexExpression || expr.latex || ''}\n`;
          }
        }
        fallbackText += '\n';
      }
      if (content.reels && Array.isArray(content.reels)) {
        fallbackText += `[🎬 ${content.reels.length} Reel(s)]\n`;
        for (const r of content.reels) {
          fallbackText += `  • ${r.title || 'Video'}: ${r.videoUrl || ''}\n`;
        }
        fallbackText += '\n';
      }
      if (content.footerText) fallbackText += "_" + content.footerText + "_";
      
      return sock.sendMessage(jid, { text: fallbackText.trim() || 'Rich content unavailable' }, sendOptions);
    }
  },

  /**
   * Parses an incoming richResponseMessage / botForwardedMessage into a
   * human-readable text representation. Handles both V1 (submessage-based)
   * and V2 (base64-encoded unifiedResponse) formats.
   *
   * @param {object} message — The raw Baileys message object
   * @returns {{ isRich: boolean, text: string, type: string, sections: Array }}
   */
  parseRichMessage(message) {
    const botFwd = message?.botForwardedMessage?.message || message?.message?.botForwardedMessage?.message;
    if (!botFwd) return { isRich: false, text: null, type: null, sections: [] };

    const rich = botFwd.richResponseMessage;
    if (!rich) return { isRich: false, text: null, type: null, sections: [] };

    const sections = [];
    let text = '';

    // ── V2: base64-encoded unifiedResponse ──────────────────────────────
    if (rich.unifiedResponse?.data) {
      try {
        const decoded = JSON.parse(
          Buffer.from(rich.unifiedResponse.data, 'base64').toString('utf8')
        );
        text = _formatV2Sections(decoded.sections || [], sections);
        return { isRich: true, text, type: 'V2-unified', sections };
      } catch {
        // Fall through to V1 if decode fails
      }
    }

    // ── V1: submessage-based ────────────────────────────────────────────
    if (rich.submessages && rich.submessages.length) {
      text = _formatV1Submessages(rich.submessages, sections);
      return { isRich: true, text, type: 'V1-submessage', sections };
    }

    return { isRich: false, text: null, type: null, sections: [] };
  },

  /**
   * Sends a buttonsMessage card — the OLD-style WhatsApp button card format.
   *
   * This is the format that produces the distinctive "grey body text" card
   * look (when the body is wrapped in monospace) with a high-quality thumbnail
   * in the header and tappable pill buttons at the bottom. It uses
   * headerType: 6 (locationMessage) to embed the thumbnail, which renders
   * as a card with the image at the top.
   *
   * The `biz`/`native_flow` additionalNodes stanza is attached automatically
   * by relayMessage() (hasNativeFlowContent checks for buttonsMessage).
   *
   * @param {object} sock
   * @param {string} jid
   * @param {object} card
   * @param {string} card.body           Card body text (wrap in ``` for grey look)
   * @param {string} [card.footer]       Card footer text
   * @param {string} [card.title]        Header title (shows as location name)
   * @param {string} [card.subtitle]     Header subtitle (shows as location address)
   *                                     — pass time/status here for "time in header" look
   * @param {*}      [card.thumbnail]    Header image — Buffer, {url}, or fetch-able URL string (uploaded to WA servers)
   * @param {Array}  [card.buttons]     Old-style buttons:
   *   { displayText: 'Label', id: '.cmd', type: 1 }                        → quick reply
   *   { displayText: 'Label', id: '.cmd', type: 1, nativeFlowInfo: {...} } → native flow (list, etc.)
   * @param {object} [card.contextInfo]  contextInfo for quoted message, mentions, etc.
   * @param {object} [options]           sendMessage/relayMessage options (quoted, etc.)
   */
  async sendButtonsCard(sock, jid, {
    body, footer, title, subtitle, thumbnail, buttons, contextInfo,
  }, options = {}) {
    // ── Fetch + resize thumbnail to 300x300 (like BIGST4CK's NIXCODE builder) ──
    let jpegThumbnail = null;
    if (thumbnail) {
      try {
        let buf;
        if (Buffer.isBuffer(thumbnail)) {
          buf = thumbnail;
        } else if (typeof thumbnail === 'string') {
          const res = await fetch(thumbnail, { signal: AbortSignal.timeout(10000) });
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        } else if (thumbnail?.url) {
          const res = await fetch(thumbnail.url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        } else if (thumbnail instanceof Uint8Array) {
          buf = Buffer.from(thumbnail);
        }
        if (buf) {
          // Use sharp if available, otherwise pass raw
          try {
            const sharp = (await import('sharp')).default;
            jpegThumbnail = await sharp(buf)
              .resize(300, 300, { fit: 'cover', position: 'center' })
              .jpeg()
              .toBuffer();
          } catch {
            jpegThumbnail = buf;
          }
        }
      } catch (err) {
        console.warn('[baileysBridge.sendButtonsCard] Thumbnail fetch failed:', err.message);
      }
    }

    const msgContent = {
      buttonsMessage: {
        contentText:   body || '',
        footerText:    footer || '',
        headerType:     6,  // location header (renders thumbnail as card image)
        locationMessage: {
          degreesLatitude:  0,
          degreesLongitude: 0,
          name:             title || '',
          address:          subtitle || '',
          ...(jpegThumbnail ? { jpegThumbnail } : {}),
        },
        // viewOnce intentionally omitted — buttonsMessage IS the persistent menu card.
        // Setting viewOnce:true would make it self-destruct after one tap, which
        // is wrong for a menu. Only use viewOnce on single-use cards (about, result cards).
        ...(contextInfo ? { contextInfo } : {}),
        // Accepts TWO input shapes so callers can mix plain buttons with
        // pre-built ones (e.g. buildNavigationButton()'s raw nativeFlowInfo
        // button from menu/types/buttonsCard.js):
        //   flat:   { displayText|text|label, id|buttonId, type, nativeFlowInfo }
        //   baileys:{ buttonText: { displayText }, buttonId, type, nativeFlowInfo }
        // Reading only the flat keys silently dropped the label to '' for
        // any already-baileys-shaped button (btn.buttonText.displayText),
        // since btn.displayText/.text/.label are all undefined on that shape.
        buttons:      (buttons || []).map(btn => ({
          buttonId:     btn.id || btn.buttonId || randomUUID(),
          buttonText:  { displayText: btn.displayText || btn.text || btn.label || btn.buttonText?.displayText || '' },
          type:         btn.type || 1,
          ...(btn.nativeFlowInfo ? { nativeFlowInfo: btn.nativeFlowInfo } : {}),
        })),
      },
    };

    return await this.relayMessage(sock, jid, msgContent, options);
  },

  async sendCarousel(sock, jid, { text, footer, cards }, options = {}) {
    // FORK QUIRK (lib/Utils/messages.js): the carousel branch is selected via
    // `hasNonNullishProperty(message, 'cards')` — it checks for a *top-level*
    // `cards` array, not a nested `carousel.cards`. Wrapping cards in an outer
    // `carousel: { cards }` key (as this used to do) means the top-level
    // object has no `cards` property at all, so the carousel branch never
    // matches. The payload then falls through the rest of the if/else chain
    // and is ultimately relayed as a bare text message — which is exactly
    // the "carousel renders as plain text" symptom. `cards` (and `text`/
    // `footer`) must be flat, top-level keys.
    //
    // Card shape (fork handles per-card upload + proto assembly):
    //   { nativeFlow: [{ text, id|url|copy|call }], image: Buffer|{url}, caption: '...', footer: '...' }
    // Use `caption` (not `text`) for the body on image/media cards.
    return await sock.sendMessage(jid, {
      cards,
      text,
      ...(footer ? { footer } : {}),
    }, {
      ...options,
      // The fork auto-attaches the biz node for carouselMessage via getBizBinaryNode,
      // extracting actual button names from carousel cards.
    });
  },

  async sendProduct(sock, jid, { title, description, productId, currency, price, footer, thumbnail, businessOwnerJid } = {}, options = {}) {
    // FORK DISPATCH: fork dispatches via `hasNonNullishProperty(message, 'product')`
    // NOT 'productMessage'. prepareProductMessage requires businessOwnerJid and
    // wraps the product data inside message.product. Passing productMessage directly
    // silently falls through to the text branch.
    return await sock.sendMessage(jid, {
      businessOwnerJid: businessOwnerJid || (sock.user?.id || '0@s.whatsapp.net'),
      product: {
        title: title || 'Premium Command Product',
        description: description || 'WhatsApp Bot Interactive Product Showcase',
        productId: productId || 'product-1',
        retailerId: productId || 'retailer-1',
        currencyCode: currency || 'USD',
        priceAmount1000: (price || 1) * 1000,
        footer: footer || '',
        ...(thumbnail ? { productImage: thumbnail } : {}),
      },
    }, options);
  },

  /**
   * Performs newsletter manager operations using the fork's native newsletter functions
   */
  async sendNewsletter(sock, jid, { action, name, description }, options = {}) {
    if (typeof sock.newsletterCreate !== 'function') {
      throw new Error('Socket does not support newsletter operations');
    }

    if (action === 'create') {
      return await sock.newsletterCreate(name, description || '');
    } else if (action === 'info') {
      return await sock.newsletterMetadata('jid', jid);
    } else if (action === 'follow') {
      return await sock.newsletterFollow(jid);
    } else if (action === 'unfollow') {
      return await sock.newsletterUnfollow(jid);
    }
    throw new Error(`Unsupported newsletter action: ${action}`);
  },

  /**
   * Generate a v1 message ID (legacy format: 3EB0 + hex).
   * Use generateId() for new messages — it produces the newer v2 format.
   */
  generateId() {
    return generateMessageIDV2();
  },

  /**
   * Sends standard or custom media message payload
   */
  async sendMedia(sock, jid, { type, buffer, caption, mimetype, fileName, ptt }, options = {}) {
    const payload = {};
    if (type === 'image') {
      payload.image = buffer;
      payload.caption = caption;
    } else if (type === 'video') {
      payload.video = buffer;
      payload.caption = caption;
    } else if (type === 'audio') {
      payload.audio = buffer;
      payload.mimetype = mimetype || 'audio/mp4';
      payload.ptt = !!ptt;
    } else if (type === 'document') {
      payload.document = buffer;
      payload.mimetype = mimetype || 'application/octet-stream';
      payload.fileName = fileName || 'document';
      payload.caption = caption;
    } else if (type === 'sticker') {
      payload.sticker = buffer;
    } else {
      throw new Error(`Unsupported media type: ${type}`);
    }

    return await sock.sendMessage(jid, payload, options);
  },

  // ───────────────────────────────────────────────────────────────────────
  // RICH MESSAGE GENERATORS — direct relay via sock.relayMessage
  // Uses the fork's generator functions (rich-message-utils.js) which build
  // the complete botForwardedMessage proto and relay it untouched.
  // All verified rendering on real WA clients (2026-08-04).
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Sends a rich table card (native WA table bubble).
   */
  async sendRichTable(sock, jid, content, opts = {}) {
    try {
      // buildV2Content and buildV2ContextInfo are statically imported at the top of this file
      const sections = [];
      if (content.headerText || content.title) {
        sections.push({
          view_model: {
            primitive: { text: content.headerText || content.title, __typename: 'GenAIMarkdownTextUXPrimitive' },
            __typename: 'GenAISingleLayoutViewModel',
          },
        });
      }
      const unified_rows = [
        ...(content.headers ? [{ is_header: true, cells: content.headers.map(String) }] : []),
        ...content.rows.map(r => ({ is_header: false, cells: r.map(String) })),
      ];
      sections.push({
        view_model: {
          primitive: { rows: unified_rows, __typename: 'GenATableUXPrimitive' },
          __typename: 'GenAISingleLayoutViewModel',
        },
      });
      if (content.footer) {
        sections.push({
          view_model: {
            primitive: { text: content.footer, __typename: 'GenAIMarkdownTextUXPrimitive' },
            __typename: 'GenAISingleLayoutViewModel',
          },
        });
      }
      const ctxInfo = buildV2ContextInfo(opts.quoted);
      const generated = { message: buildV2Content(sections, ctxInfo), messageId: generateMessageIDV2() };
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichTable] relay failed:', err.message);
      const allRows = [...(content.headers ? [content.headers] : []), ...content.rows];
      const text = '*' + content.title + '*\n' + allRows.map(r => r.join(' | ')).join('\n') + (content.footer ? '\n_' + content.footer + '_' : '');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a rich code block (native syntax-highlighted).
   */
  async sendRichCode(sock, jid, content, opts = {}) {
    try {
      // generateCodeBlockContentV2 is statically imported at the top of this file
      const generated = generateCodeBlockContentV2(
        content.code,
        opts.quoted,
        { text: content.caption, footer: content.footer, language: content.language || 'javascript' }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichCode] relay failed:', err.message);
      const text = (content.caption ? '*' + content.caption + '*\n\n' : '') + '```\n' + content.code.slice(0, 3000) + '\n```';
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends an inline video + stats table (Meta AI layout).
   */
  async sendInlineVideoStats(sock, jid, content, opts = {}) {
    try {

      const generated = generateInlineVideoWithStatsV2(content, opts.quoted, {
        headerText: content.headerText,
        footer: content.footer,
      });
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendInlineVideoStats] relay failed:', err.message);
      const title = (content.video && content.video.title) ? content.video.title : 'Video';
      const text = title + '\n' + content.tableRows.map(r => r.join(' | ')).join('\n');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a reel carousel (swipeable video cards).
   */
  async sendReelCarousel(sock, jid, content, opts = {}) {
    try {

      const generated = generateReelContentV2(content.reels, opts.quoted, {
        headerText: content.headerText,
        footer: content.footer,
      });
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendReelCarousel] relay failed:', err.message);
      const text = content.reels.map(r => r.title + ': ' + r.videoUrl).join('\n\n');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a rich citation/links card.
   */
  async sendRichLinks(sock, jid, content, opts = {}) {
    try {

      const generated = generateLinkContentV2(
        content.text || content.headerText || 'Sources',
        content.links,
        opts.quoted,
        { footer: content.footer }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichLinks] relay failed:', err.message);
      const text = content.links.map((l, i) => '[' + (i+1) + '] ' + l.title + '\n' + l.url).join('\n\n');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a rich inline image card.
   */
  async sendRichImage(sock, jid, content, opts = {}) {
    try {

      // Use V2 image generator with an empty table (just the image section)
      const generated = generateInlineImageWithTableV2(
        {
          image: {
            imageUrl: typeof content.imageUrl === 'string'
              ? { imagePreviewUrl: content.imageUrl, imageHighResUrl: content.imageUrl }
              : content.imageUrl,
            imageText: content.caption || '',
            alignment: 0,
            tapLinkUrl: content.tapLinkUrl || '',
          },
          tableHeaders: [''],
          tableRows: [],
        },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichImage] relay failed:', err.message);
      return sock.sendMessage(jid, { text: content.caption || content.imageUrl }, opts);
    }
  },

  /**
   * Sends a rich LaTeX math expression.
   */
  async sendRichLatex(sock, jid, content, opts = {}) {
    try {

      const generated = generateLatexContentV2(
        opts.quoted,
        {
          expressions: [{ latexExpression: content.latex, latexText: content.caption || '' }],
          footer: content.footer,
          headerText: content.headerText,
        }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichLatex] relay failed:', err.message);
      return sock.sendMessage(jid, { text: content.latex }, opts);
    }
  },

  /**
   * Sends a rich location/map card.
   */
  async sendRichMap(sock, jid, content, opts = {}) {
    try {

      const generated = generateMapContentV2(
        { centerLatitude: content.latitude, centerLongitude: content.longitude, ...content },
        opts.quoted,
        { footer: content.footer }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendRichMap] relay failed:', err.message);
      const coords = (content.latitude || '') + ',' + (content.longitude || '');
      return sock.sendMessage(jid, { text: (content.title || 'Location') + ': ' + coords }, opts);
    }
  },

  // ── New combination generators (v0.3.18-r3) ────────────────────────────────

  /**
   * Sends a code block + table (V2 — native UI combo).
   */
  async sendCodeWithTable(sock, jid, content, opts = {}) {
    try {

      const generated = generateCodeWithTableV2(
        { code: content.code, language: content.language, tableTitle: content.tableTitle, tableHeaders: content.headers, tableRows: content.rows },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendCodeWithTable] relay failed:', err.message);
      const text = '```' + (content.language || '') + '\n' + content.code + '\n```\n*' + (content.tableTitle || '') + '*\n' + content.rows.map(r => r.join(' | ')).join('\n');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a map card + stats table (V2 — native UI combo).
   */
  async sendMapWithTable(sock, jid, content, opts = {}) {
    try {

      const generated = generateMapWithTableV2(
        { map: { centerLatitude: content.latitude, centerLongitude: content.longitude, annotations: content.annotations || [] }, tableTitle: content.tableTitle, tableHeaders: content.headers, tableRows: content.rows },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer, primitiveStyle: content.primitiveStyle || opts.primitiveStyle }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendMapWithTable] relay failed:', err.message);
      const coords = (content.latitude || '') + ',' + (content.longitude || '');
      return sock.sendMessage(jid, { text: (content.headerText || 'Location') + ': ' + coords + '\n' + content.rows.map(r => r.join(' | ')).join('\n') }, opts);
    }
  },

  /**
   * Sends text + inline image (V2 — native UI combo).
   */
  async sendTextWithImage(sock, jid, content, opts = {}) {
    try {

      const generated = generateTextWithInlineImageV2(
        content.text,
        { imageUrl: content.imageUrl, imageText: content.caption || '', tapLinkUrl: content.tapLinkUrl || '' },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer, primitiveStyle: content.primitiveStyle || opts.primitiveStyle }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendTextWithImage] relay failed:', err.message);
      return sock.sendMessage(jid, { text: content.text + '\n' + (content.imageUrl || '') }, opts);
    }
  },

  /**
   * Sends multiple inline images (V2 — native gallery).
   */
  async sendMultiImages(sock, jid, content, opts = {}) {
    try {

      const generated = generateMultiInlineImagesV2(
        content.images,
        opts.quoted,
        { headerText: content.headerText, footer: content.footer, primitiveStyle: content.primitiveStyle || opts.primitiveStyle }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendMultiImages] relay failed:', err.message);
      const text = content.images.map(img => (img.imageText || '') + ': ' + (img.imageUrl || '')).join('\n');
      return sock.sendMessage(jid, { text }, opts);
    }
  },

  /**
   * Sends a grid image gallery + table (V2 — native UI combo).
   */
  async sendGridImageWithTable(sock, jid, content, opts = {}) {
    try {

      const generated = generateGridImageWithTableV2(
        { gridImage: { gridImageUrl: content.gridImageUrl, imageUrls: content.imageUrls || [] }, tableTitle: content.tableTitle, tableHeaders: content.headers, tableRows: content.rows },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer, primitiveStyle: content.primitiveStyle || opts.primitiveStyle }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendGridImageWithTable] relay failed:', err.message);
      return sock.sendMessage(jid, { text: content.headerText || 'Gallery' + '\n' + (content.gridImageUrl || '') }, opts);
    }
  },

  /**
   * Sends a dynamic (animated GIF/image) + table (V2 — native UI combo).
   */
  async sendDynamicWithTable(sock, jid, content, opts = {}) {
    try {

      const generated = generateDynamicWithTableV2(
        { dynamic: { type: content.dynamicType || 'GIF', url: content.dynamicUrl, version: content.dynamicVersion || 1, loopCount: content.loopCount || 0 }, tableTitle: content.tableTitle, tableHeaders: content.headers, tableRows: content.rows },
        opts.quoted,
        { headerText: content.headerText, footer: content.footer, primitiveStyle: content.primitiveStyle || opts.primitiveStyle }
      );
      return await sock.relayMessage(jid, generated.message, { messageId: generated.messageId });
    } catch (err) {
      console.warn('[baileysBridge.sendDynamicWithTable] relay failed:', err.message);
      return sock.sendMessage(jid, { text: content.headerText || 'Dynamic' + '\n' + (content.dynamicUrl || '') }, opts);
    }
  },
};

export default baileysBridge;
