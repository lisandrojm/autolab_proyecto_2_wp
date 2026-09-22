import React, { useEffect, useMemo, useState } from "react";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import type { Project } from "../../api/projects";

const valoracionesApi = createSimpleCatalogApi("/valoraciones");

/**
 * EL TAG DE LA VALORACIÓN DE UN PROYECTO (Plata, Oro…), igual en todas las pantallas.
 *
 * Vive en un solo lugar porque aparece en varias —la ficha, las tarjetas y la tabla de proyectos, el
 * alta de un miembro— y en cada una lo que se lee es lo mismo: a qué nivel comercial pertenece este
 * trabajo, que es lo que decide qué categorías se ofrecen al contratar. Con una copia por pantalla,
 * el asterisco de «fijada a mano» o el color terminaban faltando en alguna.
 *
 * Sólo PINTA: la valoración la resuelve el server (`resolverValoracion`) y viene en
 * `project.valoracionId`. Acá no se calcula nada.
 */

/** El id de la valoración, venga poblada o pelada. */
export const idValoracionDe = (ref: Project["valoracionId"] | undefined): string => (!ref ? "" : typeof ref === "object" ? String(ref._id || "") : String(ref));

/**
 * El catálogo de valoraciones del tenant, TODAS —también las apagadas—.
 *
 * Las apagadas hacen falta para el tag: un proyecto valorado con una que después se apagó sigue
 * siendo de ese nivel, y sin su nombre se mostraría como «sin valorar», que es otra cosa.
 *
 * Una lectura por componente y sin caché compartida: es un catálogo de dos o tres filas, y una caché
 * seguiría mostrando el color viejo después de editarlo en la pantalla de Valoraciones.
 */
export const useValoraciones = (): SimpleCatalogItem[] => {
  const [valoraciones, setValoraciones] = useState<SimpleCatalogItem[]>([]);
  useEffect(() => {
    let vigente = true;
    void valoracionesApi
      .list()
      .then((v) => vigente && setValoraciones(Array.isArray(v) ? v : []))
      .catch(() => vigente && setValoraciones([]));
    return () => {
      vigente = false;
    };
  }, []);
  return valoraciones;
};

/** Nombre y color de la valoración de un proyecto, o `null` si no está valorado. */
export const useValoracionDelProyecto = (project: Pick<Project, "valoracionId"> | null | undefined, valoraciones: SimpleCatalogItem[]) =>
  useMemo(() => {
    const id = idValoracionDe(project?.valoracionId);
    if (!id) return null;
    const v = valoraciones.find((x) => x._id === id);
    return v ? { id, nombre: String(v.name), color: String(v.color || "") } : null;
  }, [project?.valoracionId, valoraciones]);

/** El color del tag, que es un dato del catálogo. Sin color cargado, lo pone quien lo dibuja. */
export const estiloValoracion = (color?: string): React.CSSProperties | undefined => (color ? { color, borderColor: color, backgroundColor: `${color}1a` } : undefined);

export const tituloValoracion = (nombre: string, manual?: boolean) => (manual ? `Valoración ${nombre}: fijada manualmente` : `Valoración ${nombre}: calculada según el margen`);

/** El tag, con su color. `manual` agrega el asterisco de «fijada a mano». */
export const ChipValoracion: React.FC<{ nombre: string; color?: string; manual?: boolean; className?: string }> = ({ nombre, color, manual, className = "" }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${className}`} style={estiloValoracion(color)} title={tituloValoracion(nombre, manual)}>
    {nombre}
    {/* El asterisco marca que la puso una persona: un nivel que no coincide con el margen, sin
        esta marca, se lee como un error de cálculo. */}
    {manual ? <span className="ml-1 opacity-70">*</span> : null}
  </span>
);

/** El tag de un proyecto, resuelto. No dibuja nada si el proyecto no está valorado. */
export const ChipValoracionDelProyecto: React.FC<{ project: Pick<Project, "valoracionId" | "valoracionManual">; valoraciones: SimpleCatalogItem[]; className?: string }> = ({ project, valoraciones, className }) => {
  const v = useValoracionDelProyecto(project, valoraciones);
  return v ? <ChipValoracion nombre={v.nombre} color={v.color} manual={project.valoracionManual} className={className} /> : null;
};
