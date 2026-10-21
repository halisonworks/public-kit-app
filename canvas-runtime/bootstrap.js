// Canvas-runtime iframe bootstrap.
//
// MIRROR of the runtime logic in ../../src/utils/runtimeDependencies.js.
// The Studio shell (Vite-bundled) and this iframe (static, served from
// public/) cannot share modules without a multi-entry Vite config, so the
// transpile/load/execute pipeline is duplicated here. Keep the two files in
// sync when changing KNOWN_LIBS, the require() resolution, or error shapes.
//
// NOTE: the *load source* intentionally diverges, this Studio iframe loads
// React/Babel/chart-icon libs from vendored copies under ./vendor/ (offline +
// no cold-CDN latency), falling back to the original CDN URLs only if a local
// copy is missing. runtimeDependencies.js still loads straight from the CDN.
//
// A classic script wrapped in an IIFE, not a module: the iframe is sandboxed
// without allow-same-origin (an opaque origin), so a module or import() fetch of
// our own files would need CORS headers the Tauri protocol may not send.
// esm.sh sends CORS headers, so import() from there works.
(() => {

// React / ReactDOM load lazily, only when a *component* canvas is rendered,
// so the runtime iframe (and the full-HTML-document path) works without the
// esm.sh CDN. A pasted HTML page needs no React, no Babel, no network.
let React = null;
let ReactDOMClient = null;
let reactRoot = null;

const libraryCache = new Map();

// Minimal clsx/classnames-compatible class joiner. shadcn/ui artifacts (the
// default output shape of Claude, v0, Lovable) import `cn` from "@/lib/utils";
// that alias does not exist as an npm package, so esm.sh resolution fails and
// the component renders as a red "Missing Library" box. We shim it instead.
// This is the conditional-class join only, it does NOT run tailwind-merge's
// conflict resolution (a P1 follow-up), which only affects duplicate-utility
// dedupe, not correctness.
function cnShim(...args) {
  const out = [];
  const push = (value) => {
    if (!value) return;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      value.forEach(push);
    } else if (typeof value === 'object') {
      for (const key in value) {
        if (value[key]) out.push(key);
      }
    }
  };
  args.forEach(push);
  return out.join(' ');
}

// `@/lib/utils` is the conventional shadcn home for `cn`. Expose cn as both a
// named and default export so either import style resolves.
const SHADCN_UTILS = { __esModule: true, cn: cnShim, default: cnShim };

// React / ReactDOM load from vendored UMD bundles first (offline + no cold-CDN
// latency); esm.sh is kept only as a fallback if the local copies are missing.
// The UMD builds set window.React / window.ReactDOM (the latter exposes
// createRoot in React 18), which is also what the chart/icon UMD libs read.
async function ensureReact() {
  if (reactRoot) return;
  try {
    await loadScript('./vendor/react.production.min.js');
    await loadScript('./vendor/react-dom.production.min.js');
    React = window.React;
    ReactDOMClient = window.ReactDOM;
    if (!React || !ReactDOMClient || typeof ReactDOMClient.createRoot !== 'function') {
      throw new Error('Vendored React UMD did not expose the expected globals.');
    }
  } catch (_) {
    const [reactMod, reactDomMod] = await Promise.all([
      import('https://esm.sh/react@18'),
      import('https://esm.sh/react-dom@18/client'),
    ]);
    React = reactMod.default ?? reactMod;
    ReactDOMClient = reactDomMod;
    window.React = React;
    window.ReactDOM = ReactDOMClient;
  }
  // lucide-react's UMD reads `window.react` (lowercase) when it initialises;
  // React's UMD only sets `window.React`, so without this alias lucide throws
  // "Cannot read properties of undefined (reading 'forwardRef')" at load and its
  // icons fall back to red "Missing Library" boxes.
  window.React = React;
  window.react = React;
  reactRoot = ReactDOMClient.createRoot(rootEl);
}

const KNOWN_LIBS = {
  react: () => React,
  'react-dom': () => ReactDOMClient,
  recharts: () => window.Recharts,
  // lucide-react's UMD bundle assigns the global `LucideReact`, not `lucide`
  // (which is the vanilla DOM library). Read the correct one so the icons used
  // by most AI-generated components resolve.
  'lucide-react': () => window.LucideReact,
  'prop-types': () => window.PropTypes,
  '@/lib/utils': () => SHADCN_UTILS,
};

// External deps resolved locally, so they work offline. These stay OUT of
// KNOWN_LIBS so they're still treated as "unknown" modules (and resolved via
// loadLibraryFromCDN). classnames maps to cnShim (the same algorithm) because
// the opaque-origin iframe can't import() the vendored ES module copy.
const LOCAL_ESM_MODULES = {
  classnames: () => ({ default: cnShim }),
};

// esm.sh builds loaded with ?external=react,react-dom import a bare "react" (and
// "react/jsx-runtime", "react-dom"), which a browser can't resolve on its own
// ("Failed to resolve module specifier"). This import map points them at tiny
// data: modules that hand back the React already on the page, so a library
// like framer-motion shares its instance. Added once, before the first library
// import (data: URLs, because a sandboxed frame can't load our own files by URL).
let reactImportMapAdded = false;

function addReactImportMap() {
  if (reactImportMapAdded) return;
  reactImportMapAdded = true;
  const asModule = (global) => {
    const value = window[global] || {};
    const names = Object.keys(value).filter((k) => k !== 'default' && /^[A-Za-z_$][\w$]*$/.test(k));
    return 'data:text/javascript,' + encodeURIComponent(
      'const m = globalThis.' + global + '; export default m;'
      + names.map((k) => ' export const ' + k + ' = m.' + k + ';').join('')
    );
  };
  // React's UMD has no jsx-runtime; jsx(type, props, key) is createElement with
  // the key moved into props (children are already in props).
  const jsxRuntime = 'data:text/javascript,' + encodeURIComponent(
    'const R = globalThis.React;'
    + ' function jsx(t, p, k) { return R.createElement(t, k === undefined ? p : Object.assign({}, p, { key: k })); }'
    + ' export { jsx, jsx as jsxs, jsx as jsxDEV }; export const Fragment = R.Fragment;'
  );
  const react = asModule('React');
  const reactDom = asModule('ReactDOM');
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({
    imports: {
      react,
      'react/jsx-runtime': jsxRuntime,
      'react/jsx-dev-runtime': jsxRuntime,
      'react-dom': reactDom,
      'react-dom/client': reactDom,
    },
  });
  document.head.appendChild(map);
}

// `./x` and `../x` name a file in the project (see createProjectLoader); they
// must never become an esm.sh request for a package called "./x".
function isRelativeModule(name) {
  return name.startsWith('./') || name.startsWith('../') || name.startsWith('/');
}

// shadcn/ui components are copy-pasted source, not an npm package, so
// `@/components/ui/<name>` imports cannot be fetched from esm.sh and otherwise
// render as a red "Missing Library" box. We resolve any such import to a
// passthrough proxy: each named export becomes a forwardRef component that
// spreads its props onto a sensible host element and renders its children.
// Radix-only behaviors (asChild Slot merging, portals) are not reproduced.
// MIRROR of the same block in ../../src/utils/runtimeDependencies.js.
const SHADCN_UI_PREFIX = '@/components/ui/';

const SHADCN_TAGS = {
  Button: 'button', Input: 'input', Textarea: 'textarea', Label: 'label',
  Badge: 'span', Separator: 'hr', Checkbox: 'input', Switch: 'button',
  Slider: 'input', Avatar: 'span', Skeleton: 'div',
};

function makeShadcnComponent(exportName) {
  const tag = SHADCN_TAGS[exportName] || 'div';
  const Component = React.forwardRef((props, ref) => {
    const { asChild, children, ...rest } = props || {};
    return React.createElement(tag, { ref, ...rest }, children);
  });
  Component.displayName = `Shadcn(${exportName})`;
  return Component;
}

const shadcnUiProxies = new Map();

function createShadcnUiProxy(modulePath) {
  if (shadcnUiProxies.has(modulePath)) return shadcnUiProxies.get(modulePath);
  const members = {};
  const proxy = new Proxy(
    { __esModule: true },
    {
      get(_target, prop) {
        if (prop === '__esModule') return true;
        if (prop === 'default' || typeof prop !== 'string') return undefined;
        if (!members[prop]) members[prop] = makeShadcnComponent(prop);
        return members[prop];
      },
    }
  );
  shadcnUiProxies.set(modulePath, proxy);
  return proxy;
}

class RuntimeDependencyError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'RuntimeDependencyError';
    this.code = options.code ?? 'runtime_dependency_error';
    this.cause = options.cause ?? null;
  }
}

