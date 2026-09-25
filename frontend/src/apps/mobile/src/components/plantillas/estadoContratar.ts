import { Equipo, PedidoDeContratacion, Plantilla } from "../../../../../api/plantillasEquipo";
import { CatalogosContratacion } from "./useCatalogosContratacion";
import { puestosDe } from "./equipoUtil";
import { porDiasSueltos } from "./Condiciones";

/*
  LO ELEGIDO PARA CONTRATAR (equipos, fechas, comentarios), guardado en la sesión del navegador: pasar
  de Fechas a Revisión, ir a corregir un puesto y volver, o recargar, no pierde nada. Se borra al
  enviar. La clave de idempotencia vive acá también: un doble toque o un reintento no duplica.
*/

export interface FechasEquipo {
  incluido: boolean;
  fechas: string[];
  desde: string;
  hasta: string;
}

export interface EstadoContratar {
  equipos: Record<string, FechasEquipo>;
  /** Comentario por solicitud: `${equipoId}:${puestoId}`. */
  comentarios: Record<string, string>;
  clave: string;
}

const claveDe = (id: string) => `plantillas:contratar:${id}`;
export const nuevaClave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function leerEstado(id: string): EstadoContratar | null {
  try {
    const s = sessionStorage.getItem(claveDe(id));
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
export function guardarEstado(id: string, e: EstadoContratar) {
  try {
    sessionStorage.setItem(claveDe(id), JSON.stringify(e));
  } catch {
    /* sin storage: vale mientras la pantalla esté abierta */
  }
}
export function borrarEstado(id: string) {
  try {
    sessionStorage.removeItem(claveDe(id));
  } catch {
    /* nada */
  }
}

/** Qué fechas pide un equipo según los contratos de sus puestos: días sueltos, período o los dos. */
export function formaDe(plantilla: Plantilla, equipo: Equipo, catalogos: CatalogosContratacion) {
  const puestos = puestosDe(plantilla, equipo).map((x) => x.efectivo);
  const conDias = puestos.some((i) => porDiasSueltos(catalogos, i.contratoId));
  const conPeriodo = puestos.some((i) => !porDiasSueltos(catalogos, i.contratoId));
  const indeterminado = conPeriodo && puestos.filter((i) => !porDiasSueltos(catalogos, i.contratoId)).every((i) => !!(catalogos.contratos.find((c) => c._id === i.contratoId) as any)?.data?.esTiempoIndeterminado);
  return { conDias, conPeriodo, indeterminado, puestos: puestos.length };
}

/** Qué le falta a un equipo incluido para poder revisarlo. `""` si nada. */
export function faltaDe(plantilla: Plantilla, equipo: Equipo, f: FechasEquipo | undefined, catalogos: CatalogosContratacion): string {
  if (!f?.incluido) return "";
  const { conDias, conPeriodo, indeterminado } = formaDe(plantilla, equipo, catalogos);
  if (conDias && f.fechas.length === 0) return `Elegí los días de «${equipo.nombre}»`;
  if (conPeriodo && !f.desde) return `Elegí desde cuándo trabaja «${equipo.nombre}»`;
  if (conPeriodo && !indeterminado && !f.hasta) return `Elegí hasta cuándo trabaja «${equipo.nombre}»`;
  return "";
}

/** Los pedidos para el server: uno por equipo incluido, con sus fechas y los comentarios. */
export function pedidosDe(plantilla: Plantilla, estado: EstadoContratar, catalogos: CatalogosContratacion): PedidoDeContratacion[] {
  return plantilla.equipos
    .filter((e) => estado.equipos[e._id]?.incluido)
    .map((e) => {
      const f = estado.equipos[e._id];
      const { conDias, conPeriodo, indeterminado } = formaDe(plantilla, e, catalogos);
      const puntuales: PedidoDeContratacion["puntuales"] = {};
      for (const [k, v] of Object.entries(estado.comentarios || {})) {
        const [equipoId, puestoId] = k.split(":");
        if (equipoId === e._id && v.trim()) puntuales[puestoId] = { comentarios: v.trim() };
      }
      return { equipoId: e._id, ...(conDias ? { fechas: f.fechas } : {}), ...(conPeriodo ? { desde: f.desde, hasta: indeterminado ? undefined : f.hasta } : {}), puntuales };
    });
}
