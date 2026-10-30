import { Types } from "mongoose";
import { PlanVacaciones, type IPlanVacaciones, type IMiembroDelPlan, type IItemDelPlan } from "../../models/PlanVacaciones.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { Area } from "../../models/Area.js";
import { Shift } from "../../models/Shift.js";
import { RoleFrame } from "../../models/RoleFrame.js";
import { rolDelMiembro } from "../../compartido/configDelEquipo.js";
import { Vacation } from "../../models/Vacation.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { Notification } from "../../models/Notification.js";
import { hoyArgentina, esContratoVigente, fechaISO } from "../../utils/contratoVigencia.js";
import { contratosQueRigenDelProyecto } from "../../utils/contratosQueRigen.js";
import { claveAreaTurnoDelMiembro, asignacionesDelMiembro, partirClave } from "../../utils/areaTurno.js";
import { claveAreaTurno, claveFilaArea, sedeDe, sedePrincipalDe } from "../../compartido/areaTurno.js";
import { Info } from "../../models/Info.js";
import { saldosDeVacaciones } from "./saldos.js";
import { crearVacacionParaPersona, preAprobarVacacion, adjustBalanceOnRequestChange, ErrorVacacion } from "./crearVacacion.js";
import { violaSolapamiento, type VacacionVirtual } from "./solapamiento.js";
import { notificar, responsablesDeProyectos, NOVEDAD_PLAN_VACACIONES_ENVIADO, NOVEDAD_PLAN_VACACIONES_RESUELTO } from "../novedadesNotificaciones.js";
import { esISO, diasEntre, mesDe, mesesDeVentana, fechaCorta, nombreDeMes } from "../../compartido/planVacaciones/fechas.js";
import { repartirMes } from "../../compartido/planVacaciones/repartirMes.js";
import { validarPlan, hayErrores, type Aviso, type ContextoDeValidacion } from "../../compartido/planVacaciones/validarPlan.js";
import { coberturaDelMes } from "../../compartido/planVacaciones/cobertura.js";
import { estadoDerivado, esEditable } from "../../compartido/planVacaciones/estado.js";

/**
 * EL PLAN DE VACACIONES POR PROYECTO: lo que hace cada endpoint de `routes/planVacaciones.ts`.
 * Ver el modelo (`models/PlanVacaciones.ts`) para el porqué de cada estado.
 */

export class ErrorPlan extends Error {
  constructor(
    message: string,
    public status = 400,
    public extra?: unknown,
  ) {
    super(message);
  }
}

const oid = (v: unknown) => new Types.ObjectId(String(v));
const idValido = (v: unknown) => !!v && Types.ObjectId.isValid(String(v));
const nombreDe = (u: any) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.metadata?.fullName || u?.email || "(sin nombre)";

/**
 * La clave de un grupo área × turno (× sede) × rol (el rol por `_id`, o por nombre si el contrato no lo
 * tiene resuelto). Sin sede es "area::turno::rol", igual que siempre; con sede, "area::turno::s12::rol".
 */
export const claveDeGrupo = (g: { areaId: any; shiftId: any; sedeId?: any; rolFrameId?: any; nombreRol?: string }): string =>
  `${claveAreaTurno(g)}::${g.rolFrameId ? String(g.rolFrameId) : `nombre:${g.nombreRol || ""}`}`;

export interface GrupoDelPlan {
  clave: string;
  areaId: string;
  areaNombre: string;
  shiftId: string;
  shiftNombre: string;
  /** La sede de la fila (área × turno × sede), o null. */
  sedeId: number | null;
  sedeNombre: string;
  rolFrameId: string | null;
  nombreRol: string;
  userIds: string[];
}

export interface EquipoParaPlan {
  proyecto: { _id: string; name: string };
  equipo: IMiembroDelPlan[];
  grupos: GrupoDelPlan[];
  areas: Array<{ _id: string; name: string }>;
  shifts: Array<{ _id: string; name: string; startTime: string; endTime: string }>;
  /** Miembros activos con contrato vigente pero sin área/turno asignado: no entran en la grilla. */
  sinGrupo: Array<{ userId: string; nombre: string }>;
}

/**
 * EL EQUIPO DEL PROYECTO TAL COMO LO VE EL PLAN: los miembros activos con contrato vigente en el
 * proyecto, agrupados por área × turno (misma precedencia que la Jerarquía: `teamConfig`, si no el
 * contrato) y por rol empresa (el del contrato que rige; si no, el del vínculo), con los días
 * disponibles del año de saldo según la MISMA cuenta de «Gestión por Usuario» (`saldosDeVacaciones`).
 */
