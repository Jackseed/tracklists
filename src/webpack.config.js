var BrotliPlugin = require("brotli-webpack-plugin");
module.exports = {
  plugins: [
    new BrotliPlugin({
      asset: "[path].br",
      threshold: 0,
      minRatio: 0.8,
    }),
  ],
};
