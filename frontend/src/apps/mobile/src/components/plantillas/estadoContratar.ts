import { Equipo, PedidoDeContratacion, Plantilla, Puntual } from "../../../../../api/plantillasEquipo";
import { CatalogosContratacion } from "./useCatalogosContratacion";
import { proyectoDelEquipo, puestosDe } from "./equipoUtil";
import { porDiasSueltos } from "./Condiciones";

/*
  LO ELEGIDO PARA CONTRATAR, guardado en la sesión del navegador: pasar de un paso al otro, ir a
  corregir algo y volver, o recargar, no pierde nada. Se borra al enviar. La clave de idempotencia vive
  acá también: un doble toque o un reintento no duplica.

  TRES CAPAS, Y NINGUNA TOCA LA PLANTILLA:

    · el CONTRATO GENERAL de esta contratación, para todos los puestos (paso 1). Se elige acá y no al
      armar el equipo porque es lo que más cambia entre una vez y la siguiente;
    · las FECHAS de cada equipo (paso 1): días sueltos o desde/hasta, según ese contrato;
    · lo PUNTUAL de cada persona (paso 2): persona, reemplazo, horario, categoría, importe, días propios,
      comentario, otro contrato. Es la capa que antes no existía en la app: todo ajuste iba a parar a la
      plantilla como cambio permanente, y contratar un fin de semana dejaba el equipo distinto de como
      estaba. El server la resuelve por encima del puesto y del equipo (`Puntual`) y muere al enviar.
*/

export interface FechasEquipo {
  incluido: boolean;
  fechas: string[];
  desde: string;
  hasta: string;
}

export interface EstadoContratar {
  /** El tipo de contrato de ESTA contratación, para todos. Con su nombre y su trámite, como viajan siempre los tres. Vacío = el de cada puesto. */
  contratoId: string;
  nombreContrato: string;
  tipoImpositivo: string;
  equipos: Record<string, FechasEquipo>;
  /** Lo que se pisa sólo esta vez, por solicitud: la clave es `${equipoId}:${puestoId}` (ver `clavePuntual`). */
  puntuales: Record<string, Puntual>;
  /**
   * Cómo se llama cada persona elegida en un puntual (`userId` → nombre). El puntual guarda sólo el id
   * —es lo que el server entiende— pero la fila tiene que decir un nombre antes de que el server
   * conteste, y el reemplazado no viene en ninguna respuesta. Es caché de pantalla, no dato.
   */
  nombres: Record<string, string>;
  clave: string;
}

export const clavePuntual = (equipoId: string, puestoId: string) => `${equipoId}:${puestoId}`;