export async function equipoParaPlan(tenantObjectId: Types.ObjectId, tenantId: string, projectId: string, anioDeSaldo: number): Promise<EquipoParaPlan> {
  const project: any = await Project.findOne({ _id: projectId, tenantId: tenantObjectId }).select("name teamConfig areasConfig turnos metadata.sedeIds metadata.sedeId").lean();
  if (!project) throw new ErrorPlan("Proyecto no encontrado.", 404);
  const hoy = hoyArgentina();
  const [members, contratoDe] = await Promise.all([
    User.find({ tenantId: tenantObjectId, projectIds: project._id, "metadata.activo": true }).select("firstName lastName email metadata.fullName").lean(),
    contratosQueRigenDelProyecto(String(project._id), hoy, ["nombre_rol_frame", "rol_frame_id", "hora_inicio", "hora_fin", "empresaContratoId", "tipo_contrato_id"]),
  ]);
  const configByUser = new Map<string, any>((project.teamConfig || []).map((c: any) => [String(c.userId), c]));
  const vinculos: any[] = await UserProject.find({ projectId: project._id, userId: { $in: members.map((m: any) => m._id) } }).select("userId rol_frame_id nombre_rol_frame").lean();
  const vinculoDe = new Map(vinculos.map((v) => [String(v.userId), v]));
  // El id numérico del rol del equipo cuando no es el del contrato (las reglas de solapamiento van por id).
  const nombresDeRol = [...new Set(vinculos.map((v) => String(v.nombre_rol_frame || "").trim()).filter(Boolean))];
  const idDeRolPorNombre = new Map<string, number>(
    ((await RoleFrame.find({ name: { $in: nombresDeRol } }).select("name data.rol.id").lean()) as any[]).filter((r) => r.data?.rol?.id != null).map((r) => [String(r.name).trim(), Number(r.data.rol.id)]),
  );

  type Crudo = { user: any; contrato: any; claves: string[]; rolNumerico: number | null; nombreRol: string };
  const crudos: Crudo[] = [];
  const sinGrupo: EquipoParaPlan["sinGrupo"] = [];
  for (const m of members as any[]) {
    const contrato = contratoDe.get(String(m._id));
    if (!contrato || !esContratoVigente(contrato, hoy)) continue;
    // Con la fila (sede) donde está, explícita; quien «falta elegir sede» queda sin grupo hasta que se lo ubique.
    const claves = [...claveAreaTurnoDelMiembro(asignacionesDelMiembro(configByUser.get(String(m._id)), contrato), { areasConfig: project.areasConfig, sedePrincipal: sedePrincipalDe(project.metadata) })];
    if (claves.length === 0) {
      sinGrupo.push({ userId: String(m._id), nombre: nombreDe(m) });
      continue;
    }
    const v = vinculoDe.get(String(m._id));
    // El rol del EQUIPO primero, el del contrato si el equipo no tiene (`rolDelMiembro`, 30/10/2026): con el
    // del contrato primero, una jornada con otro rol lo cambiaba de grupo.
    const nombreRol = rolDelMiembro(v?.nombre_rol_frame, contrato.nombre_rol_frame) || "Sin rol empresa";
    const delContrato = Number.isFinite(Number(contrato.rol_frame_id)) && contrato.rol_frame_id != null ? Number(contrato.rol_frame_id) : null;
    const delVinculo = Number.isFinite(Number(v?.rol_frame_id)) && v?.rol_frame_id != null ? Number(v.rol_frame_id) : null;
    const rolNumerico = nombreRol === String(contrato.nombre_rol_frame || "").trim() && delContrato != null ? delContrato : delVinculo ?? idDeRolPorNombre.get(nombreRol) ?? delContrato;
    crudos.push({ user: m, contrato, claves, rolNumerico, nombreRol });
  }

  // El rol numérico del contrato (`rol_frame_id` = `RoleFrame.data.rol.id` / `externalId`) → el `_id` del RoleFrame.
  const numeros = [...new Set(crudos.map((c) => c.rolNumerico).filter((n): n is number => n != null))];
  const rolPorNumero = new Map<number, { _id: string; name: string }>();
  if (numeros.length > 0) {
    const rfs: any[] = await RoleFrame.find({ $or: [{ externalId: { $in: numeros.map(String) } }, { "data.rol.id": { $in: numeros } }] }).select("externalId name data.rol.id").lean();
    for (const rf of rfs) {
      const n = Number(rf.data?.rol?.id ?? rf.externalId);
      if (Number.isFinite(n) && !rolPorNumero.has(n)) rolPorNumero.set(n, { _id: String(rf._id), name: rf.name || "" });
      const e = Number(rf.externalId);
      if (Number.isFinite(e) && !rolPorNumero.has(e)) rolPorNumero.set(e, { _id: String(rf._id), name: rf.name || "" });
    }
  }

  const saldos = crudos.length > 0 ? await saldosDeVacaciones(tenantId, tenantObjectId, anioDeSaldo, { userIds: crudos.map((c) => String(c.user._id)) }) : [];
  const saldoDe = new Map(saldos.map((s: any) => [String(s.userId), s]));

  const equipo: IMiembroDelPlan[] = crudos.map((c) => {
    const rf = c.rolNumerico != null ? rolPorNumero.get(c.rolNumerico) : undefined;
    const s: any = saldoDe.get(String(c.user._id));
    const baja = fechaISO(c.contrato.fecha_baja_contrato);
    return {
      userId: c.user._id,
      nombre: nombreDe(c.user),
      grupos: c.claves.map((k) => {
        const { areaId, shiftId, sedeId } = partirClave(k);
        return { areaId: oid(areaId), shiftId: oid(shiftId), ...(sedeId ? { sedeId } : {}), rolFrameId: rf ? oid(rf._id) : null, nombreRol: rf?.name || c.nombreRol };
      }),
      diasDisponibles: Number(s?.display?.available ?? 0),
      diasTotales: Number(s?.display?.totalAnnual ?? 0),
      contratoVigenteHasta: baja || null,
      empresaContratoId: idValido(c.contrato.empresaContratoId) ? oid(c.contrato.empresaContratoId) : null,
      tipoContratoId: c.contrato.tipo_contrato_id ?? null,
      horaInicio: c.contrato.hora_inicio || undefined,
      horaFin: c.contrato.hora_fin || undefined,
    };
  });

  const { grupos, areas, shifts } = await gruposDe(tenantObjectId, project, equipo);
  return { proyecto: { _id: String(project._id), name: project.name }, equipo, grupos, areas, shifts, sinGrupo };
}

