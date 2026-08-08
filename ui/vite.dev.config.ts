import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    viteCommonjs(),
    nodePolyfills({
      include: ["buffer", "process", "util", "crypto", "stream"],
    }),
  ],
  optimizeDeps: {
    // The workspace hoists dependencies to the repository root. Explicitly
    // prebundle React and Phosphor so the browser receives ESM wrappers rather
    // than trying to import named exports from React's CommonJS entrypoint.
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@phosphor-icons/react",
    ],
  },
  esbuild: {
    jsx: "automatic",
    jsxDev: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "./src"),
      "cross-fetch": path.resolve(configDirectory, "./src/integration/browser-fetch.ts"),
      "object-inspect": path.resolve(configDirectory, "./src/integration/browser-object-inspect.ts"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(configDirectory, "..")],
    },
  },
});
