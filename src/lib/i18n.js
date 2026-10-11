/**
 * i18n.js — per-chat language system.
 *
 * The English source of truth for system responses lives in
 * nexora-messages.js. This module adds translated variants of the
 * high-traffic categories (permissions, cooldowns, not-found, errors)
 * for the languages bots in the WA scene actually get asked for.
 *
 * Resolution: chat language → English (nexora-messages) → safe default.
 * Plugins can also call `t(lang, 'key', vars)` for their own strings.
 *
 * Per-group language is stored on the group record (groupData.language,
 * set by the .language command). The DM default is the global `language`
 * setting (settingsService, owner-settable).
 */
import { nexoraResponses, getRandomResponse } from '../nexora-messages.js';
import { getSetting } from './settingsService.js';

// ── Supported languages ─────────────────────────────────────────────────────
export const LANGUAGES = {
  en: { name: 'English', flag: '🇬🇧' },
  id: { name: 'Indonesia', flag: '🇮🇩' },
  es: { name: 'Español',   flag: '🇪🇸' },
  pt: { name: 'Português', flag: '🇵🇹' },
};

const CODE_ALIASES = {
  english: 'en', inggris: 'en',
  indonesian: 'id', indonesia: 'id', indo: 'id',
  spanish: 'es', espanol: 'es',
  portuguese: 'pt', portugues: 'pt', brasil: 'pt',
};

/** Normalize any user input to a supported language code (or null). */
export function normalizeLang(input) {
  if (!input) return null;
  const code = String(input).toLowerCase().trim();
  if (LANGUAGES[code]) return code;
  return CODE_ALIASES[code] || null;
}

/** Chat language for a JID: group record, else the global setting. */
export function getChatLanguage({ db, from, isGroup, config }) {
  try {
    if (db && from && isGroup) {
      const g = db.getGroup(from);
      if (g?.language) return g.language;
    }
  } catch (_) { /* fall through to global */ }
  if (db) {
    // The .language command (DM path) writes via settingsService, which
    // stores it under the settings record's overrides key.
    const ov = getSetting('language', { db, config });
    if (ov && LANGUAGES[ov]) return ov;
  }
  return 'en';
}

