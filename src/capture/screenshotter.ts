import { chromium, type Browser, type Page } from "playwright";
import { execSync, spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import type { SimpleGit } from "simple-git";
import type { CommitInfo } from "../github/commits.js";

export interface CaptureOptions {
  repoPath: string;
  devCommand: string;
  port: number;
  waitMs: number;
  screenshotsDir: string;
  viewport?: { width: number; height: number };
}

export interface CaptureResult {
  sha: string;
  screenshotPath: string;
  success: boolean;
  error?: string;
}

function waitForPort(port: number, timeoutMs: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const net = require("net") as typeof import("net");
      const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
          return;
        }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc.pid) {
      resolve();
      return;
    }
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Already dead
      }
    }
    setTimeout(resolve, 1000);
  });
}

export async function captureCommit(
  git: SimpleGit,
  commit: CommitInfo,
  options: CaptureOptions,
  browser: Browser
): Promise<CaptureResult> {
  const screenshotPath = join(
    options.screenshotsDir,
    `${commit.shortSha}.png`
  );

  // Skip if already captured
  if (existsSync(screenshotPath)) {
    return { sha: commit.sha, screenshotPath, success: true };
  }

  let devServer: ChildProcess | null = null;

  try {
    // Checkout the commit
    await git.checkout(commit.sha, ["--force"]);

    // Install dependencies if package.json exists
    const pkgPath = join(options.repoPath, "package.json");
    if (existsSync(pkgPath)) {
      execSync("npm install --silent", { cwd: options.repoPath, stdio: "ignore" });
    }

    // Start dev server
    const [cmd, ...args] = options.devCommand.split(" ");
    devServer = spawn(cmd, args, {
      cwd: options.repoPath,
      detached: true,
      stdio: "ignore",
      shell: true,
      env: { ...process.env, PORT: String(options.port), BROWSER: "none" },
    });

    // Wait for server to be ready
    await waitForPort(options.port);

    // Additional wait for the app to fully render
    await new Promise((r) => setTimeout(r, options.waitMs));

    // Take screenshot
    const viewport = options.viewport || { width: 1280, height: 800 };
    const page: Page = await browser.newPage({ viewport });
    await page.goto(`http://localhost:${options.port}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();

    return { sha: commit.sha, screenshotPath, success: true };
  } catch (error: any) {
    return {
      sha: commit.sha,
      screenshotPath,
      success: false,
      error: error.message,
    };
  } finally {
    if (devServer) await killProcess(devServer);
  }
}

export async function captureAllCommits(
  git: SimpleGit,
  commits: CommitInfo[],
  options: CaptureOptions,
  onProgress?: (current: number, total: number, commit: CommitInfo) => void
): Promise<CaptureResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];

  // Save current branch to restore later
  const currentBranch = (await git.branch()).current;

  try {
    const frontendCommits = commits.filter((c) => c.hasFrontendChanges);
    const total = frontendCommits.length;

    for (let i = 0; i < total; i++) {
      const commit = frontendCommits[i];
      onProgress?.(i + 1, total, commit);
      const result = await captureCommit(git, commit, options, browser);
      results.push(result);
    }
  } finally {
    // Restore original branch
    try {
      await git.checkout(currentBranch, ["--force"]);
    } catch {
      // May fail if branch doesn't exist
    }
    await browser.close();
  }

  return results;
}
