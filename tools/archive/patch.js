import fs from 'fs';
const file = 'src/core/baileysBridge.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /async sendRichResponse\(sock, jid, content, sendOptions = \{\}\) \{[\s\S]*?^\s*\},/m;

const newMethod = `  async sendRichResponse(sock, jid, content, sendOptions = {}) {
    try {
      // The Baileys fork natively processes rich properties (e.g. code, links, table, items, etc.)
      // and converts them via prepareRichResponseMessage before relaying.
      return await sock.sendMessage(jid, content, sendOptions);
    } catch (err) {
      console.warn('[baileysBridge.sendRichResponse] relay failed, plain text fallback:', err.message);
      
      let fallbackText = '';
      if (content.headerText) fallbackText += "*" + content.headerText + "*\\n\\n";
      if (content.contentText) fallbackText += content.contentText + "\\n\\n";
      if (content.code) fallbackText += "\`\`\`" + (content.language || '') + "\\n" + content.code + "\\n\`\`\`\\n\\n";
      
      // Basic table extraction
      if (content.table && Array.isArray(content.table)) {
        fallbackText += content.table.map(r => r.join(' │ ')).join('\\n') + '\\n\\n';
      }
      
      // Items extraction
      if (content.items && Array.isArray(content.items)) {
        fallbackText += content.items.map(i => "• " + i.title + "\\n  " + i.text).join('\\n\\n') + '\\n\\n';
      }
      
      // Links extraction
      if (content.links && Array.isArray(content.links)) {
        fallbackText += content.links.map((l, i) => "[" + (i+1) + "] " + (l.title || 'Link') + ": " + l.url).join('\\n') + '\\n\\n';
      }

      if (content.footerText) fallbackText += "_" + content.footerText + "_";
      
      return sock.sendMessage(jid, { text: fallbackText.trim() || 'Rich content unavailable' }, sendOptions);
    }
  },`;

if (regex.test(content)) {
  content = content.replace(regex, newMethod);
  fs.writeFileSync(file, content);
  console.log('Patched baileysBridge.js using regex');
} else {
  console.log('Regex failed');
}
