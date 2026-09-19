import { menuManager } from './manager.js';
import { runWithFallback } from './fallback.js';
import { collectMenuData } from './collector.js';

// Import all 15 menu types
import documentInteractive from './types/documentInteractive.js';
import payment from './types/payment.js';
import eventMessage from './types/eventMessage.js';
import nativeFlow from './types/nativeFlow.js';
import bottomSheet from './types/bottomSheet.js';
import product from './types/product.js';
import carousel from './types/carousel.js';
import newsletter from './types/newsletter.js';
import location from './types/location.js';
import contact from './types/contact.js';
import media from './types/media.js';
import reaction from './types/reaction.js';
import aiDynamic from './types/aiDynamic.js';
import orderMessage from './types/orderMessage.js';
import richCard from './types/richCard.js';
import buttonsCard from './types/buttonsCard.js';
import listFallback from './types/listFallback.js';
import moonsonCard from './types/moonsonCard.js';
import commandDirectory from './types/commandDirectory.js';

// Register them all statically in the manager
menuManager.register(documentInteractive);
menuManager.register(payment);
menuManager.register(eventMessage);
menuManager.register(nativeFlow);
menuManager.register(bottomSheet);
menuManager.register(product);
menuManager.register(carousel);
menuManager.register(newsletter);
menuManager.register(location);
menuManager.register(contact);
menuManager.register(media);
menuManager.register(reaction);
menuManager.register(aiDynamic);
menuManager.register(orderMessage);
menuManager.register(richCard);
menuManager.register(buttonsCard);
menuManager.register(listFallback);
menuManager.register(moonsonCard);
menuManager.register(commandDirectory);

/**
 * Compiles the statistics and renders the active menu (or custom specified menu style).
 *
 * @param {object} sock - WASocket active connection
 * @param {object} m - Serialized message trigger context
 * @param {string|number} [customKey] - Optional override style key/id
 */
export const showMenu = async (sock, m, customKey = null) => {
  const menuData = collectMenuData(sock);

  const menu = customKey
    ? menuManager.getMenu(customKey)
    : menuManager.getActiveMenu();

  if (!menu) {
    return await m.reply.error(`Menu style *"${customKey}"* not found. Type \`${menuData.prefix}menulist\` to see valid options.`);
  }

  // Delegate rendering to the fallback engine — single message, no follow-ups
  await runWithFallback(menu.renderer, { sock, m, menuData });
};

export { menuManager, collectMenuData, runWithFallback };
export default showMenu;
