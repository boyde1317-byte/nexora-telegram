/**
 * Do not remove this watermark.
 *
 * NIXCODE - Advanced WhatsApp Interactive Message Builder
 * Built for creating buttons, carousels, native flows,
 * and AI rich response payloads using Baileys with
 * fluent chaining, flexible payload customization,
 * and scalable architecture for modern bot development.
 *
 * Runtime:
 * - Baileys: @whiskeysockets/baileys (latest)
 *
 * Created by Nixel
 * Contributors: ~ Ahmad tumbuh kembang
 *
 * WhatsApp: wa.me/6282139672290
 * Channel: https://whatsapp.com/channel/0029VbCV1ck8fewpdNb2TY2k
 *
 * Copyright (c) 2026 Nixel
 *
 * Permission is granted to use and modify this library
 * for personal or commercial projects.
 *
 * Reuploading, reselling, relicensing, or redistributing
 * this library as a standalone product is prohibited.
 *
 * Do not claim this project as your own original work.
 *
 * ── NEXORA-MD adaptation (moonsonKit) ─────────────────────────────────────
 * Ported from Moonson's lib/NIXCODE.js v4.5 (Button / ButtonV2 / Carousel —
 * the renderable interactive builders; the AIRich GenAI class is intentionally
 * NOT ported — richResponseMessage/botForwardedMessage needs a Meta-signed
 * bot certificate and renders as the "update WhatsApp" placeholder, see
 * core/capabilities.js).
 *
 * Differences vs upstream NIXCODE:
 *   - send() routes through baileysBridge.relayMessage() instead of raw
 *     sock.relayMessage: the bridge injects messageContextInfo.messageSecret
 *     for interactiveMessage/buttonsMessage and auto-attaches the
 *     native_flow biz stanza — no manual additionalNodes needed.
 *   - generateWAMessageFromContent is invoked by the bridge, not here.
 */

import { prepareWAMessageMedia } from 'baileys';
import crypto from 'crypto';
import { baileysBridge } from '../core/baileysBridge.js';

class BaseBuilder {
  constructor() {
    this._title = '';
    this._subtitle = '';
    this._body = '';
    this._footer = '';
    this._contextInfo = {};
    this._extraPayload = {};
  }

  setTitle(title) {
    if (typeof title !== 'string') {
      throw new TypeError('Title must be a string');
    }
    this._title = title;
    return this;
  }

  setSubtitle(subtitle) {
    if (typeof subtitle !== 'string') {
      throw new TypeError('Subtitle must be a string');
    }
    this._subtitle = subtitle;
    return this;
  }

  setBody(body) {
    if (typeof body !== 'string') {
      throw new TypeError('Body must be a string');
    }
    this._body = body;
    return this;
  }

  setFooter(footer) {
    if (typeof footer !== 'string') {
      throw new TypeError('Footer must be a string');
    }
    this._footer = footer;
    return this;
  }

  setContextInfo(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('ContextInfo must be a plain object');
    }

    this._contextInfo = obj;
    return this;
  }

  addPayload(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Payload must be a plain object');
    }

    Object.assign(this._extraPayload, obj);

    return this;
  }

  static async resize(buffer, x, y, fit = 'cover') {
    const { default: sharp } = await import('sharp');
    return await sharp(buffer)
      .resize(x, y, {
        fit,
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  static async fetchBuffer(url, options = {}, config = {}) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (config.silent) return Buffer.alloc(0);
      throw error;
    }
  }
}

/**
 * Interactive card (interactiveMessage + nativeFlowMessage).
 * The full NIXCODE builder: single_select sheets, quick replies,
 * cta_url / cta_copy / cta_call / cta_reminder / send_location buttons.
 */
class Button extends BaseBuilder {
  constructor(sock) {
    super();
    if (!sock) {
      throw new Error('Socket is required');
    }
    this._sock = sock;

    this._buttons = [];
    this._data;
    this._currentSelectionIndex = -1;
    this._currentSectionIndex = -1;
    this._params = {};
  }

