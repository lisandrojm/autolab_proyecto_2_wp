import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";

/** Con cuánta anticipación aparece un contrato: una semana antes de su fecha de baja. */
export const DIAS_DE_AVISO = 7;

/*
  CONTRATOS POR VENCER: QUÉ ENTRA Y QUIÉN LO VE.

  Es la pestaña «Por vencer» de Contratación en el móvil: una semana antes de que termine un contrato,
  quien tiene a esa persona a cargo decide si lo RENUEVA (sale una solicitud de contratación con la
  etiqueta «Renovación») o lo DEJA VENCER.

  QUÉ CONTRATO ENTRA:
   - Ya empezó y termina entre hoy y dentro de 7 días.
   - Dura MÁS de una semana. Hay muchísimos contratos de un solo día (alta = baja): avisar de todos
     llenaría la lista de cosas que nadie piensa renovar.
   - No fue renovado ya: si la misma asignación tiene otro contrato que arranca después de esta baja,
     la continuidad ya está resuelta.
   - Nadie lo resolvió (`RenovacionContrato`). Una renovación pedida y después RECHAZADA o CANCELADA no
     cuenta como resuelta: el contrato vuelve, marcado, porque sigue sin renovarse.

  QUIÉN LO VE:
   - El SUPERVISOR del proyecto (responsable): todos los contratos del proyecto.
   - El COORDINADOR: sólo los de las áreas y turnos que coordina.
*/

export interface ContratoPorVencer {
  userProjectId: string;
  userId: string;
  nombre: string;
  projectId: string;
  proyectoNombre: string;
  clienteNombre: string;
  areaNombre: string;
  turnoNombre: string;
  rolFrame: string;
  contrato: string;
  horario: string;
  fechaAlta: string;
  fechaBaja: string;
  diasRestantes: number;
  motivo: "supervisa" | "coordina";
  renovacionRechazada: boolean;
  plantilla: { firstName: string; lastName: string; metadata: Record<string, any> };
}

// Fechas "YYYY-MM-DD" como días calendario: al mediodía UTC, para que ningún huso corra el día.
const sumarDias = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desde: string, hasta: string): number => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
const idDe = (x: any): string => (x && typeof x === "object" ? String(x._id ?? "") : x ? String(x) : "");

/** Las combinaciones área/turno de un contrato, como "areaId::shiftId". */
const combosDeContrato = (c: any): { areaId: string; shiftIds: string[] }[] => {
  const desdeAsignaciones = (c.areaShiftAssignments || [])
    .map((a: any) => ({ areaId: idDe(a.areaId), shiftIds: (a.shiftIds || []).map(idDe).filter(Boolean) }))
    .filter((a: any) => a.areaId && a.shiftIds.length > 0);
  if (desdeAsignaciones.length > 0) return desdeAsignaciones;
  return idDe(c.areaId) && idDe(c.shiftId) ? [{ areaId: idDe(c.areaId), shiftIds: [idDe(c.shiftId)] }] : [];
};

