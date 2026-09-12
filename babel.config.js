module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin (reanimated v4's worklet transform, split
    // out of react-native-reanimated itself as of v4) must be listed last -
    // it needs to see the output of every other plugin/preset first.
    plugins: ['react-native-worklets/plugin'],
  };
};
