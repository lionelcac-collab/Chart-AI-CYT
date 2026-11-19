// Extends app.json. WEB_SINGLE_BUNDLE=1 disables route code-splitting so the web demo
// can be shipped as one self-contained HTML file (used by scripts/build-web-demo.mjs).
module.exports = ({ config }) => {
  if (process.env.WEB_SINGLE_BUNDLE !== '1') return config;
  return {
    ...config,
    plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : p)),
  };
};
