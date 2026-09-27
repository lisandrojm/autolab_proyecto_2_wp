import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

/*
  EL ÚNICO OVERLAY DE LAS PANTALLAS DE PLANTILLAS: un panel para elegir rápido (persona, turno,
  motivo). Escape y el fondo lo cierran; lo que se elige adentro lo cierra solo.

  VA CENTRADO Y CON AIRE ALREDEDOR. Pegado abajo y a los cuatro bordes se leía como una parte más de
  la pantalla —sobre todo con la lista llena— y no como algo que está ENCIMA y que hay que cerrar. El
  margen es chico a propósito: lo justo para que se vea el fondo oscuro rodeándolo, que es lo que lo
  delata como modal, sin robarle lugar a la lista.

  PUEDEN APILARSE, de a dos: elegir el área abre sus turnos encima, y tildar uno cierra el de arriba y
  deja el de abajo. Es lo que evita que la pantalla crezca y se mueva bajo el dedo — con el acordeón
  había que bajar hasta el área, abrirla, elegir, y volver a subir para ver qué había quedado.

  `nivel` decide cuál va arriba. Sin él quedaría librado al orden del DOM, que es cierto hoy y deja de
  serlo el día que alguien mueva un JSX de lugar.
*/
interface Props {
  abierta: boolean;
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
  /** Botones fijos abajo (ej. «Crear equipo»). */
  pie?: React.ReactNode;
  /** 2 = va encima de otra hoja abierta. */
  nivel?: 1 | 2;
}

export function HojaModal({ abierta, titulo, subtitulo, onCerrar, children, pie, nivel = 1 }: Props) {
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
    <div className={`fixed inset-0 flex items-center justify-center p-3 ${nivel === 2 ? "z-[80]" : "z-[70]"}`} role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 xl:max-w-lg">
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
