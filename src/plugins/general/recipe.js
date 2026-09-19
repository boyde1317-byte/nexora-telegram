/**
 * recipe.js — full recipe cards, the .weather treatment for food.
 *
 * Data: TheMealDB free API (keyless) — real dish photos, structured
 * ingredients + measures, cuisine/category/tags, and a YouTube
 * cook-along video for most dishes. Dishes it doesn't know (jollof,
 * waakye, …) fall back to the multi-provider AI (Groq) which returns
 * a structured JSON recipe — rendered the same way, minus the photo.
 *
 * Flow:
 *   .recipe <dish>       → 0 hits: AI recipe card
 *                          1 hit:  full card immediately
 *                          2+ hits: single_select picker (first hit's
 *                          photo as the header image, .play style)
 *                          → rows dispatch .recipe id <idMeal>
 *   .recipe id <idMeal>  → the full card:
 *                          1. dish photo (captioned)
 *                          2. ingredients TABLE (rich table card)
 *                          3. steps text + buttons — ▶ YouTube video
 *                             (cta_url), 📋 copy ingredients,
 *                             🎲 surprise me (.food)
 */
import { selectMenu, richTableCard, mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';
const MAX_PICKER = 6;

async function mealApi(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Recipe service returned HTTP ${res.status}.`);
  return res.json();
}

/** TheMealDB stores 20 ingredient/measure pairs — flatten to [{qty, item}]. */
function extractIngredients(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const item = (meal[`strIngredient${i}`] || '').trim();
    const qty = (meal[`strMeasure${i}`] || '').trim();
    if (item && item.toLowerCase() !== 'null') out.push({ qty: qty || '—', item });
  }
  return out;
}

/** Split the instruction blob into numbered steps. */
function extractSteps(instructions) {
  if (!instructions) return [];
  return instructions
    .replace(/\r/g, '')
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map(s => s.trim())
    .filter(s => s.length > 2)
    .slice(0, 12);
}

function metaLine(meal) {
  return [meal.strArea, meal.strCategory, meal.strTags?.split(',').join(' • ')]
    .filter(Boolean)
    .join(' • ');
}

/** The full 3-part card for a known TheMealDB meal. */
async function sendFullCard({ m, sock, meal, prefix }) {
  const p = prefix || '.';
  // 1. the dish photo, captioned
  if (meal.strMealThumb) {
    await sock.sendMessage(m.from, {
      image: { url: meal.strMealThumb },
      caption: `🍽️ *${meal.strMeal}*\n_${metaLine(meal)}_`,
    }, { quoted: m });
  } else {
    await sock.sendMessage(m.from, { text: `🍽️ *${meal.strMeal}*\n_${metaLine(meal)}_` }, { quoted: m });
  }

  // 2. ingredients table
  const ingredients = extractIngredients(meal);
  if (ingredients.length) {
    try {
      await richTableCard(sock, m.from, {
        title: `🛒 INGREDIENTS — ${meal.strMeal.toUpperCase()}`,
        headers: ['Qty', 'Ingredient'],
        rows: ingredients.map(i => [i.qty, i.item]),
        footer: `NEXORA • TheMealDB • ${ingredients.length} ingredients`,
      }, { quoted: m });
    } catch {
      await sock.sendMessage(m.from, { text: ingredients.map(i => `• ${i.item}${i.qty !== '—' ? ` — ${i.qty}` : ''}`).join('\n') }, { quoted: m });
    }
  }

  // 3. steps + buttons
  const steps = extractSteps(meal.strInstructions);
  const stepsText = steps.length
    ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
    : (meal.strInstructions || 'No instructions listed.').slice(0, 1200);

  const buttons = [
    { kind: 'copy', label: '📋 Copy Ingredients', value: ingredients.map(i => `${i.qty !== '—' ? i.qty + ' ' : ''}${i.item}`).join('\n') },
  ];
  if (meal.strYoutube) {
    buttons.push({ kind: 'url', label: '▶ Watch Video', url: meal.strYoutube, useWebview: true });
  }
  buttons.push({ kind: 'action', label: '🎲 Surprise Me', cmd: `${p}food` });

  await mixedCard(sock, m.from, {
    text: `👨‍🍳 *Preparation*\n\n${stepsText}`,
    footer: `NEXORA • TheMealDB • ${steps.length || 1} steps`,
  }, buttons, { quoted: m });
}

/** AI fallback for dishes TheMealDB doesn't know. */
async function aiRecipeCard({ m, sock, text: dish, args, prefix }) {
  const p = prefix || '.';
  const ai = getAiClient();
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents:
      `Write a complete, tested recipe for "${dish}". Reply with ONLY a JSON object: ` +
      `{"title": "...", "cuisine": "...", "difficulty": "Easy|Medium|Hard", "time": "...", "servings": "...", ` +
      `"description": "one sentence", "ingredients": [{"qty": "...", "item": "..."}], "steps": ["..."]}. ` +
      `ingredients: 4-15 entries. steps: 3-10 clear instructions.`,
  });
  const parts = res?.candidates?.[0]?.content?.parts || [];
  const raw = parts.map(x => x.text).filter(Boolean).join('').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('The AI could not write that recipe.');
  const recipe = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) {
    throw new Error('The AI recipe was incomplete.');
  }

  const meta = [recipe.cuisine, recipe.difficulty, recipe.time, recipe.servings]
    .filter(Boolean).join(' • ');

  await sock.sendMessage(m.from, { text: `🍽️ *${recipe.title}*\n_${meta || 'AI recipe'}_\n\n${recipe.description || ''}` }, { quoted: m });

  try {
    await richTableCard(sock, m.from, {
      title: `🛒 INGREDIENTS — ${String(recipe.title).toUpperCase()}`,
      headers: ['Qty', 'Ingredient'],
      rows: recipe.ingredients.map(i => [i.qty || '—', i.item]),
      footer: 'NEXORA • AI Recipe • no photo — TheMealDB does not know this dish',
    }, { quoted: m });
  } catch {
    await sock.sendMessage(m.from, { text: recipe.ingredients.map(i => `• ${i.item}${i.qty ? ` — ${i.qty}` : ''}`).join('\n') }, { quoted: m });
  }

  const steps = (recipe.steps || []).slice(0, 10);
  await mixedCard(sock, m.from, {
    text: `👨‍🍳 *Preparation*\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n')}`,
    footer: 'NEXORA • AI Recipe',
  }, [
    { kind: 'copy', label: '📋 Copy Ingredients', value: recipe.ingredients.map(i => `${i.qty ? i.qty + ' ' : ''}${i.item}`).join('\n') },
  ], { quoted: m });
}

