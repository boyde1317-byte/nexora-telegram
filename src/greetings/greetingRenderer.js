import fs from 'node:fs';
import path from 'node:path';
import { greetingConfig } from './greetingConfig.js';
import { messageCapability } from './messageCapability.js';
import { welcome1 } from './greetingStyles/welcome1.js';
import { welcome2 } from './greetingStyles/welcome2.js';
import { welcome3 } from './greetingStyles/welcome3.js';
import { welcome4 } from './greetingStyles/welcome4.js';
import { db } from '../database/db.js';

// Simple in-memory caches to prevent rate limiting & disk bottleneck
const profilePicCache = new Map();
const queue = [];
let processingQueue = false;

const STYLES = {
  1: welcome1,
  2: welcome2,
  3: welcome3,
  4: welcome4
};

// Anti-spam: rapid joins in one group are collapsed into a SINGLE combined
// greeting instead of one message per joiner (join raids were flooding chats).
const JOIN_BATCH_WINDOW_MS = 15000;
const pendingBatches = new Map(); // `${jid}:${in|out}` -> { users:Set, isWelcome, timer }

/**
 * Sequential execution queue to prevent race conditions during rapid joins
 */
const enqueueTask = (task) => {
  queue.push(task);
  triggerQueue();
};

const triggerQueue = async () => {
  if (processingQueue) return;
  processingQueue = true;
  while (queue.length > 0) {
    const task = queue.shift();
    try {
      await task();
    } catch (err) {
      console.error('[GREETING RENDERER] Task execution error:', err);
    }
  }
  processingQueue = false;
};

