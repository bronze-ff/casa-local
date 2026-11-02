// Árvore de elementos com os HOOKS DO REACT SUBSTITUÍDOS por um estado simples: chama cada componente como função, expande os
// filhos e devolve só elementos de DOM (button, input…). Permite achar um botão e chamar o onClick dele, como o check.cjs legado,
// mas sobre os componentes novos. NÃO é navegador: nada de DOM real, foco, layout nem eventos nativos.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { web } from '../ui/harness.mjs';

export function createTree({ stubs = {} } = {}) {
  const React = web('react');
  const instances = new Map();
  let current = null;
  const slot = () => current.cursor++;
  const shim = {
    ...React,
    useState(initial) { const i = slot(); const hooks = current.hooks; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], (value) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = slot(); const hooks = current.hooks; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useId() { const i = slot(); const hooks = current.hooks; if (!(i in hooks)) hooks[i] = `:t${current.id}-${i}:`; return hooks[i]; },
    useEffect() {}, useLayoutEffect() {},
    useMemo: (fn) => fn(), useCallback: (fn) => fn(),
    useContext: (context) => context._currentValue,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  };
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    for (const [suffix, module] of Object.entries(stubs)) if (file.endsWith(suffix)) return module;
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const { code } = web('esbuild').transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic', target: 'node20' });
    const localRequire = (spec) => (spec.startsWith('.') ? load(resolve(dirname(file), spec)) : spec === 'react' ? shim : spec === 'react/jsx-runtime' ? jsx : web(spec));
    new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
    return module.exports;
  }
  const jsx = web('react/jsx-runtime');
  let counter = 0;

  function deep(type, props, path) {
    if (!instances.has(path)) instances.set(path, { hooks: [], cursor: 0, id: ++counter });
    const instance = instances.get(path);
    instance.cursor = 0;
    current = instance;
    const out = type(props);
    return expand(out, path);
  }
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}.${index}`));
    if (!React.isValidElement(node)) return node;
    if (typeof node.type === 'function') return deep(node.type, node.props, `${path}/${node.type.name || 'c'}:${node.key ?? ''}`);
    const label = typeof node.type === 'string' ? node.type : 'f';
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${path}/${label}`) } };
  }

  const nodes = (tree) => (Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : []);
  const textOf = (tree) => (Array.isArray(tree) ? tree.map(textOf).join('') : React.isValidElement(tree) ? (tree.props.className === 'sr-only' ? '' : textOf(tree.props.children)) : tree == null || typeof tree === 'boolean' ? '' : String(tree));

  /** Monta o componente; `render()` refaz a árvore mantendo o estado (como depois de um clique). */
  function mount(Component, props = {}) {
    const root = `root:${++counter}`;
    const render = () => deep(Component, props, root);
    const api = {
      render,
      text: () => textOf(render()),
      buttons: () => nodes(render()).filter((n) => n.type === 'button'),
      find(label) {
        const found = nodes(render()).find((n) => n.type === 'button' && (n.props['aria-label'] === label || textOf(n.props.children).replace(/\s+/g, ' ').trim() === label));
        return found;
      },
      /** Chama o onClick de um botão HABILITADO. Falha se não existir ou se estiver desabilitado (como o navegador não deixaria clicar). */
      async click(label) {
        const button = api.find(label);
        if (!button) throw new Error(`Botão não encontrado: ${label}. Botões: ${api.buttons().map((b) => b.props['aria-label'] || textOf(b.props.children)).join(' | ')}`);
        if (button.props.disabled || button.props['aria-disabled'] === true || !button.props.onClick) throw new Error(`Botão desabilitado: ${label}`);
        return button.props.onClick();
      },
      isDisabled(label) { const button = api.find(label); return !!button && !!(button.props.disabled || !button.props.onClick); },
    };
    return api;
  }
  return { load, mount, React };
}
