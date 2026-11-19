#!/bin/bash
# Builds the web app (connected to Supabase via apps/mobile/.env) and deploys it to Vercel production
# (team cyt-chart-ia, project chart-boursafrikia → https://chart-boursafrikia.com).
# Needs a Vercel token: VERCEL_TOKEN env var, or injected by the Claude session proxy.
set -euo pipefail
cd "$(dirname "$0")/../apps/mobile"
OUT=$(mktemp -d)
npx expo export --platform web --clear --output-dir "$OUT"
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
