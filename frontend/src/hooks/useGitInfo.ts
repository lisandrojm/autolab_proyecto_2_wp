import { useEffect, useState } from "react";

type GitInfo = {
  branch: string | null;
  lastCommit: {
    hash: string | null;
    message: string | null;
    author: string | null;
  } | null;
};

type EnvResponse = {
  nodeEnv: string;
  mongoDbName: string;
  apiUrl: string | null;
  git: GitInfo;
};

export function useGitInfo(pollMs = 15000) {
  const [loading, setLoading] = useState(true);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number>(Date.now());

  const fetchGitInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/env", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: EnvResponse = await res.json();
      setGitInfo(json.git || null);
    } catch (e: any) {
      setGitInfo(null);
      setError(e?.message || "Error fetching Git info");
    } finally {
      setLoading(false);
      setLastCheckedAt(Date.now());
    }
  };

  useEffect(() => {
    fetchGitInfo();
    const id = window.setInterval(fetchGitInfo, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);

  return { loading, gitInfo, error, refetch: fetchGitInfo, lastCheckedAt, pollMs };
}
