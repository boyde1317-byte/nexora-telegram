import { proto } from 'baileys';
import { capabilities as staticCaps } from './capabilities.js';

/**
 * Scans the active Baileys socket and reconciles with the static capability
 * verdicts in capabilities.js to produce a compatibility map whose keys match
 * the strings declared in each menu type's `supportedMessages` array.
 *
 * WHY static verdicts instead of live proto introspection:
 *   protobufjs does NOT expose nested message types as direct constructor
 *   properties — `proto.Message.InteractiveMessage` is always undefined even
 *   when the type is compiled into WAProto.proto. Relying on proto introspection
 *   causes every nested type check to return false and wrecks menulist output.
 *   Static verdicts are derived once from WAProto.proto at capabilities.js
 *   authoring time, then pinned until a baileys fork upgrade.
 *
 * NAMING CONVENTION:
 *   Keys must match the strings used in menu type `supportedMessages` arrays
 *   so that menulist.js compatibility checks (`capabilities[msgType] === false`)
 *   fire correctly.
 *
 * @param {object} sock - Active WASocket instance (used for runtime socket checks)
 * @returns {object} Flat capability map keyed by WAProto message type name
 */
export const scanCapabilities = (sock) => {
  // ── Runtime socket checks (the only reliable live introspection) ──────────
  // Newsletter socket methods are exposed as functions on the socket object —
  // this IS inspectable at runtime unlike proto nested type constructors.
  const hasNewsletterSocket = (
    typeof sock?.newsletterCreate   === 'function' &&
    typeof sock?.newsletterFollow   === 'function' &&
    typeof sock?.newsletterUnfollow === 'function' &&
    typeof sock?.newsletterMetadata === 'function'
  );

  // ── Build the capability map ───────────────────────────────────────────────
  // Keys listed in alphabetical order. Each key must correspond 1-to-1 with
  // strings used in menu type supportedMessages arrays.
  return {
    // ── Core interactive types (always true — confirmed in WAProto.proto) ─
    interactiveMessage:   staticCaps.interactive,      // true
    nativeFlowMessage:    staticCaps.nativeFlow,       // true
    extendedTextMessage:  true,
    imageMessage:         true,
    videoMessage:         true,
    audioMessage:         true,
    documentMessage:      staticCaps.documentInteractive, // true
    contactMessage:       true,
    locationMessage:      true,
    orderMessage:         true,                        // orderMessage is standard WA catalog

    // ── optionText / bottom-sheet ─────────────────────────────────────────
    // BottomSheetMessage is NOT a separate proto type (absent from WAProto.proto).
    // The "bottom sheet" UX is triggered by the `optionText` field inside a
    // standard nativeFlowMessage — so the real gate is nativeFlow, not bottomSheet.
    bottomSheetMessage:   false,                       // proto type does not exist
    optionText:           staticCaps.nativeFlow,       // true — field on nativeFlowMessage

    // ── Carousel ─────────────────────────────────────────────────────────
    // The fork routes { carousel: { cards } } through generateWAMessageContent,
    // not via a standalone carouselMessage proto. Capability is inherited from
    // interactiveMessage being present.
    carouselMessage:      staticCaps.interactive,      // true

    // ── Album (multi-image/video) ─────────────────────────────────────────
    albumMessage:         staticCaps.album,            // true

    // ── Payment ──────────────────────────────────────────────────────────
    // requestPaymentMessage IS present in WAProto.proto. However WhatsApp only
    // renders payment cards on verified business / payment-enabled accounts in
    // supported regions. The capability is true at proto level but may silently
    // no-op at the WA server level on regular accounts.
    requestPaymentMessage: staticCaps.requestPayment ?? true,

    // ── Event ────────────────────────────────────────────────────────────
    // eventMessage IS confirmed present in WAProto.proto (static verdict).
    eventMessage:         staticCaps.eventMessage ?? true,

    // ── Newsletter ───────────────────────────────────────────────────────
    // adminInviteMessage / followerInviteMessage are nested proto types —
    // proto introspection always returns false for them (protobufjs limitation).
    // Use the live socket check instead.
    newsletterAdminInviteMessage:    hasNewsletterSocket,
    newsletterFollowerInviteMessage: hasNewsletterSocket,

    // ── Reaction / edit ──────────────────────────────────────────────────
    react: true,    // sock.sendMessage({ react }) — standard Baileys
    edit:  true,    // sock.sendMessage({ edit: key }) — standard Baileys

    // ── Rich response / AI message ────────────────────────────────────────
    richResponseMessage:  staticCaps.richResponse,     // true
    botForwardedMessage:  staticCaps.richResponse,     // true

    // ── Stickers / lottie ─────────────────────────────────────────────────
    stickerMessage:       true,
    stickerPackMessage:   staticCaps.stickerPack,      // true
    lottieStickerMessage: staticCaps.lottieSticker,    // true

    // ── Poll / quiz ───────────────────────────────────────────────────────
    pollCreationMessage:  true,
    quizPoll:             staticCaps.quizPoll,         // true

    // ── Spoiler / group status ────────────────────────────────────────────
    spoilerMessage:       staticCaps.spoilerMessage,   // true
    groupStatusMessageV2: staticCaps.groupStatus,      // true

    // ── Short-form aliases (consumed by capabilities.js importers) ────────
    interactive:        staticCaps.interactive,
    nativeFlow:         staticCaps.nativeFlow,
    bottomSheet:        false,                         // not a proto type
    album:              staticCaps.album,
    richResponse:       staticCaps.richResponse,
    newsletter:         hasNewsletterSocket,
  };
};

export default scanCapabilities;
