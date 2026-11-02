// Carregador de teste: transforma JSX com o esbuild do checkout principal (só leitura) e avalia em CommonJS.
// `stubs` troca módulos por sufixo de caminho (ex.: core/hooks.js). Sem rede, sem navegador, sem instalar nada.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const WEB = process.env.CASA_WEB_ROOT || '/home/filippe/CasaLocal/web';
export const available = ['react', 'react-dom', 'esbuild'].every((name) => existsSync(`${WEB}/node_modules/${name}/package.json`));
const requireWeb = available ? createRequire(`${WEB}/package.json`) : null;
export const web = (name) => requireWeb(name);

export function createLoader({ stubs = {} } = {}) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    for (const [suffix, module] of Object.entries(stubs)) if (file.endsWith(suffix)) return module;
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const { code } = web('esbuild').transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic', target: 'node20' });
    const localRequire = (spec) => (spec.startsWith('.') ? load(resolve(dirname(file), spec)) : web(spec));
    new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
    return module.exports;
  }
  return load;
}