export const greetingRenderer = {
  /**
   * Fetches user profile picture with fallback cache
   */
  async getUserProfilePic(sock, userJid) {
    if (profilePicCache.has(userJid)) {
      return profilePicCache.get(userJid);
    }
    try {
      const url = await sock.profilePictureUrl(userJid, 'image');
      if (url) {
        profilePicCache.set(userJid, url);
        return url;
      }
    } catch (err) {
      // Benign error if user has privacy settings blocking PP
    }
    return null;
  },

  /**
   * Checks whether greetings should fire for a given group.
   *
   * Resolution order:
   *   1. Per-group DB flag (db.getGroup(jid).welcome / .goodbye)
   *      — set via `.welcome on/off` run inside that group
   *   2. Global greetingConfig flag (greeting.json)
   *      — set via `.welcome on/off` run in DM (no group context)
   *
   * If the per-group flag is explicitly true or false, it wins.
   * If the per-group flag was never set (undefined), we fall back to
   * the global default.
   */
  _isGreetingEnabled(jid, isWelcome) {
    const groupData = db.getGroup(jid);

    if (isWelcome) {
      // Per-group flag takes priority if explicitly set
      if (typeof groupData.welcome === 'boolean') {
        return groupData.welcome;
      }
      // Fall back to global
      return greetingConfig.getEnabled();
    } else {
      // Goodbye
      if (typeof groupData.goodbye === 'boolean') {
        return groupData.goodbye;
      }
      // Fall back to global
      return greetingConfig.getGoodbyeEnabled();
    }
  },

  /**
   * Entry point — normalizes the participant JID, checks the group's
   * greeting flags, and batches rapid joins so a join raid produces ONE
   * message instead of one per joiner.
   */
  async renderAndSend({ sock, jid, userJid, isWelcome }) {
    // group-participants.update can hand over participant entries that are
    // objects ({ jid, ... }) or undefined on some event shapes — normalize
    // here instead of letting userJid.split() crash mid-render.
    if (userJid && typeof userJid === 'object') {
      userJid = userJid.jid || userJid.id || userJid.lid || null;
    }
    if (typeof userJid !== 'string' || !userJid.includes('@')) {
      console.warn('[GREETING RENDERER] Skipping render — invalid userJid:', JSON.stringify(userJid));
      return;
    }

    if (!this._isGreetingEnabled(jid, isWelcome)) {
      console.log(`[GREETING RENDERER] ${isWelcome ? 'Welcome' : 'Goodbye'} disabled for ${jid} (per-group or global)`);
      return;
    }

    const key = `${jid}:${isWelcome ? 'in' : 'out'}`;
    let batch = pendingBatches.get(key);
    if (!batch) {
      batch = { users: new Set(), isWelcome, timer: null };
      pendingBatches.set(key, batch);
    }
    batch.users.add(userJid);
    clearTimeout(batch.timer);
    batch.timer = setTimeout(() => {
      pendingBatches.delete(key);
      const users = [...batch.users];
      enqueueTask(() => this._flushBatch({ sock, jid, users, isWelcome: batch.isWelcome }));
    }, JOIN_BATCH_WINDOW_MS);
  },

  /**
   * Sends either the styled greeting (single user) or one combined
   * multi-mention greeting (2+ users in the same batch window).
   */
  async _flushBatch({ sock, jid, users, isWelcome }) {
    try {
      // ── combined greeting for multiple users in one window ──────────────
      if (users.length > 1) {
        let metadata;
        try {
          metadata = await sock.groupMetadata(jid);
        } catch { /* fall through without metadata */ }
        const groupName = metadata?.subject || 'this group';
        const memberCount = metadata?.participants?.length || 0;
        const nameList = users.map(u => `@${u.split('@')[0]}`).join(', ');
        const text = isWelcome
          ? `👋 Welcome ${nameList} to *${groupName}* — you are member #${memberCount}! (${users.length} joined together)`
          : `👋 ${nameList} left *${groupName}*.`;
        await sock.sendMessage(jid, { text, mentions: users });
        console.log(`[GREETING RENDERER] Batched ${users.length} users into one greeting for ${jid}`);
        return;
      }

      const userJid = users[0];

      // 2. Fetch Group metadata
      let metadata;
      try {
        metadata = await sock.groupMetadata(jid);
      } catch (e) {
        console.error('[GREETING RENDERER] Failed to load group metadata:', e);
        return;
      }

      const groupName = metadata.subject || 'this Group';
      const memberCount = metadata.participants ? metadata.participants.length : 1;
      const userNumber = userJid.split('@')[0];
      const userMention = `@${userNumber}`;

      // 3. Fetch user profile pic
      const profilePicUrl = await this.getUserProfilePic(sock, userJid);

      const variables = {
        userNumber,
        userMention,
        groupName,
        memberCount,
        profilePicUrl
      };

      // 4. Select style based on active style ID
      const activeStyleId = greetingConfig.getStyle();
      const style = STYLES[activeStyleId] || welcome1;

      let payload = null;
      try {
        payload = await style.render({ sock, jid, userJid, variables, isWelcome });
      } catch (err) {
        console.error(`[GREETING RENDERER] Error rendering style ${activeStyleId}:`, err);
        // Fallback to Style 4 (Minimal) — text-only, safe on every client
        payload = await welcome4.render({ sock, jid, userJid, variables, isWelcome });
      }

      // 5. Message Capability Safeguards & Fallbacks
      const messageType = Object.keys(payload).find(key => ['image', 'document', 'text'].includes(key));
      const capability = messageCapability[`${messageType}Message`] || {};

      // If the selected message type is unsupported, fall back to simple text layout
      if (messageType && !capability) {
        console.log(`[GREETING RENDERER] Fallback triggered. Unsupported message type: ${messageType}`);
        payload = {
          text: payload.caption || payload.text,
          mentions: [userJid]
        };
      }

      // 6. Deliver the primary card
      await sock.sendMessage(jid, payload);

      // 7. Separate audio follow-up if custom welcome audio exists on disk
      const audioSubdir = isWelcome ? 'welcome' : 'goodbye';
      const audioDir = path.join(process.cwd(), 'media', 'greetings', audioSubdir);

      if (fs.existsSync(audioDir)) {
        const files = fs.readdirSync(audioDir);
        const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.ogg') || f.endsWith('.wav'));

        if (audioFile) {
          const absoluteAudioPath = path.join(audioDir, audioFile);
          console.log(`[GREETING RENDERER] Broadcasting secondary audio file: ${absoluteAudioPath}`);

          // Deliver separate audio attachment
          await sock.sendMessage(jid, {
            audio: { url: absoluteAudioPath },
            mimetype: 'audio/mp4',
            ptt: true // Push to Talk audio message format
          });
        }
      }

    } catch (err) {
      console.error('[GREETING RENDERER] Failed to render greeting layout:', err);
    }
  }
};

export default greetingRenderer;
