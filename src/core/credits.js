import brand from '../../config/brand.js';

export const credits = {
  getCreator() {
    return brand.creator;
  },

  getProject() {
    return brand.name;
  },

  getVersion() {
    return brand.version;
  },

  getSignature() {
    return brand.signature;
  },

  getFullCredits() {
    return [
      `╭─「 𝖭𝖤𝖷𝖮𝖱𝖠 𝖬𝖣 」`,
      `│`,
      `│ Developer:`,
      `│ 𝗟𝗼𝗿𝗱 𝗔𝗶𝘇𝗲𝗻`,
      `│`,
      `│ Framework:`,
      `│ 𝖭𝖤𝖷𝖮𝖱𝖠`,
      `│`,
      `│ Version:`,
      `│ ${brand.version}`,
      `│`,
      `╰ ༒ 𝗦𝘁𝘂𝗿𝗱𝘆 𝗟𝗼𝗻𝗲𝗿 ༒`
    ].join('\n');
  }
};

export const getCreator = () => credits.getCreator();
export const getProject = () => credits.getProject();
export const getVersion = () => credits.getVersion();
export const getSignature = () => credits.getSignature();
export const getFullCredits = () => credits.getFullCredits();

export default credits;
