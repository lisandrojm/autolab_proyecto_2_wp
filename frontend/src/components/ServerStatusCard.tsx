import React from "react";
import { ServerStatusPill } from "./ServerStatusPill";
import { ApiUrlBadge } from "./ApiUrlBadge";
import { GitBranchBadge } from "./GitBranchBadge";

export const ServerStatusCard: React.FC = () => {
  // Solo mostrar en modo development
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-8 hidden xl:block w-50 z-50">
      <div className="bg-white/70 dark:bg-gray-800/70 shadow-md rounded-lg px-3 py-2 border border-gray-200/60 dark:border-gray-700/60 backdrop-blur-sm">
        <ApiUrlBadge />
        <div className="mt-2">
          <GitBranchBadge />
        </div>
        <div className="mt-2">
          <ServerStatusPill />
        </div>
      </div>
    </div>
  );
};