const claveDe = (id: string) => `plantillas:contratar:${id}`;
export const nuevaClave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function leerEstado(id: string): EstadoContratar | null {
  try {
    const s = sessionStorage.getItem(claveDe(id));
    if (!s) return null;
    const e = JSON.parse(s);
    // Una sesión guardada antes de los puntuales traía los comentarios sueltos: se leen como puntuales.
    const puntuales: Record<string, Puntual> = e.puntuales || {};
    for (const [k, v] of Object.entries((e.comentarios || {}) as Record<string, string>)) if (v && !puntuales[k]?.comentarios) puntuales[k] = { ...(puntuales[k] || {}), comentarios: v };
    return { contratoId: e.contratoId || "", nombreContrato: e.nombreContrato || "", tipoImpositivo: e.tipoImpositivo || "", equipos: e.equipos || {}, puntuales, nombres: e.nombres || {}, clave: e.clave || nuevaClave() };
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

/**
 * EL TIPO DE CONTRATO QUE RIGE UN PUESTO EN ESTA CONTRATACIÓN: el suyo puntual → el general → el del
 * puesto (que ya incluye el del equipo). La misma cadena que el server, para que lo que se ve acá —qué
 * fechas se piden, qué dice cada fila— sea lo que después se calcula.
 */
export function contratoDelPuesto(estado: EstadoContratar | null | undefined, equipoId: string, puestoId: string, delPuesto: string | null | undefined): string {
  return estado?.puntuales?.[clavePuntual(equipoId, puestoId)]?.contratoId || estado?.contratoId || delPuesto || "";
}

/** Qué fechas pide un equipo según los contratos que rigen sus puestos: días sueltos, período o los dos. */
export function formaDe(plantilla: Plantilla, equipo: Equipo, catalogos: CatalogosContratacion, estado?: EstadoContratar | null) {
  const contratos = puestosDe(plantilla, equipo).map((x) => contratoDelPuesto(estado, equipo._id, x.puesto._id, x.efectivo.contratoId));
  const conDias = contratos.some((c) => porDiasSueltos(catalogos, c));
  const porPeriodo = contratos.filter((c) => !porDiasSueltos(catalogos, c));
  const conPeriodo = porPeriodo.length > 0;
  const indeterminado = conPeriodo && porPeriodo.every((c) => !!(catalogos.contratos.find((x) => x._id === c) as any)?.data?.esTiempoIndeterminado);
  return { conDias, conPeriodo, indeterminado, puestos: contratos.length };
}

/** Qué le falta a un equipo incluido para poder seguir. `""` si nada. */
export function faltaDe(plantilla: Plantilla, equipo: Equipo, f: FechasEquipo | undefined, catalogos: CatalogosContratacion, estado?: EstadoContratar | null): string {
  if (!f?.incluido) return "";
  const { conDias, conPeriodo, indeterminado } = formaDe(plantilla, equipo, catalogos, estado);
  if (conDias && f.fechas.length === 0) return `Elegí los días de «${equipo.nombre}»`;
  if (conPeriodo && !f.desde) return `Elegí desde cuándo trabaja «${equipo.nombre}»`;
  if (conPeriodo && !indeterminado && !f.hasta) return `Elegí hasta cuándo trabaja «${equipo.nombre}»`;
  return "";
}

/**
 * Un puntual sin lo vacío: lo que no se tocó no viaja, y un puntual que quedó vacío no existe.
 *
 * `false` SÍ viaja: «isReplacement: false» es una decisión —apagar esta vez el reemplazo que la
 * plantilla trae guardado—, y borrarla por vacía sería dejar el reemplazo puesto.
 */
export function puntualLimpio(p: Puntual | undefined): Puntual {
  const r: Record<string, any> = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    r[k] = typeof v === "string" ? v.trim() : v;
  }
  if (r.comentarios === "") delete r.comentarios;
  return r as Puntual;
}

/** Los pedidos para el server: uno por equipo incluido, con el contrato general, sus fechas y sus puntuales. */
export function pedidosDe(plantilla: Plantilla, estado: EstadoContratar, catalogos: CatalogosContratacion): PedidoDeContratacion[] {
  return plantilla.equipos
    .filter((e) => estado.equipos[e._id]?.incluido)
    .map((e) => {
      const f = estado.equipos[e._id];
      const { conDias, conPeriodo, indeterminado } = formaDe(plantilla, e, catalogos, estado);
      const puntuales: PedidoDeContratacion["puntuales"] = {};
      for (const [k, v] of Object.entries(estado.puntuales || {})) {
        const [equipoId, puestoId] = k.split(":");
        if (equipoId !== e._id) continue;
        const limpio = puntualLimpio(v);
        if (Object.keys(limpio).length) puntuales[puestoId] = limpio;
      }
      /*
        LA CATEGORÍA POR DEFECTO, PARA EL PUESTO QUE NO TIENE. La del nivel del proyecto —un proyecto
        Plata, la Plata de la función— o la más cercana, con la MISMA regla del alta individual
        (`categoriaPorDefecto`). Sin esto, un puesto que quedó sin categoría llegaba al server como
        «Falta la categoría» y había que abrirlo para elegir lo que la regla ya sabía.
      */
      const { proyecto, empresaId, convenioId } = proyectoDelEquipo(catalogos, e);
      for (const x of puestosDe(plantilla, e)) {
        const id = x.puesto._id;
        if (x.efectivo.categoriaSatId || puntuales[id]?.categoriaSatId) continue;
        const porDefecto = catalogos.categoriaPorDefectoPara(proyecto, empresaId, convenioId, x.puesto.rolesFrame, x.efectivo.contratoId);
        if (porDefecto) puntuales[id] = { ...(puntuales[id] || {}), categoriaSatId: porDefecto };
      }
      return {
        equipoId: e._id,
        ...(estado.contratoId ? { contratoId: estado.contratoId, nombreContrato: estado.nombreContrato, tipoImpositivo: estado.tipoImpositivo } : {}),
        ...(conDias ? { fechas: f.fechas } : {}),
        ...(conPeriodo ? { desde: f.desde, hasta: indeterminado ? undefined : f.hasta } : {}),
        puntuales,
      };
    });
}
