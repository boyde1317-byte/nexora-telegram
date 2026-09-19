import fs from 'node:fs';
import path from 'node:path';
import { assetManager } from '../assets/assetManager.js';

const GREETING_DB_PATH = path.join(process.cwd(), 'database', 'greeting.json');

const defaultGreetingConfig = {
  enabled: true,
  goodbyeEnabled: true,
  style: 4,
  welcomeText: "👋 Welcome {user} to *{group}*!\n\nWe are glad to have you here. You are our {memberCount}th member! ✨",
  goodbyeText: "😢 Goodbye {user}! We will miss you.",
  welcomeImage: "https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/6e8441439_generated_image.png",
  goodbyeImage: "https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/02ebca731_generated_image.png"
};

const ensureConfigExists = () => {
  const dir = path.dirname(GREETING_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(GREETING_DB_PATH)) {
    fs.writeFileSync(GREETING_DB_PATH, JSON.stringify(defaultGreetingConfig, null, 2), 'utf-8');
  }
};

export const greetingConfig = {
  load() {
    try {
      ensureConfigExists();
      const content = fs.readFileSync(GREETING_DB_PATH, 'utf-8');
      return { ...defaultGreetingConfig, ...JSON.parse(content) };
    } catch (err) {
      console.error('[GREETING CONFIG] Load failed, returning defaults:', err);
      return defaultGreetingConfig;
    }
  },

  save(configData) {
    try {
      ensureConfigExists();
      fs.writeFileSync(GREETING_DB_PATH, JSON.stringify(configData, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[GREETING CONFIG] Save failed:', err);
      return false;
    }
  },

  getEnabled() {
    return this.load().enabled;
  },

  setEnabled(val) {
    const data = this.load();
    data.enabled = !!val;
    this.save(data);
  },

  getGoodbyeEnabled() {
    return this.load().goodbyeEnabled;
  },

  setGoodbyeEnabled(val) {
    const data = this.load();
    data.goodbyeEnabled = !!val;
    this.save(data);
  },

  getStyle() {
    return this.load().style;
  },

  setStyle(styleId) {
    const data = this.load();
    const styleNum = parseInt(styleId, 10);
    if ([1, 2, 3, 4].includes(styleNum)) {
      data.style = styleNum;
      this.save(data);
      return true;
    }
    return false;
  },

  getWelcomeText() {
    return this.load().welcomeText;
  },

  setWelcomeText(text) {
    const data = this.load();
    data.welcomeText = text;
    this.save(data);
  },

  getGoodbyeText() {
    return this.load().goodbyeText;
  },

  setGoodbyeText(text) {
    const data = this.load();
    data.goodbyeText = text;
    this.save(data);
  },

  getWelcomeImage() {
    return assetManager.getAsset('welcome');
  },

  setWelcomeImage(urlOrPath) {
    const data = this.load();
    data.welcomeImage = urlOrPath;
    this.save(data);
    // Register custom welcome asset as manual override
    assetManager.registerManualAsset('welcome', urlOrPath);
  },

  getGoodbyeImage() {
    return assetManager.getAsset('goodbye');
  },

  setGoodbyeImage(urlOrPath) {
    const data = this.load();
    data.goodbyeImage = urlOrPath;
    this.save(data);
    // Register custom goodbye asset as manual override
    assetManager.registerManualAsset('goodbye', urlOrPath);
  }
};

export default greetingConfig;
