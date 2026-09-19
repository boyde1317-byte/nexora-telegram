const fs = require('fs');
const file = 'src/lib/interactiveKit.js';
let content = fs.readFileSync(file, 'utf8');

const regexArticle = /export async function richArticleCard[\s\S]*?return sock.sendMessage\(jid, \{ text: text.trim\(\) \}, sendOptions\);\n\}/m;
const newArticle = `export async function richArticleCard(sock, jid, { headerText, contentText, footerText, disclaimerText, latex, links = [], suggested }, sendOptions = {}) {
  if (capabilities.richResponse) {
    return await baileysBridge.sendRichResponse(sock, jid, { 
      headerText, contentText, footerText, disclaimerText, latex, links, suggested 
    }, sendOptions);
  }
  let text = '';
  if (headerText) text += \`*\${headerText}*\\n\\n\`;
  if (contentText) text += \`\${contentText}\\n\\n\`;
  if (latex) text += \`\\n\${latex.map(l => l.text).join('\\n')}\\n\\n\`;
  if (footerText) text += \`_\${footerText}_\\n\`;
  return sock.sendMessage(jid, { text: text.trim() }, sendOptions);
}`;

content = content.replace(regexArticle, newArticle);

fs.writeFileSync(file, content);
