import fs from 'fs';
import path from 'path';

async function fetchWallpaper() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch('https://nekos.life/api/v2/img/wallpaper');
      const json = await res.json();
      if (json.url) return json.url;
    } catch(e) {}
  }
  return "https://cdn.nekos.life/wallpaper/Q_Ovh9f8wgs.png";
}

async function fetchWaifu() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch('https://nekos.life/api/v2/img/waifu');
      const json = await res.json();
      if (json.url) return json.url;
    } catch(e) {}
  }
  return "https://cdn.nekos.life/waifu/9fa33319-3606-411e-bd26-028980d09a29.jpg";
}

async function run() {
  console.log("Fetching images...");
  const urls = [];
  for (let i = 0; i < 5; i++) {
    urls.push(await fetchWallpaper());
  }

  const defaultAssetsPath = path.join(process.cwd(), 'src', 'assets', 'defaultAssets.js');
  let defaultAssetsStr = fs.readFileSync(defaultAssetsPath, 'utf8');

  defaultAssetsStr = defaultAssetsStr.replace(/menuBanner: 'https:\/\/.+?'/, `menuBanner: '${urls[0]}'`);
  defaultAssetsStr = defaultAssetsStr.replace(/welcome: 'https:\/\/.+?'/, `welcome: '${urls[1]}'`);
  defaultAssetsStr = defaultAssetsStr.replace(/goodbye: 'https:\/\/.+?'/, `goodbye: '${urls[2]}'`);
  defaultAssetsStr = defaultAssetsStr.replace(/thumbnail: 'https:\/\/.+?'/, `thumbnail: '${urls[3]}'`);
  defaultAssetsStr = defaultAssetsStr.replace(/docThumbnail: 'https:\/\/.+?'/, `docThumbnail: '${urls[4]}'`);

  fs.writeFileSync(defaultAssetsPath, defaultAssetsStr);

  const imagesJsonPath = path.join(process.cwd(), 'database', 'images.json');
  let imagesDb = JSON.parse(fs.readFileSync(imagesJsonPath, 'utf8'));

  for (const key of Object.keys(imagesDb.menu)) {
    if (key.startsWith('menu') && imagesDb.menu[key].images) {
       if (imagesDb.menu[key].images.length > 0) {
          imagesDb.menu[key].images = [await fetchWallpaper()];
       }
    }
  }

  fs.writeFileSync(imagesJsonPath, JSON.stringify(imagesDb, null, 2));

  const greetingConfigPath = path.join(process.cwd(), 'src', 'greetings', 'greetingConfig.js');
  let greetingConfigStr = fs.readFileSync(greetingConfigPath, 'utf8');
  greetingConfigStr = greetingConfigStr.replace(/welcomeImage: "https:\/\/.+?"/, `welcomeImage: "${urls[1]}"`);
  greetingConfigStr = greetingConfigStr.replace(/goodbyeImage: "https:\/\/.+?"/, `goodbyeImage: "${urls[2]}"`);
  fs.writeFileSync(greetingConfigPath, greetingConfigStr);

  console.log('Finished fixing image URLs');
}

run();