class ComponentExecutionError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ComponentExecutionError';
    this.code = options.code ?? 'component_execution_error';
    this.cause = options.cause ?? null;
  }
}

function toRuntimeDependencyError(message, options = {}) {
  return new RuntimeDependencyError(message, options);
}

// In KIT Apps this page is a srcdoc and our own files come from the shell: on
// Windows, Tauri v1 doesn't serve tauri.localhost to an opaque-origin frame
// (see src/utils/canvasRuntimeDoc.js). The share viewer loads them by URL.
const assetsFromShell = location.href === 'about:srcdoc';
const pendingAssets = {};
let nextAssetId = 1;
window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== window.parent || !d || d.type !== 'asset-result' || !pendingAssets[d.id]) return;
  const p = pendingAssets[d.id];
  delete pendingAssets[d.id];
  if (d.error) p.reject(toRuntimeDependencyError(d.error, { code: 'script_load_failed' }));
  else p.resolve(d.text);
});

function loadScript(src) {
  if (assetsFromShell && src.startsWith('./')) {
    return new Promise((resolve, reject) => {
      const id = nextAssetId++;
      pendingAssets[id] = { resolve, reject };
      postToParent({ type: 'asset', id, path: src });
    }).then((text) => {
      const script = document.createElement('script');
      script.textContent = text;
      document.head.appendChild(script); // inline scripts run on insert
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () =>
      reject(toRuntimeDependencyError(`Failed to load ${src}`, { code: 'script_load_failed' }));
    document.head.appendChild(script);
  });
}

// Load a vendored UMD bundle, falling back to its CDN URL only if the local
// copy is unavailable. Keeps the runtime working offline and fast while
// preserving the original CDN behavior as a safety net.
async function loadVendorScript(localSrc, cdnSrc) {
  try {
    await loadScript(localSrc);
  } catch (_) {
    await loadScript(cdnSrc);
  }
}

async function ensureBabelReady() {
  if (window.Babel) return;
  try {
    await loadScript('./vendor/babel.min.js');
  } catch (_) {
    try {
      await loadScript('https://unpkg.com/@babel/standalone/babel.min.js');
    } catch (error) {
      throw toRuntimeDependencyError('Unable to load the Babel runtime.', {
        code: 'babel_unavailable',
        cause: error,
      });
    }
  }
}

async function ensureRuntimeLibrariesReady() {
  if (window.Recharts && window.LucideReact) return;
  try {
    await Promise.all([
      window.PropTypes
        ? Promise.resolve()
        : loadVendorScript(
            './vendor/prop-types.min.js',
            'https://unpkg.com/prop-types@15.8.1/prop-types.min.js'
          ),
      window.LucideReact
        ? Promise.resolve()
        : loadVendorScript(
            './vendor/lucide-react.umd.js',
            'https://unpkg.com/lucide-react@0.344.0/dist/umd/lucide-react.js'
          ),
    ]);

    if (!window.Recharts) {
      await loadVendorScript(
        './vendor/recharts.umd.js',
        'https://unpkg.com/recharts@2.12.7/umd/Recharts.js'
      );
    }

    await new Promise((resolve) => window.setTimeout(resolve, 100));
  } catch (error) {
    throw toRuntimeDependencyError('Unable to load the runtime chart/icon libraries.', {
      code: 'runtime_libraries_unavailable',
      cause: error,
    });
  }
}

function extractRequiredModules(transpiledCode) {
  const matches = [...transpiledCode.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

// Next.js / React Server Component artifacts (v0, Lovable, Next app-router
// output) begin with a `"use client"` or `"use server"` directive. It is a
// no-op in KIT Apps' client-only runtime, so strip a leading run of those
// directives before transpile.
// MIRROR of stripClientDirectives in ../../src/utils/runtimeDependencies.js.
function stripClientDirectives(code) {
  return code.replace(/^[\s﻿]*(?:["']use (?:client|server)["']\s*;?\s*)+/i, '');
}

function transpileComponentCode(code) {
  try {
    return window.Babel.transform(stripClientDirectives(code), {
      // 'typescript' strips TS type annotations (interfaces, type aliases,
      // `: Props`, generics) that Claude / v0 / ChatGPT TSX artifacts carry;
      // isTSX + allExtensions make it parse JSX in every input. It runs before
      // 'react' (presets apply in reverse), leaving plain JSX for preset-react.
      presets: [
        'react',
        'env',
        ['typescript', { isTSX: true, allExtensions: true, allowDeclareFields: true }],
      ],
      parserOpts: { allowReturnOutsideFunction: true },
      sourceType: 'unambiguous',
      filename: 'canvas.tsx',
    }).code;
  } catch (error) {
    throw new ComponentExecutionError('Unable to transpile the component source.', {
      code: 'transpile_failed',
      cause: error,
    });
  }
}

function getUnknownModules(transpiledCode) {
  return extractRequiredModules(transpiledCode).filter(
    (name) => !KNOWN_LIBS[name] && !libraryCache.has(name) && !name.startsWith(SHADCN_UI_PREFIX)
  );
}

// Classify where a required module resolves from, for the render load log:
// a built-in runtime lib, one of the local shims, a locally vendored ES module,
// or an on-demand esm.sh fetch.
function describeDependencySource(name) {
  if (name.startsWith(SHADCN_UI_PREFIX)) return 'shadcn-shim';
  if (name === '@/lib/utils') return 'cn-shim';
  if (KNOWN_LIBS[name]) return 'runtime';
  if (LOCAL_ESM_MODULES[name]) return 'vendor';
  return 'cdn:esm.sh';
}

async function loadLibraryFromCDN(name) {
  if (libraryCache.has(name)) return libraryCache.get(name);

  if (KNOWN_LIBS[name]) {
    const knownLibrary = KNOWN_LIBS[name]();
    if (knownLibrary) return knownLibrary;
  }

  try {
    // Common external deps are vendored as local ES modules so they resolve
    // offline; anything else still loads on demand from esm.sh.
    const localEsm = LOCAL_ESM_MODULES[name];
    if (!localEsm) addReactImportMap();
    const module = localEsm
      ? localEsm()
      : await import(/* @vite-ignore */ `https://esm.sh/${name}?external=react,react-dom`);
    const resolvedLibrary =
      module.default && Object.keys(module).length === 1 ? module.default : module;
    libraryCache.set(name, resolvedLibrary);
    return resolvedLibrary;
  } catch (error) {
    throw toRuntimeDependencyError(`Unable to load external dependency "${name}".`, {
      code: 'external_dependency_load_failed',
      cause: error,
    });
  }
}

function resolveRuntimeLibrary(name) {
  if (name.startsWith(SHADCN_UI_PREFIX)) {
    return createShadcnUiProxy(name);
  }
  if (KNOWN_LIBS[name]) {
    const knownLibrary = KNOWN_LIBS[name]();
    if (knownLibrary) return knownLibrary;
  }
  // Only what was loaded: no window[name] fallback, which made
  // require('location') hand the canvas window.location.
  return libraryCache.has(name) ? libraryCache.get(name) : null;
}

// The canvas code runs from an inline <script>, not new Function: in this
// opaque-origin frame our own script files count as cross-origin, so the browser
// reduces errors thrown from code they define to "Script error.". Code defined
// by an inline script keeps its real error messages (event handlers, timers).
function compileComponentCode(transpiledCode) {
  window.__cvCanvasFn = null;
  const script = document.createElement('script');
  script.textContent = 'window.__cvCanvasFn = function (exports, require, module, React) {\n' + transpiledCode + '\n};';
  // A parse error surfaces as a window 'error' event, not a throw; catch it
  // first (capture phase) so it's reported once, with its real message.
  let compileError = null;
  const onError = (event) => {
    compileError = event.error || new SyntaxError(event.message);
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  window.addEventListener('error', onError, true);
  try {
    document.head.appendChild(script);
  } finally {
    window.removeEventListener('error', onError, true);
    script.remove();
  }
  const fn = window.__cvCanvasFn;
  delete window.__cvCanvasFn;
  if (compileError) throw compileError;
  if (typeof fn !== 'function') throw new SyntaxError('The canvas code could not be compiled.');
  return fn;
}

function formatRuntimeError(error) {
  if (!error) return 'Unknown runtime error.';
  if (error instanceof RuntimeDependencyError || error instanceof ComponentExecutionError) {
    if (error.cause) {
      const causeMessage = error.cause.message ?? String(error.cause);
      return `${error.message}\n\n${causeMessage}`;
    }
    return error.message;
  }
  return error.message ?? String(error);
}

function createMissingLibraryProxy(name) {
  return new Proxy({}, {
    get: (_target, prop) => {
      if (prop === '__esModule') return false;
      return () =>
        React.createElement(
          'div',
          {
            className:
              'text-red-500 text-xs p-2 border border-red-200 bg-red-50 rounded',
          },
          `Missing Library: ${name}.${String(prop)}`
        );
    },
  });
}

function isRenderableComponent(candidate) {
  return (
    candidate &&
    (typeof candidate === 'function' ||
      (typeof candidate === 'object' && Object.keys(candidate).length > 0))
  );
}

// Render errors are reported from an error boundary because window 'error'
// events for them arrive as "Script error." here (see compileComponentCode).
// A new key per render resets the boundary.
let CanvasErrorBoundary = null;
let renderCount = 0;
function canvasErrorBoundary() {
  if (!CanvasErrorBoundary) {
    CanvasErrorBoundary = class extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        postToParent({ type: 'error', message: formatRuntimeError(error) });
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    };
  }
  return CanvasErrorBoundary;
}

function postToParent(message) {
  try {
    window.parent.postMessage(message, '*');
  } catch (_) {
    /* parent gone */
  }
}

const rootEl = document.getElementById('root');

let lastRenderedCode = null;

// Heuristic: a paste is a standalone HTML document (typical of Gemini Canvas)
// rather than a JSX component if it starts with <!DOCTYPE html> or <html>.
// We render those as-is in a nested srcdoc iframe instead of running them
// through Babel, Babel can't parse `class="..."`, `<style>`, raw `<script>`,
// or DOCTYPE declarations.
function looksLikeHtmlDocument(code) {
  const trimmed = code.trimStart();
  return /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

// --- Per-canvas storage (Studio only) ----------------------------------------
// The iframe is sandboxed without allow-same-origin, so it has an opaque origin
// and no localStorage/IndexedDB of its own; that is what keeps canvas code away
// from KIT Apps' own keys and the Tauri API in the parent window. The shell owns
// each canvas's data (localStorage under `__cv__:<id>:`, IndexedDB
// `appstudio:<id>`, see src/utils/appData.js) and serves it over postMessage:
// every render carries the canvas's localStorage snapshot, writes go back as
// messages, and window.appStudio.storage calls are request/response pairs.
// A host that sends no snapshot (the share viewer) gets a memory-only store.
// (Packaged apps don't use this file; they get a per-bundleId WebView2 profile,
// see runtime/src-tauri/src/main.rs.)
const storageBridge = {
  connected: false,
  items: Object.create(null),
  memory: new Map(),
  pending: new Map(),
  nextId: 1,
  load(items) {
    this.connected = items != null;
    for (const k of Object.keys(this.items)) delete this.items[k];
    Object.assign(this.items, items || {});
    this.memory.clear();
  },
  write(op, key, value) {
    if (this.connected) postToParent({ type: 'storage', op, key, value });
  },
  idb(method, args) {
    if (!this.connected) return new Promise((resolve) => resolve(memoryStorageCall(this.memory, method, args)));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      try {
        window.parent.postMessage({ type: 'storage', op: 'idb', id, method, args }, '*');
      } catch (err) {
        this.pending.delete(id);
        reject(err); // e.g. DataCloneError for a value that can't be stored
      }
    });
  },
  settle(id, error, result) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  },
};
// Bridge for the nested srcdoc iframe of an HTML canvas. That document gets its
// own opaque origin, so it can't touch this frame: it starts from a copy of the
// items and relays writes and appStudio.storage calls here over postMessage
// (handled in the message listener below). Self-contained for injection.
function relayBridge(items) {
  var pending = {};
  var next = 1;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.type !== 'storage-result' || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  });
  return {
    items: items,
    write: function (op, key, value) { window.parent.postMessage({ type: 'child-storage', op: op, key: key, value: value }, '*'); },
    idb: function (method, args) {
      return new Promise(function (resolve, reject) {
        var id = next++;
        pending[id] = { resolve: resolve, reject: reject };
        try {
          window.parent.postMessage({ type: 'child-storage', op: 'idb', id: id, method: method, args: args }, '*');
        } catch (err) {
          delete pending[id];
          reject(err);
        }
      });
    }
  };
}

// Captures this document's body for PNG/PDF export, expanded to its natural
// height so off-screen content is included. Self-contained: it is also
// injected into an HTML canvas's nested frame, which this frame can't capture.
function captureBody(backgroundColor) {
  var body = document.body;
  var saved = { overflow: body.style.overflow, height: body.style.height };
  body.style.overflow = 'visible';
  body.style.height = 'auto';
  return new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); })
    .then(function () { return import('https://esm.sh/modern-screenshot@4.4.39'); })
    .then(function (mod) {
      return mod.domToBlob(body, {
        backgroundColor: backgroundColor || '#f8fafc',
        scale: 2,
        // modern-screenshot reads default styles from a helper iframe it
        // creates; in an opaque-origin frame that iframe is cross-origin and
        // the capture throws. A stand-in with no window makes it skip the
        // defaults and inline every computed style instead.
        // shortcut: relies on the internal `sandbox` context field of 4.4.39; re-check when bumping the version.
        sandbox: { contentWindow: null, remove: function () {} }
      });
    })
    .finally(function () {
      body.style.overflow = saved.overflow;
      body.style.height = saved.height;
    });
}

