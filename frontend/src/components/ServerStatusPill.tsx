import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faRotateRight, faServer } from "@fortawesome/free-solid-svg-icons";
import { useHealth } from "../hooks/useHealth";

type Props = {
  pollMs?: number;
  className?: string;
  widthPx?: number; // ancho fijo total
  heightPx?: number; // alto fijo total
};

export const ServerStatusPill: React.FC<Props> = ({
  pollMs = 10000,
  className,
  widthPx = 250,
  heightPx = 36, // aprox h-9
}) => {
  // Solo mostrar en modo development
  if (!import.meta.env.DEV) {
    return null;
  }

  const { loading, serverOk, error, data, refetch, lastCheckedAt, pollMs: usedPoll } = useHealth(pollMs);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - lastCheckedAt);
  const remainingMs = Math.max(0, usedPoll - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const remainingSecStr = String(Math.min(remainingSec, 99)).padStart(2, "0");

  // wrapper con tamaño fijo
  const style = { width: `${widthPx}px`, height: `${heightPx}px` };
  const base = "inline-flex items-center gap-2 px-3 rounded-full text-xs";
  const tone = loading ? "text-gray-200/90 bg-slate-700/60" : serverOk ? "text-blue-600 dark:text-blue-300 border dark:border-none dark:bg-blue-900/30" : "text-red-300 bg-red-900/30";

  // slots con ancho reservado para que no cambie el layout
  const labelCls = "font-medium"; // "Server:OFF" cabe
  const actionCls = "flex items-center justify-center w-4"; // botón reset
  const msgCls = "text-[10px] opacity-70 w-[130px] truncate"; // error/ts
  const timeCls = "text-[10px] opacity-70 w-[42px] text-right"; // (99s)

  return (
    <div className={`${base} ${tone} ${className || ""}`} style={style}>
      {/* Icono */}
      {loading ? <span className="h-3 w-3 rounded-full dark:bg-gray-300/70" /> : serverOk ? <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" /> : <FontAwesomeIcon icon={faServer} className="h-4 w-4" />}

      {/* Label */}
      <span className={labelCls}>{loading ? "Chequeando…" : serverOk ? "Server:ON" : "Server:OFF"}</span>

      {/* Botón reset: siempre visible para mantener ancho; deshabilitado si loading */}
      <button onClick={refetch} title="Reintentar" disabled={loading} className={`${actionCls} ${loading ? "opacity-50 cursor-not-allowed" : "opacity-100"}`}>
        <FontAwesomeIcon icon={faRotateRight} className="h-4 w-4" />
      </button>

      {/* Mensaje (error o ts) con ancho fijo */}
      {loading ? <span className={`${msgCls} opacity-40`}>...</span> : serverOk ? <span className={msgCls}>{data?.ts ? `ts:${data.ts}` : ""}</span> : <span className={msgCls}>{error ? `(${String(error)})` : ""}</span>}

      {/* Countdown */}
      <span className={timeCls}>({remainingSecStr}s)</span>
    </div>
  );
};
