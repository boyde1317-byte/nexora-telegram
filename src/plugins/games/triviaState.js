import crypto from 'node:crypto';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_CHALLENGES = 1000;
const challenges = new Map();

function prune(now = Date.now()) {
  for (const [token, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(token);
  }
  while (challenges.size > MAX_CHALLENGES) {
    challenges.delete(challenges.keys().next().value);
  }
}

export function createTriviaChallenge({ sender, chat, correctAnswer, question }) {
  const now = Date.now();
  prune(now);
  const token = crypto.randomUUID();
  challenges.set(token, {
    sender: String(sender || ''),
    chat: String(chat || ''),
    correctAnswer: String(correctAnswer || ''),
    question: String(question || ''),
    expiresAt: now + CHALLENGE_TTL_MS,
  });
  return token;
}

export function consumeTriviaChallenge(token, { sender, chat } = {}) {
  prune();
  const key = String(token || '');
  const challenge = challenges.get(key);
  if (!challenge) return null;
  challenges.delete(key);
  if (challenge.sender !== String(sender || '') || challenge.chat !== String(chat || '')) return null;
  return challenge;
}
