import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition, faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";

/**
 * EL MODAL DE AYUDA DEL MÓVIL — UNO SOLO, PARA TODA LA APP.
 *
 * Es el que abre la «i» del encabezado de cada sección (Registro, Contratación, Novedades…). Vivía
 * adentro de `SectionHeader`, así que un campo que necesitara explicarse no podía usarlo: terminaba
 * como un recuadro de color metido en el formulario, que se lee distinto, ocupa lugar para siempre y
 * empuja hacia abajo lo que hay que completar.
 *
 * Sacado acá, la ayuda se ve igual venga de donde venga, y eso es el punto: quien ya tocó una «i»
 * sabe qué va a pasar cuando toque la siguiente.
 */
interface Props {
  icono: IconDefinition;
  titulo: string;
  /** Qué es esto, en dos o tres oraciones. Los saltos de línea se respetan. O contenido ya armado (varios párrafos). */
  texto: React.ReactNode;
  /** Un botón extra adentro del modal, para lo que esa pantalla ya ofrecía. */
  extra?: { label: string; onClick: () => void };
  onCerrar: () => void;
}

export function ModalInfo({ icono, titulo, texto, extra, onCerrar }: Props) {
  return (
    // Centrado en la pantalla: pegado abajo se confundía con la barra de navegación.
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <FontAwesomeIcon icon={icono} className="h-4 w-4" /> {titulo}
          </p>
          <button onClick={onCerrar} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded text-slate-500">
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {typeof texto === "string" ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{texto}</p>
          ) : (
            // Contenido armado afuera: los párrafos se leen al tamaño del modal, no al de la ayuda chica de un campo.
            <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-slate-700 dark:[&_p]:text-slate-300">{texto}</div>
          )}
          {extra && (
            <button
              onClick={() => {
                onCerrar();
                extra.onClick();
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              {extra.label}
            </button>
          )}
          <button onClick={onCerrar} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La «i» y su modal, juntos: para un CAMPO del formulario, no para la sección entera.
 *
 * Se pone al lado del rótulo. La explicación queda a un toque de distancia en vez de ocupar lugar
 * arriba del campo que hay que llenar.
 */
/**
 * `tono`: la «i» en gris es ayuda; en amarillo o rojo es un aviso —hay algo para mirar—. Misma pieza,
 * mismo lugar al lado del rótulo, otro color: quien ya sabe qué hace la «i» entiende que ésta urge.
 */
export function BotonInfo({ icono = faCircleInfo, titulo, texto, tono }: { icono?: IconDefinition; titulo: string; texto: React.ReactNode; tono?: "ambar" | "rojo" }) {
  const [abierto, setAbierto] = useState(false);
  const color = tono === "rojo" ? "text-red-500 hover:text-red-700 dark:hover:text-red-300" : tono === "ambar" ? "text-amber-500 hover:text-amber-700 dark:hover:text-amber-300" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200";
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={tono ? `Ver ${titulo}` : `Qué va en ${titulo}`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${color}`}
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
      {abierto && <ModalInfo icono={icono} titulo={titulo} texto={texto} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