/** Los grupos (área › turno › rol) de un equipo, en el orden de `areasConfig`, del turno y del nombre del rol, con los nombres para dibujar. */
async function gruposDe(tenantObjectId: Types.ObjectId, project: any, equipo: IMiembroDelPlan[]): Promise<Pick<EquipoParaPlan, "grupos" | "areas" | "shifts">> {
  const areaIds = [...new Set(equipo.flatMap((m) => m.grupos.map((g) => String(g.areaId))))];
  const shiftIds = [...new Set(equipo.flatMap((m) => m.grupos.map((g) => String(g.shiftId))))];
  const sedeIds = [...new Set(equipo.flatMap((m) => m.grupos.map((g) => sedeDe(g.sedeId)).filter((x): x is number => x != null)))];
  const [areasDoc, shiftsDoc, sedesDoc] = await Promise.all([
    areaIds.length ? Area.find({ _id: { $in: areaIds } }).select("name").lean() : [],
    shiftIds.length ? Shift.find({ _id: { $in: shiftIds } }).select("name order startTime endTime").lean() : [],
    // Los nombres de las sedes de las filas con sede (sin sedes por área no se consulta nada). El catálogo
    // de sedes (`Info` type "sede") es global, sin tenantId: igual que en `routes/projects.ts`.
    sedeIds.length ? Info.find({ type: "sede", "data.id": { $in: sedeIds } }).select("name data.id data.nombre").lean() : [],
  ]);
  const nombreSede = new Map<number, string>((sedesDoc as any[]).map((x) => [Number(x.data?.id), String(x.data?.nombre || x.name || "")]));
  const areaPorId = new Map((areasDoc as any[]).map((a) => [String(a._id), a]));
  const shiftPorId = new Map((shiftsDoc as any[]).map((s) => [String(s._id), s]));
  // El orden de las filas de `areasConfig` (área + sede); una fila con sede que ya no está cae en la de su área.
  const ordenArea = new Map<string, number>();
  (project.areasConfig || []).forEach((a: any, i: number) => {
    const fila = claveFilaArea({ areaId: a.areaId?._id || a.areaId, sedeId: a.sedeId });
    if (!ordenArea.has(fila)) ordenArea.set(fila, i);
    const soloArea = String(a.areaId?._id || a.areaId);
    if (!ordenArea.has(soloArea)) ordenArea.set(soloArea, i);
  });
  const porClave = new Map<string, GrupoDelPlan>();
  for (const m of equipo) {
    for (const g of m.grupos) {
      const clave = claveDeGrupo(g);
      if (!porClave.has(clave)) {
        porClave.set(clave, {
          clave,
          areaId: String(g.areaId),
          areaNombre: areaPorId.get(String(g.areaId))?.name || "Área",
          shiftId: String(g.shiftId),
          shiftNombre: shiftPorId.get(String(g.shiftId))?.name || "Turno",
          sedeId: sedeDe(g.sedeId),
          sedeNombre: sedeDe(g.sedeId) ? nombreSede.get(sedeDe(g.sedeId)!) || `Sede ${sedeDe(g.sedeId)}` : "",
          rolFrameId: g.rolFrameId ? String(g.rolFrameId) : null,
          nombreRol: g.nombreRol,
          userIds: [],
        });
      }
      const grupo = porClave.get(clave)!;
      if (!grupo.userIds.includes(String(m.userId))) grupo.userIds.push(String(m.userId));
    }
  }
  const grupos = [...porClave.values()].sort((a, b) => {
    const oa = ordenArea.get(claveFilaArea(a)) ?? ordenArea.get(a.areaId) ?? 999;
    const ob = ordenArea.get(claveFilaArea(b)) ?? ordenArea.get(b.areaId) ?? 999;
    if (oa !== ob) return oa - ob;
    if (a.areaNombre !== b.areaNombre) return a.areaNombre.localeCompare(b.areaNombre, "es");
    if (a.sedeNombre !== b.sedeNombre) return a.sedeNombre.localeCompare(b.sedeNombre, "es");
    const sa = Number(shiftPorId.get(a.shiftId)?.order ?? 0);
    const sb = Number(shiftPorId.get(b.shiftId)?.order ?? 0);
    if (sa !== sb) return sa - sb;
    if (a.shiftNombre !== b.shiftNombre) return a.shiftNombre.localeCompare(b.shiftNombre, "es");
    return a.nombreRol.localeCompare(b.nombreRol, "es");
  });
  return {
    grupos,
    areas: (areasDoc as any[]).map((a) => ({ _id: String(a._id), name: a.name })),
    shifts: (shiftsDoc as any[]).map((s) => ({ _id: String(s._id), name: s.name, startTime: s.startTime, endTime: s.endTime })),
  };
}

// ───────────────────────────── CRUD del plan ─────────────────────────────

function validarVentana(desde: unknown, hasta: unknown): { desde: string; hasta: string } {
  if (!esISO(desde) || !esISO(hasta)) throw new ErrorPlan("La ventana necesita fecha desde y hasta (YYYY-MM-DD).");
  if (hasta < desde) throw new ErrorPlan("La fecha hasta es anterior a la fecha desde.");
  if (mesesDeVentana(desde, hasta).length > 12) throw new ErrorPlan("La ventana no puede abarcar más de 12 meses.");
  return { desde, hasta };
}

const validarTope = (v: unknown, porDefecto = 15): number => {
  if (v === undefined || v === null || v === "") return porDefecto;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new ErrorPlan("El tope de días por persona tiene que ser un entero entre 1 y 60.");
  return n;
};

export async function crearPlan(tenantObjectId: Types.ObjectId, tenantId: string, creadorId: string, body: any): Promise<IPlanVacaciones> {
  if (!idValido(body?.projectId)) throw new ErrorPlan("Falta el proyecto.");
  const { desde, hasta } = validarVentana(body?.ventanaDesde, body?.ventanaHasta);
  const anioDeSaldo = Number.isInteger(Number(body?.anioDeSaldo)) && Number(body.anioDeSaldo) > 2000 ? Number(body.anioDeSaldo) : Number(desde.slice(0, 4));
  const tope = validarTope(body?.topeDiasPorPersona);
  const nombre = String(body?.nombre || "").trim() || `Temporada ${desde.slice(0, 4)}${hasta.slice(0, 4) !== desde.slice(0, 4) ? `/${hasta.slice(2, 4)}` : ""}`;
  const eq = await equipoParaPlan(tenantObjectId, tenantId, String(body.projectId), anioDeSaldo);
  return PlanVacaciones.create({
    tenantId: tenantObjectId,
    projectId: oid(body.projectId),
    nombre,
    ventanaDesde: desde,
    ventanaHasta: hasta,
    anioDeSaldo,
    topeDiasPorPersona: tope,
    estado: "borrador",
    equipo: eq.equipo,
    equipoActualizadoAt: new Date(),
    items: [],
    reemplazos: [],
    creadoPor: oid(creadorId),
  });
}

export async function cargarPlan(tenantObjectId: Types.ObjectId, planId: string): Promise<IPlanVacaciones> {
  if (!idValido(planId)) throw new ErrorPlan("Plan no encontrado.", 404);
  const plan = await PlanVacaciones.findOne({ _id: planId, tenantId: tenantObjectId });
  if (!plan) throw new ErrorPlan("Plan no encontrado.", 404);
  return plan;
}

