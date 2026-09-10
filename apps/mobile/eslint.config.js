// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Build output and generated types are not sources.
    ignores: ["dist/*", "dist-web/*", ".expo/*"],
  },
]);
