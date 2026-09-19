/**
 * Levenshtein distance for fuzzy command matching.
 * Used to suggest "Did you mean .X?" when a user mistypes a command.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance (lower = more similar)
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);

  for (let i = 0; i <= b.length; i++) prev[i] = i;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    // Swap arrays
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Find the closest matching command name from a set of candidates.
 * Returns the best match if within the threshold, or null.
 *
 * @param {string} input     The mistyped command name
 * @param {string[]} candidates  Available command names + aliases
 * @param {number} [maxDistance=2]  Maximum edit distance to suggest
 * @returns {string|null}
 */
export function suggestCommand(input, candidates, maxDistance = 2) {
  let bestMatch = null;
  let bestDistance = maxDistance + 1;

  for (const candidate of candidates) {
    // Fast path: prefix match (e.g. "hel" → "help")
    if (candidate.startsWith(input) && candidate.length - input.length <= 2) {
      return candidate;
    }

    const dist = levenshtein(input, candidate);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  return bestDistance <= maxDistance ? bestMatch : null;
}

export default { levenshtein, suggestCommand };
