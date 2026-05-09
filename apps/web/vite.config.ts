import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /** Resolve workspace package to its TS source so runtime imports
       *  (e.g. market-session helpers) work without building dist first. */
      "@paper-trader/shared": path.resolve(here, "../../packages/shared/src/index.ts")
    }
  }
});