// ── Translated system responses ────────────────────────────────────────────
// Shapes mirror nexora-messages.js: string | Array<string|function>.
// English is intentionally absent here — it IS nexora-messages.js.
export const TRANSLATIONS = {
  id: {
    permission_denied: [
      'Kamu tidak punya izin untuk perintah ini. ❖',
      'Maaf, itu di luar level aksesmu. ☕',
    ],
    owner_only: [
      'Perintah ini khusus owner saja. 🪐',
      'Hanya owner yang bisa menjalankan ini. ✦',
    ],
    group_only: 'Perintah ini hanya berfungsi di dalam grup. ✦',
    bot_not_admin: 'Aku butuh izin admin untuk itu. Promosikan aku dulu. ⚡',
    private_mode: 'Bot sedang berjalan dalam mode privat. Hanya owner yang bisa menggunakan perintah.',
    cooldown: [
      (cmd, time) => `⏳ \`${cmd}\` masih cooldown. Coba lagi dalam *${time}*.`,
      (cmd, time) => `Santai — \`${cmd}\` butuh *${time}* lagi. ⚡`,
      (cmd, time) => `Sabar ya — \`${cmd}\` siap dalam *${time}*. 🪐`,
    ],
    not_found: [
      (cmd) => `Tidak menemukan \`${cmd}\`. Cek ejaannya? ✦`,
      (cmd) => `\`${cmd}\` bukan perintah yang aku kenal. ☕`,
      (cmd) => `Tidak ada yang cocok untuk \`${cmd}\`. Coba \`.help\` untuk daftar lengkap. ⚡`,
    ],
    success: [
      'Selesai. ✦',
      'Beres. ⚡',
      'Sudah ditangani. ☕',
      'Tersimpan dan aman. ✦',
    ],
    error: [
      'Ada kendala saat memproses. Coba lagi ya. ✦',
      'Sepertinya ada yang gagal. Coba lagi. ⚡',
      'Sistem sedang bermasalah. Coba lagi sebentar? ☕',
    ],
  },

  es: {
    permission_denied: [
      'No tienes permisos para esto. ❖',
      'Eso está por encima de tu nivel de acceso. ☕',
    ],
    owner_only: [
      'Este comando es solo para el propietario. 🪐',
      'Solo el owner puede usar esto. ✦',
    ],
    group_only: 'Este comando solo funciona en grupos. ✦',
    bot_not_admin: 'Necesito permisos de administrador. Hazme admin primero. ⚡',
    private_mode: 'El bot está en modo privado. Solo el propietario puede usar comandos.',
    cooldown: [
      (cmd, time) => `⏳ \`${cmd}\` está en cooldown. Inténtalo en *${time}*.`,
      (cmd, time) => `Tranquilo — a \`${cmd}\` le quedan *${time}*. ⚡`,
      (cmd, time) => `Paciencia — \`${cmd}\` estará listo en *${time}*. 🪐`,
    ],
    not_found: [
      (cmd) => `No encontré \`${cmd}\`. ¿Revisas la ortografía? ✦`,
      (cmd) => `\`${cmd}\` no es un comando que conozca. ☕`,
      (cmd) => `Nada coincide con \`${cmd}\`. Prueba \`.help\` para la lista completa. ⚡`,
    ],
    success: [
      'Listo. ✦',
      'Hecho. ⚡',
      'Resuelto. ☕',
      'Guardado y seguro. ✦',
    ],
    error: [
      'Hubo un problema al procesar. Inténtalo de nuevo. ✦',
      'Algo falló en el proceso. Prueba otra vez. ⚡',
      'El sistema tuvo un inconveniente. ¿Reintentamos? ☕',
    ],
  },

  pt: {
    permission_denied: [
      'Você não tem permissão para isso. ❖',
      'Isso está acima do seu nível de acesso. ☕',
    ],
    owner_only: [
      'Este comando é só para o dono. 🪐',
      'Apenas o owner pode usar isso. ✦',
    ],
    group_only: 'Este comando só funciona em grupos. ✦',
    bot_not_admin: 'Preciso de permissão de admin. Me promova primeiro. ⚡',
    private_mode: 'O bot está em modo privado. Só o dono pode usar comandos.',
    cooldown: [
      (cmd, time) => `⏳ \`${cmd}\` está em cooldown. Tente de novo em *${time}*.`,
      (cmd, time) => `Calma — faltam *${time}* para \`${cmd}\`. ⚡`,
      (cmd, time) => `Paciência — \`${cmd}\` estará pronto em *${time}*. 🪐`,
    ],
    not_found: [
      (cmd) => `Não encontrei \`${cmd}\`. Confere a grafia? ✦`,
      (cmd) => `\`${cmd}\` não é um comando que eu conheço. ☕`,
      (cmd) => `Nada bate com \`${cmd}\`. Tenta \`.help\` para a lista completa. ⚡`,
    ],
    success: [
      'Pronto. ✦',
      'Feito. ⚡',
      'Resolvido. ☕',
      'Salvo e seguro. ✦',
    ],
    error: [
      'Tive um problema ao processar. Tenta de novo. ✦',
      'Algo falhou por aqui. Tenta outra vez. ⚡',
      'O sistema deu uma travada. Tentamos de novo? ☕',
    ],
  },
};

