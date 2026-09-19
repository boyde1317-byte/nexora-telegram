import fs from 'fs';
import path from 'path';

const PINTEREST_LINKS = [
  "https://i.pinimg.com/736x/32/cb/59/32cb598a2eb31bce70cf7c653ff9d10d.jpg",
  "https://i.pinimg.com/736x/43/d3/18/43d3184ce961d66cd227cb2243729e24.jpg",
  "https://i.pinimg.com/736x/87/40/d6/8740d6bd5e50529d3809e2cf4bfe28c0.jpg",
  "https://i.pinimg.com/736x/a2/33/c4/a233c4f7b24329cc647b0eec826bfdf2.jpg",
  "https://i.pinimg.com/736x/11/1d/18/111d184bf41d40c6c7bb86b245dd980e.jpg",
  "https://i.pinimg.com/736x/85/3e/dc/853edcbfde0bb9edc39cfcce3fc4746f.jpg",
  "https://i.pinimg.com/736x/49/ef/e2/49efe2cb9eeea71510d9e2645851412b.jpg",
  "https://i.pinimg.com/736x/95/43/a1/9543a1a9e62fbb8b5dc4334360e6533c.jpg",
  "https://i.pinimg.com/736x/21/df/b5/21dfb55d658c70dd47d7eb4ed4ce0360.jpg",
  "https://i.pinimg.com/736x/07/ee/b2/07eeb226d7d519b4b9b940e7cb2818a7.jpg"
];

const imagesJsonPath = path.join(process.cwd(), 'database', 'images.json');
let imagesDb = JSON.parse(fs.readFileSync(imagesJsonPath, 'utf8'));

let linkIndex = 0;
for (const key of Object.keys(imagesDb.menu)) {
  if (key.startsWith('menu') && imagesDb.menu[key].images) {
     if (imagesDb.menu[key].images.length > 0) {
        imagesDb.menu[key].images = [PINTEREST_LINKS[linkIndex % PINTEREST_LINKS.length]];
        linkIndex++;
     }
  }
}

fs.writeFileSync(imagesJsonPath, JSON.stringify(imagesDb, null, 2));
console.log('Done patching images.json');
