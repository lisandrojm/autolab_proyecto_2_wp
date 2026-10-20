import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";
import { nombreCentroCosto } from "../../../../utils/centroCosto";
import { ChipValoracionDelProyecto, useValoraciones } from "../../../../components/proyectos/ChipValoracion";

/*
  ELEGIR UN PROYECTO EN LA APP, igual en todas las pantallas (Solicitud de Contratación, Equipos).

  Con un solo proyecto no hay nada que elegir: se muestra y listo. Con varios, NO se elige ninguno por
  defecto (pedido del 19/10/2026): el campo dice «Seleccionar proyecto» y abre una ventana con la
  lista. Antes quedaba elegido el primero y se trabajaba sobre un proyecto que nadie había mirado.

  Cada proyecto lleva su centro de costo a la izquierda y su valoración a la derecha.
*/

/** El nombre con el cliente adelante: «Frame | PRODUCTORA». */
export const etiquetaDeProyecto = (p: any): string => (typeof p?.clientId === "object" && p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p?.name || "");

/** El centro de costo del proyecto, como badge (el número de Tango). Sin centro, nada. */
export const BadgeCentroCosto: React.FC<{ proyecto: any }> = ({ proyecto }) => {
  const cc = nombreCentroCosto(proyecto);
  if (!cc) return null;
  return (
    <span title={`Centro de costo ${cc}`} className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
      {cc}
    </span>
  );
};

export const SelectorDeProyecto: React.FC<{
  proyectos: any[];
  /** `_id` del elegido, o "" si todavía no se eligió. */
  valor: string;
  onElegir: (id: string) => void;
  /** Algo más al lado del campo (el botón de información del proyecto, por ejemplo). */
  extra?: React.ReactNode;
}> = ({ proyectos, valor, onElegir, extra }) => {
  const [abierto, setAbierto] = useState(false);
  const valoraciones = useValoraciones();
  const elegido = proyectos.find((p) => p._id === valor) || null;

  return (
    <>
      <div className="flex items-center gap-2">
        {!elegido ? (
          <button type="button" onClick={() => setAbierto(true)} className="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-white p-3 text-left transition-colors hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-900 dark:hover:bg-blue-900/20">
            <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Seleccionar proyecto</span>
            <span className="ml-auto text-[11px] text-slate-400">{proyectos.length} disponibles</span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-blue-700 dark:bg-blue-900/20">
            <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
            <BadgeCentroCosto proyecto={elegido} />
            <span className="min-w-0 truncate text-sm font-medium text-blue-700 dark:text-blue-400">{etiquetaDeProyecto(elegido)}</span>
            <ChipValoracionDelProyecto project={elegido} valoraciones={valoraciones} mostrarSinValorar className="ml-auto shrink-0" />
          </div>
        )}
        {proyectos.length > 1 && elegido && (
          <button type="button" onClick={() => setAbierto(true)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            Cambiar
          </button>
        )}
        {extra}
      </div>

      <Modal
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        title="Elegí el proyecto"
        subtitle={`${proyectos.length} disponibles`}
        size="md"
        zIndex={80}
        footer={
          <div className="flex w-full justify-end items-center gap-3">
            <button type="button" onClick={() => setAbierto(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
              Listo
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 py-2">
          {proyectos.map((p) => {
            const isSelected = p._id === valor;
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => {
                  onElegir(p._id);
                  setAbierto(false);
                }}
                aria-pressed={isSelected}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${isSelected ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{isSelected && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
                <BadgeCentroCosto proyecto={p} />
                <span className="text-sm font-medium">{etiquetaDeProyecto(p)}</span>
                <ChipValoracionDelProyecto project={p} valoraciones={valoraciones} mostrarSinValorar className="ml-auto shrink-0" />
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