// In the nested HTML frame: answer the runtime frame's screenshot requests.
function answerScreenshots(capture) {
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== 'screenshot') return;
    capture(e.data.backgroundColor).then(
      function (blob) { window.parent.postMessage({ type: 'screenshot-result', blob: blob }, '*'); },
      function (err) { window.parent.postMessage({ type: 'screenshot-error', message: String((err && err.message) || err) }, '*'); }
    );
  });
}

// Applies a relayed storage call from the nested HTML document to this frame's bridge.
function handleChildStorage(source, data) {
  if (data.op === 'idb') {
    const reply = (msg) => source.postMessage({ type: 'storage-result', id: data.id, ...msg }, '*');
    storageBridge.idb(data.method, data.args).then(
      (result) => reply({ result }),
      (err) => reply({ error: err?.message || String(err) })
    );
    return;
  }
  const items = storageBridge.items;
  if (data.op === 'ls-set') items[data.key] = String(data.value);
  else if (data.op === 'ls-remove') delete items[data.key];
  else if (data.op === 'ls-clear') for (const k of Object.keys(items)) delete items[k];
  else return;
  storageBridge.write(data.op, data.key, data.value);
}

function memoryStorageCall(map, method, [key, value] = []) {
  switch (method) {
    case 'get': return map.get(key);
    case 'set': map.set(key, value); return true;
    case 'remove': map.delete(key); return true;
    case 'keys': return [...map.keys()];
    case 'values': return [...map.values()];
    case 'getAll': return Object.fromEntries(map);
    case 'clear': map.clear(); return true;
    default: throw new Error('Unknown storage method "' + method + '".');
  }
}

