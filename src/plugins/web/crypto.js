/**
 * crypto.js — Cryptocurrency price lookup using CoinGecko's free API (no key needed).
 *
 * Supports common coins by ID (bitcoin, ethereum, solana, etc.) and shows
 * price in USD/EUR/GBP with 24h change indicator.
 *
 * Usage:
 *   .crypto bitcoin
 *   .crypto ethereum
 *   .crypto solana
 */
import { Providers } from '../../lib/webClient.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

// Common coin aliases → CoinGecko IDs
const COIN_ALIASES = {
  btc:    'bitcoin',
  eth:    'ethereum',
  sol:    'solana',
  ada:    'cardano',
  doge:   'dogecoin',
  xrp:    'ripple',
  dot:    'polkadot',
  matic:  'matic-network',
  avax:   'avalanche-2',
  link:   'chainlink',
  ltc:    'litecoin',
  bnb:    'binancecoin',
  uni:    'uniswap',
  atom:   'cosmos',
  trx:    'tron',
  shib:   'shiba-inu',
  pepe:   'pepe',
};

export default {
  name: 'crypto',
  aliases: ['price', 'coinprice'],
  category: 'web',
  description: 'Get cryptocurrency prices. Usage: .crypto <coin> (e.g. bitcoin, eth, sol)',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const input = args[0]?.toLowerCase().trim();
    if (!input) {
      return await m.reply.info(
        `Usage: \`${prefix}crypto <coin>\`\n\nExamples:\n• \`${prefix}crypto bitcoin\`\n• \`${prefix}crypto eth\`\n• \`${prefix}crypto sol\`\n\nCommon: btc, eth, sol, ada, doge, xrp, dot, link, ltc, bnb`,
        'CRYPTO PRICE'
      );
    }

    const coinId = COIN_ALIASES[input] || input;

    await withReactionStatus(m, async () => {
      const price = await Providers.crypto(coinId);
      const change24h = price.usd_24h_change ?? 0;
      const arrow = change24h >= 0 ? '📈' : '📉';
      const changeStr = change24h >= 0 ? `+${change24h.toFixed(2)}%` : `${change24h.toFixed(2)}%`;

      const rows = [
        ['USD', `$${price.usd.toLocaleString()}`],
        ['EUR', `€${price.eur.toLocaleString()}`],
        ['GBP', `£${price.gbp.toLocaleString()}`],
        ['24h Change', `${arrow} ${changeStr}`],
      ];

      try {
        await richTableCard(sock, m.from, {
          title:   `₿ ${coinId.toUpperCase()} PRICE`,
          headers: ['Currency', 'Price'],
          rows,
          footer:  'NEXORA • CoinGecko',
        }, { quoted: m });
      } catch (err) {
        const text = `₿ *${coinId.toUpperCase()} PRICE*\n\n` +
          `*USD:* $${price.usd.toLocaleString()}\n` +
          `*EUR:* €${price.eur.toLocaleString()}\n` +
          `*GBP:* £${price.gbp.toLocaleString()}\n` +
          `*24h:* ${arrow} ${changeStr}`;
        await m.reply(text);
      }
    });
  },
};
