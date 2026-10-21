/**
 * vipRichKit — generic GenAI unified-response builder (r18).
 *
 * Farmed from Lady-Trish/Omegatech's VIP reaction card (in-the-wild proven
 * envelope). Their full outer shape, minus the junk:
 *   ✅ messageContextInfo.messageSecret (crypto-random 32B) — REQUIRED for
 *      clients to render the botForwardedMessage envelope. Our older htmlGames
 *      envelope omitted it and was never device-verified.
 *   ✅ botMetadata: messageDisclaimerText + botResponseId (+ optional
 *      verificationMetadata.proofs from our own cert chain).
 *   ✅ contextInfo extras: expiration 7776000, forwardingScore 1, isForwarded,
 *      forwardedAiBotMessageInfo.botJid @bot, forwardOrigin 4, optional
 *      forwardedNewsletterMessageInfo + mentionedJid + quotedMessage.
 *   ❌ their senderKeyDistributionMessage with a HARDCODED axolotl blob bound
 *      to a foreign group (120363425020013890@g.us) — cargo cult that leaks a
 *      third-party sender-key blob into every chat. Deliberately NOT ported.
 *
 * Primitive builders cover: productItemCard, markdownText (with citation
 * chips), 3PExtWidget (CTAs with toasts), followUpPills, and any custom
 * primitive via raw().
 *
 * CTA note: GenAI3PExtWidgetCTA taps show the toast and are routed via
 * tool_call_id to the botJid in forwardedAiBotMessageInfo. We are not a real
 * Meta AI endpoint, so taps are toast-only theater (same as the source bot's
 * actual behavior in practice).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { generateWAMessageFromContent } from 'baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'htmlgames');

const VERIFICATION_SIGNATURE =
  'HAgEAkwAawAgV60r8LC1zhSDWyiFYBJWUVI4xgUu1c5EF3ibZoOXhByVMVFcM4AJlETvUyKTKIEJt9+q9TLa0BRuAJKEQdImFnIwZe0bfvAHWPCD+zTPDcsENCTIQ1Gf98f70kFTzECEAI7Z+F4IHhTfWj0DTvVXqEFx4lB21qgvGRIQCIH3wOh35UjNTCXeN0O6EBMSAKyGM0EBIFQZcPZ';

function loadCertificateChain() {
  try {
    const raw = fs.readFileSync(path.join(ASSETS_DIR, 'certificate.json'), 'utf-8');
    const chain = JSON.parse(raw);
    return Array.isArray(chain) ? chain : [];
  } catch {
    return [];
  }
}

// ─── Primitive builders ────────────────────────────────────────────────────

/** Fake product card repurposed as a branded status banner. */
export function productItemCard({ title, brand = 'NEXORA', price, salePrice, productUrl, imageUrl, additionalImages = [], image = null }) {
  return {
    title, brand,
    price: price || '✅ Success',
    ...(salePrice ? { sale_price: salePrice } : {}),
    product_url: productUrl || 'https://wa.me/233533416608',
    image: image || { url: imageUrl, mime_type: 'image/jpeg' },
    additional_images: additionalImages,
    __typename: 'GenAIProductItemCardPrimitive',
  };
}

/** Markdown body text, optionally with tappable citation chips. */
export function markdownText(text, citations = []) {
  // citations: [{ url, title, displayName }]
  return {
    text,
    inline_entities: citations.map((c, i) => ({
      key: `CI_${i}`,
      metadata: {
        reference_id: i + 1,
        reference_url: c.url,
        reference_title: c.title || c.url,
        reference_display_name: c.displayName || '🔗 Link',
        sources: [],
        __typename: 'GenAISearchCitationItem',
      },
    })),
    __typename: 'GenAIMarkdownTextUXPrimitive',
  };
}

/** Suggested-prompt pills (each renders as a rounded chip). */
export function followUpPills(textOrArray, type = 'SUGGESTED_PROMPT') {
  const pills = Array.isArray(textOrArray) ? textOrArray : [textOrArray];
  return pills.map((p) =>
    typeof p === 'object' ? { ...p, __typename: 'GenAIFollowUpSuggestionPillPrimitive' }
      : { prompt_text: p, prompt_type: type, __typename: 'GenAIFollowUpSuggestionPillPrimitive' });
}

/**
 * 3P extension widget — header + CTA buttons with toast feedback.
 * ctas: [{ label, state = 'PENDING', kind = 'OTHER', toolCallId, toast }]
 */
