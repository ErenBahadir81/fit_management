// Composes jest-expo's React Native resolver with react-native-worklets' resolver.
// Reanimated/Worklets must resolve their NON-".native" (JS) implementation under Jest,
// otherwise: "Cannot read properties of undefined (reading 'loadUnpackers')".
const rnResolver = require("@react-native/jest-preset/jest/resolver");

module.exports = (request, options) => {
  const isWorkletsLand =
    options.basedir.includes("react-native-worklets") ||
    options.basedir.includes("react-native-reanimated") ||
    request.includes("react-native-worklets") ||
    request.includes("react-native-reanimated");
  if (isWorkletsLand) {
    options = { ...options, extensions: options.extensions?.filter((ext) => !ext.includes("native")) };
  }
  return rnResolver(request, options);
};
