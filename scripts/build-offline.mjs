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
// A versão segue o conteúdo, não só os nomes: um index.html novo também troca o cache.
const hash = createHash('sha256');
for (const asset of assets.slice(1)) hash.update(asset).update(await readFile(path.join(root, asset.slice(1))));
const version = hash.digest('hex').slice(0, 12);
const markers = ["'casa-local-v1'", '/*__PRECACHE__*/["/", "/index.html", "/icon.svg", "/manifest.webmanifest"]'];
const template = await readFile(path.join(root, 'sw.js'), 'utf8');
const missing = markers.filter((marker) => !template.includes(marker));
if (missing.length) throw new Error(`sw.js sem as marcas do template (rode depois de um build limpo): ${missing.join(', ')}`);
const source = template.replace(markers[0], JSON.stringify('casa-local-' + version)).replace(markers[1], JSON.stringify(assets));
await writeFile(path.join(root, 'sw.js'), source);
console.log(`Pré-cache local preparado: ${assets.length} arquivos.`);
