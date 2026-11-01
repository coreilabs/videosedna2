// Run before publishing: node scripts/version-assets.cjs
// Stable content hashes change the URL only when the file itself changes.
// Use --force to renew all URLs for a publication even without content changes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const original = fs.readFileSync(htmlPath, 'utf8');
let html = original;
const release = process.argv.includes('--force') ? crypto.randomBytes(4).toString('hex') : null;
for (const name of ['styles.css', 'accessibility.css', 'app.js']) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex').slice(0, 12);
  const escaped = name.replace(/\./g, '\\.');
  const reference = new RegExp(`((?:href|src)="${escaped})(?:\\?[^"\\s]*)?"`, 'g');
  let matches = 0;
  let version;
  html = html.replace(reference, (match, prefix) => {
    matches++;
    const previous = /\?v=([a-f0-9]{12}-[a-f0-9]{8})"$/.exec(match)?.[1];
    version = release ? `${hash}-${release}` : previous?.startsWith(`${hash}-`) ? previous : hash;
    return `${prefix}?v=${version}"`;
  });
  if (matches !== 1) throw new Error(`Esperada uma referencia a ${name}; encontradas ${matches}.`);
  console.log(`${name}?v=${version}`);
}
if (html !== original) fs.writeFileSync(htmlPath, html);
