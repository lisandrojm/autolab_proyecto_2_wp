import React from "react";
import { GitBranch, RotateCw } from "lucide-react";
import { useGitInfo } from "../hooks/useGitInfo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGithub } from "@fortawesome/free-brands-svg-icons";

export const GitBranchBadge: React.FC = () => {
  const { loading, gitInfo, error, refetch, lastCheckedAt, pollMs } = useGitInfo(15000);
  const [now, setNow] = React.useState(Date.now());

  if (!import.meta.env.DEV) {
    return null;
  }

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - lastCheckedAt);
  const remainingMs = Math.max(0, pollMs - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingSecStr = String(Math.min(remainingSec, 99)).padStart(2, "0");

  if (loading && !gitInfo) {
    return (
      <div className="inline-flex flex-col items-start gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
        <div className="flex items-center gap-2 w-full">
          <span className="h-3 w-3 rounded-full animate-pulse bg-gray-400 dark:bg-gray-500" />
          <span className="font-medium">Branch: Cargando...</span>
        </div>
      </div>
    );
  }

  if ((error || !gitInfo || !gitInfo.branch) && !loading) {
    return (
      <div className="inline-flex flex-col items-start gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">No Git repo</span>
          </div>
          <button onClick={refetch} title="Reintentar" disabled={loading} className={`${loading ? "opacity-50 cursor-not-allowed" : "opacity-100 hover:opacity-70"}`}>
            <RotateCw className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center justify-end w-full">
          <span className="text-[10px] opacity-70">({remainingSecStr}s)</span>
        </div>
      </div>
    );
  }

  const branch = gitInfo.branch || "unknown";
  const commit = gitInfo.lastCommit;
  const commitHash = commit?.hash || "N/A";
  const commitMessage = commit?.message || "No commit";
  const commitAuthor = commit?.author || "Unknown";

  const fullTooltip = `Branch: ${branch}\nCommit: ${commitHash}\nMessage: ${commitMessage}\nAuthor: ${commitAuthor}`;

  return (
    <div title={fullTooltip} className="inline-flex flex-col items-start gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200">
      <div className="flex items-center gap-2 w-full justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3 w-3" />
          <FontAwesomeIcon className="text-teal-400 dark:text-indigo-200" icon={faGithub} />
          <span className="font-semibold">{branch}</span>
        </div>
        <button onClick={refetch} title="Actualizar" disabled={loading} className={`${loading ? "opacity-50 cursor-not-allowed" : "opacity-100 hover:opacity-70"}`}>
          <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 w-full">
        <span className="font-mono">{commitHash}</span>
        <span className="truncate max-w-[120px] opacity-80">{commitMessage}</span>
        <div className="flex items-center justify-end w-full">
          <span className="text-[10px] opacity-70">({remainingSecStr}s)</span>
        </div>
      </div>
    </div>
  );
};
