import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface ProjectConfig {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  devCommand: string;
  port: number;
  waitMs: number;
}

export interface AppConfig {
  githubToken?: string;
  projects: Record<string, ProjectConfig>;
}

const CONFIG_DIR = join(homedir(), ".devviewer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getDataDir(owner: string, repo: string): string {
  const dir = join(CONFIG_DIR, "data", `${owner}--${repo}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getScreenshotsDir(owner: string, repo: string): string {
  const dir = join(getDataDir(owner, repo), "screenshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_FILE)) {
    const defaults: AppConfig = { projects: {} };
    writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

export function saveConfig(config: AppConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function parseRepoUrl(input: string): { owner: string; repo: string } {
  // Handle: owner/repo, https://github.com/owner/repo, git@github.com:owner/repo.git
  const ghHttps = input.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (ghHttps) return { owner: ghHttps[1], repo: ghHttps[2] };

  const ghSsh = input.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (ghSsh) return { owner: ghSsh[1], repo: ghSsh[2] };

  const shorthand = input.match(/^([^/]+)\/([^/]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2] };

  throw new Error(
    `Cannot parse repo: "${input}". Use owner/repo or a GitHub URL.`
  );
}