// Installs localStorage, sessionStorage and window.appStudio.storage on the
// current window, backed by the bridge. Self-contained so the same source can be
// injected verbatim into an HTML canvas's nested srcdoc iframe.
function installCanvasStorage(bridge) {
  // A Proxy so the forms AI-written code uses work like real Storage:
  // localStorage.x = v, localStorage.x, 'x' in localStorage, delete, Object.keys,
  // JSON.stringify. Methods win over a stored key of the same name, as in Storage.
  function facade(items, write) {
    var has = function (k) { return Object.prototype.hasOwnProperty.call(items, k); };
    var api = {
      getItem: function (k) { k = String(k); return has(k) ? items[k] : null; },
      setItem: function (k, v) { k = String(k); v = String(v); items[k] = v; write('ls-set', k, v); },
      removeItem: function (k) { k = String(k); delete items[k]; write('ls-remove', k); },
      clear: function () { Object.keys(items).forEach(function (k) { delete items[k]; }); write('ls-clear'); },
      key: function (i) { var k = Object.keys(items)[i]; return k === undefined ? null : k; }
    };
    var isApi = function (k) { return k === 'length' || Object.prototype.hasOwnProperty.call(api, k); };
    return new Proxy(api, {
      get: function (t, k) {
        if (k === 'length') return Object.keys(items).length;
        if (typeof k === 'symbol' || isApi(k)) return t[k];
        return has(k) ? items[k] : undefined;
      },
      set: function (t, k, v) {
        if (typeof k === 'symbol' || isApi(k)) return true; // ignored, like Storage's methods
        api.setItem(k, v);
        return true;
      },
      has: function (t, k) { return typeof k === 'string' && (isApi(k) || has(k)); },
      deleteProperty: function (t, k) {
        if (typeof k === 'string' && has(k)) api.removeItem(k);
        return true;
      },
      ownKeys: function () { return Object.keys(items); },
      getOwnPropertyDescriptor: function (t, k) {
        if (typeof k !== 'string' || !has(k)) return undefined;
        return { value: items[k], writable: true, enumerable: true, configurable: true };
      },
      defineProperty: function (t, k, d) {
        if (typeof k === 'string' && !isApi(k) && 'value' in d) api.setItem(k, d.value);
        return true;
      }
    });
  }
  try {
    var local = facade(bridge.items, function (op, k, v) { bridge.write(op, k, v); });
    var session = facade(Object.create(null), function () {});
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return local; } });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function () { return session; } });
  } catch (e) { /* some engines disallow redefining storage; it stays unavailable */ }
  function call(method) { return function () { return bridge.idb(method, Array.prototype.slice.call(arguments)); }; }
  window.appStudio = window.appStudio || {};
  window.appStudio.storage = {
    get: call('get'), set: call('set'), remove: call('remove'), keys: call('keys'),
    values: call('values'), getAll: call('getAll'), clear: call('clear')
  };
}

