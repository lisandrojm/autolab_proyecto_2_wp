import React, { useState } from "react";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import type { Project } from "../../api/projects";
import { ChipValoracion, ChipSinValorar, idValoracionDe } from "./ChipValoracion";
import { resolverValoracion } from "@compartido/valoracionAutomatica";

/**
 * EL CAMPO «VALORACIÓN» DE LOS FORMULARIOS DE PROYECTO (alta y edición).
 *
 * Dos modos, y `valor` dice cuál:
 *   - `""` = AUTOMÁTICA: la del margen y, sin margen, la POR DEFECTO. Se MUESTRA mientras se escribe
 *     el margen, con la misma regla que aplica el server (`@compartido/valoracionAutomatica`).
 *   - un id = FORZADA A MANO, con un botón explícito. Vale para el margen de ese momento: si el
 *     margen CAMBIA, vuelve sola a la automática (acá al escribirlo, y el server al guardarlo), y
 *     para tenerla distinta hay que volver a forzarla.
 *
 * Las valoraciones se ven y se eligen como sus BADGES, con su color: un <select> no puede pintarlas.
 */
/** El valor con el que arranca el campo: fijada → su id; automática → `""`. */
export const valorInicialValoracion = (project?: Pick<Project, "valoracionId" | "valoracionManual"> | null): string => (project?.valoracionManual ? idValoracionDe(project.valoracionId) : "");

/**
 * Qué mandar al guardar, según lo elegido y cómo estaba. Sin `antes` es un alta.
 *
 * Sólo se manda lo que cambia de modo o de valoración: mandar `valoracionId` siempre la dejaría
 * fijada a mano en cada edición, aunque nadie la haya tocado, y el margen dejaría de moverla.
 */
export const cambiosDeValoracion = (elegida: string, antes?: Pick<Project, "valoracionId" | "valoracionManual"> | null): { valoracionId?: string; valoracionManual?: boolean } => {
  if (!antes) return elegida ? { valoracionId: elegida } : {};
  if (!elegida) return antes.valoracionManual ? { valoracionManual: false } : {};
  if (antes.valoracionManual && idValoracionDe(antes.valoracionId) === elegida) return {};
  return { valoracionId: elegida };
};

export const CampoValoracion: React.FC<{
  valoraciones: SimpleCatalogItem[];
  valor: string;
  onChange: (v: string) => void;
  /** El proyecto como está guardado (edición). Sin él, es un alta. */
  proyecto?: Pick<Project, "valoracionId" | "valoracionManual" | "margen"> | null;
  /** El margen (%) como texto, el que se está escribiendo. Con `onMargen` además se edita en este campo. */
  margen?: string;
  onMargen?: (v: string) => void;
  className?: string;
}> = ({ valoraciones, valor, onChange, proyecto, margen, onMargen, className = "" }) => {
  /** Abierto el panel de «Forzar valoración», antes de elegir una. */
  const [forzando, setForzando] = useState(false);
  const activas = [...valoraciones].filter((v) => v.activo !== false).sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0));
  const actual = valoraciones.find((v) => v._id === idValoracionDe(proyecto?.valoracionId));

  // El margen que vale ahora: el que se está escribiendo o, sin campo, el guardado.
  const textoMargen = margen !== undefined ? margen : proyecto?.margen == null ? "" : String(proyecto.margen);
  const margenNum = textoMargen.trim() === "" ? null : Number(textoMargen);
  const automatica = resolverValoracion(Number.isFinite(margenNum as number) ? margenNum : null, activas as any[]) as SimpleCatalogItem | null;
  const forzada = valor ? valoraciones.find((v) => v._id === valor) : undefined;
  const margenGuardado = proyecto?.margen == null ? "" : String(proyecto.margen);
  /** Se desforzó al cambiar el margen: se avisa, para que no parezca que se perdió sola. */
  const [desforzada, setDesforzada] = useState(false);

  // Cambiar el margen desfija la valoración forzada: vuelve a salir del margen (igual que el server).
  const escribirMargen = (v: string) => {
    onMargen?.(v);
    if (valor && v !== margenGuardado) {
      onChange("");
      setDesforzada(true);
    }
  };

  // Una forzada que después se apagó sigue siendo la del proyecto: se ofrece para no borrarla sin querer.
  const opciones = actual && proyecto?.valoracionManual && actual.activo === false ? [...activas, actual] : activas;

  const forzar = (id: string) => {
    onChange(id);
    setDesforzada(false);
    setForzando(false);
  };

  return (
    <div className={className}>
      <div className={onMargen ? "grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-4" : ""}>
        {onMargen && (
          <div>
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Margen (%)</label>
            {/* Admite coma y la normaliza a punto: «12,5» es como se escribe un decimal acá. */}
            <input
              type="text"
              inputMode="decimal"
              value={margen ?? ""}
              onChange={(e) => {
                const crudo = e.target.value.replace(",", ".").replace(/(?!^-)[^0-9.]/g, "");
                const partes = crudo.split(".");
                escribirMargen(partes.length > 2 ? `${partes[0]}.${partes.slice(1).join("")}` : crudo);
              }}
              placeholder="Sin margen"
              className="input-field py-2.5"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Valoración</label>
          <div className="min-h-[2.75rem] flex flex-wrap items-center gap-2">
            {forzada ? (
              <>
                <ChipValoracion nombre={String(forzada.name)} color={String(forzada.color || "")} manual />
                <span className="text-[11px] text-amber-700 dark:text-amber-400">Forzada a mano. Si cambiás el margen, vuelve a la del margen.</span>
                <button type="button" onClick={() => setForzando(true)} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Cambiar
                </button>
                <button type="button" onClick={() => onChange("")} className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline">
                  Volver a automática{automatica ? ` (${automatica.name})` : ""}
                </button>
              </>
            ) : (
              <>
                {automatica ? <ChipValoracion nombre={String(automatica.name)} color={String(automatica.color || "")} /> : <ChipSinValorar />}
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {margenNum == null ? "Sin margen: la valoración por defecto." : `Según el margen (${textoMargen}%).`}
                  {desforzada && <span className="text-amber-700 dark:text-amber-400"> Cambiaste el margen: la forzada se quitó. Forzala de nuevo si la querés distinta.</span>}
                </span>
                {!forzando && (
                  <button type="button" onClick={() => setForzando(true)} className="ml-auto inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                    Forzar valoración
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/*
        FORZAR ES UNA DECISIÓN APARTE, y se dice. Sin esta explicación, elegir un nivel al lado del
        margen se lee como «el margen da esto», cuando es exactamente lo contrario: lo pisa.
      */}
      {forzando && (
        <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
          <p className="text-[11.5px] text-amber-800 dark:text-amber-300">
            <strong>Estás forzando la valoración.</strong> Queda la que elijas en lugar de la que da el margen, y decide qué categorías se ofrecen al contratar. Vale para el margen actual: si después cambiás el margen, vuelve a la del margen y hay que volver a forzarla.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {opciones.map((v) => (
              <button key={v._id} type="button" onClick={() => forzar(v._id)} className={`rounded transition-shadow ${v._id === valor ? "ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-gray-900" : "hover:ring-2 hover:ring-amber-300"}`} title={`Forzar ${v.name}`}>
                <ChipValoracion nombre={`${v.name}${v.activo === false ? " (inactiva)" : ""}`} color={String(v.color || "")} />
              </button>
            ))}
            <button type="button" onClick={() => setForzando(false)} className="ml-auto text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
