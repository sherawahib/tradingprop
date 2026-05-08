import type { Express, Request, Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Lookup table of where each platform's installer is expected to land after
 * `npm run package -w apps/desktop` (electron-builder writes into
 * `apps/desktop/release/`). The API process runs out of `apps/api`, so we
 * resolve back up to the monorepo root each time the route fires — that way
 * the rebuilt installer is picked up live without restarting the API.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DESKTOP_RELEASE_DIR = path.join(REPO_ROOT, "apps", "desktop", "release");

interface DesktopArtifact {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
  version: string | null;
}

function findLatestWindowsInstaller(): DesktopArtifact | null {
  if (!fs.existsSync(DESKTOP_RELEASE_DIR)) return null;
  const entries = fs.readdirSync(DESKTOP_RELEASE_DIR, { withFileTypes: true });
  let best: DesktopArtifact | null = null;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".exe")) continue;
    /** Skip electron-builder's elevated helper / uninstaller binaries. */
    if (lower.includes("uninstall") || lower.includes("elevate")) continue;
    const full = path.join(DESKTOP_RELEASE_DIR, entry.name);
    const stat = fs.statSync(full);
    const versionMatch = entry.name.match(/(\d+\.\d+\.\d+)/);
    const candidate: DesktopArtifact = {
      filePath: full,
      fileName: entry.name,
      sizeBytes: stat.size,
      modifiedAt: stat.mtimeMs,
      version: versionMatch ? versionMatch[1] : null
    };
    if (!best || candidate.modifiedAt > best.modifiedAt) {
      best = candidate;
    }
  }
  return best;
}

export function registerDownloadRoutes(app: Express): void {
  /**
   * Manifest the portal can read to render the download card without
   * issuing a HEAD request.
   */
  app.get("/downloads/desktop/manifest", (_req: Request, res: Response) => {
    const installer = findLatestWindowsInstaller();
    if (!installer) {
      return res.status(404).json({
        available: false,
        platform: "windows",
        message:
          "Installer not built yet — run `npm run package -w apps/desktop` to produce a Windows NSIS installer."
      });
    }
    return res.json({
      available: true,
      platform: "windows",
      version: installer.version,
      fileName: installer.fileName,
      sizeBytes: installer.sizeBytes,
      modifiedAt: installer.modifiedAt,
      downloadUrl: "/downloads/desktop/windows"
    });
  });

  /**
   * Stream the latest Windows installer. We use `res.download` so the
   * response carries a proper `Content-Disposition: attachment; filename=…`
   * header — clicking the portal button triggers a real file download.
   */
  app.get("/downloads/desktop/windows", (_req: Request, res: Response) => {
    const installer = findLatestWindowsInstaller();
    if (!installer) {
      return res.status(404).json({
        error:
          "Desktop installer not available yet. Build it with `npm run package -w apps/desktop` and try again."
      });
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(installer.sizeBytes));
    return res.download(installer.filePath, installer.fileName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Failed to stream installer." });
      }
    });
  });
}
