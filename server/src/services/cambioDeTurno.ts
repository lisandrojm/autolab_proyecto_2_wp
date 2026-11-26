import { Types } from "mongoose";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Shift } from "../models/Shift.js";
import { Area } from "../models/Area.js";
import { Info } from "../models/Info.js";
import { Order } from "../models/Order.js";
import { OrderConfig } from "../models/OrderConfig.js";
import { Vacation } from "../models/Vacation.js";
import { claveAreaTurno, clavesDelMiembro, idDe, partirClaveAreaTurno, sedeDe, sedePrincipalDe, type ContextoDeSede } from "../compartido/areaTurno.js";
import { filaSegunContratos, superponerContratos } from "./equipoSegunContratos.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { CATEGORIA_CAMBIO_TURNO, rangosSePisan, reglasCambioTurnoDe, sumarDias, type ErrorCambioTurno, type PedidoCambioTurno, type ReglasCambioTurno } from "../compartido/cambioDeTurno.js";
import { etiquetaDeTurno } from "../compartido/etiquetaTurno.js";

/*
  ═══════════════════════════════════════════════════════════════════════
  PEDIDO «CAMBIO DE TURNO» (tipo de sistema, 26/11/2026)
  ═══════════════════════════════════════════════════════════════════════

  La persona pide pasar de su turno actual a otro de la MISMA FILA DE ÁREA (área + sede) de un proyecto,
  desde una fecha y, si el tipo lo permite, hasta otra (cambio temporal). Acá viven:

    · `validarCambioDeTurno(ctx)` — PURA: las reglas sobre un contexto ya cargado. Es lo que se prueba
      (`cambioDeTurno.test.ts`) y lo que corre al pedir, al revalidar antes de enviar y al aprobar.
    · `contextoDeCambioDeTurno` — carga ese contexto de la base: dónde está hoy la persona (el equipo con
      el contrato que rige encima, la misma lectura que Equipos y la Jerarquía), qué turnos tiene esa fila,
      sus otros pedidos en juego, sus ausencias aprobadas y la ocupación del destino.
    · `contextoParaPedir` — lo que el móvil muestra para armar el pedido sin calcular nada: proyectos,
      filas de área con el turno actual y los turnos posibles, reglas y primera fecha válida.
    · `fotoDeCambioDeTurno` — los NOMBRES (proyecto, área, sede, turnos) que se guardan en
      `Order.metadata.cambioTurno` al pedir, para el detalle y el PDF: los ids no se traducen en el teléfono.

  Dónde está hoy la persona: NO en `User.metadata.areaShiftAssignments` (eso es de la solicitud de
  contratación), sino en `Project.teamConfig` con el contrato que rige superpuesto (regla del 12/11/2026,
  `services/equipoSegunContratos.ts`). Aplicar el cambio escribe por `services/areasDeMiembro.ts`, como la
  Jerarquía (ver `services/pedidoCambioDeTurno.ts`).
*/

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const EN_JUEGO = ["pending", "pre_approved", "approved"] as const;
const APROBADAS = ["approved", "delivered"] as const;

/** "YYYY-MM-DD" → "D/M/YYYY" para los mensajes. */
const fechaCorta = (iso: string): string => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
};

export interface Ausencia {
  tipo: "vacaciones" | "licencia";
  desde: string;
  hasta: string;
}

/** Todo lo que necesitan las reglas, ya cargado. */
export interface ContextoCambioTurno {
  hoy: string;
  reglas: ReglasCambioTurno;
  pedido: PedidoCambioTurno;
  /** Turnos (ids) que la persona tiene HOY en esa fila (área + sede) del proyecto. Vacío = no está ahí. */
  turnosActuales: string[];
  /** Turnos (ids) de esa fila en `areasConfig`; null = la fila (área o sede) no existe en el proyecto. */
  turnosDeLaFila: string[] | null;
  /** El turno pedido existe en el tenant. */
  destinoExiste: boolean;
  /** Otros pedidos de cambio de turno de la persona en juego (pendientes, preaprobados o aprobados). */
  otrosPedidos: { desde: string; hasta: string | null }[];
  /** Vacaciones y licencias aprobadas de la persona. */
  ausencias: Ausencia[];
  /** Cuántas personas hay hoy en el turno de destino (sólo se calcula si el tipo tiene cupo); null = no se calculó. */
  ocupacionDestino: number | null;
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: ErrorCambioTurno[];
}