export default {
  name: 'recipe',
  aliases: ['cook', 'howtocook', 'make'],
  category: 'general',
  description: 'Full recipe card — photo, ingredients table, steps and video. Usage: .recipe <dish>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();

    if (!args.length) {
      return await m.reply.info(
        `Usage: \`${p}recipe <dish>\`\n\nExamples:\n• \`${p}recipe lasagna\` — full card: photo, ingredients table, steps, video\n• \`${p}recipe jollof rice\` — dishes TheMealDB doesn't know are AI-generated\n• \`${p}food\` — food roulette for inspiration`,
        'NEXORA • Recipe'
      );
    }

    await withReactionStatus(m, async () => {
      // Direct lookup: .recipe id <idMeal>
      if (sub === 'id' && args[1]) {
        const data = await mealApi(`/lookup.php?i=${encodeURIComponent(args[1])}`);
        if (!data.meals?.length) return await m.reply.error('That recipe ID does not exist.');
        return await sendFullCard({ m, sock, meal: data.meals[0], prefix: p });
      }

      const query = args.join(' ').trim();
      const data = await mealApi(`/search.php?s=${encodeURIComponent(query)}`);
      const meals = data.meals || [];

      if (meals.length === 0) {
        if (!hasApiKey()) {
          return await m.reply.error(`No recipe found for "${query}" in TheMealDB — and no AI fallback is configured (GROQ_API_KEY).`);
        }
        try {
          return await aiRecipeCard({ m, sock, text: query, args, prefix: p });
        } catch (err) {
          return await m.reply.error(`Recipe lookup failed: ${err.message}`);
        }
      }

      if (meals.length === 1) {
        return await sendFullCard({ m, sock, meal: meals[0], prefix: p });
      }

      // Multiple hits → picker, .play style (photo of the first hit as header)
      return await selectMenu(sock, m.from, {
        text: `🔍 *${meals.length} recipes for "${query}"*\nTap one for the full card.`,
        footer: 'NEXORA • Recipe Picker',
      }, '🍽️ Pick a recipe', [
        {
          title: '🍽️ Recipes',
          rows: meals.slice(0, MAX_PICKER).map((meal, idx) => ({
            id: `${p}recipe id ${meal.idMeal}`,
            title: `${idx + 1}. ${meal.strMeal}`.slice(0, 60),
            description: metaLine(meal).slice(0, 60),
          })),
        },
      ], [], {
        quoted: m,
        thumbnail: meals[0].strMealThumb,
      });
    });
  },
};
