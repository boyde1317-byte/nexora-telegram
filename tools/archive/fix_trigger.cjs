const fs = require('fs');
const file = 'src/lib/interactiveKit.js';
let content = fs.readFileSync(file, 'utf8');

const regexCarousel = /export async function richCarouselCard[\s\S]*?return sock.sendMessage\(jid, \{ text \}, sendOptions\);\n\}/m;
const newCarousel = `export async function richCarouselCard(sock, jid, items, sendOptions = {}) {
  if (capabilities.richResponse) {
    // Pass links: [] to trigger prepareRichResponseMessage natively for top-level items property
    return await baileysBridge.sendRichResponse(sock, jid, { items, links: [] }, sendOptions);
  }
  const text = items.map(i => \`*├ \${i.title}*\\n│ \${i.text}\`).join('\\n\\n');
  return sock.sendMessage(jid, { text }, sendOptions);
}`;

content = content.replace(regexCarousel, newCarousel);

const regexMedia = /export async function richMediaCard[\s\S]*?return sock.sendMessage\(jid, payload, sendOptions\);\n\}/m;
const newMedia = `export async function richMediaCard(sock, jid, { type = 'image', url, caption, alignment, tapLinkUrl }, sendOptions = {}) {
  if (capabilities.richResponse) {
    const payload = { links: [] }; // trigger flag
    if (type === 'image') {
      payload.inlineImage = url;
      payload.imageText = caption;
    } else {
      payload.inlineVideo = url;
      payload.contentText = caption;
    }
    if (alignment) payload.alignment = alignment;
    if (tapLinkUrl) payload.tapLinkUrl = tapLinkUrl;
    return await baileysBridge.sendRichResponse(sock, jid, payload, sendOptions);
  }
  const payload = type === 'image' ? { image: { url }, caption } : { video: { url }, caption };
  return sock.sendMessage(jid, payload, sendOptions);
}`;

content = content.replace(regexMedia, newMedia);

fs.writeFileSync(file, content);
