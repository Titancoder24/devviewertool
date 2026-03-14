import { Octokit } from "@octokit/rest";

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  hasFrontendChanges: boolean;
  filesChanged: string[];
}

const FRONTEND_PATTERNS = [
  /\.(tsx?|jsx?|vue|svelte|html|css|scss|sass|less|styl)$/,
  /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
  /package\.json$/,
  /tailwind/,
  /postcss/,
  /vite\.config/,
  /next\.config/,
  /nuxt\.config/,
];

function isFrontendFile(filename: string): boolean {
  return FRONTEND_PATTERNS.some((p) => p.test(filename));
}

export async function fetchCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string = "main",
  maxCommits: number = 100
): Promise<CommitInfo[]> {
  const octokit = new Octokit({ auth: token });

  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    sha: branch,
    per_page: Math.min(maxCommits, 100),
  });

  const results: CommitInfo[] = [];

  for (const commit of commits) {
    const { data: detail } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: commit.sha,
    });

    const filesChanged = (detail.files || []).map((f) => f.filename);
    const hasFrontendChanges = filesChanged.some(isFrontendFile);

    results.push({
      sha: commit.sha,
      shortSha: commit.sha.substring(0, 7),
      message: commit.commit.message.split("\n")[0],
      author: commit.commit.author?.name || "Unknown",
      date: commit.commit.author?.date || "",
      hasFrontendChanges,
      filesChanged,
    });
  }

  return results;
}

export async function fetchCommitsLocal(
  git: import("simple-git").SimpleGit,
  branch: string = "main",
  maxCommits: number = 100
): Promise<CommitInfo[]> {
  const log = await git.log({ maxCount: maxCommits, from: branch });
  const results: CommitInfo[] = [];

  for (const entry of log.all) {
    let filesChanged: string[] = [];
    try {
      const diff = await git.diffSummary([`${entry.hash}^`, entry.hash]);
      filesChanged = diff.files.map((f) => f.file);
    } catch {
      // First commit has no parent
    }

    results.push({
      sha: entry.hash,
      shortSha: entry.hash.substring(0, 7),
      message: entry.message.split("\n")[0],
      author: entry.author_name,
      date: entry.date,
      hasFrontendChanges: filesChanged.some(isFrontendFile),
      filesChanged,
    });
  }

  return results;
}
