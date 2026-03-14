import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync } from "fs";
import { getDataDir, getScreenshotsDir } from "../utils/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TimelineEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  hasFrontendChanges: boolean;
  hasScreenshot: boolean;
  screenshotUrl: string | null;
  filesChanged: string[];
}

export function createServer(
  owner: string,
  repo: string,
  timelineData: TimelineEntry[],
  serverPort: number = 3333
) {
  const app = express();
  const screenshotsDir = getScreenshotsDir(owner, repo);
  const publicDir = join(__dirname, "../../public");

  // Serve static assets
  app.use("/public", express.static(publicDir));

  // Serve screenshots
  app.use("/screenshots", express.static(screenshotsDir));

  // API: timeline data
  app.get("/api/timeline", (_req, res) => {
    res.json({
      project: { owner, repo },
      commits: timelineData,
      stats: {
        totalCommits: timelineData.length,
        frontendCommits: timelineData.filter((c) => c.hasFrontendChanges)
          .length,
        capturedScreenshots: timelineData.filter((c) => c.hasScreenshot).length,
      },
    });
  });

  // Serve the dashboard
  app.get("/", (_req, res) => {
    res.sendFile(join(publicDir, "index.html"));
  });

  return new Promise<void>((resolve) => {
    app.listen(serverPort, () => {
      resolve();
    });
  });
}