// Lo que se lee de cada contrato. Los contratos cargan documentación y firmas: traerlos enteros pesa.
const CAMPOS_CONTRATO = ["fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "nombre_rol_frame", "rol_frame_id", "nombre_area", "nombre_turno", "areaId", "shiftId", "areaShiftAssignments", "hora_inicio", "hora_fin", "sueldo_jornada", "dias_por_semana", "dias_semana", "dias_rotativos", "empresaContratoId"];

export async function listarContratosPorVencer(tenantId: Types.ObjectId | string, userId: string, hoy: string = hoyArgentina()): Promise<ContratoPorVencer[]> {
  const tenant = new Types.ObjectId(String(tenantId));
  const yo = new Types.ObjectId(String(userId));

  // 1. De qué proyectos: los que supervisa (enteros) y los que coordina (sus áreas/turnos).
  const { proyectos: supervisados } = await alcanceDeResponsable(tenant, String(userId));
  const supervisa = new Set(supervisados.map(String));
  const conCoordinacion: any[] = await Project.find({ tenantId: tenant, "coordinatorAssignments.userId": yo }).select("_id coordinatorAssignments").lean();
  const coordina = new Map<string, Set<string>>();
  for (const p of conCoordinacion) {
    const combos = new Set<string>();
    for (const a of p.coordinatorAssignments || []) if (String(a.userId) === String(userId)) combos.add(`${a.areaId}::${a.shiftId}`);
    coordina.set(String(p._id), combos);
  }
  const projectIds = [...new Set([...supervisa, ...coordina.keys()])];
  if (projectIds.length === 0) return [];

  // 2. Los contratos que entran. Las fechas son texto y en más de un formato: el filtro fino va acá.
  const limite = sumarDias(hoy, DIAS_DE_AVISO);
  const seleccion = ["projectId", "userId", ...CAMPOS_CONTRATO.map((c) => `contracts.${c}`)].join(" ");
  const asignaciones: any[] = await UserProject.find({ projectId: { $in: projectIds.map((id) => new Types.ObjectId(id)) }, "contracts.fecha_baja_contrato": { $nin: [null, ""] } })
    .select(seleccion)
    .lean();

  const candidatos: { up: any; c: any; alta: string; baja: string; pid: string }[] = [];
  for (const up of asignaciones) {
    const contratos: any[] = up.contracts || [];
    const pid = String(up.projectId);
    for (const c of contratos) {
      const alta = fechaISO(c.fecha_alta_contrato);
      const baja = fechaISO(c.fecha_baja_contrato);
      // Sin alta no se sabe cuánto dura; sin baja es por tiempo indeterminado y no vence.
      if (!alta || !baja) continue;
      if (alta > hoy || baja < hoy || baja > limite) continue;
      if (diasEntre(alta, baja) + 1 <= DIAS_DE_AVISO) continue;
      if (contratos.some((o) => o !== c && fechaISO(o.fecha_alta_contrato) > baja)) continue;
      if (!supervisa.has(pid)) {
        const mios = coordina.get(pid);
        const suyos = combosDeContrato(c).flatMap((a) => a.shiftIds.map((s) => `${a.areaId}::${s}`));
        if (!mios || !suyos.some((k) => mios.has(k))) continue;
      }
      candidatos.push({ up, c, alta, baja, pid });
    }
  }
  if (candidatos.length === 0) return [];

  // 3. Lo ya resuelto. Una renovación rechazada o cancelada (o borrada) no resuelve nada.
  const decisiones: any[] = await RenovacionContrato.find({ tenantId: tenant, userProjectId: { $in: candidatos.map((x) => x.up._id) } }).lean();
  const decisionDe = new Map(decisiones.map((d) => [`${d.userProjectId}::${d.fechaBajaContrato}`, d]));
  const solicitudIds = decisiones.filter((d) => d.decision === "renovar" && d.solicitudId).map((d) => d.solicitudId);
  const solicitudes: any[] = solicitudIds.length > 0 ? await User.find({ _id: { $in: solicitudIds } }).select("metadata.solicitudStatus").lean() : [];
  const estadoDe = new Map(solicitudes.map((u) => [String(u._id), u.metadata?.solicitudStatus]));

  const pendientes = candidatos
    .map((x) => {
      const d = decisionDe.get(`${x.up._id}::${x.baja}`);
      if (!d) return { ...x, renovacionRechazada: false };
      if (d.decision === "dejar_vencer") return null;
      const estado = estadoDe.get(String(d.solicitudId));
      return estado === "pendiente" || estado === "aprobada" ? null : { ...x, renovacionRechazada: true };
    })
    .filter(Boolean) as (typeof candidatos[number] & { renovacionRechazada: boolean })[];
  if (pendientes.length === 0) return [];

  // 4. Los nombres.
  const combos = pendientes.map((x) => combosDeContrato(x.c)[0]);
  const [personas, proyectos, areas, turnos, roles] = await Promise.all([
    User.find({ _id: { $in: pendientes.map((x) => x.up.userId) } }).select("firstName lastName metadata.fullName metadata.roles_frame").lean(),
    Project.find({ _id: { $in: pendientes.map((x) => x.up.projectId) } }).select("name clientId").populate("clientId", "name").lean(),
    Area.find({ _id: { $in: combos.filter(Boolean).map((a) => a!.areaId) } }).select("name").lean(),
    Shift.find({ _id: { $in: combos.filter(Boolean).map((a) => a!.shiftIds[0]) } }).select("name").lean(),
    RoleFrame.find({ "data.rol.id": { $in: pendientes.map((x) => Number(x.c.rol_frame_id)).filter((n) => Number.isFinite(n) && n > 0) } }).select("name data.rol.id").lean(),
  ]);
  const personaDe = new Map((personas as any[]).map((u) => [String(u._id), u]));
  const proyectoDe = new Map((proyectos as any[]).map((p) => [String(p._id), p]));
  const areaDe = new Map((areas as any[]).map((a) => [String(a._id), a.name]));
  const turnoDe = new Map((turnos as any[]).map((s) => [String(s._id), s.name]));
  const rolDe = new Map((roles as any[]).map((r) => [Number(r.data?.rol?.id), r]));

  return pendientes
    .map((x, i) => {
      const { up, c, alta, baja, pid } = x;
      const persona: any = personaDe.get(String(up.userId)) || {};
      const proyecto: any = proyectoDe.get(pid) || {};
      const nombre = persona.metadata?.fullName || `${persona.firstName || ""} ${persona.lastName || ""}`.trim() || "Sin nombre";
      const combo = combos[i];
      const rol: any = rolDe.get(Number(c.rol_frame_id));
      const horario = c.hora_inicio && c.hora_fin ? `${c.hora_inicio} - ${c.hora_fin}` : "";
      // La renovación arranca al día siguiente de la baja y dura lo mismo. Son sólo la precarga: se editan.
      const inicio = sumarDias(baja, 1);
      const rolesDeLaPersona = (persona.metadata?.roles_frame || []).map(String);

      return {
        userProjectId: String(up._id),
        userId: String(up.userId),
        nombre,
        projectId: pid,
        proyectoNombre: proyecto.name || "",
        clienteNombre: proyecto.clientId?.name || "",
        areaNombre: (combo && areaDe.get(combo.areaId)) || c.nombre_area || "",
        turnoNombre: (combo && turnoDe.get(combo.shiftIds[0])) || c.nombre_turno || "",
        rolFrame: c.nombre_rol_frame || rol?.name || "",
        contrato: c.nombre_contrato || "",
        horario,
        fechaAlta: alta,
        fechaBaja: baja,
        diasRestantes: diasEntre(hoy, baja),
        motivo: supervisa.has(pid) ? "supervisa" : "coordina",
        renovacionRechazada: x.renovacionRechazada,
        plantilla: {
          firstName: persona.firstName || "",
          lastName: persona.lastName || "",
          metadata: {
            fullName: nombre,
            projectIds: [pid],
            solicitudUserId: String(up.userId),
            // El rol del contrato si se puede resolver; si no, el primero de la persona.
            roles_frame: rol ? [String(rol._id)] : rolesDeLaPersona.slice(0, 1),
            startDate: inicio,
            dueDate: sumarDias(inicio, diasEntre(alta, baja)),
            diasPorSemana: c.dias_por_semana ?? undefined,
            diasSemana: Array.isArray(c.dias_semana) ? c.dias_semana : [],
            diasRotativos: !!c.dias_rotativos,
            schedule: horario || undefined,
            dailyRate: c.sueldo_jornada || undefined,
            empresaContratoId: c.empresaContratoId ? String(c.empresaContratoId) : undefined,
            areaShiftAssignments: combosDeContrato(c),
          },
        },
      } as ContratoPorVencer;
    })
    .sort((a, b) => a.fechaBaja.localeCompare(b.fechaBaja) || a.nombre.localeCompare(b.nombre));
}
