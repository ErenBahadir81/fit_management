module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    // No reanimated/worklets plugin here: babel-preset-expo@57 injects it.
  };
};
