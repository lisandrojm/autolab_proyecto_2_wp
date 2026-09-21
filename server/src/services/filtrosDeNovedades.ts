import { Types } from "mongoose";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import UserProject from "../models/UserProject.js";
import { fechaISOExpr } from "../utils/contratosQueRigen.js";
import { claveEstado } from "../utils/estadoClave.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS FILTROS DEL REPORTE DE NOVEDADES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vigencia, tipo, estado impositivo y reemplazo dependen del CONTRATO QUE RIGE, y elegir ese
 * contrato es una regla con desempates que no se puede escribir como query de Mongo. Se resuelve
 * acá y viajan unos pocos KB, en vez de los contratos de las 1.577 personas del tenant.
 *
 * ── Lo que hay que tener presente, porque es de donde salieron todos los bugs ──
 *
 * LA UNIDAD DE ESTE REPORTE ES LA FILA, NO LA PERSONA. Cada fila es una persona EN UN PROYECTO, y
 * su contrato es el que rige EN ESE PROYECTO DENTRO DEL PERÍODO. La misma persona puede tener dos
 * filas: vigente en un proyecto y no vigente en el otro.
 *
 * La primera versión de esto contestaba una lista de personas, con el contrato que rige HOY entre
 * TODOS sus proyectos. Elegía otro contrato que el que muestra la fila, así que:
 *
 *   · con «Vigentes» puesto quedaban filas NO VIGENTE — la persona tenía un contrato vigente en
 *     otro proyecto y eso la dejaba pasar entera, con todas sus filas;
 *   · el desplegable «Tipo de contrato» salía vacío o incompleto: listaba los tipos de la gente que
 *     aparece en los PARTES (91 personas) mientras la tabla dibuja a todo el que tiene contrato en
 *     el período (189 filas), así que había filas cuyo tipo no se podía elegir.
 *
 * Por eso esto devuelve CLAVES DE FILA (`userId::PROYECTONORMALIZADO`) y las opciones salen de esas
 * mismas filas: lo que se puede elegir es exactamente lo que está en la tabla.
 *
 * ── El mismo criterio que la tabla, campo por campo ──
 *
 * El contrato de la fila se elige con la regla de `getContratoActivo` del front: entre los vigentes
 * manda el de tiempo indeterminado, después el más reciente por alta y, a igualdad, por carga; sin
 * vigentes, el más reciente de todos. Si se toca allá, hay que tocar acá.
 *
 * Los proyectos se agrupan por NOMBRE NORMALIZADO y no por id, igual que la tabla: hay vínculos
 * distintos con el mismo proyecto escrito de otra forma, y la tabla los junta en una fila.
 *
 * LA EXCEPCIÓN, a propósito: el área y el turno salen del PARTE, no de la configuración del
 * proyecto. Acá se mira dónde trabajó esa persona esos días, que es la pregunta de una novedad;
 * en Gestionar Equipo se mira dónde está asignada, que es la de un equipo.
 */

export interface FiltrosDeNovedades {
  desde: string;
  hasta: string;
  estadoUsuario?: "active" | "inactive" | "";
  vigencia?: "vigente" | "novigente" | "";
  tipoContrato?: string;
  estadoContrato?: string;
  /** "areaId::shiftId", o "__none__" para los renglones sin área ni turno. */
  areaTurno?: string;
  reemplazo?: "con" | "sin" | "";
  /** Nombre del rol de plataforma, tal como se muestra. */
  rol?: string;
  /**
   * El interruptor «Mostrar solo los que tienen contrato activo» de la tabla.
   *
   * Prendido (el valor por omisión, y como se abre el modal) la fila mira sólo los contratos que
   * pisan el período; apagado mira todos los de la persona en ese proyecto. Tiene que venir de
   * afuera porque cambia QUÉ CONTRATO rige, y con él la vigencia, el tipo y el estado.
   */
  soloContratoActivo?: boolean;
}

export interface OpcionesDeFiltro {
  roles: string[];
  tipos: string[];
  estados: string[];
  areasTurnos: { value: string; label: string }[];
}

const SIN_AREA_NI_TURNO = "__none__";