// ── Named UI strings (used via t(lang, key, vars)) ──────────────────────────
export const STRINGS = {
  en: {
    while_you_wait: 'While you wait, try:',
    lang_title: '🌐 LANGUAGE',
    lang_current: 'Current language: {{current}}',
    lang_select: 'Pick a language below — replies in this chat switch instantly.',
    lang_set: '✅ Language set to {{lang}} for this chat.',
    lang_set_global: '✅ Default language set to {{lang}}.',
    lang_footer: 'Applies to system replies, errors, and cooldowns',
    dash_title: '🛠️ GROUP DASHBOARD',
    dash_subtitle: 'One menu, every group feature. Current states below — tap a row to flip it.',
    dash_footer: 'Admins only • Changes apply instantly',
    dash_sec_protection: 'Protection',
    dash_sec_greetings: 'Greetings',
    dash_sec_chat: 'Chat',
    dash_enable: 'Enable',
    dash_disable: 'Disable',
    dash_language_row: '🌐 Chat Language',
    dash_lang_desc: 'Current: {{current}} — tap to change',
    dash_status: 'Features on: {{on}}/{{total}}',
  },
  id: {
    while_you_wait: 'Sambil menunggu, coba:',
    lang_title: '🌐 BAHASA',
    lang_current: 'Bahasa saat ini: {{current}}',
    lang_select: 'Pilih bahasa di bawah — balasan di chat ini langsung berganti.',
    lang_set: '✅ Bahasa diatur ke {{lang}} untuk chat ini.',
    lang_set_global: '✅ Bahasa default diatur ke {{lang}}.',
    lang_footer: 'Berlaku untuk balasan sistem, error, dan cooldown',
    dash_title: '🛠️ DASHBOARD GRUP',
    dash_subtitle: 'Satu menu, semua fitur grup. Status di bawah — ketuk untuk mengubah.',
    dash_footer: 'Khusus admin • Perubahan langsung berlaku',
    dash_sec_protection: 'Proteksi',
    dash_sec_greetings: 'Sambutan',
    dash_sec_chat: 'Obrolan',
    dash_enable: 'Aktifkan',
    dash_disable: 'Nonaktifkan',
    dash_language_row: '🌐 Bahasa Chat',
    dash_lang_desc: 'Saat ini: {{current}} — ketuk untuk mengubah',
    dash_status: 'Fitur aktif: {{on}}/{{total}}',
  },
  es: {
    while_you_wait: 'Mientras esperas, prueba:',
    lang_title: '🌐 IDIOMA',
    lang_current: 'Idioma actual: {{current}}',
    lang_select: 'Elige un idioma — las respuestas de este chat cambian al instante.',
    lang_set: '✅ Idioma configurado en {{lang}} para este chat.',
    lang_set_global: '✅ Idioma predeterminado: {{lang}}.',
    lang_footer: 'Aplica a respuestas del sistema, errores y cooldowns',
    dash_title: '🛠️ PANEL DEL GRUPO',
    dash_subtitle: 'Un menú, todas las funciones del grupo. Toca una opción para cambiarla.',
    dash_footer: 'Solo admins • Los cambios aplican al instante',
    dash_sec_protection: 'Protección',
    dash_sec_greetings: 'Saludos',
    dash_sec_chat: 'Chat',
    dash_enable: 'Activar',
    dash_disable: 'Desactivar',
    dash_language_row: '🌐 Idioma del chat',
    dash_lang_desc: 'Actual: {{current}} — toca para cambiar',
    dash_status: 'Funciones activas: {{on}}/{{total}}',
  },
  pt: {
    while_you_wait: 'Enquanto espera, tente:',
    lang_title: '🌐 IDIOMA',
    lang_current: 'Idioma atual: {{current}}',
    lang_select: 'Escolha um idioma — as respostas deste chat mudam na hora.',
    lang_set: '✅ Idioma definido como {{lang}} para este chat.',
    lang_set_global: '✅ Idioma padrão definido: {{lang}}.',
    lang_footer: 'Vale para respostas do sistema, erros e cooldowns',
    dash_title: '🛠️ PAINEL DO GRUPO',
    dash_subtitle: 'Um menu, todos os recursos do grupo. Toque para ativar ou desativar.',
    dash_footer: 'Só admins • Mudanças valem na hora',
    dash_sec_protection: 'Proteção',
    dash_sec_greetings: 'Saudações',
    dash_sec_chat: 'Conversa',
    dash_enable: 'Ativar',
    dash_disable: 'Desativar',
    dash_language_row: '🌐 Idioma do chat',
    dash_lang_desc: 'Atual: {{current}} — toque para mudar',
    dash_status: 'Recursos ativos: {{on}}/{{total}}',
  },
};

/**
 * Random response in the chat's language. Falls back to the English
 * nexora-messages.js pool, then to a safe default.
 */
export function getLocalizedResponse(category, lang, ...args) {
  const pool = TRANSLATIONS[lang]?.[category];
  if (pool) {
    if (typeof pool === 'string') return pool;
    if (Array.isArray(pool)) {
      const picked = pool[Math.floor(Math.random() * pool.length)];
      return typeof picked === 'function' ? picked(...args) : picked;
    }
  }
  return getRandomResponse(category, ...args);
}

// ── Named-string interpolation for plugins ────────────────────────────────
export function t(lang, key, vars = {}) {
  let str = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  if (typeof str !== 'string') return key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{{${k}}}`, String(v));
  }
  return str;
}

export default {
  LANGUAGES,
  STRINGS,
  normalizeLang,
  getChatLanguage,
  getLocalizedResponse,
  t,
};