export async function listarPlanes(tenantObjectId: Types.ObjectId, o: { projectId?: string; estado?: string; proyectos: Types.ObjectId[] | null; pendientesDeMi?: Types.ObjectId[] | null }) {
  const filtro: any = { tenantId: tenantObjectId };
  if (o.projectId && idValido(o.projectId)) filtro.projectId = oid(o.projectId);
  if (o.estado) filtro.estado = o.estado;
  if (o.proyectos) filtro.projectId = filtro.projectId ? { $in: o.proyectos.filter((p) => String(p) === String(filtro.projectId)) } : { $in: o.proyectos };
  if (o.pendientesDeMi) {
    filtro.projectId = { $in: o.pendientesDeMi };
    filtro["items.estado"] = "enviado";
  }
  const planes: any[] = await PlanVacaciones.find(filtro).select("nombre projectId ventanaDesde ventanaHasta anioDeSaldo topeDiasPorPersona estado creadoPor enviadoAt createdAt updatedAt items.estado reemplazos.estado").sort({ ventanaDesde: -1, createdAt: -1 }).lean();
  const proyectos: any[] = await Project.find({ _id: { $in: [...new Set(planes.map((p) => String(p.projectId)))] } }).select("name").lean();
  const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), p.name]));
  return planes.map((p) => {
    const contar = (e: string) => (p.items || []).filter((i: any) => i.estado === e).length;
    return {
      _id: String(p._id),
      projectId: String(p.projectId),
      proyecto: nombreProyecto.get(String(p.projectId)) || "",
      nombre: p.nombre,
      ventanaDesde: p.ventanaDesde,
      ventanaHasta: p.ventanaHasta,
      anioDeSaldo: p.anioDeSaldo,
      topeDiasPorPersona: p.topeDiasPorPersona,
      estado: p.estado,
      enviadoAt: p.enviadoAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      contadores: { total: (p.items || []).length, propuestos: contar("propuesto"), enviados: contar("enviado"), aprobados: contar("aprobado"), rechazados: contar("rechazado"), cancelados: contar("cancelado"), reemplazos: (p.reemplazos || []).filter((r: any) => r.estado === "solicitado").length },
    };
  });
}

/** El plan como lo recibe la pantalla: con grupos, nombres, avisos y cobertura por grupo y mes. */
export async function detalleDelPlan(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones) {
  const project: any = await Project.findOne({ _id: plan.projectId, tenantId: tenantObjectId }).select("name areasConfig vacationConfig").lean();
  const equipo = plan.equipo as IMiembroDelPlan[];
  const { grupos, areas, shifts } = await gruposDe(tenantObjectId, project || {}, equipo);
  const avisos = await avisosDelPlan(tenantObjectId, plan, project);
  const meses = mesesDeVentana(plan.ventanaDesde, plan.ventanaHasta);

  // Cobertura por grupo y mes: días con alguien del rol afuera (justifica el reemplazo) y días sin nadie.
  const cobertura: Record<string, Record<string, { dias: number; diasConAlguienAfuera: number; diasSinNadie: number; ausentesPorDia: number[] }>> = {};
  for (const g of grupos) {
    cobertura[g.clave] = {};
    const delGrupo = (plan.items as any[]).filter((i) => claveDeGrupo(i) === g.clave).map((i) => ({ userId: String(i.userId), desde: i.desde, hasta: i.hasta, estado: i.estado }));
    for (const mes of meses) {
      const c = coberturaDelMes(delGrupo, g.userIds, mes, plan.ventanaDesde, plan.ventanaHasta);
      cobertura[g.clave][mes] = { dias: c.dias, diasConAlguienAfuera: c.diasConAlguienAfuera, diasSinNadie: c.diasSinNadie, ausentesPorDia: c.porDia.map((d) => d.ausentes.length) };
    }
  }
  const json: any = plan.toObject();
  return {
    ...json,
    _id: String(plan._id),
    proyecto: { _id: String(plan.projectId), name: project?.name || "" },
    meses,
    grupos,
    areas,
    shifts,
    avisos,
    cobertura,
  };
}

/** La configuración de fraccionamiento que rige para el proyecto (la del proyecto si no usa la global). */
async function configDeFraccionamiento(tenantObjectId: Types.ObjectId, project: any): Promise<{ permiteFraccionadas: boolean; minDiasFraccion: number }> {
  const global: any = await VacationConfig.findOne({ tenantId: tenantObjectId }).select("permiteFraccionadas minDiasFraccion").lean();
  const propia = project?.vacationConfig && project.vacationConfig.useGlobalConfig === false ? project.vacationConfig : null;
  return {
    permiteFraccionadas: propia?.permiteFraccionadas ?? global?.permiteFraccionadas ?? true,
    minDiasFraccion: propia?.minDiasFraccion ?? global?.minDiasFraccion ?? 7,
  };
}

/** Los avisos del plan con el contexto resuelto de la base (ver `compartido/planVacaciones/validarPlan.ts`). */
async function avisosDelPlan(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, project: any): Promise<Aviso[]> {
  const equipo = plan.equipo as IMiembroDelPlan[];
  const userIds = [...new Set((plan.items as any[]).map((i) => String(i.userId)))];
  const nombreDeId: Record<string, string> = {};
  const disponiblesDe: Record<string, number> = {};
  const contratoVenceEl: Record<string, string> = {};
  for (const m of equipo) {
    nombreDeId[String(m.userId)] = m.nombre;
    disponiblesDe[String(m.userId)] = m.diasDisponibles;
    if (m.contratoVigenteHasta) contratoVenceEl[String(m.userId)] = m.contratoVigenteHasta;
  }
  const vacacionesExistentes: ContextoDeValidacion["vacacionesExistentes"] = {};
  const itemsDeOtrosPlanes: ContextoDeValidacion["itemsDeOtrosPlanes"] = {};
  if (userIds.length > 0) {
    const propias = new Set((plan.items as any[]).map((i) => (i.vacationId ? String(i.vacationId) : "")).filter(Boolean));
    const vacs: any[] = await Vacation.find({
      tenantId: tenantObjectId,
      userId: { $in: userIds.map(oid) },
      status: { $nin: ["rejected", "cancelled"] },
      startDate: { $lte: new Date(`${plan.ventanaHasta}T23:59:59.999Z`) },
      endDate: { $gte: new Date(`${plan.ventanaDesde}T00:00:00.000Z`) },
    })
      .select("userId startDate endDate status")
      .lean();
    for (const v of vacs) {
      if (propias.has(String(v._id))) continue;
      const u = String(v.userId);
      (vacacionesExistentes[u] = vacacionesExistentes[u] || []).push({ desde: new Date(v.startDate).toISOString().slice(0, 10), hasta: new Date(v.endDate).toISOString().slice(0, 10), estado: v.status });
    }
    const otros: any[] = await PlanVacaciones.find({ tenantId: tenantObjectId, _id: { $ne: plan._id }, estado: { $ne: "cancelado" }, "items.userId": { $in: userIds.map(oid) } }).select("nombre items.userId items.desde items.hasta items.estado").lean();
    for (const o of otros) {
      for (const i of o.items || []) {
        if (i.estado === "cancelado" || i.estado === "rechazado" || i.estado === "aprobado") continue; // el aprobado ya es Vacation: lo cubre el bloque de arriba
        const u = String(i.userId);
        if (!userIds.includes(u)) continue;
        (itemsDeOtrosPlanes[u] = itemsDeOtrosPlanes[u] || []).push({ desde: i.desde, hasta: i.hasta, plan: o.nombre });
      }
    }
  }
  const config = await configDeFraccionamiento(tenantObjectId, project);
  return validarPlan(
    { ventanaDesde: plan.ventanaDesde, ventanaHasta: plan.ventanaHasta, topeDiasPorPersona: plan.topeDiasPorPersona, items: (plan.items as any[]).map((i) => ({ id: String(i._id), userId: String(i.userId), desde: i.desde, hasta: i.hasta, dias: i.dias, estado: i.estado })) },
    { disponiblesDe, nombreDe: nombreDeId, vacacionesExistentes, itemsDeOtrosPlanes, config, contratoVenceEl, personasDelEquipo: equipo.map((m) => String(m.userId)) },
  );
}

