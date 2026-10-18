import React from "react";

/** Días, horas y minutos que faltan; null si ya pasó. */
export const faltan = (destinoMs: number, ahoraMs: number): { d: number; h: number; m: number } | null => {
  const ms = destinoMs - ahoraMs;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60_000);
  return { d: Math.floor(min / 1440), h: Math.floor((min % 1440) / 60), m: min % 60 };
};

/**
 * LA CUENTA REGRESIVA de las corridas automáticas de ARCA (altas, descarga de constancias): tres cajas
 * con días, horas y minutos. `ahora` es la hora del SERVIDOR (ver cómo la calcula cada página): la
 * cuenta no puede depender de un reloj de PC atrasado.
 */
export const CuentaRegresiva: React.FC<{ destino: string; ahora: number; grande?: boolean }> = ({ destino, ahora, grande }) => {
  const r = faltan(new Date(destino).getTime(), ahora);
  if (!r) return null;
  const caja = grande ? "min-w-[64px] px-3 py-2" : "min-w-[42px] px-2 py-1";
  const num = grande ? "text-2xl" : "text-sm";
  return (
    <div className="flex items-stretch gap-1.5" aria-label={`Faltan ${r.d} días, ${r.h} horas y ${r.m} minutos`}>
      {[
        [r.d, r.d === 1 ? "día" : "días"],
        [r.h, r.h === 1 ? "hora" : "horas"],
        [r.m, r.m === 1 ? "minuto" : "minutos"],
      ].map(([n, et]) => (
        <div key={String(et)} className={`${caja} rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-center`}>
          <div className={`${num} font-bold tabular-nums text-blue-700 dark:text-blue-300 leading-tight`}>{n}</div>
          <div className="text-[10px] uppercase tracking-wide text-blue-500 dark:text-blue-400">{et}</div>
        </div>
      ))}
    </div>
  );
};
