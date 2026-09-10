module.exports = {
  preset: "jest-expo",
  resolver: "<rootDir>/jest.resolver.js",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/dist-web/", "/.expo/", "/__tests__/helpers\\.tsx$", "/__tests__/mocks/"],
  transformIgnorePatterns: [
    "node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?" +
      "|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*" +
      "|@sentry/react-native|native-base|react-native-svg|react-native-reanimated" +
      "|react-native-worklets|moti|@gorhom/.*|@shopify/.*|victory-native|lottie-react-native|@fitfloow/.*))",
  ],
  collectCoverageFrom: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
};