const soloBorrador = (plan: IPlanVacaciones) => {
  if (plan.estado !== "borrador") throw new ErrorPlan("Sólo se puede cambiar un plan en borrador (sin bloques enviados ni aprobados).", 409);
};

const recalcularEstado = (plan: IPlanVacaciones) => {
  if (plan.estado === "cancelado") return;
  const nuevo = estadoDerivado(plan.items as any[]);
  plan.estado = nuevo;
  if (nuevo === "cerrado" && !plan.cerradoAt) plan.cerradoAt = new Date();
  if (nuevo !== "cerrado") plan.cerradoAt = undefined;
};

export async function actualizarPlan(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, body: any): Promise<{ quitados: number }> {
  soloBorrador(plan);
  let quitados = 0;
  if (body.nombre !== undefined) plan.nombre = String(body.nombre).trim() || plan.nombre;
  if (body.ventanaDesde !== undefined || body.ventanaHasta !== undefined) {
    const { desde, hasta } = validarVentana(body.ventanaDesde ?? plan.ventanaDesde, body.ventanaHasta ?? plan.ventanaHasta);
    plan.ventanaDesde = desde;
    plan.ventanaHasta = hasta;
    // Los bloques propuestos que quedan fuera de la ventana nueva se quitan; se informa cuántos.
    const antes = plan.items.length;
    plan.items.pull(...(plan.items as any[]).filter((i) => esEditable(i.estado) && (i.desde < desde || i.hasta > hasta)).map((i) => i._id));
    quitados = antes - plan.items.length;
  }
  if (body.topeDiasPorPersona !== undefined) plan.topeDiasPorPersona = validarTope(body.topeDiasPorPersona, plan.topeDiasPorPersona);
  if (body.anioDeSaldo !== undefined && Number(body.anioDeSaldo) !== plan.anioDeSaldo) {
    const n = Number(body.anioDeSaldo);
    if (!Number.isInteger(n) || n < 2000) throw new ErrorPlan("Año de saldo inválido.");
    plan.anioDeSaldo = n;
    await refrescarEquipo(tenantObjectId, tenantId, plan, false);
  }
  await plan.save();
  return { quitados };
}

export async function eliminarPlan(plan: IPlanVacaciones): Promise<void> {
  if ((plan.items as any[]).some((i) => i.estado === "aprobado")) throw new ErrorPlan("El plan tiene bloques aprobados (ya son vacaciones): no se puede borrar. Cancelalos primero.", 409);
  await plan.deleteOne();
}

export async function cancelarPlan(plan: IPlanVacaciones): Promise<void> {
  if ((plan.items as any[]).some((i) => i.estado === "aprobado")) throw new ErrorPlan("El plan tiene bloques aprobados: cancelá cada bloque (eso cancela su vacación) antes de cancelar el plan.", 409);
  plan.estado = "cancelado";
  plan.canceladoAt = new Date();
  await plan.save();
}

/** Vuelve a tomar el equipo del proyecto. Los bloques de quien ya no está no se borran: `avisos` los marca. */
export async function refrescarEquipo(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, guardar = true): Promise<void> {
  const eq = await equipoParaPlan(tenantObjectId, tenantId, String(plan.projectId), plan.anioDeSaldo);
  plan.equipo = eq.equipo as any;
  plan.equipoActualizadoAt = new Date();
  if (guardar) await plan.save();
}

// ───────────────────────────── bloques ─────────────────────────────

const vivo = (i: any) => i.estado !== "cancelado" && i.estado !== "rechazado";

/** Días ya asignados a la persona en el plan, fuera de los bloques que se van a reemplazar. */
const diasYaAsignados = (plan: IPlanVacaciones, userId: string, excepto: Set<string>) => (plan.items as any[]).filter((i) => String(i.userId) === userId && vivo(i) && !excepto.has(String(i._id))).reduce((acc, i) => acc + (i.dias || 0), 0);

const miembroDe = (plan: IPlanVacaciones, userId: string): IMiembroDelPlan | undefined => (plan.equipo as IMiembroDelPlan[]).find((m) => String(m.userId) === String(userId));

const grupoDeBody = (body: any) => {
  if (!idValido(body?.areaId) || !idValido(body?.shiftId)) throw new ErrorPlan("Falta el área o el turno del grupo.");
  const rolFrameId = idValido(body?.rolFrameId) ? String(body.rolFrameId) : null;
  const sedeId = sedeDe(body?.sedeId);
  return { areaId: String(body.areaId), shiftId: String(body.shiftId), ...(sedeId ? { sedeId } : {}), rolFrameId, nombreRol: String(body?.nombreRol || "") };
};

const validarMes = (mes: unknown, plan: IPlanVacaciones): string => {
  if (typeof mes !== "string" || !/^\d{4}-\d{2}$/.test(mes)) throw new ErrorPlan("Mes inválido (YYYY-MM).");
  if (!mesesDeVentana(plan.ventanaDesde, plan.ventanaHasta).includes(mes)) throw new ErrorPlan("Ese mes está fuera de la ventana del plan.");
  return mes;
};

/**
 * ASIGNAR UN MES A UN GRUPO (área × turno × rol): reparte el mes entre sus personas con `repartirMes`
 * y reemplaza los bloques editables que el grupo tuviera en ese mes. Quien ya tiene un bloque vivo en
 * OTRO grupo o mes del plan se saltea (una persona se planifica una vez) y se informa. Si el grupo
 * tiene bloques enviados o aprobados en ese mes, no se toca nada (409).
 */
