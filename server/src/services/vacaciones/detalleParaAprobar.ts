import { Types } from "mongoose";
import { Vacation } from "../../models/Vacation.js";
import { User } from "../../models/User.js";
import { UserProfile } from "../../models/UserProfile.js";
import { Project } from "../../models/Project.js";
import UserProject from "../../models/UserProject.js";
import { Area } from "../../models/Area.js";
import { Shift } from "../../models/Shift.js";
import { RoleFrame } from "../../models/RoleFrame.js";
import { CampaniaVacaciones } from "../../models/CampaniaVacaciones.js";
import { clavesDelMiembro, idDe, sedePrincipalDe } from "../../compartido/areaTurno.js";
import { etapaDe } from "../../compartido/vacaciones/etapaDeAprobacion.js";
import { esContratoVigente, fechaISO, getContratoActivo, hoyArgentina } from "../../utils/contratoVigencia.js";
import { filaSegunContratos } from "../equipoSegunContratos.js";
import { nombreDePersona } from "../novedadesNotificaciones.js";
import { ErrorVacacion } from "./crearVacacion.js";
import { saldosDeVacaciones } from "./saldos.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL DETALLE DE UNA SOLICITUD PARA QUIEN LA APRUEBA (16/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Lo que abre la tarjeta de «Aprobaciones» en la app: todo lo que ayuda a decidir.
 *   · La solicitud: fechas, días (corridos o hábiles), de dónde vino (pedido, plan, campaña), en qué paso está.
 *   · La persona: rol empresa, antigüedad y saldo del año (la misma cuenta que «Gestión por Usuario»).
 *   · Por cada proyecto donde quien mira aprueba: el contrato que rige (tipo, categoría, alta, horario,
 *     días), su área y turno (los de sus contratos vigentes, como la cadena de aprobación) y quiénes
 *     del mismo proyecto están de vacaciones en esas fechas, marcando a los de su misma área y turno.
 *   · Sus otras vacaciones del año.
 *
 * Sin sueldos: lo ven también los supervisores (ver `routes/contratoMiembro.ts`, que es sólo del coordinador).
 * Lo ve quien está en la cadena de la solicitud (supervisor o coordinador de alguno de sus proyectos) o un admin.
 */

