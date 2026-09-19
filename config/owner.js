function sanitizeNumber(num) {
  return num ? num.replace(/[^0-9]/g, '') : '';
}

export default {
  ownerName: process.env.OWNER_NAME || "Bot Owner",
  ownerNumber: sanitizeNumber(process.env.PAIRING_PHONE || process.env.OWNER_NUMBERS?.split(',')[0]) || "000000000000",
  developerName: process.env.OWNER_NAME || "Developer",
};
