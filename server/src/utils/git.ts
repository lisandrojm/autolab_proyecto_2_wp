import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitInfo {
  branch: string | null;
  lastCommit: {
    hash: string | null;
    message: string | null;
    author: string | null;
  } | null;
}

export async function getGitInfo(): Promise<GitInfo> {
  const result: GitInfo = {
    branch: null,
    lastCommit: null,
  };

  try {
    const branchResult = await execAsync("git rev-parse --abbrev-ref HEAD", {
      timeout: 5000,
    });
    result.branch = branchResult.stdout.trim() || null;
  } catch (error) {
    console.warn("Failed to get Git branch:", error);
  }

  try {
    const commitResult = await execAsync('git log -1 --pretty=format:"%h|%s|%an"', {
      timeout: 5000,
    });
    const commitData = commitResult.stdout.trim();
    if (commitData) {
      const [hash, message, author] = commitData.split("|");
      result.lastCommit = {
        hash: hash || null,
        message: message || null,
        author: author || null,
      };
    }
  } catch (error) {
    console.warn("Failed to get Git commit info:", error);
  }

  return result;
}
