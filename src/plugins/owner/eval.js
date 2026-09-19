import vm from 'node:vm';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'eval',
  aliases: ['>'],
  category: 'owner',
  description: 'Executes JavaScript expressions in a sandboxed context.',
  permissions: {
    owner: true
  },
  execute: async ({ sock, m, args, db }) => {
    const code = args.join(' ');
    if (!code) {
      return await m.reply.error('No code provided.');
    }

    // ── Sandbox context with limited surface area ───────────────────────
    // We expose only what's needed for debugging — sock, m, db, and basic
    // globals. Running in a vm context prevents accidental pollution of
    // the real module scope and limits access to Node internals.
    const sandbox = {
      sock,
      m,
      db,
      console,      // Allow console output for debugging
      JSON,
      Math,
      Date,
      Object,
      Array,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      Buffer,
      process: { env: Object.fromEntries(
        // Only expose non-secret env vars — never leak API keys, tokens, or passwords
        Object.entries(process.env).filter(([k]) =>
          !/KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH/i.test(k)
        )
      ) },
      fetch: globalThis.fetch,
      Promise,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    };

    try {
      // Create a VM context with the sandbox
      const context = vm.createContext(sandbox);
      
      // Run the code in the sandbox with a timeout to prevent infinite loops
      let result = vm.runInContext(code, context, {
        timeout: 10000,  // 10 second timeout
        filename: 'eval-sandbox.js',
      });

      if (result instanceof Promise) result = await result;

      const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      // Truncate very long output to avoid WhatsApp message limits
      const truncated = output.length > 3500
        ? output.slice(0, 3500) + '\n... (truncated)'
        : output;

      await m.reply(`✦ *Result:*\n\`\`\`javascript\n${truncated}\n\`\`\``, { contextInfo: buildEnrichedContextInfo() });
    } catch (err) {
      await m.reply.error(`${err.stack || err.message}`);
    }
  }
};