  setVideo(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { video: path, ...options }) : (this._data = { video: { url: path }, ...options });
    return this;
  }

  setImage(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { image: path, ...options }) : (this._data = { image: { url: path }, ...options });
    return this;
  }

  setDocument(path, options = {}) {
    if (!path) throw new Error('Url or buffer needed');
    Buffer.isBuffer(path) ? (this._data = { document: path, ...options }) : (this._data = { document: { url: path }, ...options });
    return this;
  }

  setMedia(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Media must be a plain object');
    }

    this._data = obj;
    return this;
  }

  clearButtons() {
    this._buttons = [];
    return this;
  }

  setParams(obj) {
    this._params = obj;
    return this;
  }

  addButton(name, params) {
    this._buttons.push({
      name,
      buttonParamsJson: typeof params === 'string' ? params : JSON.stringify(params),
    });

    return this;
  }

  makeRow(header = '', title = '', description = '', id = '') {
    if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) {
      throw new Error('You need to create a selection and a section first');
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id });
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }

  makeSection(title = '', highlight_label = '') {
    if (this._currentSelectionIndex === -1) {
      throw new Error('You need to create a selection first');
    }
    const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson);
    buttonParams.sections.push({ title, highlight_label, rows: [] });
    this._currentSectionIndex = buttonParams.sections.length - 1;
    this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
    return this;
  }

  addSelection(title, options = {}) {
    this._buttons.push({ ...options, name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections: [] }) });
    this._currentSelectionIndex = this._buttons.length - 1;
    this._currentSectionIndex = -1;
    return this;
  }

  addReply(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addCall(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addReminder(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_reminder',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addCancelReminder(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'cta_cancel_reminder',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addAddress(display_text = '', id = '', options = {}) {
    this._buttons.push({
      name: 'address_message',
      buttonParamsJson: JSON.stringify({
        display_text,
        id,
        ...options,
      }),
    });
    return this;
  }

  addLocation(options = {}) {
    this._buttons.push({
      name: 'send_location',
      buttonParamsJson: JSON.stringify(options),
    });
    return this;
  }

  addUrl(display_text = '', url = '', webview_interaction = false, options = {}) {
    this._buttons.push({
      ...options,
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text,
        url,
        webview_interaction,
        ...options,
      }),
    });
    return this;
  }

  addCopy(display_text = '', copy_code = '', options = {}) {
    this._buttons.push({
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text,
        copy_code,
        ...options,
      }),
    });
    return this;
  }

  async toCard() {
    return {
      body: {
        text: this._body,
      },
      footer: {
        text: this._footer,
      },
      header: {
        title: this._title,
        subtitle: this._subtitle,
        hasMediaAttachment: !!this._data,
        ...(this._data
          ? await prepareWAMessageMedia(this._data, { upload: this._sock.waUploadToServer }).catch((e) => {
              if (String(e).includes('Invalid media type')) return this._data;
              throw e;
            })
          : {}),
      },
      nativeFlowMessage: {
        messageParamsJson: JSON.stringify(this._params),
        buttons: this._buttons,
      },
    };
  }

  async buildContent() {
    const message = await this.toCard();

    return {
      ...this._extraPayload,
      interactiveMessage: {
        ...message,
        contextInfo: this._contextInfo,
      },
    };
  }

  async send(jid, { ...options } = {}) {
    const content = await this.buildContent();

    // Bridge handles generateWAMessageFromContent + messageSecret injection +
    // native_flow biz stanza (hasNativeFlowContent) automatically.
    return await baileysBridge.relayMessage(this._sock, jid, content, options);
  }
}

/**
 * Legacy grey-pill card (buttonsMessage with location header + thumbnail).
 * NIXCODE parity: viewOnce defaults to true — call setViewOnce(false) for
 * persistent menu cards (see baileysBridge.sendButtonsCard note).
 */