export function extWidget({ title, subtitle, ctas = [] }) {
  return {
    __typename: 'GenAI3PExtWidgetPrimitive',
    header: {
      __typename: 'GenAI3PExtWidgetStandardHeader',
      title,
      ...(subtitle ? { subtitle } : {}),
    },
    body: {
      __typename: 'GenAI3PExtCalendarEventList',
      sections: [],
      ctas: ctas.map((c, i) => ({
        __typename: 'GenAI3PExtWidgetCTA',
        label: c.label || `Action ${i + 1}`,
        state: c.state || 'PENDING',
        kind: c.kind || 'OTHER',
        tool_call_id: c.toolCallId || String(i).padStart(2, '0'),
        toast: { __typename: 'GenAI3PExtWidgetToast', label: c.toast || c.label || 'OK' },
      })),
    },
  };
}

/** Any raw primitive object (must carry its own __typename). */
export function rawPrimitive(obj) {
  return obj;
}

/** Single-vertical-layout section around one primitive. */
export function singleSection(primitive) {
  return {
    view_model: { primitive, __typename: 'GenAISingleLayoutViewModel' },
    __typename: 'GenAIUnifiedResponseSection',
  };
}

/** Horizontal-scroll section around multiple primitives (carousel). */
export function hScrollSection(primitives) {
  return {
    view_model: { primitives, __typename: 'GenAIHScrollLayoutViewModel' },
    __typename: 'GenAIUnifiedResponseSection',
  };
}

// ─── Envelope sender ───────────────────────────────────────────────────────

/**
 * Sends a unified-response rich card. options:
 *   sections           — array of GenAIUnifiedResponseSection (required)
 *   disclaimer         — botMetadata.messageDisclaimerText (short badge text)
 *   submessages        — [{ messageType: 2, messageText }] header rows
 *   quoted             — quoted message (obj with key/message) or null
 *   newsletter         — { jid, serverMessageId, name } forwarded-from chip
 *   mentionedJid       — array of JIDs to mention
 *   botJid             — forwardedAiBotMessageInfo.botJid (default Meta AI id)
 *   withProofs         — attach verificationMetadata cert-chain proofs
 */
export async function sendUnifiedRich(sock, jid, {
  sections, disclaimer = '', submessages = [], quoted = null,
  newsletter = null, mentionedJid = [], botJid = '867051314767696@bot',
  withProofs = true, additionalNodes,
} = {}) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('sendUnifiedRich: sections array required');
  }
  const responseId = crypto.randomUUID();
  const messageSecret = crypto.randomBytes(32); // required — Omegatech parity
  const stanzaId = crypto.randomBytes(16).toString('hex').toUpperCase();

  const unified = Buffer.from(JSON.stringify({
    response_id: responseId,
    sections,
  })).toString('base64');

  const certificateChain = withProofs ? loadCertificateChain() : [];

  const content = {
    messageContextInfo: {
      messageSecret,
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: disclaimer,
        botResponseId: responseId,
        ...(certificateChain.length
          ? {
              verificationMetadata: {
                proofs: [
                  {
                    version: 1,
                    useCase: 1,
                    signature: VERIFICATION_SIGNATURE,
                    certificateChain,
                  },
                ],
              },
            }
          : {}),
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          ...(submessages.length ? { submessages } : {}),
          unifiedResponse: { data: unified },
          contextInfo: {
            ...(quoted && typeof quoted === 'object'
              ? {
                  stanzaId: quoted.key?.id || stanzaId,
                  participant: quoted.key?.participant || quoted.participant,
                  quotedMessage: quoted.message ?? quoted,
                }
              : { stanzaId }),
            forwardingScore: 1,
            isForwarded: true,
            expiration: 7776000,
            forwardedAiBotMessageInfo: { botJid },
            forwardOrigin: 4,
            ...(mentionedJid.length ? { mentionedJid } : {}),
            ...(newsletter
              ? {
                  forwardedNewsletterMessageInfo: {
                    newsletterJid: newsletter.jid,
                    serverMessageId: newsletter.serverMessageId ?? 1,
                    newsletterName: newsletter.name || '',
                  },
                }
              : {}),
          },
        },
      },
    },
  };

  const message = await generateWAMessageFromContent(jid, content, {
    userJid: sock.user?.id || '0@s.whatsapp.net',
  });
  await sock.relayMessage(jid, message.message, {
    messageId: message.key.id,
    ...(additionalNodes ? { additionalNodes } : {}),
  });
  return { ok: true, key: message.key, responseId };
}
