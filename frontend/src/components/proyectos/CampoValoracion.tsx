import React from "react";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import type { Project } from "../../api/projects";
import { ChipValoracion, idValoracionDe } from "./ChipValoracion";

/**
 * EL CAMPO «VALORACIÓN» DE LOS FORMULARIOS DE PROYECTO (alta y edición).
 *
 * Dos modos, y el valor del select dice cuál:
 *   - `""` = AUTOMÁTICA. La resuelve el server: la del margen y, sin margen, la POR DEFECTO. Es con
 *     lo que nace un proyecto nuevo.
 *   - un id = FIJADA A MANO. El margen deja de moverla, hasta que se vuelva a «Automática».
 *
 * Acá no se calcula qué valoración le toca a un margen (eso es `resolverValoracion`, en el server).
 * Lo único que se anticipa es el caso sin margen —la por defecto—, que no es cálculo sino leer la
 * marca: sin eso, el alta mostraría «Automática» a secas y no se sabría con qué nivel nace.
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
  className?: string;
}> = ({ valoraciones, valor, onChange, proyecto, className = "" }) => {
  const activas = [...valoraciones].filter((v) => v.activo !== false).sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0));
  const porDefecto = valoraciones.find((v) => v.esDefault === true && v.activo !== false);
  const actual = valoraciones.find((v) => v._id === idValoracionDe(proyecto?.valoracionId));
  const sinMargen = proyecto?.margen == null;

  // Lo que se lee en la opción «Automática»: con qué nivel queda, cuando se puede saber sin calcular.
  const etiquetaAutomatica =
    proyecto && !proyecto.valoracionManual && actual
      ? `Automática según el margen (hoy: ${actual.name})`
      : sinMargen && porDefecto
        ? `Automática: ${porDefecto.name} (la por defecto, sin margen)`
        : "Automática según el margen";

  // La que se va a ver en el tag, para la vista previa.
  const resultante = valor ? valoraciones.find((v) => v._id === valor) : proyecto && !proyecto.valoracionManual ? actual : sinMargen ? porDefecto : undefined;

  // Una fijada que después se apagó sigue siendo la del proyecto: se ofrece para no borrarla sin querer.
  const opciones = actual && proyecto?.valoracionManual && actual.activo === false ? [...activas, actual] : activas;

  return (
    <div className={className}>
      <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Valoración</label>
      <select className="input-field py-2.5" value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">{etiquetaAutomatica}</option>
        {opciones.map((v) => (
          <option key={v._id} value={v._id}>
            {v.name} — fijada a mano{v.activo === false ? " (inactiva)" : ""}
          </option>
        ))}
      </select>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {resultante && <ChipValoracion nombre={String(resultante.name)} color={String(resultante.color || "")} manual={!!valor} />}
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {valor ? "Queda fija: cambiar el margen no la mueve." : "La define el margen del proyecto; sin margen, la valoración por defecto."}
        </span>
      </div>
    </div>
  );
};