/**
 * LAS REGLAS. Devuelve TODOS los errores, no el primero: el móvil los muestra juntos antes de enviar.
 * Códigos estables (el front puede engancharse a ellos); mensajes para la persona.
 */
export function validarCambioDeTurno(ctx: ContextoCambioTurno): ResultadoValidacion {
  const errores: ErrorCambioTurno[] = [];
  const p = ctx.pedido;
  const error = (codigo: string, mensaje: string) => errores.push({ codigo, mensaje });

  // Dónde está hoy.
  const actual = idDe(p.shiftActualId);
  if (ctx.turnosDeLaFila === null) error("fila_inexistente", "Esa área (o esa sede) no está configurada en el proyecto.");
  if (ctx.turnosActuales.length === 0) error("sin_turno_actual", "No tenés turno asignado en esa área del proyecto.");
  else if (!ctx.turnosActuales.includes(actual)) error("turno_actual_distinto", "Tu turno actual no es el que figura en el pedido: volvé a cargar la pantalla.");

  // A dónde quiere ir.
  const destino = idDe(p.shiftSolicitadoId);
  if (!destino || !ctx.destinoExiste) error("turno_destino_inexistente", "El turno pedido no existe.");
  else if (ctx.turnosDeLaFila && !ctx.turnosDeLaFila.includes(destino)) error("turno_fuera_del_area", "El turno pedido no es de esa área en ese proyecto.");
  if (destino && (destino === actual || ctx.turnosActuales.includes(destino))) error("mismo_turno", "Ya estás en ese turno.");

  // Fechas.
  const desdeOk = ES_FECHA.test(p.fechaDesde || "");
  if (!desdeOk) error("fecha_desde_invalida", "Indicá desde qué fecha.");
  else {
    const minima = sumarDias(ctx.hoy, ctx.reglas.diasAnticipacion);
    if (p.fechaDesde < minima) {
      const n = ctx.reglas.diasAnticipacion;
      error("anticipacion_insuficiente", n > 0 ? `Se pide con ${n} ${n === 1 ? "día" : "días"} de anticipación: la primera fecha posible es el ${fechaCorta(minima)}.` : "La fecha desde no puede ser anterior a hoy.");
    }
  }
  if (p.fechaHasta) {
    if (!ES_FECHA.test(p.fechaHasta)) error("fecha_hasta_invalida", "La fecha hasta no es válida.");
    else if (desdeOk && p.fechaHasta < p.fechaDesde) error("fecha_hasta_invalida", "La fecha hasta tiene que ser igual o posterior a la fecha desde.");
    if (!ctx.reglas.permitirTemporal) error("temporal_no_permitido", "Acá los cambios de turno son permanentes: no se puede indicar hasta cuándo.");
  }
  if (!String(p.motivo || "").trim()) error("motivo_requerido", "Contá el motivo del cambio.");

  // Lo que ya tiene en esas fechas.
  if (desdeOk) {
    const rango = { desde: p.fechaDesde, hasta: p.fechaHasta || null };
    if (ctx.otrosPedidos.some((o) => rangosSePisan(rango, o))) error("pedido_superpuesto", "Ya tenés otro pedido de cambio de turno en esas fechas.");
    const vacaciones = ctx.ausencias.find((a) => a.tipo === "vacaciones" && rangosSePisan(rango, a));
    if (vacaciones) error("vacaciones_superpuestas", `Se pisa con tus vacaciones aprobadas (${fechaCorta(vacaciones.desde)} al ${fechaCorta(vacaciones.hasta)}).`);
    const licencia = ctx.ausencias.find((a) => a.tipo === "licencia" && rangosSePisan(rango, a));
    if (licencia) error("licencia_superpuesta", `Se pisa con una licencia aprobada (${fechaCorta(licencia.desde)} al ${fechaCorta(licencia.hasta)}).`);
  }

  // Cupo del destino.
  if (ctx.reglas.cupoMaximoPorTurno != null && ctx.ocupacionDestino != null && ctx.ocupacionDestino >= ctx.reglas.cupoMaximoPorTurno) {
    error("cupo_excedido", `El turno pedido ya tiene ${ctx.ocupacionDestino} ${ctx.ocupacionDestino === 1 ? "persona" : "personas"} (tope ${ctx.reglas.cupoMaximoPorTurno}).`);
  }

  return { ok: errores.length === 0, errores };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que llega del cliente
// ─────────────────────────────────────────────────────────────────────────────

const zId = z.string().refine((v) => Types.ObjectId.isValid(v), "Id inválido.");
const zFecha = z.string().regex(ES_FECHA, "Fecha inválida (YYYY-MM-DD).");

/** `Order.dynamicValue` de un pedido de cambio de turno, tal como lo manda el móvil. */
export const pedidoCambioTurnoSchema = z.object({
  projectId: zId,
  areaId: zId,
  sedeId: z.coerce.number().int().positive().nullable().optional().transform((v) => v ?? null),
  shiftActualId: zId,
  shiftSolicitadoId: zId,
  fechaDesde: zFecha,
  fechaHasta: z
    .union([zFecha, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  motivo: z.string().max(1000).default(""),
});

// ─────────────────────────────────────────────────────────────────────────────
// Dónde está hoy la persona
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_PROYECTO = "name teamConfig areasConfig metadata.sedeIds metadata.sedeId";

interface Situacion {
  proyecto: any | null;
  /** La persona pertenece al proyecto (`User.projectIds`). */
  pertenece: boolean;
  ctxSede: ContextoDeSede;
  /** Sus claves "area::turno[::sN]" hoy en el proyecto. */
  claves: Set<string>;
}

/** Las claves de UNA persona en UN proyecto: su fila del equipo con el contrato que rige encima. */
export async function situacionEnElProyecto(tenantId: Types.ObjectId, userId: string, proyecto: any, hoy: string): Promise<Situacion> {
  const ctxSede: ContextoDeSede = { areasConfig: proyecto?.areasConfig || [], sedePrincipal: sedePrincipalDe(proyecto?.metadata) };
  if (!proyecto) return { proyecto: null, pertenece: false, ctxSede, claves: new Set() };
  const [pertenece, vinculo] = await Promise.all([
    User.exists({ _id: userId, tenantId, projectIds: proyecto._id }).then((x) => !!x),
    UserProject.findOne({ userId, projectId: proyecto._id }).select("contracts").lean(),
  ]);
  if (!pertenece) return { proyecto, pertenece: false, ctxSede, claves: new Set() };
  const fila = (proyecto.teamConfig || []).find((c: any) => String(c.userId?._id ?? c.userId) === String(userId)) || null;
  const vista = filaSegunContratos(fila ?? { userId }, (vinculo as any)?.contracts || [], hoy);
  return { proyecto, pertenece: true, ctxSede, claves: clavesDelMiembro(vista?.areaShiftAssignments || [], ctxSede) };
}

/** Los turnos (ids) de la fila área + sede en `areasConfig`; null si no existe. */
function turnosDeLaFila(areasConfig: any[] | undefined, areaId: string, sedeId: number | null): string[] | null {
  const fila = (areasConfig || []).find((f: any) => idDe(f.areaId) === areaId && sedeDe(f.sedeId) === sedeId);
  return fila ? (fila.shiftIds || []).map(idDe) : null;
}

/** Los turnos que la persona tiene en esa fila, a partir de sus claves. */
const turnosEnLaFila = (claves: Set<string>, areaId: string, sedeId: number | null): string[] =>
  [...claves]
    .map(partirClaveAreaTurno)
    .filter((k) => k.areaId === areaId && k.sedeId === sedeId)
    .map((k) => k.shiftId);

/** Los ids de los tipos de pedido del tenant que cumplen una condición (para buscar pedidos por categoría). */
const tiposConfigurados = async (tenantId: Types.ObjectId, filtro: Record<string, unknown>): Promise<Types.ObjectId[]> =>
  (await OrderConfig.find({ tenantId, ...filtro }).select("_id").lean()).map((c: any) => c._id);

const isoDeDate = (d: unknown): string => (d instanceof Date ? d.toISOString().slice(0, 10) : fechaISO(String(d || "")));

/** El contexto completo para `validarCambioDeTurno`, leído de la base. */
export async function contextoDeCambioDeTurno(
  tenantId: Types.ObjectId,
  userId: string,
  pedido: PedidoCambioTurno,
  reglas: ReglasCambioTurno,
  opciones: { excluirOrderId?: string; hoy?: string } = {},
): Promise<ContextoCambioTurno> {
  const hoy = opciones.hoy || hoyArgentina();
  const proyecto: any = Types.ObjectId.isValid(pedido.projectId) ? await Project.findOne({ _id: pedido.projectId, tenantId }).select(SELECT_PROYECTO).lean() : null;
  const situacion = await situacionEnElProyecto(tenantId, userId, proyecto, hoy);
  const areaId = idDe(pedido.areaId);
  const sedeId = sedeDe(pedido.sedeId);
  const destino = idDe(pedido.shiftSolicitadoId);

  const [destinoExiste, idsCambioTurno, idsLicencias] = await Promise.all([
    Types.ObjectId.isValid(destino) ? Shift.exists({ _id: destino, tenantId }).then((x) => !!x) : Promise.resolve(false),
    tiposConfigurados(tenantId, { categoryType: CATEGORIA_CAMBIO_TURNO }),
    tiposConfigurados(tenantId, { categoryType: "fecha", dateMode: "range" }),
  ]);

  const filtroPropio: any = { tenantId, userId: new Types.ObjectId(userId) };
  if (opciones.excluirOrderId && Types.ObjectId.isValid(opciones.excluirOrderId)) filtroPropio._id = { $ne: new Types.ObjectId(opciones.excluirOrderId) };

  const [otros, licencias, vacaciones] = await Promise.all([
    idsCambioTurno.length ? Order.find({ ...filtroPropio, categoryId: { $in: idsCambioTurno }, status: { $in: EN_JUEGO } }).select("dynamicValue").lean() : Promise.resolve([] as any[]),
    idsLicencias.length ? Order.find({ ...filtroPropio, categoryId: { $in: idsLicencias }, status: { $in: APROBADAS } }).select("dynamicValue").lean() : Promise.resolve([] as any[]),
    Vacation.find({ tenantId, userId, status: { $in: APROBADAS } }).select("startDate endDate").lean(),
  ]);

  const ausencias: Ausencia[] = [
    ...(vacaciones as any[]).map((v) => ({ tipo: "vacaciones" as const, desde: isoDeDate(v.startDate), hasta: isoDeDate(v.endDate) })),
    ...(licencias as any[]).map((o) => ({ tipo: "licencia" as const, desde: fechaISO(o.dynamicValue?.fechaDesde), hasta: fechaISO(o.dynamicValue?.fechaHasta) })),
  ].filter((a) => a.desde && a.hasta);

  // La ocupación del destino sólo cuando hay cupo: es leer el equipo entero con sus contratos.
  let ocupacionDestino: number | null = null;
  if (reglas.cupoMaximoPorTurno != null && proyecto) {
    const contratoDe = await contratosQueRigenDelProyecto(String(proyecto._id), hoy);
    const clave = claveAreaTurno({ areaId, shiftId: destino, sedeId });
    ocupacionDestino = superponerContratos(proyecto.teamConfig, contratoDe).filter((fila: any) => String(fila.userId?._id ?? fila.userId) !== String(userId) && clavesDelMiembro(fila.areaShiftAssignments || [], situacion.ctxSede).has(clave)).length;
  }

  return {
    hoy,
    reglas,
    pedido,
    turnosActuales: turnosEnLaFila(situacion.claves, areaId, sedeId),
    turnosDeLaFila: proyecto ? turnosDeLaFila(proyecto.areasConfig, areaId, sedeId) : null,
    destinoExiste,
    otrosPedidos: (otros as any[]).map((o) => ({ desde: fechaISO(o.dynamicValue?.fechaDesde), hasta: fechaISO(o.dynamicValue?.fechaHasta) || null })).filter((o) => o.desde),
    ausencias,
    ocupacionDestino,
  };
}

/** El tipo de sistema del tenant (null si el init todavía no corrió). */
export const tipoCambioDeTurno = (tenantId: Types.ObjectId) => OrderConfig.findOne({ tenantId, categoryType: CATEGORIA_CAMBIO_TURNO });

/** Cargar el contexto y validar: lo que corren POST /orders, validate-cambio-turno y la aprobación. */
export async function validarPedidoCambioDeTurno(
  tenantId: Types.ObjectId,
  userId: string,
  pedido: PedidoCambioTurno,
  opciones: { reglas?: ReglasCambioTurno; excluirOrderId?: string; hoy?: string } = {},
): Promise<ResultadoValidacion & { ctx: ContextoCambioTurno }> {
  const reglas = opciones.reglas || reglasCambioTurnoDe((await tipoCambioDeTurno(tenantId))?.config);
  const ctx = await contextoDeCambioDeTurno(tenantId, userId, pedido, reglas, opciones);
  return { ...validarCambioDeTurno(ctx), ctx };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nombres para el detalle y el PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface FotoCambioTurno {
  proyectoNombre: string;
  areaNombre: string;
  sedeNombre: string;
  turnoActualNombre: string;
  turnoSolicitadoNombre: string;
  /** Cuándo se aplicó el cambio en el equipo (null = todavía no). */
  aplicado: { el: string; por: string | null } | null;
  /** Cuándo se volvió al turno original (sólo con `fechaHasta`). */
  revertido: { el: string } | null;
}

const nombreDeTurno = (t: any): string => (t ? etiquetaDeTurno(String(t.name || "")) : "");

export async function fotoDeCambioDeTurno(tenantId: Types.ObjectId, pedido: PedidoCambioTurno): Promise<FotoCambioTurno> {
  const sede = sedeDe(pedido.sedeId);
  const [proyecto, area, turnos, sedeInfo] = await Promise.all([
    Project.findOne({ _id: pedido.projectId, tenantId }).select("name").lean(),
    Area.findById(pedido.areaId).select("name").lean(),
    Shift.find({ _id: { $in: [pedido.shiftActualId, pedido.shiftSolicitadoId].filter((x) => Types.ObjectId.isValid(x)) } }).select("name").lean(),
    sede ? Info.findOne({ type: "sede", "data.id": sede }).select("name data.nombre").lean() : Promise.resolve(null),
  ]);
  const turnoDe = (id: string) => nombreDeTurno((turnos as any[]).find((t) => String(t._id) === String(id)));
  return {
    proyectoNombre: String((proyecto as any)?.name || ""),
    areaNombre: String((area as any)?.name || ""),
    sedeNombre: String((sedeInfo as any)?.data?.nombre || (sedeInfo as any)?.name || ""),
    turnoActualNombre: turnoDe(pedido.shiftActualId),
    turnoSolicitadoNombre: turnoDe(pedido.shiftSolicitadoId),
    aplicado: null,
    revertido: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que el móvil necesita para armar el pedido
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnoParaPedir {
  id: string;
  nombre: string;
  horario: string;
  dias: number[];
}

export interface FilaParaPedir {
  areaId: string;
  areaNombre: string;
  sedeId: number | null;
  sedeNombre: string;
  /** El turno (o turnos) en que está hoy en esa fila. */
  turnosActuales: TurnoParaPedir[];
  /** A dónde puede pedir pasar: los turnos de la fila que no son el suyo. */
  turnosPosibles: TurnoParaPedir[];
}

export interface ContextoParaPedir {
  hoy: string;
  reglas: ReglasCambioTurno;
  /** La primera `fechaDesde` válida (hoy + anticipación). */
  fechaMinima: string;
  proyectos: { projectId: string; nombre: string; filas: FilaParaPedir[] }[];
}

/**
 * Los proyectos donde la persona tiene turno hoy, con cada fila de área (área + sede), su turno actual y
 * los otros turnos de la fila. Sólo filas con turno actual: sin turno no hay de dónde cambiarse.
 */
export async function contextoParaPedir(tenantId: Types.ObjectId, userId: string, reglas: ReglasCambioTurno): Promise<ContextoParaPedir> {
  const hoy = hoyArgentina();
  const persona: any = await User.findById(userId).select("projectIds").lean();
  const proyectos: any[] = persona?.projectIds?.length ? await Project.find({ _id: { $in: persona.projectIds }, tenantId }).select(SELECT_PROYECTO).lean() : [];
  const turnos = new Map((await Shift.find({ tenantId }).select("name startTime endTime days").lean()).map((t: any) => [String(t._id), t]));
  const turnoParaPedir = (id: string): TurnoParaPedir | null => {
    const t: any = turnos.get(id);
    return t ? { id, nombre: nombreDeTurno(t), horario: t.startTime && t.endTime ? `${t.startTime} a ${t.endTime}` : "", dias: Array.isArray(t.days) ? t.days : [] } : null;
  };

  const areaIds = new Set<string>();
  const sedeIds = new Set<number>();
  const filasPorProyecto: { projectId: string; nombre: string; filas: { areaId: string; sedeId: number | null; actuales: string[]; posibles: string[] }[] }[] = [];
  for (const p of proyectos) {
    const { claves, ctxSede } = await situacionEnElProyecto(tenantId, userId, p, hoy);
    const filas: { areaId: string; sedeId: number | null; actuales: string[]; posibles: string[] }[] = [];
    for (const f of (p.areasConfig || []) as any[]) {
      const areaId = idDe(f.areaId);
      const sedeId = sedeDe(f.sedeId);
      const actuales = turnosEnLaFila(claves, areaId, sedeId);
      if (!actuales.length) continue;
      const posibles = (f.shiftIds || []).map(idDe).filter((s: string) => !actuales.includes(s));
      filas.push({ areaId, sedeId, actuales, posibles });
      areaIds.add(areaId);
      if (sedeId) sedeIds.add(sedeId);
    }
    if (filas.length) filasPorProyecto.push({ projectId: String(p._id), nombre: String(p.name || ""), filas });
    void ctxSede;
  }

  const [areas, sedes] = await Promise.all([
    areaIds.size ? Area.find({ _id: { $in: [...areaIds] } }).select("name").lean() : Promise.resolve([]),
    sedeIds.size ? Info.find({ type: "sede", "data.id": { $in: [...sedeIds] } }).select("name data.id data.nombre").lean() : Promise.resolve([]),
  ]);
  const nombreArea = new Map((areas as any[]).map((a) => [String(a._id), String(a.name || "")]));
  const nombreSede = new Map((sedes as any[]).map((s) => [Number(s.data?.id), String(s.data?.nombre || s.name || "")]));

  return {
    hoy,
    reglas,
    fechaMinima: sumarDias(hoy, reglas.diasAnticipacion),
    proyectos: filasPorProyecto
      .map((p) => ({
        projectId: p.projectId,
        nombre: p.nombre,
        filas: p.filas.map((f) => ({
          areaId: f.areaId,
          areaNombre: nombreArea.get(f.areaId) || "Área",
          sedeId: f.sedeId,
          sedeNombre: f.sedeId ? nombreSede.get(f.sedeId) || `Sede ${f.sedeId}` : "",
          turnosActuales: f.actuales.map(turnoParaPedir).filter((t): t is TurnoParaPedir => !!t),
          turnosPosibles: f.posibles.map(turnoParaPedir).filter((t): t is TurnoParaPedir => !!t),
        })),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}
