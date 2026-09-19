const fs = require('fs');
const file = 'src/lib/interactiveKit.js';
let content = fs.readFileSync(file, 'utf8');

const regexTable = /await baileysBridge\.sendRichResponse\(sock, jid, \{\s*richResponse: \[\{ text: title \}\],\s*table: \{ title, rows: tableRows \},\s*footerText: footer \|\| '',\s*\}, sendOptions\);/m;
const newTable = `await baileysBridge.sendRichResponse(sock, jid, {
        title: title,
        table: tableRows.map(r => r.items),
        footerText: footer || '',
      }, sendOptions);`;

content = content.replace(regexTable, newTable);
fs.writeFileSync(file, content);
