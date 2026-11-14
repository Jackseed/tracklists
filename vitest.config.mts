import { defineConfig } from 'vitest/config';

// Used by `ng test` (see "runnerConfig" in angular.json).
export default defineConfig({
  test: {
    server: {
      deps: {
        // Akita ships ES module syntax in plain .js files: Node cannot load it as is, Vite can.
        inline: [/@datorama\/akita/, /akita-filters-plugin/],
      },
    },
  },
});
