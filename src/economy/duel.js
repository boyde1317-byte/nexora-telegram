/**
 * @file src/economy/duel.js
 * NEXORA Duel system — player-vs-player coin wagers with a proper
 * challenge → accept flow (no instant-theft duels), atomic dual-wallet
 * transfer, and win/loss records.
 *
 * Pending challenges live in memory with a 10-minute expiry; wallet moves
 * happen only at resolution, inside locks taken in a fixed order
 * (alphabetical) so two crossing duels can never deadlock or double-spend.
 */

import { db } from '../database/db.js';
import { grantXp, withUserLock } from './leveling.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_BET = 500000;

// key: `${chat}|${targetJid}` -> { challengerJid, amount, expiresAt }
const pendingChallenges = new Map();

function sweepChallenges() {
  const now = Date.now();
  for (const [k, c] of pendingChallenges) {
    if (c.expiresAt < now) pendingChallenges.delete(k);
  }
}

export function createChallenge(chatJid, challengerJid, targetJid, amount) {
  sweepChallenges();
  if (challengerJid === targetJid) {
    const err = new Error('You cannot duel yourself — even legends need an opponent.');
    err.friendly = true;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BET) {
    const err = new Error(`Bet must be between 1 and ${MAX_BET.toLocaleString()} coins.`);
    err.friendly = true;
    throw err;
  }
  const key = `${chatJid}|${targetJid}`;
  const existing = pendingChallenges.get(key);
  if (existing && existing.expiresAt > Date.now() && existing.challengerJid === challengerJid) {
    const err = new Error('You already have an open challenge against them — they still have time to accept.');
    err.friendly = true;
    throw err;
  }
  pendingChallenges.set(key, {
    challengerJid,
    amount,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { expiresAt: Date.now() + CHALLENGE_TTL_MS };
}

export function getPendingChallenge(chatJid, targetJid) {
  sweepChallenges();
  return pendingChallenges.get(`${chatJid}|${targetJid}`) ?? null;
}

export function declineChallenge(chatJid, targetJid) {
  const existed = pendingChallenges.delete(`${chatJid}|${targetJid}`);
  if (!existed) {
    const err = new Error('No open challenge to decline.');
    err.friendly = true;
    throw err;
  }
}

function lockPair(a, b, fn) {
  // Fixed global order prevents deadlock when A duels B while B duels A.
  const [first, second] = [a, b].sort();
  return withUserLock(first, () => withUserLock(second, fn));
}

/**
 * Resolve an accepted duel: both wallets are checked, the pot moves in one
 * atomic pass, records + XP are updated. Returns a verdict object the
 * plugin renders. Winner gets the pot plus a small XP bonus.
 */
export async function resolveDuel(chatJid, challengerJid, targetJid) {
  const challenge = getPendingChallenge(chatJid, targetJid);
  if (!challenge || challenge.challengerJid !== challengerJid) {
    const err = new Error('No open challenge to accept — it may have expired. Ask them to re-issue it.');
    err.friendly = true;
    throw err;
  }

  return lockPair(challengerJid, targetJid, async () => {
    const challenger = db.getUser(challengerJid);
    const target = db.getUser(targetJid);
    const amount = challenge.amount;

    const shortChallenger = challengerJid.split('@')[0].split(':')[0];
    const shortTarget = targetJid.split('@')[0].split(':')[0];

    if ((challenger.coins ?? 0) < amount) {
      pendingChallenges.delete(`${chatJid}|${targetJid}`);
      const err = new Error(`@${shortChallenger} can no longer cover the bet (${amount.toLocaleString()} coins). Challenge voided.`);
      err.friendly = true;
      throw err;
    }
    if ((target.coins ?? 0) < amount) {
      pendingChallenges.delete(`${chatJid}|${targetJid}`);
      const err = new Error(`You can't cover the bet — you need ${amount.toLocaleString()} coins and you have ${(target.coins ?? 0).toLocaleString()}.`);
      err.friendly = true;
      throw err;
    }

    pendingChallenges.delete(`${chatJid}|${targetJid}`);

    // Fair 50/50 — the drama is the wager, not a rigged coin.
    const challengerWins = Math.random() < 0.5;
    const winnerJid = challengerWins ? challengerJid : targetJid;
    const loserJid = challengerWins ? targetJid : challengerJid;

    db.setUser(winnerJid, {
      coins: (db.getUser(winnerJid).coins ?? 0) + amount,
      duelWins: (db.getUser(winnerJid).duelWins ?? 0) + 1,
    });
    db.setUser(loserJid, {
      coins: (db.getUser(loserJid).coins ?? 0) - amount,
      duelLosses: (db.getUser(loserJid).duelLosses ?? 0) + 1,
    });
    // Winner gets a small XP sprinkle for the showmanship.
    grantXp(db, winnerJid, { xp: 15 });

    return {
      amount,
      winnerJid,
      loserJid,
      winnerRecord: `${(db.getUser(winnerJid).duelWins ?? 0)}W-${(db.getUser(winnerJid).duelLosses ?? 0)}L`,
    };
  });
}

export default { createChallenge, getPendingChallenge, declineChallenge, resolveDuel };