installCanvasStorage(storageBridge);

function renderHtmlCanvas(html) {
  // Tear down any prior React-mounted content, replace the root with a nested
  // iframe whose document is the pasted HTML. The inner iframe runs the HTML's
  // own scripts (including any CDN Tailwind), styles, and event handlers
  // exactly as a browser would, no transpilation, no conversion.
  //
  // Use unmount() (synchronous) rather than render(null) (scheduled): clearing
  // rootEl.innerHTML below detaches the nodes immediately, so a *scheduled*
  // React unmount would later call removeChild on nodes that are already gone
  // ("Failed to execute 'removeChild' on 'Node'"). unmount() detaches React's
  // tree now, so the innerHTML wipe is safe.
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  rootEl.innerHTML = '';
  const inner = document.createElement('iframe');
  inner.id = 'canvas-html-iframe';
  inner.title = 'Canvas HTML document';
  inner.style.cssText = 'width:100%;height:100%;border:0;display:block;';
  // Inject the storage shim into the nested document before the user's HTML so
  // its localStorage and appStudio.storage go through the bridge too. `<` is
  // escaped so a stored value containing "</script>" can't end the shim early.
  const items = JSON.stringify(storageBridge.items).replace(/</g, '\\u003c');
  const storageShim = '<script>(' + installCanvasStorage.toString() + ')((' + relayBridge.toString() + ')('
    + items + '));(' + answerScreenshots.toString() + ')(' + captureBody.toString() + ');<\/script>';
  // Print backgrounds too, as the runtime page does (index.html).
  const printColors = '<style>@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style>';
  inner.setAttribute('srcdoc', printColors + storageShim + html);
  rootEl.appendChild(inner);
  // Make sure the host iframe body fills the viewport so the nested iframe
  // has somewhere to expand into.
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
  rootEl.style.height = '100%';
  // HTML documents load their own scripts inside the nested iframe, so there are
  // no React external dependencies for the load log to track.
  postToParent({ type: 'loadReport', report: { kind: 'html', dependencies: [], status: 'rendered', error: null } });
  postToParent({ type: 'rendered' });
}

