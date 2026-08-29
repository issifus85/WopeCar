// app.json holds all the static config; this file only adds the one field
// that has to vary per build - APP_ENV, set via eas.json's per-profile `env`
// (or the local shell for `npx expo start`) - so components/EnvironmentBanner.js
// knows whether to render.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    APP_ENV: process.env.APP_ENV || 'development',
  },
});
