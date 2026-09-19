/**
 * food.js — food roulette. Inspiration, not homework.
 *
 * .food             → random dish from TheMealDB (photo + meta teaser)
 * .food italian     → random dish from a cuisine (21 cuisines covered)
 * .food kenyan      → case-insensitive cuisine matching
 *
 * Teaser card: dish photo + one-line summary + buttons — "📖 Full
 * Recipe" dispatches .recipe id <idMeal> for the complete card, and
 * "🎲 Another" re-rolls. Fast to scroll, one tap to go deep.
 */
import { mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';

async function mealApi(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Recipe service returned HTTP ${res.status}.`);
  return res.json();
}

let cuisineCache = null; // [{ strArea }] — refreshed on miss
async function resolveArea(input) {
  if (!cuisineCache) {
    const list = await mealApi('/list.php?a=list');
    cuisineCache = list.meals || [];
  }
  const q = input.trim().toLowerCase();
  const hit = cuisineCache.find(a => a.strArea.toLowerCase() === q)
    || cuisineCache.find(a => a.strArea.toLowerCase().startsWith(q));
  return hit?.strArea || null;
}

function teaserSummary(meal) {
  const first = (meal.strInstructions || '').replace(/\s+/g, ' ').trim();
  const sentence = first.split(/(?<=[.!?])\s/)[0] || 'A tasty dish.';
  return sentence.length > 160 ? sentence.slice(0, 157) + '…' : sentence;
}

async function sendTeaser({ m, sock, meal, prefix }) {
  const p = prefix || '.';
  const meta = [meal.strArea, meal.strCategory].filter(Boolean).join(' • ');

  await sock.sendMessage(m.from, {
    image: { url: meal.strMealThumb },
    caption: `🍽️ *${meal.strMeal}*\n_${meta}_`,
  }, { quoted: m });

  await mixedCard(sock, m.from, {
    text: `🤔 *Hungry?*\n\n${teaserSummary(meal)}`,
    footer: `NEXORA • ${meal.strArea || 'Food'} Roulette`,
  }, [
    { kind: 'action', label: '📖 Full Recipe', cmd: `${p}recipe id ${meal.idMeal}` },
    { kind: 'action', label: '🎲 Another', cmd: `${p}food${meal.strArea ? ' ' + meal.strArea : ''}` },
  ], { quoted: m });
}

export default {
  name: 'food',
  aliases: ['hungry', 'eat', 'dinner'],
  category: 'fun',
  description: 'Food roulette — a random dish with photo and a one-tap full recipe. Usage: .food [cuisine]',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    await withReactionStatus(m, async () => {
      try {
        let meal;
        if (args.length) {
          const area = await resolveArea(args.join(' '));
          if (!area) {
            return await m.reply.error(
              `No cuisine called "${args.join(' ')}" yet. Try: Italian, Chinese, Kenyan, Indian, Mexican, Japanese, American, Thai, French, Greek, Dutch, Turkish, Vietnamese, British…`
            );
          }
          const data = await mealApi(`/filter.php?a=${encodeURIComponent(area)}`);
          if (!data.meals?.length) throw new Error('No dishes found for that cuisine.');
          meal = data.meals[Math.floor(Math.random() * data.meals.length)];
          // filter.php omits instructions — hydrate via lookup
          const full = await mealApi(`/lookup.php?i=${meal.idMeal}`);
          meal = full.meals?.[0] || meal;
        } else {
          const data = await mealApi('/random.php');
          meal = data.meals?.[0];
          if (!meal) throw new Error('The food gods are silent. Try again.');
        }
        await sendTeaser({ m, sock, meal, prefix: p });
      } catch (err) {
        await m.reply.error(`Could not roll a dish: ${err.message}`);
        throw err;
      }
    });
  },
};
