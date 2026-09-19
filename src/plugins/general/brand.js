/**
 * @file src/plugins/general/brand.js
 *
 * .brand — Moonson-style brand card, ported onto moonsonKit.
 *
 * This is the showpiece port of Moonson's commands/information/brand.js:
 * the same interactiveMessage card with the `booking_confirmation`
 * nativeFlow button that renders as the "📊 View Brand Details" pill —
 * tapping it opens a full-screen brand sheet (description, contact rows,
 * calendar-style CTA labels via display_content).
 *
 * Why this one ports cleanly (unlike .ping/.store in Moonson, which ride
 * the AIRich GenAI envelope): interactiveMessage + nativeFlowMessage render
 * on all modern clients — no bot-verification certificate involved.
 *
 * Differences vs Moonson's .brand:
 *   - built with moonsonKit.Button (fluent NIXCODE API) and sent through
 *     baileysBridge.relayMessage (messageSecret + biz stanza handled)
 *   - brand/config values come from Nexora's config (config/brand.js,
 *     config/owner.js) with env overrides for links
 *   - contextInfo carries the status-quoted contact card exactly like
 *     Moonson (quoted contactMessage vcard of the bot)
 */

import { Button } from '../../lib/moonsonKit.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { config } from '../../../config/index.js';

export default {
  name: 'brand',
  aliases: ['brandcard'],
  category: 'general',
  description: 'Interactive brand card with a full-screen brand details sheet (Moonson-style).',
  cooldown: 5000,
  execute: async ({ sock, m }) => {
    try {
      const botName      = brand.name;
      const creator      = brand.creator;
      const phone       = (owner.ownerNumber || '').replace(/[^0-9]/g, '');
      const groupLink   = process.env.BRAND_GROUP_LINK || `https://wa.me/${phone}`;
      const channelLink = process.env.BRAND_CHANNEL_LINK
        || `https://whatsapp.com/channel/${(config.channelJid || '').replace('@newsletter', '')}`;
      const websiteLink = process.env.BRAND_WEBSITE || groupLink;
      const footer      = brand.copyright || `© ${botName}`;

      // Full sheet content — shown when the user taps the booking button
      const brandDescription =
        `» *${botName}*\n` +
        `  › ${brand.description}\n\n` +
        `» *Who We Are*\n` +
        `  › ${brand.core} · ${brand.engine}\n` +
        `  › ${brand.ui} · ${brand.plugins}\n\n` +
        `» *What We Do*\n` +
        `  › WhatsApp Bot Framework\n` +
        `  › Automation & Digital Solutions\n` +
        `  › Custom Command Development\n\n` +
        `» *Our Stack*\n` +
        `  › ${botName} — v${brand.version}\n` +
        `  › ${brand.security} · ${brand.ai}\n\n` +
        `» *Our Team*\n` +
        `  › ${owner.ownerName} — Founder & Developer\n\n` +
        `» *Mission*\n` +
        `  › ${brand.tagline}\n\n` +
        `» *Values*\n` +
        `  › Innovation · Simplicity · Reliability\n` +
        `  › Community-Driven\n\n` +
        `» *Connect With Us*\n` +
        `  › WhatsApp: wa.me/${phone}\n` +
        `  › Group: ${groupLink}\n` +
        `  › Channel: ${channelLink}\n\n` +
        `_Powered by ${botName} — ${brand.signature}_`;

      // Compact card body — what renders in the chat bubble
      const outerBody =
        `» *${botName}*\n` +
        `  › ${brand.description}\n\n` +
        `» *Your Tech Hub*\n` +
        `  › Bots · Automation · Digital Solutions\n\n` +
        `_Tap the button below for full details._`;

      // Status-quoted contact card (same reply-bar effect Moonson uses)
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${botName} Bot`,
        `FN:${botName} Bot`,
        `ORG:${botName};`,
        `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
        'END:VCARD',
      ].join('\r\n');

      const card = new Button(sock)
        .setTitle(`🖥️ ${botName}`)
        .setBody(outerBody)
        .setFooter(footer)
        .setContextInfo({
          mentionedJid: [],
          stanzaId: 'StatusBiz',
          participant: '0@s.whatsapp.net',
          remoteJid: 'status@broadcast',
          quotedMessage: {
            contactMessage: {
              displayName: botName,
              vcard,
            },
          },
        });

      // booking_confirmation — the same button type Moonson's .brand uses
      card.addButton('booking_confirmation', {
        start_datetime: new Date().toISOString(),
        end_datetime: new Date(Date.now() + 600000).toISOString(),
        location: botName,
        booking_url: websiteLink,
        phone_number: phone,
        booking_management_url: `https://wa.me/${phone}`,
        description: brandDescription,
        email: '',
        display_text: `📊 View Brand Details`,
        display_content: {
          display_language: 'en',
          display_meeting_type: 'Brand Information',
          display_bottom_sheet_header: `📋 ${botName}`,
          display_add_to_calendar_cta_text: 'BRAND',
          display_view_on_maps_cta_text: 'View Website',
          display_manage_booking_cta_text: '📱 Contact',
          display_manage_booking_not_supported_text: 'Brand Info',
          display_read_more: 'View Details',
        },
      });

      await card.send(m.from, { quoted: m });
    } catch (err) {
      console.error('[brand] Error:', err);
      return await m.reply.error(`Failed to render brand card: ${err.message}`);
    }
  },
};
