export interface GitInfo {
    branch: string | null;
    lastCommit: {
        hash: string | null;
        message: string | null;
        author: string | null;
    } | null;
}
export declare function getGitInfo(): Promise<GitInfo>;
