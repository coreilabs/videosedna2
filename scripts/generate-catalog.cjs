// Run locally after adding videos: node scripts/generate-catalog.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'gallery')).filter(name => /\.(mp4|mov|m4v|webm)$/i.test(name)).sort();
const videos = files.map((name, index) => ({
  id: crypto.createHash('sha256').update(name).digest('hex').slice(0, 16),
  title: `Recordação ${String(index + 1).padStart(3, '0')}`,
  file: `gallery/${name}`,
  thumbnail: fs.existsSync(path.join(root, 'thumbnails', name + '.webp')) ? `thumbnails/${name}.webp` : null
}));
if (new Set(videos.map(v => v.id)).size !== videos.length) throw new Error('Identificadores duplicados');
fs.writeFileSync(path.join(root, 'videos.json'), JSON.stringify(videos, null, 2) + '\n');
console.log(`${videos.length} vídeos no catálogo; ${videos.filter(v => !v.thumbnail).length} sem miniatura.`);