const EN_JUEGO = ["pending", "pre_approved", "approved", "delivered"];
const isoDia = (d: Date | string | undefined | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const oid = (x: unknown) => new Types.ObjectId(String(x));

export async function detalleParaAprobar(o: { tenantId: any; tenantObjectId: Types.ObjectId; vacationId: string; userId: string; esAdmin: boolean }) {
  if (!Types.ObjectId.isValid(o.vacationId)) throw new ErrorVacacion("Solicitud inválida.", 400);
  const v: any = await Vacation.findOne({ _id: o.vacationId, tenantId: o.tenantObjectId }).lean();
  if (!v) throw new ErrorVacacion("Solicitud no encontrada.", 404);

  const cadena: any[] = v.cadena?.proyectos || [];
  const estoyEn = (p: any) => [...(p.supervisores || []), ...(p.coordinadores || [])].some((u: any) => String(u) === o.userId);
  const misProyectos = o.esAdmin ? cadena : cadena.filter(estoyEn);
  if (!o.esAdmin && misProyectos.length === 0) throw new ErrorVacacion("No sos parte de la aprobación de esta solicitud.", 403);

  const hoy = hoyArgentina();
  const persona = String(v.userId);
  const desde = isoDia(v.startDate);
  const hasta = isoDia(v.endDate);
  const anio = Number(desde.slice(0, 4)) || Number(hoy.slice(0, 4));
  const idsProyecto = misProyectos.map((p) => oid(p.projectId));

  // Quiénes más del proyecto están de vacaciones en esas fechas (cualquier estado en juego).
  const solapadas: any[] = await Vacation.find({ tenantId: o.tenantObjectId, status: { $in: EN_JUEGO }, userId: { $ne: oid(persona) }, startDate: { $lte: v.endDate }, endDate: { $gte: v.startDate } })
    .select("userId userName startDate endDate daysRequested status")
    .lean();
  const idsSolapadas = [...new Set(solapadas.map((s) => String(s.userId)))];

  const [usuario, perfil, proyectos, asignaciones, asignacionesOtros, otrasDelAnio, campania, saldos]: any[] = await Promise.all([
    User.findById(persona).select("firstName lastName email metadata.fullName metadata.cuit").lean(),
    UserProfile.findOne({ tenantId: o.tenantObjectId, userId: oid(persona) }).select("profilePhotoUrl").lean(),
    idsProyecto.length ? Project.find({ _id: { $in: idsProyecto }, tenantId: o.tenantObjectId }).select("name teamConfig areasConfig metadata.sedeIds metadata.sedeId").lean() : [],
    idsProyecto.length ? UserProject.find({ projectId: { $in: idsProyecto }, userId: oid(persona) }).select("projectId contracts").lean() : [],
    idsProyecto.length && idsSolapadas.length ? UserProject.find({ projectId: { $in: idsProyecto }, userId: { $in: idsSolapadas.map(oid) } }).select("projectId userId contracts").lean() : [],
    Vacation.find({ tenantId: o.tenantObjectId, userId: oid(persona), _id: { $ne: v._id }, startDate: { $gte: new Date(`${anio}-01-01T00:00:00.000Z`), $lt: new Date(`${anio + 1}-01-01T00:00:00.000Z`) } })
      .select("vacationNumber startDate endDate daysRequested status origen")
      .sort({ startDate: 1 })
      .lean(),
    v.campaniaId ? CampaniaVacaciones.findById(v.campaniaId).select("nombre ventanaDesde ventanaHasta").lean() : null,
    saldosDeVacaciones(o.tenantId, o.tenantObjectId, anio, { userIds: [persona] }).catch((e) => {
      console.error("[APROBACIONES] saldo:", e?.message || e);
      return [];
    }),
  ]);
  const saldo = (saldos as any[])[0];

  // Los nombres que hacen falta, de una sola vez: aprobadores, personas que se superponen, áreas, turnos y roles.
  const filaDe = (p: any, uid: string, contratos: any[]) => filaSegunContratos(((p.teamConfig || []) as any[]).find((f) => String(f?.userId) === uid) || { userId: uid }, contratos, hoy);
  const contratosDe = (lista: any[], projectId: string, uid: string) => (lista.find((a) => String(a.projectId) === projectId && String(a.userId ?? persona) === uid)?.contracts || []) as any[];

  const idsPersonas = new Set<string>([...idsSolapadas]);
  for (const p of misProyectos) for (const u of [...(p.supervisores || []), ...(p.coordinadores || [])]) idsPersonas.add(String(u));
  for (const nivel of ["supervisor", "coordinador"]) if (v.aprobaciones?.[nivel]?.userId) idsPersonas.add(String(v.aprobaciones[nivel].userId));
  const idsArea = new Set<string>();
  const idsTurno = new Set<string>();
  const rolesFrame = new Set<number>();
  for (const p of proyectos) {
    const contratos = contratosDe(asignaciones, String(p._id), persona);
    for (const a of filaDe(p, persona, contratos)?.areaShiftAssignments || []) {
      if (a?.areaId) idsArea.add(idDe(a.areaId));
      for (const s of a?.shiftIds || []) idsTurno.add(idDe(s));
    }
    const c: any = getContratoActivo(contratos, hoy);
    if (c && !c.nombre_rol_frame && Number(c.rol_frame_id) > 0) rolesFrame.add(Number(c.rol_frame_id));
  }
  const valido = (ids: Set<string>) => [...ids].filter((x) => Types.ObjectId.isValid(x)).map(oid);
  const [personas, areas, turnos, roles]: any[][] = await Promise.all([
    idsPersonas.size ? User.find({ _id: { $in: valido(idsPersonas) } }).select("firstName lastName metadata.fullName").lean() : [],
    idsArea.size ? Area.find({ _id: { $in: valido(idsArea) } }).select("name").lean() : [],
    idsTurno.size ? Shift.find({ _id: { $in: valido(idsTurno) } }).select("name").lean() : [],
    rolesFrame.size ? RoleFrame.find({ "data.rol.id": { $in: [...rolesFrame] } }).select("name data.rol.id").lean() : [],
  ]);
  const nombre = new Map(personas.map((p) => [String(p._id), nombreDePersona(p)]));
  const areaDe = new Map(areas.map((a) => [String(a._id), String(a.name || "")]));
  const turnoDe = new Map(turnos.map((s) => [String(s._id), String(s.name || "")]));
  const rolDe = new Map(roles.map((r) => [Number(r?.data?.rol?.id), String(r.name || "")]));
  const proyectoPorId = new Map<string, any>(proyectos.map((p) => [String(p._id), p]));

  const detalleProyectos = misProyectos
    .map((pc) => {
      const p = proyectoPorId.get(String(pc.projectId));
      if (!p) return null;
      const id = String(p._id);
      const contratos = contratosDe(asignaciones, id, persona);
      const c: any = getContratoActivo(contratos, hoy);
      const ctx = { areasConfig: p.areasConfig || [], sedePrincipal: sedePrincipalDe(p.metadata) };
      const fila = filaDe(p, persona, contratos);
      const misClaves = clavesDelMiembro(fila?.areaShiftAssignments, ctx);
      // Del mismo proyecto y con contrato vigente hoy; marcando si comparten área y turno.
      const enElProyecto = solapadas
        .map((s) => {
          const suyos = contratosDe(asignacionesOtros, id, String(s.userId));
          if (!suyos.some((x) => esContratoVigente(x, hoy))) return null;
          const claves = clavesDelMiembro(filaDe(p, String(s.userId), suyos)?.areaShiftAssignments, ctx);
          return {
            nombre: nombre.get(String(s.userId)) || s.userName || "",
            desde: isoDia(s.startDate),
            hasta: isoDia(s.endDate),
            dias: s.daysRequested,
            status: s.status,
            mismaAreaTurno: [...claves].some((k) => misClaves.has(k)),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Number(b.mismaAreaTurno) - Number(a.mismaAreaTurno) || a.desde.localeCompare(b.desde));
      return {
        projectId: id,
        nombre: String(p.name || ""),
        rolEmpresa: c ? c.nombre_rol_frame || rolDe.get(Number(c.rol_frame_id)) || "" : "",
        contrato: c
          ? {
              tipo: c.nombre_contrato || "",
              categoria: c.nombre_categoria_sat || "",
              empresa: c.nombre_empresa_contrato || "",
              alta: fechaISO(c.fecha_alta_contrato),
              baja: fechaISO(c.fecha_baja_contrato),
              horario: c.hora_inicio && c.hora_fin ? `${c.hora_inicio} a ${c.hora_fin}` : "",
              diasSemana: Array.isArray(c.dias_semana) ? c.dias_semana : [],
              diasPorSemana: c.dias_por_semana ?? null,
              sede: c.nombre_sede || "",
            }
          : null,
        areasTurnos: ((fila?.areaShiftAssignments || []) as any[])
          .filter((a) => a?.areaId)
          .map((a) => ({ area: areaDe.get(idDe(a.areaId)) || "Área", turnos: ((a.shiftIds || []) as any[]).map((s) => turnoDe.get(idDe(s)) || "").filter(Boolean) })),
        supervisores: (pc.supervisores || []).map((u: any) => nombre.get(String(u)) || "").filter(Boolean),
        coordinadores: (pc.coordinadores || []).map((u: any) => nombre.get(String(u)) || "").filter(Boolean),
        soyAprobador: estoyEn(pc),
        superposiciones: enElProyecto,
      };
    })
    .filter(Boolean);

  const aprobacion = (nivel: "supervisor" | "coordinador") => (v.aprobaciones?.[nivel]?.userId ? { nombre: nombre.get(String(v.aprobaciones[nivel].userId)) || "", at: v.aprobaciones[nivel].at || null } : null);

  return {
    solicitud: {
      _id: String(v._id),
      vacationNumber: v.vacationNumber,
      desde,
      hasta,
      dias: v.daysRequested,
      diasCorridos: v.rules?.diasCorridos ?? null,
      motivo: v.reason || "",
      creadaAt: v.createdAt,
      status: v.status,
      etapa: etapaDe(v),
      origen: v.origen || "solicitud",
      campania: campania ? { nombre: campania.nombre, ventanaDesde: campania.ventanaDesde, ventanaHasta: campania.ventanaHasta } : null,
      asignadaPorEmpresa: !!v.asignadaPorEmpresa,
      aprobaciones: { supervisor: aprobacion("supervisor"), coordinador: aprobacion("coordinador") },
      recordatorios: (v.recordatorios || []).length,
    },
    persona: {
      _id: persona,
      nombre: nombreDePersona(usuario) || v.userName || "",
      email: usuario?.email || "",
      cuil: usuario?.metadata?.cuit || "",
      foto: perfil?.profilePhotoUrl || "",
      rolEmpresa: saldo?.rolEmpresa && saldo.rolEmpresa !== "Sin rol empresa" ? saldo.rolEmpresa : "",
      antiguedad: saldo?.seniority || "",
      empresaComputo: saldo?.antiguedad?.empresaComputo?.nombre || "",
      saldo: saldo ? { anio, total: saldo.display.totalAnnual, gozados: saldo.display.taken, pendientes: saldo.display.pending, disponibles: saldo.display.available } : null,
    },
    proyectos: detalleProyectos,
    otrasDelAnio: (otrasDelAnio as any[]).map((x) => ({ vacationNumber: x.vacationNumber, desde: isoDia(x.startDate), hasta: isoDia(x.endDate), dias: x.daysRequested, status: x.status, origen: x.origen || "solicitud" })),
  };
}

export type DetalleParaAprobar = Awaited<ReturnType<typeof detalleParaAprobar>>;