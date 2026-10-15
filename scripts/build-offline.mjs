import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function files(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await files(p));
    else if (entry.name !== 'sw.js') found.push('/' + path.relative(root, p).split(path.sep).join('/'));
  }
  return found;
}
const assets = ['/', ...(await files(root)).sort()];
const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
const source = (await readFile(path.join(root, 'sw.js'), 'utf8'))
  .replace("'casa-local-v1'", JSON.stringify('casa-local-' + version))
  .replace('/*__PRECACHE__*/["/", "/index.html", "/icon.svg", "/manifest.webmanifest"]', JSON.stringify(assets));
await writeFile(path.join(root, 'sw.js'), source);
console.log(`Pré-cache local preparado: ${assets.length} arquivos.`);
