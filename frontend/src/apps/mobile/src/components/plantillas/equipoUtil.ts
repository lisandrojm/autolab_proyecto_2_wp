import { Asignacion, Equipo, Plantilla, Puesto, puestoBaseEnEquipo, puestoEnEquipo, usaElPuesto } from "../../../../../api/plantillasEquipo";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { Project } from "../../../../../api/projects";

/*
  LO QUE LAS PANTALLAS SABEN DE UN EQUIPO, calculado en un solo lugar: qué puestos usa, quién los
  ocupa, qué tiene cada uno distinto del equipo y cómo está el equipo (completo, faltan, reemplazos).
*/

export interface PuestoDelEquipo {
  puesto: Puesto;
  /** Número del puesto en la plantilla (1, 2, …): es el de la URL. */
  n: number;
  asignacion?: Asignacion;
  /** Lo que rige: puesto → equipo → diferencia. */
  efectivo: Puesto;
  /** Lo que rige sin la diferencia: «igual que el equipo». */
  base: Puesto;
  diferencias: string[];
}

const igual = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (!a && !b);

/** Qué tiene el puesto distinto del equipo, en palabras cortas. */
export function diferenciasDe(efectivo: Puesto, base: Puesto): string[] {
  const d: string[] = [];
  if (!igual(efectivo.shiftId, base.shiftId) || !igual(efectivo.areaId, base.areaId)) d.push("Otra área o turno");
  if (!igual(efectivo.inTime, base.inTime) || !igual(efectivo.outTime, base.outTime)) d.push("Horario distinto");
  if (!igual([...(efectivo.diasSemana || [])].sort(), [...(base.diasSemana || [])].sort()) || !!efectivo.diasRotativos !== !!base.diasRotativos) d.push("Otros días");
  if (!igual(efectivo.contratoId, base.contratoId)) d.push("Otro contrato");
  return d;
}

export function puestosDe(plantilla: Plantilla, equipo: Equipo): PuestoDelEquipo[] {
  return plantilla.integrantes
    .map((puesto, i) => ({ puesto, n: i + 1 }))
    .filter(({ puesto }) => usaElPuesto(equipo, puesto._id))
    .map(({ puesto, n }) => {
      const efectivo = puestoEnEquipo(puesto, equipo);
      const base = puestoBaseEnEquipo(puesto, equipo);
      return { puesto, n, asignacion: equipo.asignaciones.find((a) => a.puestoId === puesto._id), efectivo, base, diferencias: diferenciasDe(efectivo, base) };
    });
}

export function sacadosDe(plantilla: Plantilla, equipo: Equipo) {
  return plantilla.integrantes.map((puesto, i) => ({ puesto, n: i + 1 })).filter(({ puesto }) => !usaElPuesto(equipo, puesto._id));
}

export function estadoDe(plantilla: Plantilla, equipo: Equipo) {
  const puestos = puestosDe(plantilla, equipo);
  const asignados = puestos.filter((p) => p.asignacion?.userId).length;
  const reemplazos = puestos.filter((p) => p.asignacion?.reemplazo).length;
  const revisar = puestos.filter((p) => p.asignacion?.reemplazo?.revisarMotivo).length;
  const avisos = puestos.filter((p) => (equipo.avisos?.[p.puesto._id] || []).length).length;
  return { total: puestos.length, asignados, faltan: puestos.length - asignados, reemplazos, revisar, avisos };
}

/** «Técnica · Noche». */
export const nombreTurno = (areas: OpcionAreaTurno[] | null, areaId?: string | null, shiftId?: string | null) => {
  const t = (areas || []).find((o) => o.areaId === areaId && o.shiftId === shiftId);
  return t ? `${t.areaNombre} · ${t.turnoNombre}` : "";
};

export const nombreRoles = (roleFrames: { _id: string; name: string }[], ids: string[]) => ids.map((r) => roleFrames.find((x) => x._id === r)?.name).filter(Boolean).join(", ") || "Sin rol";

/** Las rutas, en un solo lugar. */
export const rutas = {
  lista: "/mobile/plantillas",
  /** El formulario de «Nuevo equipo» (con el grupo o el proyecto ya elegidos, si vienen). */
  nuevo: (x: { grupo?: string; proyecto?: string } = {}) => `/mobile/plantillas/nuevo${x.grupo ? `?grupo=${x.grupo}` : x.proyecto ? `?proyecto=${x.proyecto}` : ""}`,
  grupo: (id: string) => `/mobile/plantillas/${id}`,
  equipo: (id: string, equipoId: string) => `/mobile/plantillas/${id}/equipos/${equipoId}`,
  puesto: (id: string, equipoId: string, n: number) => `/mobile/plantillas/${id}/equipos/${equipoId}/puesto/${n}`,
  contratar: (id: string, equipos?: string[]) => `/mobile/plantillas/${id}/contratar${equipos?.length ? `?equipos=${equipos.join(",")}` : ""}`,
  revision: (id: string) => `/mobile/plantillas/${id}/contratar/revision`,
  enviado: (id: string) => `/mobile/plantillas/${id}/contratar/enviado`,
};

/** Volver a Contratación, en la pestaña pedida (la app de afuera no tiene rutas: se pasa por `state`). */
export const aContratacion = (pestana: "plantillas" | "historial" = "plantillas") => ({ pathname: "/mobile", state: { vista: "user_history", pestana } });

/**
 * LA CATEGORÍA DE CADA PUESTO EN UN EQUIPO: la del nivel del proyecto de ESE equipo (Plata, Oro…), con
 * la misma regla del alta individual. Como el grupo sirve en cualquier proyecto, se calcula por equipo.
 */
export function categoriasDelNivel(catalogos: CatalogosContratacion, proyecto: Project | null, empresaId: string | null | undefined, convenioId: string | null | undefined, puestos: Pick<Puesto, "_id" | "rolesFrame">[]): Record<string, string> {
  const r: Record<string, string> = {};
  if (!proyecto || !empresaId) return r;
  for (const p of puestos) {
    const cat = catalogos.categoriaPorDefectoPara(proyecto, empresaId, convenioId || "", p.rolesFrame.slice(0, 1));
    if (cat) r[p._id] = cat;
  }
  return r;
}

/** El proyecto, la empresa y el convenio de un equipo, resueltos contra los catálogos. */
export function proyectoDelEquipo(catalogos: CatalogosContratacion, equipo: Pick<Equipo, "projectId" | "empresaContratoId" | "convenioId"> | null | undefined) {
  const proyecto = catalogos.proyectos?.find((x) => x._id === equipo?.projectId) || null;
  const empresaId = equipo?.empresaContratoId || (catalogos.empresasDelProyecto(proyecto).length === 1 ? catalogos.empresasDelProyecto(proyecto)[0]._id : "");
  const convenioId = equipo?.convenioId || catalogos.convenioUnico(proyecto, empresaId)?._id || "";
  return { proyecto, empresaId, convenioId };
}
