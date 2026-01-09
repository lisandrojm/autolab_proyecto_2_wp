import React, { useEffect, useState } from "react";

type EnvInfo = {
  nodeEnv: string;
  mongoDbName: string;
  apiUrl: string | null;
};

export const ApiUrlBadge: React.FC = () => {
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);

  useEffect(() => {
    fetch("/api/v1/env")
      .then((res) => res.json())
      .then(setEnvInfo)
      .catch((err) => {
        console.error("Failed to fetch env info:", err);
      });
  }, []);

  if (!envInfo) {
    return <span className="inline-flex flex-col items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">Cargando entorno...</span>;
  }

  let label = envInfo.apiUrl || "Sin API";
  let ddbb = envInfo.mongoDbName || "Unknown DB";
  let classes = "inline-flex flex-col px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";

  try {
    const url = new URL(envInfo.apiUrl || "");
    const host = url.hostname.toLowerCase();

    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isAutolab = host.includes("autolab.fun");

    if (isLocal) {
      label = "Local | Development";
      ddbb = envInfo.mongoDbName;
      classes = "inline-flex flex-col px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
    } else if (isAutolab) {
      label = "Autolab.fun | Production";
      ddbb = envInfo.mongoDbName;
      classes = "inline-flex flex-col items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200";
    } else {
      label = host;
      ddbb = envInfo.mongoDbName;
    }
  } catch {
    label = envInfo.apiUrl || "Sin API";
    ddbb = envInfo.mongoDbName || "Unknown DB";
  }

  return (
    <span title={envInfo.apiUrl || ""} className={classes}>
      <span>
        <span className="text-indigo-200">API : </span>
        {label}
      </span>
      <span>
        <span className="text-indigo-200">DDBB : </span>
        {ddbb}
      </span>
    </span>
  );
};
