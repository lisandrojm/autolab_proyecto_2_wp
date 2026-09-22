import React, { useEffect, useMemo, useState } from "react";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import type { Project } from "../../api/projects";
import { colorTextoBadge, conAlpha } from "../EstadoSelect";
import { useThemeStore } from "../../stores/themeStore";

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

/**
 * El color del tag, que es un dato del catálogo. Sin color cargado, lo pone quien lo dibuja.
 *
 * Mismo tratamiento que los badges de Estados: el color cargado es el de la TIPOGRAFÍA, aclarado u
 * oscurecido según el tema para que se lea, y el fondo es ese color translúcido. Pintar el texto con
 * el hex tal cual dejaba a Plata (#9ca3af) gris sobre gris en el tema claro, y a Oro apenas visible.
 */
export const estiloValoracion = (color: string | undefined, oscuro: boolean): React.CSSProperties | undefined =>
  color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? { color: colorTextoBadge(color, oscuro), backgroundColor: conAlpha(color, 0.14), borderColor: conAlpha(color, 0.35) } : undefined;

export const tituloValoracion = (nombre: string, manual?: boolean) => (manual ? `Valoración ${nombre}: fijada manualmente` : `Valoración ${nombre}: calculada según el margen`);

/** El tag, con su color. `manual` agrega el asterisco de «fijada a mano». */
export const ChipValoracion: React.FC<{ nombre: string; color?: string; manual?: boolean; className?: string }> = ({ nombre, color, manual, className = "" }) => {
  const oscuro = useThemeStore((s) => s.theme) === "dark";
  const estilo = estiloValoracion(color, oscuro);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${estilo ? "" : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"} ${className}`}
      style={estilo}
      title={tituloValoracion(nombre, manual)}
    >
      {nombre}
      {/* El asterisco marca que la puso una persona: un nivel que no coincide con el margen, sin
          esta marca, se lee como un error de cálculo. */}
      {manual ? <span className="ml-1 opacity-70">*</span> : null}
    </span>
  );
};

/**
 * El tag como badge de una TARJETA (`Card`), que recibe texto y estilo en vez de componentes.
 *
 * Devuelve una lista para poder desparramarla (`...`) entre los otros badges: vacía si el proyecto no
 * está valorado, que es lo mismo que no ponerlo.
 */
export const badgesDeValoracion = (project: Pick<Project, "valoracionId" | "valoracionManual"> | null | undefined, valoraciones: SimpleCatalogItem[], oscuro: boolean) => {
  const id = idValoracionDe(project?.valoracionId);
  const v = id ? valoraciones.find((x) => x._id === id) : undefined;
  if (!v) return [];
  const color = String(v.color || "");
  return [
    {
      text: `${String(v.name)}${project?.valoracionManual ? " *" : ""}`,
      className: color ? "border font-bold" : "border font-bold border-gray-400 text-gray-600 dark:text-gray-300",
      style: estiloValoracion(color, oscuro),
      title: tituloValoracion(String(v.name), project?.valoracionManual),
    },
  ];
};

/** El tag de un proyecto, resuelto. No dibuja nada si el proyecto no está valorado. */
export const ChipValoracionDelProyecto: React.FC<{ project: Pick<Project, "valoracionId" | "valoracionManual">; valoraciones: SimpleCatalogItem[]; className?: string }> = ({ project, valoraciones, className }) => {
  const v = useValoracionDelProyecto(project, valoraciones);
  return v ? <ChipValoracion nombre={v.nombre} color={v.color} manual={project.valoracionManual} className={className} /> : null;
};