/** El mismo `normalizeProjectName` de la tabla: sin espacios, guiones ni guiones bajos, en mayúsculas. */
const normalizarProyecto = (nombre: unknown): string =>
  String(nombre ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "");

/** Lo mismo, pero adentro de Mongo, para agrupar sin traerse los nombres. */
const normalizarProyectoExpr = {
  $reduce: {
    input: [" ", "-", "_", "\t"],
    initialValue: { $toUpper: { $trim: { input: { $ifNull: ["$nombre_proyecto", "Desconocido"] } } } },
    in: { $replaceAll: { input: "$$value", find: "$$this", replacement: "" } },
  },
};

/** Lo que se necesita saber del contrato que rige en una fila. */
interface ContratoDeLaFila {
  alta: string;
  baja: string;
  nombre_contrato: string;
  tipo_contrato_id: any;
  nombre_estado_empleado: string;
  reemplazo: any;
}

interface Fila {
  clave: string;
  userId: string;
  contrato: ContratoDeLaFila | null;
}

/**
 * UNA FILA POR PERSONA Y PROYECTO, con el contrato que rige, elegido adentro de Mongo.
 *
 * `soloDelPeriodo` deja afuera los contratos que no pisan el período, que es lo que hace la tabla
 * cuando el interruptor está prendido. Los que están dados de baja o inactivos tampoco cuentan,
 * igual que en `isActiveContract`.
 */
