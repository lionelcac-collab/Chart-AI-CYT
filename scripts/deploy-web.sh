#!/bin/bash
# Builds the web app (connected to Supabase via apps/mobile/.env) and deploys it to Vercel production
# (team cyt-chart-ia, project chart-boursafrikia → https://chart-boursafrikia.com).
# Needs a Vercel token: VERCEL_TOKEN env var, or injected by the Claude session proxy.
set -euo pipefail
cd "$(dirname "$0")/../apps/mobile"
OUT=$(mktemp -d)
npx expo export --platform web --clear --output-dir "$OUT"
# Home-screen / desktop icon: manifest + Apple touch icon (files come from apps/mobile/public), French page language.
python3 - "$OUT/index.html" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
tags = ('<link rel="manifest" href="/manifest.webmanifest"/>'
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>'
        '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>'
        '<meta name="theme-color" content="#161B1E"/>'
        '<meta name="apple-mobile-web-app-capable" content="yes"/>'
        '<meta name="mobile-web-app-capable" content="yes"/>'
        '<meta name="apple-mobile-web-app-title" content="BoursafrikIA"/>'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black"/>')
if 'rel="manifest"' not in s: s = s.replace('</head>', tags + '</head>', 1)
s = s.replace('<html lang="en">', '<html lang="fr">', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
for f in manifest.webmanifest apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png favicon-32.png; do
  [ -f "$OUT/$f" ] || cp "public/$f" "$OUT/$f"
done
cat > "$OUT/vercel.json" <<'JSON'
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/_expo/static/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "SAMEORIGIN" }
    ] }
  ]
}
JSON
npx --yes vercel@latest deploy "$OUT" --prod --yes --token "${VERCEL_TOKEN:-vcpPlaceholderInjectedByProxy0000}" --scope cyt-chart-ia --name chart-boursafrikia
