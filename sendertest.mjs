process.env.NEXORA_LOG_SILENT = '1';
import { serialize } from './src/core/serializer.js';

function buildSock(ownNumber) {
  return {
    user: { id: `${ownNumber}:14@s.whatsapp.net` },
    chatRead: async () => {},
  };
}

function buildSelfChatMsg(ownNumber, text) {
  const jid = `${ownNumber}@s.whatsapp.net`;
  return {
    key: { remoteJid: jid, fromMe: true, id: 'ABC' + Math.random().toString(36).slice(2, 8) },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: 'Tester',
  };
}

const sockA = buildSock('233597514499');
const sockB = buildSock('233533416608');

const mA = await serialize(buildSelfChatMsg('233597514499', '.menu'), sockA);
const mB = await serialize(buildSelfChatMsg('233533416608', '.menu'), sockB);

console.log('A sender:', mA.sender);
console.log('B sender:', mB.sender);
console.log('A === B ?', mA.sender === mB.sender);

const keyA = `${mA.sender}_menu`;
const keyB = `${mB.sender}_menu`;
console.log('cooldownKey A:', keyA);
console.log('cooldownKey B:', keyB);
console.log('keys collide?', keyA === keyB);
process.exit(0);
