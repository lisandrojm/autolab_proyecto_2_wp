import { Types } from "mongoose";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { contratosQueRigenDeLasPersonas } from "../utils/contratosQueRigen.js";
import { claveEstado } from "../utils/estadoClave.js";
import { hoyArgentina, esContratoVigente } from "../utils/contratoVigencia.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS MISMOS FILTROS DE GESTIONAR EQUIPO, PERO SOBRE UN PERÍODO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestionar Equipo filtra en el SERVER (ver `resolveProjectTeamFilterIds` en `routes/users.ts`),
 * porque vigencia, tipo, estado impositivo y reemplazo dependen del contrato que rige y eso no se
 * puede escribir como query de Mongo. El modal de Reportes de Novedades necesitaba lo mismo, y
 * hacerlo en el navegador exigía bajarse los contratos de las 1.577 personas del tenant.
 *
 * Por eso esto devuelve DOS COSAS Y NADA MÁS:
 *
 *   · `userIds`: quiénes pasan los filtros. El modal se queda con esas filas.
 *   · `opciones`: qué poner en cada desplegable, sacado de la gente del período y no del sistema
 *     entero — igual que el resto de los filtros del modal.
 *
 * Son unos pocos KB contra los 2,7 MB del directorio, y el criterio no puede divergir del de
 * Gestionar Equipo porque las dos puntas usan las mismas funciones: `getContratoActivo` para elegir
 * el contrato y `claveEstado` para comparar estados.
 *
 * LA DIFERENCIA CON GESTIONAR EQUIPO, a propósito: el área y el turno salen del PARTE, no de la
 * configuración del proyecto. Acá se está mirando dónde trabajó esa persona esos días, que es la
 * pregunta de una novedad; allá se mira dónde está asignada, que es la de un equipo.
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
}

export interface OpcionesDeFiltro {
  roles: string[];
  tipos: string[];
  estados: string[];
  areasTurnos: { value: string; label: string }[];
}

const SIN_AREA_NI_TURNO = "__none__";

export async function resolverFiltrosDeNovedades(
  tenantId: Types.ObjectId,
  filtros: FiltrosDeNovedades,
): Promise<{ userIds: string[]; opciones: OpcionesDeFiltro; total: number }> {
  /* ── 1. Quiénes aparecen en los partes del período, y en qué área y turno ── */
  const partes: any[] = await Request.find({ tenantId, date: { $gte: filtros.desde, $lte: filtros.hasta } })
    .select("areaId shiftId attendance.employeeId attendance.replacementId")
    .lean();

  /** Las combinaciones de área y turno en las que cada persona aparece. */
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

  const ids = [...areasTurnosPorPersona.keys()];
  if (ids.length === 0) return { userIds: [], opciones: { roles: [], tipos: [], estados: [], areasTurnos: [] }, total: 0 };

  /* ── 2. Sus datos: estado de usuario y roles de plataforma ── */
  const usuarios: any[] = await User.find({ _id: { $in: ids }, tenantId })
    .select("metadata.activo roles")
    .populate({ path: "roles", select: "name", model: Role })
    .lean();
  const porId = new Map(usuarios.map((u: any) => [String(u._id), u]));

  /*
    ── 3. El contrato que rige, de todos sus proyectos ──

    Misma función que usa el resto del sistema, así que el contrato elegido es el mismo que muestra
    la fila. Se piden sólo los tres campos que los filtros miran.
  */
  const contratos = await contratosQueRigenDeLasPersonas(ids, hoyArgentina(), ["nombre_contrato", "nombre_estado_empleado", "reemplazo"]);

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
    const partes = [nombreArea.get(areaId), nombreTurno.get(shiftId)].filter(Boolean);
    return partes.join(" · ") || "Sin área/turno";
  };

  /* ── 5. Las opciones: lo que hay EN EL PERÍODO, no en el sistema ── */
  const roles = new Set<string>();
  const tipos = new Set<string>();
  const estados = new Set<string>();
  const areasTurnos = new Map<string, string>();

  for (const id of ids) {
    (porId.get(id)?.roles || []).forEach((r: any) => r?.name && roles.add(r.name));
    const c: any = contratos.get(id);
    if (c?.nombre_contrato) tipos.add(String(c.nombre_contrato).trim());
    if (c?.nombre_estado_empleado) estados.add(String(c.nombre_estado_empleado).trim());
    areasTurnosPorPersona.get(id)!.forEach((clave) => areasTurnos.set(clave, etiquetaDeAreaTurno(clave)));
  }

  /* ── 6. Quiénes pasan ── */
  const pasan = ids.filter((id) => {
    const u = porId.get(id);
    // Alguien que aparece en un parte y no está en el tenant no se puede evaluar: queda afuera.
    if (!u) return false;

    if (filtros.estadoUsuario === "active" && u.metadata?.activo === false) return false;
    if (filtros.estadoUsuario === "inactive" && u.metadata?.activo !== false) return false;

    if (filtros.rol && !(u.roles || []).some((r: any) => r?.name === filtros.rol)) return false;

    const c: any = contratos.get(id);

    if (filtros.vigencia) {
      /*
        Sin contrato se considera VIGENTE, igual que en Gestionar Equipo. Es discutible, pero lo que
        no se puede es que las dos pantallas respondan distinto a la misma pregunta.

        La vigencia se calcula con `esContratoVigente`, la misma función que usa la tabla: el helper
        devuelve las dos fechas, no un booleano, justamente para que nadie tenga su propia versión.
      */
      const vigente = !c || esContratoVigente(c);
      if (filtros.vigencia === "vigente" ? !vigente : vigente) return false;
    }

    if (filtros.tipoContrato && String(c?.nombre_contrato ?? "") !== filtros.tipoContrato) return false;

    if (filtros.estadoContrato && claveEstado(String(c?.nombre_estado_empleado ?? "")) !== claveEstado(filtros.estadoContrato)) return false;

    if (filtros.reemplazo) {
      const esReemplazo = !!c?.reemplazo;
      if (filtros.reemplazo === "con" ? !esReemplazo : esReemplazo) return false;
    }

    if (filtros.areaTurno && !areasTurnosPorPersona.get(id)!.has(filtros.areaTurno)) return false;

    return true;
  });

  const ordenar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
  return {
    userIds: pasan,
    total: ids.length,
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
