import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

/*
  EL ÚNICO OVERLAY DE LAS PANTALLAS DE PLANTILLAS: un panel desde abajo para elegir rápido (persona,
  turno, motivo). Cada pantalla tiene a lo sumo uno abierto (un solo estado `hoja`), así que nunca hay
  dos apilados. Escape y el fondo lo cierran; lo que se elige adentro lo cierra solo.
*/
interface Props {
  abierta: boolean;
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
  /** Botones fijos abajo (ej. «Crear equipo»). */
  pie?: React.ReactNode;
}

export function HojaInferior({ abierta, titulo, subtitulo, onCerrar, children, pie }: Props) {
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 xl:w-1/2">
        <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{titulo}</h2>
            {subtitulo && <p className="truncate text-xs text-slate-600 dark:text-slate-300">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {pie && <div className="border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-700">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
