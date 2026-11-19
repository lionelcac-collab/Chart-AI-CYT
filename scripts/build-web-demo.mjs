// Builds the web DEMO as one self-contained HTML fragment (single JS bundle inlined),
// suitable for hosting as a single page. Usage: node scripts/build-web-demo.mjs <outDir>
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-demo';
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
<script>
  // The app router reads the URL path: start the demo on its home screen whatever path hosts this page.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>${js}</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'nyota-demo.html'), page);
console.log(`wrote ${join(out, 'nyota-demo.html')} (${(page.length / 1e6).toFixed(2)} MB)`);
