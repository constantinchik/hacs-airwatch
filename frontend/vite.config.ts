import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig({
  build: {
    lib: {
      entry: "src/airwatch-cards.ts",
      formats: ["es"],
      fileName: () => "airwatch-cards.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  plugins: [cssInjectedByJsPlugin()],
});