async function filasConSuContrato(desde: string, hasta: string, soloDelPeriodo: boolean): Promise<Fila[]> {
  /*
    El contrato se reduce a sus claves ANTES de agrupar: alta, baja, carga y los cuatro campos que
    los filtros miran. Agrupar contratos enteros sería mover el historial completo adentro de Mongo
    para quedarse con uno por fila.
  */
  const claveDelContrato = {
    alta: fechaISOExpr("$contracts.fecha_alta_contrato"),
    baja: fechaISOExpr("$contracts.fecha_baja_contrato"),
    carga: { $toString: { $ifNull: ["$contracts.fecha_carga", ""] } },
    nombre_contrato: { $ifNull: ["$contracts.nombre_contrato", ""] },
    tipo_contrato_id: "$contracts.tipo_contrato_id",
    nombre_estado_empleado: { $ifNull: ["$contracts.nombre_estado_empleado", ""] },
    reemplazo: "$contracts.reemplazo",
  };

  const hoy = hoyArgentina();

  const filas = await UserProject.aggregate([
    { $match: { contracts: { $exists: true, $ne: [] } } },
    { $project: { userId: 1, projectId: 1, proyecto: normalizarProyectoExpr, contracts: 1 } },
    { $unwind: "$contracts" },
    { $project: { userId: 1, projectId: 1, proyecto: 1, c: claveDelContrato, estado: { $toLower: { $ifNull: ["$contracts.nombre_estado_empleado", ""] } } } },
    /*
      Un contrato sin fecha de alta no es una fila: es un renglón a medio cargar. Y los que dicen
      «baja» o «inactivo» en el estado quedan afuera aunque las fechas den, que es lo que hace la
      tabla — alguien puede tener fechas que parecen vigentes y estar dado de baja.
    */
    {
      $match: {
        "c.alta": { $ne: "" },
        estado: { $not: { $regex: "baja|inactivo" } },
        ...(soloDelPeriodo
          ? {
              // Pisa el período: no terminó antes de que empiece, ni empieza después de que termine.
              $and: [{ $or: [{ "c.baja": "" }, { "c.baja": { $gte: desde } }] }, { "c.alta": { $lte: hasta } }],
            }
          : {}),
      },
    },
    { $group: { _id: { u: "$userId", p: "$proyecto" }, conProyecto: { $max: { $cond: [{ $ifNull: ["$projectId", false] }, 1, 0] } }, claves: { $push: "$c" } } },
    // La tabla descarta el grupo «Desconocido» cuando además no hay proyecto: es basura de carga.
    { $match: { $or: [{ "_id.p": { $ne: "DESCONOCIDO" } }, { conProyecto: 1 }] } },
    /*
      La regla de `getContratoActivo`, en tres pasos: los vigentes hoy; entre ellos, los de tiempo
      indeterminado (sin baja) si hay alguno; y de los que queden, el más reciente por alta y, a
      igualdad, por carga.
    */
    {
      $addFields: {
        vigentes: {
          $filter: {
            input: "$claves",
            as: "k",
            cond: { $and: [{ $or: [{ $eq: ["$$k.alta", ""] }, { $lte: ["$$k.alta", hoy] }] }, { $or: [{ $eq: ["$$k.baja", ""] }, { $gte: ["$$k.baja", hoy] }] }] },
          },
        },
      },
    },
    {
      $addFields: {
        candidatos: {
          $let: {
            vars: { indeterminados: { $filter: { input: "$vigentes", as: "k", cond: { $eq: ["$$k.baja", ""] } } } },
            in: { $cond: [{ $gt: [{ $size: "$$indeterminados" }, 0] }, "$$indeterminados", { $cond: [{ $gt: [{ $size: "$vigentes" }, 0] }, "$vigentes", "$claves"] }] },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id.u",
        proyecto: "$_id.p",
        elegido: {
          $reduce: {
            input: "$candidatos",
            initialValue: null,
            in: { $cond: [{ $or: [{ $eq: ["$$value", null] }, { $gte: [{ $concat: ["$$this.alta", "|", "$$this.carga"] }, { $concat: ["$$value.alta", "|", "$$value.carga"] }] }] }, "$$this", "$$value"] },
          },
        },
      },
    },
  ]);

  return (filas as any[]).map((f) => ({
    clave: `${String(f.userId)}::${f.proyecto}`,
    userId: String(f.userId),
    contrato: f.elegido
      ? {
          alta: f.elegido.alta || "",
          baja: f.elegido.baja || "",
          nombre_contrato: String(f.elegido.nombre_contrato || "").trim(),
          tipo_contrato_id: f.elegido.tipo_contrato_id,
          nombre_estado_empleado: String(f.elegido.nombre_estado_empleado || "").trim(),
          reemplazo: f.elegido.reemplazo,
        }
      : null,
  }));
}

/** Vigente = ya arrancó y no terminó. Mismo criterio que `esContratoVigente` del front. */
const estaVigente = (c: ContratoDeLaFila | null): boolean => {
  if (!c) return false;
  const hoy = hoyArgentina();
  if (c.alta && c.alta > hoy) return false;
  return !c.baja || c.baja >= hoy;
};

export async function resolverFiltrosDeNovedades(
  tenantId: Types.ObjectId,
  filtros: FiltrosDeNovedades,
): Promise<{ claves: string[]; opciones: OpcionesDeFiltro; total: number }> {
  const soloDelPeriodo = filtros.soloContratoActivo !== false;

  /* ── 1. Las filas, con su contrato ── */
  const filas = await filasConSuContrato(filtros.desde, filtros.hasta, soloDelPeriodo);
  if (filas.length === 0) return { claves: [], opciones: { roles: [], tipos: [], estados: [], areasTurnos: [] }, total: 0 };

  /* ── 2. El área y el turno en que cada persona trabajó esos días, del parte ── */
  const partes: any[] = await Request.find({ tenantId, date: { $gte: filtros.desde, $lte: filtros.hasta } })
    .select("areaId shiftId attendance.employeeId attendance.replacementId")
    .lean();

  const areasTurnosPorPersona = new Map<string, Set<string>>();
  const sumar = (userId: string, clave: string) => {
    if (!areasTurnosPorPersona.has(userId)) areasTurnosPorPersona.set(userId, new Set());
    areasTurnosPorPersona.get(userId)!.add(clave);
  };
  for (const parte of partes) {
    const clave = parte.areaId || parte.shiftId ? `${parte.areaId || ""}::${parte.shiftId || ""}` : SIN_AREA_NI_TURNO;
    for (const r of parte.attendance || []) {
      if (r?.employeeId) sumar(String(r.employeeId), clave);
      // El reemplazante también «estuvo» ese día: si se lo dejara afuera no aparecería en el reporte.
      if (r?.replacementId) sumar(String(r.replacementId), clave);
    }
  }

  /* ── 3. Estado de usuario y roles de plataforma, de la gente de esas filas ── */
  const ids = [...new Set(filas.map((f) => f.userId))];
  const usuarios: any[] = await User.find({ _id: { $in: ids }, tenantId })
    .select("metadata.activo roles")
    .populate({ path: "roles", select: "name", model: Role })
    .lean();
  const porId = new Map(usuarios.map((u: any) => [String(u._id), u]));

  /* ── 4. Nombres de áreas y turnos, para las etiquetas del desplegable ── */
  const [areas, turnos] = await Promise.all([
    Area.find({ tenantId }).select("name").lean(),
    Shift.find({ tenantId }).select("name").lean(),
  ]);
  const nombreArea = new Map((areas as any[]).map((a: any) => [String(a._id), a.name]));
  const nombreTurno = new Map((turnos as any[]).map((t: any) => [String(t._id), t.name]));
  const etiquetaDeAreaTurno = (clave: string) => {
    if (clave === SIN_AREA_NI_TURNO) return "Sin área/turno";
    const [areaId, shiftId] = clave.split("::");
    return [nombreArea.get(areaId), nombreTurno.get(shiftId)].filter(Boolean).join(" · ") || "Sin área/turno";
  };

  /* ── 5. Las filas que la tabla puede llegar a dibujar ── */
  const delTenant = filas.filter((f) => porId.has(f.userId));

  /*
    ── 6. Las opciones: lo que hay EN LA TABLA ──

    Salen de las mismas filas que se van a dibujar y NO de los filtros aplicados: si dependieran de
    ellos, elegir un tipo borraría los demás del desplegable y no habría forma de cambiar de opinión.
  */
  const roles = new Set<string>();
  const tipos = new Set<string>();
  const estados = new Set<string>();
  const areasTurnos = new Map<string, string>();
  for (const f of delTenant) {
    (porId.get(f.userId)?.roles || []).forEach((r: any) => r?.name && roles.add(r.name));
    if (f.contrato?.nombre_contrato) tipos.add(f.contrato.nombre_contrato);
    if (f.contrato?.nombre_estado_empleado) estados.add(f.contrato.nombre_estado_empleado);
    areasTurnosPorPersona.get(f.userId)?.forEach((clave) => areasTurnos.set(clave, etiquetaDeAreaTurno(clave)));
  }

  /* ── 7. Qué filas pasan ── */
  const pasan = delTenant.filter((f) => {
    const u = porId.get(f.userId)!;

    if (filtros.estadoUsuario === "active" && u.metadata?.activo === false) return false;
    if (filtros.estadoUsuario === "inactive" && u.metadata?.activo !== false) return false;
    if (filtros.rol && !(u.roles || []).some((r: any) => r?.name === filtros.rol)) return false;

    const c = f.contrato;

    if (filtros.vigencia) {
      const vigente = estaVigente(c);
      if (filtros.vigencia === "vigente" ? !vigente : vigente) return false;
    }

    if (filtros.tipoContrato && (c?.nombre_contrato ?? "") !== filtros.tipoContrato) return false;

    if (filtros.estadoContrato && claveEstado(c?.nombre_estado_empleado ?? "") !== claveEstado(filtros.estadoContrato)) return false;

    if (filtros.reemplazo) {
      const esReemplazo = !!c?.reemplazo;
      if (filtros.reemplazo === "con" ? !esReemplazo : esReemplazo) return false;
    }

    // El área y el turno son de la PERSONA en el período: si no aparece en ningún parte, no pasa.
    if (filtros.areaTurno && !areasTurnosPorPersona.get(f.userId)?.has(filtros.areaTurno)) return false;

    return true;
  });

  const ordenar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
  return {
    claves: pasan.map((f) => f.clave),
    total: delTenant.length,
    opciones: {
      roles: [...roles].sort(ordenar),
      tipos: [...tipos].sort(ordenar),
      estados: [...estados].sort(ordenar),
      areasTurnos: [...areasTurnos.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => ordenar(a.label, b.label)),
    },
  };
}

/** La clave de fila que espera `claves`, para que el front la arme igual. */
export const claveDeFila = (userId: string, nombreProyecto: string) => `${userId}::${normalizarProyecto(nombreProyecto)}`;