// --- Projects with several files (D19, #350) -------------------------------
// MIRROR of src/utils/projectModules.js (the packaged Runtime's copy); this
// file is a plain script and can't import it. Keep the two in step.
// The shell sends every project file as text, so nothing is fetched by URL.
// `./` and `../` imports resolve among those files, with or without an
// extension and to `<dir>/index.*`; bare names still load from esm.sh.
const PROJECT_JS_FILE = /\.(jsx|tsx|js|ts|mjs|cjs)$/i;
const PROJECT_EXTENSIONS = ['', '.jsx', '.tsx', '.js', '.ts', '.mjs', '.json', '.css'];

// Resolve `name` against the folder of `from`; null when it climbs above the root.
function projectPath(from, name) {
  const parts = name.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const seg of name.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

function findProjectFile(files, from, name) {
  const path = projectPath(from, name);
  if (path == null) return null;
  for (const ext of PROJECT_EXTENSIONS) if (Object.hasOwn(files, path + ext)) return path + ext;
  for (const ext of ['.jsx', '.tsx', '.js', '.ts']) if (Object.hasOwn(files, `${path}/index${ext}`)) return `${path}/index${ext}`;
  return null;
}

// An HTML entry's src/href to a project file becomes a data: URL, because the
// frame it runs in can't load files by URL (#351). Scripts keep their order
// and defer; links to anything outside the project are left alone.
const DATA_TYPES = { js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', html: 'text/html', htm: 'text/html' };
function inlineHtmlFiles(html, files, from) {
  return html.replace(/(\s(?:src|href)\s*=\s*)(["'])([^"']*)\2/gi, (whole, attr, quote, url) => {
    const path = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|$)/i.test(url) ? null : findProjectFile(files, from, url.split(/[?#]/)[0]);
    if (!path) return whole;
    const type = DATA_TYPES[path.split('.').pop().toLowerCase()] || 'text/plain';
    return `${attr}${quote}data:${type};charset=utf-8,${encodeURIComponent(files[path])}${quote}`;
  });
}

// CommonJS-style loader over the project's transpiled files. A module is cached
// before it runs, so an import cycle gets the partly filled exports, as in Node.
function createProjectLoader(files, transpiled, bareRequire) {
  const cache = new Map();
  const load = (path) => {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const text = files[path];
    if (/\.css$/i.test(path)) {
      const style = document.createElement('style');
      style.dataset.projectFile = path;
      style.textContent = text;
      document.head.appendChild(style);
    } else if (/\.json$/i.test(path)) {
      try { module.exports = JSON.parse(text); } catch (err) {
        throw new ComponentExecutionError(`${path} is not valid JSON.`, { code: 'project_json_invalid', cause: err });
      }
    } else if (PROJECT_JS_FILE.test(path)) {
      compileComponentCode(transpiled.get(path))(module.exports, requireFrom(path), module, React);
    } else {
      module.exports = text; // anything else as text, e.g. an image as a data: URL
    }
    return module.exports;
  };
  const requireFrom = (from) => (name) => {
    if (!isRelativeModule(name)) return bareRequire(name);
    const path = findProjectFile(files, from, name);
    if (!path) {
      throw new ComponentExecutionError(`${from} imports "${name}", which is not a file in this project.`, { code: 'project_file_missing' });
    }
    return load(path);
  };
  return load;
}

async function renderCanvas(code, kind, storage, files, entry) {
  // A single-file canvas is a project with one file.
  const project = files && typeof files === 'object' && Object.hasOwn(files, entry)
    ? { files, entry }
    : { files: { 'App.jsx': code }, entry: 'App.jsx' };
  const renderKey = JSON.stringify(project);
  if (renderKey === lastRenderedCode) {
    return;
  }
  lastRenderedCode = renderKey;
  code = project.files[project.entry];
  storageBridge.load(storage);

  if (!code) {
    // Synchronous unmount before wiping the container, see renderHtmlCanvas.
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
    }
    rootEl.innerHTML = '';
    postToParent({ type: 'rendered' });
    return;
  }

  // The shell passes an authoritative `kind` (from src/utils/detectCanvasKind);
  // fall back to the local heuristic if an older message omits it.
  const isHtml = kind === 'html' || (kind == null && looksLikeHtmlDocument(code));
  if (isHtml) {
    try {
      renderHtmlCanvas(inlineHtmlFiles(code, project.files, project.entry));
    } catch (err) {
      const message = formatRuntimeError(err);
      postToParent({ type: 'loadReport', report: { kind: 'html', dependencies: [], status: 'error', error: message } });
      postToParent({ type: 'error', message });
    }
    return;
  }

  // If we're switching back from an HTML render to a JSX render, drop the
  // HTML iframe so React can take over `#root` again.
  if (rootEl.querySelector('#canvas-html-iframe')) {
    rootEl.innerHTML = '';
    reactRoot = null;
  }
  document.querySelectorAll('style[data-project-file]').forEach((el) => el.remove());

  // Accumulate the render load report (consumed by the Studio shell's render
  // log). It records every module the file imports, how each resolves, and
  // whether it loaded, so a missing/failing external dependency is captured
  // rather than just producing a blank canvas.
  const report = { kind: 'component', dependencies: [], status: 'rendered', error: null };

  try {
    await ensureReact();
    await ensureBabelReady();
    await ensureRuntimeLibrariesReady();
    const transpiled = new Map();
    for (const [path, text] of Object.entries(project.files)) {
      if (!PROJECT_JS_FILE.test(path)) continue;
      try {
        transpiled.set(path, transpileComponentCode(text));
      } catch (err) {
        if (Object.keys(project.files).length > 1) err.message = `${path}: ${err.message}`;
        throw err;
      }
    }
    // Bare package names across every file; `./` imports are project files.
    const allTranspiled = [...transpiled.values()].join('\n');
    const required = extractRequiredModules(allTranspiled).filter((name) => !isRelativeModule(name));
    const unknownModules = getUnknownModules(allTranspiled).filter((name) => !isRelativeModule(name));

    // Known / shim modules resolve synchronously from globals or proxies. Verify
    // each actually resolved so a misconfigured runtime lib (e.g. a global-name
    // mismatch) is reported as failed instead of a false "loaded".
    for (const name of required) {
      if (unknownModules.includes(name)) continue;
      const resolved = resolveRuntimeLibrary(name);
      report.dependencies.push({
        name,
        source: describeDependencySource(name),
        status: resolved ? 'loaded' : 'failed',
        error: resolved ? null : 'Runtime library global not found.',
      });
    }

    // Unknown modules load now and may fail (the case this log exists to
    // surface), so load them one at a time and record each outcome instead of
    // failing the whole batch on the first error.
    let dependencyError = null;
    if (unknownModules.length > 0) {
      postToParent({ type: 'loadingLibs', libs: unknownModules });
      for (const name of unknownModules) {
        const source = describeDependencySource(name);
        try {
          await loadLibraryFromCDN(name);
          report.dependencies.push({ name, source, status: 'loaded', error: null });
        } catch (err) {
          dependencyError = dependencyError || err;
          report.dependencies.push({ name, source, status: 'failed', error: formatRuntimeError(err) });
        }
      }
    }

    if (dependencyError) throw dependencyError;

    const requireFn = (name) => resolveRuntimeLibrary(name) ?? createMissingLibraryProxy(name);
    let Component;
    try {
      const exports = createProjectLoader(project.files, transpiled, requireFn)(project.entry);
      Component = exports && (exports.default || exports);
    } catch (error) {
      throw error instanceof ComponentExecutionError ? error
        : new ComponentExecutionError('Unable to execute the rendered component.', { code: 'execution_failed', cause: error });
    }

    if (!isRenderableComponent(Component)) {
      report.status = 'error';
      report.error =
        "Could not find a component to render. Ensure the code has 'export default Component;'";
      postToParent({ type: 'loadReport', report });
      postToParent({ type: 'error', message: report.error });
      return;
    }

    renderCount += 1;
    reactRoot.render(
      React.createElement(canvasErrorBoundary(), { key: renderCount }, React.createElement(Component))
    );
    postToParent({ type: 'loadReport', report });
    postToParent({ type: 'rendered' });
  } catch (err) {
    report.status = 'error';
    report.error = formatRuntimeError(err);
    postToParent({ type: 'loadReport', report });
    postToParent({ type: 'error', message: report.error });
  }
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const htmlFrame = document.getElementById('canvas-html-iframe');
  if (htmlFrame && event.source === htmlFrame.contentWindow) {
    if (data.type === 'child-storage') handleChildStorage(event.source, data);
    else if (data.type === 'screenshot-result' || data.type === 'screenshot-error') postToParent(data);
    return;
  }
  if (event.source !== window.parent) return;

  if (data.type === 'render') {
    renderCanvas(data.code ?? '', data.kind, data.storage, data.files, data.entry);
  } else if (data.type === 'storage-result') {
    storageBridge.settle(data.id, data.error, data.result);
  } else if (data.type === 'print') {
    // The shell can't call print() on this sandboxed frame; it asks instead.
    window.print();
  } else if (data.type === 'reset') {
    lastRenderedCode = null;
    // Synchronous unmount; ensureReact() recreates the root on the next
    // component render. Avoids leaving a scheduled-unmount root around.
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
    }
  } else if (data.type === 'screenshot') {
    // PNG/PDF export: the shell can't read this sandboxed frame's DOM, so the
    // frame captures itself. An HTML canvas lives in a nested frame with its
    // own opaque origin, so the request goes on to that frame, and its answer
    // comes back through the relay above.
    const htmlFrame = document.getElementById('canvas-html-iframe');
    if (htmlFrame) {
      htmlFrame.contentWindow.postMessage(data, '*');
    } else {
      captureBody(data.backgroundColor).then(
        (blob) => postToParent({ type: 'screenshot-result', blob }),
        (err) => postToParent({ type: 'screenshot-error', message: formatRuntimeError(err) })
      );
    }
  }
});

// Signal ready immediately: Babel, React, and the chart/icon libraries now
// load lazily on the first *component* render, so an HTML-document canvas
// renders with no network round-trip and the shell can stop showing the
// "Loading Compiler & Libraries..." overlay right away.
postToParent({ type: 'ready' });
})();
