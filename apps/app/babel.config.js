module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimated/worklets-Plugin muss zuletzt stehen.
    plugins: ["react-native-worklets/plugin"],
  };
};