class ButtonV2 extends BaseBuilder {
  constructor(sock) {
    super();
    if (!sock) {
      throw new Error('Socket is required');
    }

    this._sock = sock;
    this._image;
    this._data;
    this._viewOnce = true;
    this._buttons = [];
  }

  addButton(displayText = '', buttonId = crypto.randomUUID()) {
    this._buttons.push({
      buttonId,
      buttonText: { displayText },
      type: 1,
    });
    return this;
  }

  addRawButton(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Buttons must be a plain object');
    }

    this._buttons.push(obj);
    return this;
  }

  setViewOnce(enabled = true) {
    this._viewOnce = !!enabled;
    return this;
  }

  setThumbnail(path) {
    if (!path) throw new Error('Url or buffer needed');
    this._image = path;
    return this;
  }

  setMedia(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new TypeError('Media must be a plain object');
    }

    this._data = obj;
    return this;
  }

  async buildContent() {
    // NEXORA patch: a buttonsMessage location header without a
    // jpegThumbnail renders blank. Default to the same brand image the
    // menu uses (unless .image() was called). Any fetch/resize failure
    // falls back to the pre-patch behavior (no thumbnail) — a failed
    // header image must never break the card send.
    let _thumbSrc = this._image;
    if (!_thumbSrc) {
      try {
        const { ASSET_URLS } = await import('../assets/assetUrls.js');
        _thumbSrc = ASSET_URLS.thumbnail || null;
      } catch (_) {}
    }
    let _thumbnail = null;
    if (_thumbSrc) {
      try {
        const buf = Buffer.isBuffer(_thumbSrc)
          ? _thumbSrc
          : await BaseBuilder.fetchBuffer(_thumbSrc, {}, { silent: true });
        if (buf && buf.length) _thumbnail = await BaseBuilder.resize(buf, 300, 300);
      } catch (_) { _thumbnail = null; }
    }

    return {
      ...this._extraPayload,
      buttonsMessage: {
        contentText: this._body,
        footerText: this._footer,
        ...(this._data
          ? this._data
          : {
              headerType: 6,
              locationMessage: {
                degreesLatitude: 0,
                degreesLongitude: 0,
                name: this._title,
                address: this._subtitle,
                jpegThumbnail: _thumbnail,
              },
            }),
        viewOnce: this._viewOnce,
        contextInfo: this._contextInfo,
        buttons: [...this._buttons],
      },
    };
  }

  async send(jid, { ...options } = {}) {
    if (this._buttons.length < 1) throw new Error('ButtonV2 requires at least one button');
    const content = await this.buildContent();

    return await baileysBridge.relayMessage(this._sock, jid, content, options);
  }
}

/**
 * Swipeable card carousel (interactiveMessage.carouselMessage).
 * Cards require media (image/video) in their header — NIXCODE enforces this.
 */
class Carousel extends BaseBuilder {
  constructor(sock) {
    super();
    if (!sock) {
      throw new Error('Socket is required');
    }

    this._sock = sock;
    this._cards = [];
  }

  addCard(card) {
    const cards = Array.isArray(card) ? card : [card];
    const baseIndex = this._cards.length;

    for (const [index, c] of cards.entries()) {
      if (!c?.header?.hasMediaAttachment) {
        throw new Error(`Card [${baseIndex + index}] must include an image or video in header`);
      }
    }

    this._cards.push(...cards);
    return this;
  }

  buildContent() {
    return {
      ...this._extraPayload,
      interactiveMessage: {
        header: {
          hasMediaAttachment: false,
        },
        body: { text: this._body },
        footer: { text: this._footer },
        contextInfo: this._contextInfo,
        carouselMessage: {
          cards: this._cards,
        },
      },
    };
  }

  async send(jid, { ...options } = {}) {
    const content = this.buildContent();

    return await baileysBridge.relayMessage(this._sock, jid, content, options);
  }
}

export { Button, ButtonV2, Carousel };
export default { Button, ButtonV2, Carousel };
