// Builds the web DEMO as one self-contained HTML fragment (single JS bundle inlined),
// suitable for hosting as a single page.
// Usage: node scripts/build-web-demo.mjs <outDir> [--snapshot snapshot.json]
//   --snapshot injects a real-data snapshot (scripts/fetch-snapshot.mts) instead of fictional demo data.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-demo';
const snapIdx = process.argv.indexOf('--snapshot');
const snapshot = snapIdx > 0 ? readFileSync(process.argv[snapIdx + 1], 'utf8') : null;
if (snapshot) JSON.parse(snapshot); // fail early on a broken file
const build = join(out, 'expo-build');
const app = new URL('../apps/mobile', import.meta.url).pathname;
execSync(`npx expo export --platform web --output-dir ${build}`, {
  cwd: app, stdio: 'inherit',
  env: { ...process.env, WEB_SINGLE_BUNDLE: '1', EXPO_PUBLIC_DEMO: '1', CI: '1' },
});
const dir = join(build, '_expo/static/js/web');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
if (files.length !== 1) throw new Error(`expected 1 bundle, got ${files.length}`);
const js = readFileSync(join(dir, files[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const page = `<title>Nyota Démo</title>
<meta name="description" content="Démo web de Nyota, analyse des bourses africaines (données fictives).">
<style>
  :root { --bg: #F5F6FB; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0B0F1E; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0B0F1E; color-scheme: dark; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--bg); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>JavaScript est nécessaire pour afficher la démo.</noscript>
<div id="root"></div>
<div id="boot" style="font:15px -apple-system,Segoe UI,sans-serif;color:#9AA4C2;padding:24px;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center">Chargement de la démo Nyota…</div>
<script>
  // The app router reads the URL path: start the demo on its home screen whatever path hosts this page.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
  // If the app has not rendered after 10 s, say so and show the first error instead of a blank screen.
  window.__bootErrors = [];
  window.addEventListener('error', function (e) { window.__bootErrors.push(String(e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { window.__bootErrors.push(String(e.reason && e.reason.message || e.reason)); });
  var bootTimer = setInterval(function () {
    var root = document.getElementById('root'), boot = document.getElementById('boot');
    if (root && root.childElementCount > 0) { if (boot) boot.remove(); clearInterval(bootTimer); }
  }, 200);
  setTimeout(function () {
    var root = document.getElementById('root'), boot = document.getElementById('boot');
    if (boot && !(root && root.childElementCount > 0)) {
      boot.textContent = 'La démo n’a pas pu démarrer dans ce navigateur. ' + (window.__bootErrors[0] ? 'Erreur : ' + window.__bootErrors[0] : 'Essayez Chrome ou Safari à jour.');
    }
  }, 10000);
</script>
${snapshot ? `<script>window.__NYOTA_SNAPSHOT__ = ${snapshot.replace(/</g, '\\u003c')};</script>\n` : ''}<script>${js}</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'nyota-demo.html'), page);
console.log(`wrote ${join(out, 'nyota-demo.html')} (${(page.length / 1e6).toFixed(2)} MB)`);
