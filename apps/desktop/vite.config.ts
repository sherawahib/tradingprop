import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromHere = createRequire(import.meta.url);

/** Resolve react/react-dom from wherever npm hoisted them in the workspace. */
function resolvePkgDir(pkg: string): string {
  const localCandidate = path.resolve(here, "node_modules", pkg);
  try {
    // Re-use the closest install (workspace local first, then root hoist).
    return path.dirname(requireFromHere.resolve(`${pkg}/package.json`));
  } catch {
    return localCandidate;
  }
}

const reactDir = resolvePkgDir("react");
const reactDomDir = resolvePkgDir("react-dom");

/**
 * Force every import of `react` / `react-dom` (and `react/jsx-runtime`) in
 * this app — including from third-party packages like `lucide-react` that npm
 * may have hoisted to the repo root against the web workspace's React 18 —
 * to resolve to the SINGLE copy nested inside `apps/desktop/node_modules`.
 * Without this we get two React instances at runtime and the classic error:
 *   "A React Element from an older version of React was rendered."
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5180,
    strictPort: true,
    /** Avoid reload storms when `electron-builder` writes under `release/` — those used to restart Vite on a random port while Electron still waited on :5180. */
    watch: {
      ignored: ["**/release/**", "**/dist-electron/**", "**/dist/**", "**/*.node"]
    }
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: reactDir,
      "react-dom": reactDomDir,
      "react/jsx-runtime": path.join(reactDir, "jsx-runtime"),
      "react/jsx-dev-runtime": path.join(reactDir, "jsx-dev-runtime"),
      /** Resolve workspace package to its TS source so runtime imports
       *  (e.g. market-session helpers) work without building dist first. */
      "@paper-trader/shared": path.resolve(here, "../../packages/shared/src/index.ts")
    }
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "lucide-react", "lightweight-charts"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: false
  }
});
