import React, { useState } from "react";
import { ServerStatusPill } from "./ServerStatusPill";
import { ApiUrlBadge } from "./ApiUrlBadge";
import { GitBranchBadge } from "./GitBranchBadge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTerminal, faChevronDown } from "@fortawesome/free-solid-svg-icons";

export const ServerStatusCard: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Solo mostrar en modo development
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className={`fixed bottom-5 right-8 hidden xl:block z-50 transition-all duration-500 ease-in-out`}>
      {isCollapsed ? (
        <button onClick={() => setIsCollapsed(false)} className="flex items-center justify-center w-10 h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/20 transition-all hover:scale-110 active:scale-95 group relative" title="Ver estado del sistema">
          <div className="absolute inset-0 rounded-full bg-indigo-500 animate-ping opacity-20 group-hover:opacity-40" />
          <FontAwesomeIcon icon={faTerminal} className="h-4 w-4 relative z-10" />
        </button>
      ) : (
        <div className="w-80 bg-white/70 dark:bg-gray-800/80 shadow-2xl rounded-2xl p-4 border border-white/20 dark:border-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 relative group">
          <button onClick={() => setIsCollapsed(true)} className="absolute -top-2 -right-2 w-6 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500 hover:text-white text-gray-500 dark:text-gray-400 rounded-full flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100" title="Colapsar">
            <FontAwesomeIcon icon={faChevronDown} className="h-2 w-2" />
          </button>

          <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-1">System Environment</h3>

          <div className="space-y-3">
            <div className="flex flex-col gap-2.5">
              <ApiUrlBadge />
              <GitBranchBadge />
              <div className="pt-1">
                <ServerStatusPill />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
