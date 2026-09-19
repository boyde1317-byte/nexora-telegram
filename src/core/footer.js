import brand from '../../config/brand.js';
import layoutConfig from '../../config/layout.js';
import { toSmallcaps } from '../lib/smallcaps.js';

export const footerManager = {
  getStyle() {
    return layoutConfig.footerStyle || 'clean';
  },

  setStyle(style) {
    layoutConfig.footerStyle = style;
  },

  getFooter(customStyle) {
    const style = customStyle || this.getStyle();
    switch (style) {
      case 'minimal':
        return `${toSmallcaps(brand.core)}`;
      case 'professional':
      case 'ornate':
        return `© ${toSmallcaps(brand.name + ' Framework')}`;
      case 'clean':
      case 'default':
      default:
        return `${toSmallcaps(brand.name)} • ${toSmallcaps(brand.signature)}`;
    }
  }
};

export default footerManager;