export async function asignarMes(plan: IPlanVacaciones, body: any): Promise<{ bloques: number; salteados: Array<{ userId: string; nombre: string; motivo: string }> }> {
  if (plan.estado === "cancelado") throw new ErrorPlan("El plan está cancelado.", 409);
  const g = grupoDeBody(body);
  const mes = validarMes(body?.mes, plan);
  const clave = claveDeGrupo(g);
  const equipo = plan.equipo as IMiembroDelPlan[];
  const delGrupo = equipo.filter((m) => m.grupos.some((x) => claveDeGrupo(x) === clave));
  if (delGrupo.length === 0) throw new ErrorPlan("Ese grupo no tiene personas en el equipo del plan.", 404);
  const nombreRol = delGrupo[0].grupos.find((x) => claveDeGrupo(x) === clave)?.nombreRol || g.nombreRol;

  const existentes = (plan.items as any[]).filter((i) => claveDeGrupo(i) === clave && i.mes === mes);
  if (existentes.some((i) => !esEditable(i.estado))) throw new ErrorPlan("Ese grupo ya tiene bloques enviados o aprobados en ese mes: cancelalos o esperá la respuesta del coordinador.", 409);
  const aReemplazar = new Set(existentes.map((i) => String(i._id)));

  // Orden: el que mande la pantalla; si no, por nombre.
  const orden: string[] = Array.isArray(body?.orden) ? body.orden.map(String) : [];
  const ordenadas = [...delGrupo].sort((a, b) => {
    const ia = orden.indexOf(String(a.userId));
    const ib = orden.indexOf(String(b.userId));
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const salteados: Array<{ userId: string; nombre: string; motivo: string }> = [];
  const personas: Array<{ userId: string; disponibles: number }> = [];
  for (const m of ordenadas) {
    const uid = String(m.userId);
    const enOtroLado = (plan.items as any[]).find((i) => String(i.userId) === uid && vivo(i) && !aReemplazar.has(String(i._id)));
    if (enOtroLado) {
      salteados.push({ userId: uid, nombre: m.nombre, motivo: `ya tiene un bloque en ${nombreDeMes(enOtroLado.mes)} (${fechaCorta(enOtroLado.desde)}–${fechaCorta(enOtroLado.hasta)})` });
      continue;
    }
    personas.push({ userId: uid, disponibles: Math.max(0, m.diasDisponibles - diasYaAsignados(plan, uid, aReemplazar)) });
  }
  const bloques = repartirMes(personas, mes, { tope: plan.topeDiasPorPersona, ventanaDesde: plan.ventanaDesde, ventanaHasta: plan.ventanaHasta });

  plan.items.pull(...[...aReemplazar].map((id) => oid(id)));
  for (const b of bloques) {
    const m = miembroDe(plan, b.userId)!;
    plan.items.push({
      userId: oid(b.userId),
      areaId: oid(g.areaId),
      shiftId: oid(g.shiftId),
      ...(g.sedeId ? { sedeId: g.sedeId } : {}),
      rolFrameId: g.rolFrameId ? oid(g.rolFrameId) : null,
      nombreRol,
      mes,
      desde: b.desde,
      hasta: b.hasta,
      dias: b.dias,
      diasDisponiblesAlPlanificar: m.diasDisponibles,
      ajustadoAMano: false,
      estado: "propuesto",
    } as any);
  }
  recalcularEstado(plan);
  await plan.save();
  return { bloques: bloques.length, salteados };
}

export async function quitarAsignacion(plan: IPlanVacaciones, body: any): Promise<{ quitados: number }> {
  const g = grupoDeBody(body);
  const mes = validarMes(body?.mes, plan);
  const clave = claveDeGrupo(g);
  const ids = (plan.items as any[]).filter((i) => claveDeGrupo(i) === clave && i.mes === mes && esEditable(i.estado)).map((i) => i._id);
  plan.items.pull(...ids);
  recalcularEstado(plan);
  await plan.save();
  return { quitados: ids.length };
}

/** Valida un bloque suelto (alta o edición) contra el tope, la ventana, el saldo y sus otros bloques. 422 con los avisos si no pasa. */
function validarBloqueSuelto(plan: IPlanVacaciones, item: { id: string; userId: string; desde: string; hasta: string; dias: number }) {
  const m = miembroDe(plan, item.userId);
  if (!m) throw new ErrorPlan("La persona no está en el equipo del plan.", 404);
  const otros = (plan.items as any[]).filter((i) => String(i._id) !== item.id).map((i) => ({ id: String(i._id), userId: String(i.userId), desde: i.desde, hasta: i.hasta, dias: i.dias, estado: i.estado }));
  const avisos = validarPlan(
    { ventanaDesde: plan.ventanaDesde, ventanaHasta: plan.ventanaHasta, topeDiasPorPersona: plan.topeDiasPorPersona, items: [...otros, { ...item, estado: "propuesto" }] },
    { disponiblesDe: { [item.userId]: m.diasDisponibles }, nombreDe: { [item.userId]: m.nombre } },
  ).filter((a) => a.nivel === "error" && (a.itemId === item.id || (!a.itemId && a.userId === item.userId)));
  if (avisos.length > 0) throw new ErrorPlan(avisos[0].mensaje, 422, avisos);
}

export async function crearItem(plan: IPlanVacaciones, body: any): Promise<string> {
  if (plan.estado === "cancelado") throw new ErrorPlan("El plan está cancelado.", 409);
  const g = grupoDeBody(body);
  if (!idValido(body?.userId)) throw new ErrorPlan("Falta la persona.");
  if (!esISO(body?.desde) || !esISO(body?.hasta)) throw new ErrorPlan("Fechas inválidas (YYYY-MM-DD).");
  const m = miembroDe(plan, String(body.userId));
  if (!m) throw new ErrorPlan("La persona no está en el equipo del plan.", 404);
  const grupo = m.grupos.find((x) => claveDeGrupo(x) === claveDeGrupo(g));
  if (!grupo) throw new ErrorPlan("La persona no pertenece a ese grupo.", 400);
  const dias = diasEntre(body.desde, body.hasta);
  const id = new Types.ObjectId();
  validarBloqueSuelto(plan, { id: String(id), userId: String(m.userId), desde: body.desde, hasta: body.hasta, dias });
  plan.items.push({
    _id: id,
    userId: m.userId,
    areaId: oid(g.areaId),
    shiftId: oid(g.shiftId),
    ...(g.sedeId ? { sedeId: g.sedeId } : {}),
    rolFrameId: grupo.rolFrameId,
    nombreRol: grupo.nombreRol,
    mes: mesDe(body.desde),
    desde: body.desde,
    hasta: body.hasta,
    dias,
    diasDisponiblesAlPlanificar: m.diasDisponibles,
    ajustadoAMano: true,
    estado: "propuesto",
  } as any);
  recalcularEstado(plan);
  await plan.save();
  return String(id);
}

const itemDe = (plan: IPlanVacaciones, itemId: string): IItemDelPlan & { save?: unknown } => {
  const it: any = idValido(itemId) ? (plan.items as any).id(itemId) : null;
  if (!it) throw new ErrorPlan("Bloque no encontrado.", 404);
  return it;
};

export async function actualizarItem(plan: IPlanVacaciones, itemId: string, body: any): Promise<void> {
  const it: any = itemDe(plan, itemId);
  if (!esEditable(it.estado)) throw new ErrorPlan("Ese bloque ya fue enviado al coordinador: no se puede mover.", 409);
  const desde = body?.desde ?? it.desde;
  const hasta = body?.hasta ?? it.hasta;
  if (!esISO(desde) || !esISO(hasta)) throw new ErrorPlan("Fechas inválidas (YYYY-MM-DD).");
  const dias = diasEntre(desde, hasta);
  if (dias <= 0) throw new ErrorPlan("La fecha hasta es anterior a la fecha desde.");
  validarBloqueSuelto(plan, { id: String(it._id), userId: String(it.userId), desde, hasta, dias });
  it.desde = desde;
  it.hasta = hasta;
  it.dias = dias;
  it.mes = mesDe(desde);
  it.ajustadoAMano = true;
  if (it.estado === "rechazado") {
    it.estado = "propuesto";
    it.motivoRechazo = undefined;
  }
  recalcularEstado(plan);
  await plan.save();
}

export async function eliminarItem(plan: IPlanVacaciones, itemId: string): Promise<void> {
  const it: any = itemDe(plan, itemId);
  if (!esEditable(it.estado)) throw new ErrorPlan("Ese bloque ya fue enviado o aprobado: cancelalo en vez de borrarlo.", 409);
  plan.items.pull(it._id);
  recalcularEstado(plan);
  await plan.save();
}

// ───────────────────────────── circuito con el coordinador ─────────────────────────────

const linkDelPlan = (plan: IPlanVacaciones) => `/projects/${plan.projectId}/team?tab=vacaciones&planId=${plan._id}`;

/** Manda al coordinador los bloques editables (todos, o los indicados). Con errores de validación no se envía nada. */
export async function enviarPlan(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, actorId: string, itemIds?: string[]): Promise<{ enviados: number }> {
  if (plan.estado === "cancelado") throw new ErrorPlan("El plan está cancelado.", 409);
  const project: any = await Project.findOne({ _id: plan.projectId, tenantId: tenantObjectId }).select("name vacationConfig").lean();
  const avisos = await avisosDelPlan(tenantObjectId, plan, project);
  if (hayErrores(avisos)) throw new ErrorPlan("El plan tiene errores que hay que resolver antes de enviarlo.", 422, avisos.filter((a) => a.nivel === "error"));
  const quiero = itemIds && itemIds.length > 0 ? new Set(itemIds.map(String)) : null;
  const aEnviar = (plan.items as any[]).filter((i) => esEditable(i.estado) && i.dias > 0 && (!quiero || quiero.has(String(i._id))));
  if (aEnviar.length === 0) throw new ErrorPlan("No hay bloques propuestos para enviar.");
  const ahora = new Date();
  for (const i of aEnviar) {
    i.estado = "enviado";
    i.enviadoAt = ahora;
    i.motivoRechazo = undefined;
  }
  plan.enviadoPor = oid(actorId);
  plan.enviadoAt = ahora;
  recalcularEstado(plan);
  await plan.save();
  const personas = new Set(aEnviar.map((i) => String(i.userId))).size;
  await notificar({
    tenantId: tenantObjectId,
    destinatarios: await responsablesDeProyectos(tenantObjectId, [plan.projectId]),
    type: NOVEDAD_PLAN_VACACIONES_ENVIADO,
    title: "Plan de vacaciones para aprobar",
    message: `${project?.name || "Proyecto"} · «${plan.nombre}»: ${aEnviar.length} bloque(s) de ${personas} persona(s) esperan tu aprobación.`,
    linkUrl: linkDelPlan(plan),
    refId: plan._id as Types.ObjectId,
    excepto: actorId,
  });
  return { enviados: aEnviar.length };
}

/**
 * APROBAR UN BLOQUE (el coordinador): se vuelve a mirar la verdad en ese momento —persona activa con
 * contrato vigente en el proyecto, saldo, sin pisarse con una vacación existente, reglas de
 * solapamiento contando los demás bloques enviados del plan— y recién ahí se crea la `Vacation`
 * (`pending`) y se pre-aprueba con su PDF. El bloque guarda `vacationId`.
 */
export async function aprobarItem(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, itemId: string, actorId: string): Promise<{ vacationId: string }> {
  const it: any = itemDe(plan, itemId);
  if (it.estado !== "enviado") throw new ErrorPlan(it.estado === "aprobado" ? "Ese bloque ya está aprobado." : "Sólo se aprueban bloques enviados al coordinador.", 409);
  const userId = String(it.userId);
  const hoy = hoyArgentina();
  const [user, contratoDe] = await Promise.all([User.findOne({ _id: userId, tenantId: tenantObjectId }).select("firstName lastName metadata.activo").lean() as any, contratosQueRigenDelProyecto(String(plan.projectId), hoy)]);
  if (!user || user.metadata?.activo !== true) throw new ErrorPlan("La persona ya no está activa.", 409);
  const contrato = contratoDe.get(userId);
  if (!contrato || !esContratoVigente(contrato, hoy)) throw new ErrorPlan("La persona ya no tiene un contrato vigente en el proyecto.", 409);
  const [saldo] = await saldosDeVacaciones(tenantId, tenantObjectId, plan.anioDeSaldo, { userIds: [userId] });
  const disponibles = Number((saldo as any)?.display?.available ?? 0);
  if (it.dias > disponibles) throw new ErrorPlan(`${nombreDe(user)} tiene ${disponibles} días disponibles en ${plan.anioDeSaldo} y el bloque pide ${it.dias}.`, 409);

  // Los demás bloques enviados del plan cuentan para las reglas de solapamiento aunque todavía no sean vacaciones.
  const virtuales: VacacionVirtual[] = (plan.items as any[])
    .filter((i) => i.estado === "enviado" && String(i._id) !== String(it._id))
    .map((i) => ({ userId: String(i.userId), startDate: new Date(`${i.desde}T00:00:00.000Z`), endDate: new Date(`${i.hasta}T23:59:59.999Z`) }));
  const choque = await violaSolapamiento(tenantObjectId, userId, new Date(`${it.desde}T00:00:00.000Z`), new Date(`${it.hasta}T23:59:59.999Z`), { vacacionesVirtuales: virtuales });
  if (choque.viola) throw new ErrorPlan(choque.mensaje || "Conflicto de solapamiento.", 409);

  const project: any = await Project.findOne({ _id: plan.projectId }).select("name").lean();
  let vacation;
  try {
    vacation = await crearVacacionParaPersona({
      tenantId: tenantObjectId,
      userId,
      startDate: `${it.desde}T00:00:00.000Z`,
      endDate: `${it.hasta}T00:00:00.000Z`,
      reason: `Plan de vacaciones «${plan.nombre}» · ${project?.name || ""} · ${it.nombreRol}`.trim(),
      origen: "plan",
      planVacacionesId: plan._id as Types.ObjectId,
      projectId: plan.projectId,
      periodoSaldo: plan.anioDeSaldo,
      vacacionesVirtuales: virtuales,
    });
    vacation = await preAprobarVacacion(vacation, actorId, tenantObjectId);
  } catch (e: any) {
    if (e instanceof ErrorVacacion) throw new ErrorPlan(e.message, e.status === 404 ? 404 : 409);
    throw e;
  }
  it.estado = "aprobado";
  it.aprobadoPor = oid(actorId);
  it.aprobadoAt = new Date();
  it.vacationId = vacation._id;
  it.motivoRechazo = undefined;
  recalcularEstado(plan);
  await plan.save();

  // A la persona, como cualquier pre-aprobación; al planificador, el resultado.
  try {
    await Notification.create({ tenantId: tenantObjectId, userId: oid(userId), type: "vacation", title: "Vacaciones planificadas", message: `Tus vacaciones del ${fechaCorta(it.desde)} al ${fechaCorta(it.hasta)} quedaron pre-aprobadas (${project?.name || "proyecto"}).`, linkUrl: "/vacations", refId: vacation._id });
  } catch (e) {
    console.error("[PLAN-VACACIONES] No se pudo avisar a la persona:", e);
  }
  await notificar({ tenantId: tenantObjectId, destinatarios: [plan.creadoPor, plan.enviadoPor], type: NOVEDAD_PLAN_VACACIONES_RESUELTO, title: "Bloque de vacaciones aprobado", message: `${nombreDe(user)} · ${fechaCorta(it.desde)}–${fechaCorta(it.hasta)} · «${plan.nombre}»`, linkUrl: linkDelPlan(plan), refId: plan._id as Types.ObjectId, excepto: actorId });
  return { vacationId: String(vacation._id) };
}

export async function rechazarItem(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, itemId: string, actorId: string, motivo: unknown): Promise<void> {
  const it: any = itemDe(plan, itemId);
  if (it.estado !== "enviado") throw new ErrorPlan("Sólo se rechazan bloques enviados al coordinador.", 409);
  const texto = String(motivo || "").trim();
  if (!texto) throw new ErrorPlan("Decí por qué lo rechazás: el planificador lo necesita para re-armarlo.");
  it.estado = "rechazado";
  it.motivoRechazo = texto;
  it.rechazadoPor = oid(actorId);
  it.rechazadoAt = new Date();
  recalcularEstado(plan);
  await plan.save();
  const m = miembroDe(plan, String(it.userId));
  await notificar({ tenantId: tenantObjectId, destinatarios: [plan.creadoPor, plan.enviadoPor], type: NOVEDAD_PLAN_VACACIONES_RESUELTO, title: "Bloque de vacaciones rechazado", message: `${m?.nombre || "Persona"} · ${fechaCorta(it.desde)}–${fechaCorta(it.hasta)} · «${plan.nombre}»: ${texto}`, linkUrl: linkDelPlan(plan), refId: plan._id as Types.ObjectId, excepto: actorId });
}

/** Aprueba todos los enviados, uno por uno (los PDF y la numeración son efectos externos: no hay transacción). Un fallo no frena a los demás. */
export async function aprobarTodo(tenantObjectId: Types.ObjectId, tenantId: string, plan: IPlanVacaciones, actorId: string): Promise<{ aprobados: number; fallidos: Array<{ itemId: string; nombre: string; motivo: string }> }> {
  const ids = (plan.items as any[]).filter((i) => i.estado === "enviado").map((i) => String(i._id));
  let aprobados = 0;
  const fallidos: Array<{ itemId: string; nombre: string; motivo: string }> = [];
  for (const id of ids) {
    try {
      await aprobarItem(tenantObjectId, tenantId, plan, id, actorId);
      aprobados++;
    } catch (e: any) {
      const it: any = (plan.items as any).id(id);
      fallidos.push({ itemId: id, nombre: miembroDe(plan, String(it?.userId))?.nombre || "", motivo: e?.message || String(e) });
    }
  }
  return { aprobados, fallidos };
}

/**
 * CANCELAR UN BLOQUE. Si ya era una vacación, se cancela también —mientras no esté entregada ni
 * firmada— y se restituye el saldo. Con `reabrir` el bloque vuelve a `propuesto` (para re-armarlo);
 * si no, queda `cancelado`.
 */
export async function cancelarItem(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, itemId: string, body: any): Promise<void> {
  const it: any = itemDe(plan, itemId);
  if (it.estado === "cancelado") return;
  if (it.estado === "aprobado" && it.vacationId) {
    const vac: any = await Vacation.findOne({ _id: it.vacationId, tenantId: tenantObjectId });
    if (vac) {
      if (vac.status === "delivered" || vac.signatureStatus === "signed") throw new ErrorPlan("Esa vacación ya está firmada o entregada: no se cancela desde el plan.", 409);
      if (!["rejected", "cancelled"].includes(vac.status)) {
        vac.status = "cancelled";
        vac.cancelledAt = new Date();
        if (body?.motivo) vac.managerComment = String(body.motivo);
        await vac.save();
        await adjustBalanceOnRequestChange(tenantObjectId, vac.userId, vac.periodoSaldo ?? new Date(vac.startDate).getFullYear(), vac.daysRequested, "cancel");
      }
    }
  }
  if (body?.reabrir) {
    it.estado = "propuesto";
    it.vacationId = undefined;
    it.aprobadoPor = undefined;
    it.aprobadoAt = undefined;
  } else {
    it.estado = "cancelado";
    it.canceladoAt = new Date();
  }
  recalcularEstado(plan);
  await plan.save();
}
