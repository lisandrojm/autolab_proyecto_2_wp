import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import { Info } from "../models/Info.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { plantillaDelContrato } from "../compartido/plantillaDelContrato.js";
// El `populate("clientId")` necesita el modelo registrado; no se depende de que otro archivo lo haya cargado.
import "../models/Client.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion, contratoEnLasFechas, mensajeSoloServicios, superposiciones } from "../utils/superposicionContratos.js";

/*
  SUPERPOSICIÓN DE UN ALTA CON LO QUE LA PERSONA YA TIENE: la parte que toca la base.

  Junta todos sus contratos (en cualquier proyecto) y sus otras solicitudes pendientes, y se los pasa a
  la regla pura (`utils/superposicionContratos.ts`). La usan el formulario individual (para avisar
  mientras se carga), el alta de la solicitud (que guarda la foto de los avisos para quien aprueba) y el
  alta masiva de plantillas de equipo.
*/

const idsDeTurno = (asignaciones: any[] | undefined, suelto?: any): string[] => {
  const ids = (asignaciones || []).flatMap((a: any) => (a?.shiftIds || []).map(String));
  if (suelto) ids.push(String(suelto));
  return [...new Set(ids.filter(Boolean))];
};

/** "10:00 - 18:00" → { inTime, outTime }. */
const partirHorario = (schedule?: string): { inTime: string; outTime: string } => {
  const [inTime = "", outTime = ""] = String(schedule || "").split("-").map((s) => s.trim());
  return { inTime, outTime };
};

/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export function pedidoDesdeSolicitud(m: any): PedidoDeAlta {
  return {
    desde: fechaISO(m?.startDate),
    hasta: fechaISO(m?.dueDate),
    fechas: Array.isArray(m?.fechasTrabajadas) ? m.fechasTrabajadas.map((f: string) => fechaISO(f)).filter(Boolean) : undefined,
    dias: Array.isArray(m?.diasSemana) ? m.diasSemana.map(Number) : [],
    rotativos: !!m?.diasRotativos,
    ...partirHorario(m?.schedule),
    shiftIds: idsDeTurno(m?.areaShiftAssignments),
  };
}

/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export async function compromisosDePersona(tenantId: Types.ObjectId, userId: string, excluirSolicitudId?: string): Promise<CompromisoExistente[]> {
  if (!Types.ObjectId.isValid(userId)) return [];
  const uid = new Types.ObjectId(userId);
  const [asignaciones, pendientes] = await Promise.all([
    UserProject.find({ userId: uid })
      .select("projectId nombre_proyecto contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.dias_semana contracts.dias_rotativos contracts.fechas_trabajadas contracts.hora_inicio contracts.hora_fin contracts.shiftId contracts.areaShiftAssignments contracts.nombre_turno contracts.nombre_contrato contracts.tipo_contrato_id contracts.contrato_id")
      .lean() as Promise<any[]>,
    User.find({
      tenantId,
      "metadata.isSolicitud": true,
      "metadata.solicitudStatus": "pendiente",
      "metadata.solicitudUserId": { $in: [userId, uid] },
      ...(excluirSolicitudId && Types.ObjectId.isValid(excluirSolicitudId) ? { _id: { $ne: new Types.ObjectId(excluirSolicitudId) } } : {}),
    })
      .select("metadata.startDate metadata.dueDate metadata.fechasTrabajadas metadata.diasSemana metadata.diasRotativos metadata.schedule metadata.areaShiftAssignments metadata.projectIds")
      .lean() as Promise<any[]>,
  ]);

  const proyectoIds = [...asignaciones.map((a) => a.projectId), ...pendientes.flatMap((p) => p.metadata?.projectIds || [])].filter((id) => id && Types.ObjectId.isValid(String(id)));
  const proyectos: any[] = proyectoIds.length ? await Project.find({ _id: { $in: proyectoIds } }).select("name clientId").populate("clientId", "name").lean() : [];
  const nombreDe = new Map(proyectos.map((p) => [String(p._id), p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name]));

  /*
    CONTRATOS SIN DÍAS PERO CON TURNO: se usan los días del turno. Casi todos los contratos que vienen de
    FRAME no traen días de la semana (FRAME no los manda); los que tienen turno asignado igual dicen qué
    días trabaja la persona. Sin días ni turno, la regla lo trata como «podría pisarse» y lo dice.
  */
  const turnosSinDias = [
    ...new Set(
      asignaciones.flatMap((a) => (a.contracts || []).filter((c: any) => !(Array.isArray(c.dias_semana) && c.dias_semana.length)).flatMap((c: any) => idsDeTurno(c.areaShiftAssignments, c.shiftId))),
    ),
  ].filter((id) => Types.ObjectId.isValid(id));
  const turnos: any[] = turnosSinDias.length ? await Shift.find({ _id: { $in: turnosSinDias } }).select("days").lean() : [];
  const diasDelTurno = new Map(turnos.map((t) => [String(t._id), (t.days || []).map(Number)]));
  const diasDe = (c: any): number[] => {
    if (Array.isArray(c.dias_semana) && c.dias_semana.length) return c.dias_semana.map(Number);
    return [...new Set(idsDeTurno(c.areaShiftAssignments, c.shiftId).flatMap((id) => diasDelTurno.get(id) || []))].sort() as number[];
  };

  const compromisos: CompromisoExistente[] = [];
  for (const a of asignaciones) {
    for (const c of a.contracts || []) {
      const desde = fechaISO(c.fecha_alta_contrato);
      if (!desde) continue;
      compromisos.push({
        origen: "contrato",
        proyectoNombre: nombreDe.get(String(a.projectId)) || a.nombre_proyecto || "",
        desde,
        hasta: fechaISO(c.fecha_baja_contrato),
        // Por días sueltos: los días exactos, no todos los de la semana que caen en el período.
        fechas: Array.isArray(c.fechas_trabajadas) && c.fechas_trabajadas.length ? c.fechas_trabajadas.map((f: string) => fechaISO(f)).filter(Boolean) : undefined,
        dias: diasDe(c),
        rotativos: !!c.dias_rotativos,
        inTime: c.hora_inicio || "",
        outTime: c.hora_fin || "",
        shiftIds: idsDeTurno(c.areaShiftAssignments, c.shiftId),
        turnoNombre: c.nombre_turno || "",
        tipo: { nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id, contrato_id: c.contrato_id },
      });
    }
  }
  for (const p of pendientes) {
    const pedido = pedidoDesdeSolicitud(p.metadata);
    if (!pedido.desde && !pedido.fechas?.length) continue;
    compromisos.push({ origen: "solicitud", proyectoNombre: nombreDe.get(String(p.metadata?.projectIds?.[0])) || "", ...pedido });
  }
  return compromisos;
}

/**
 * Lee el trámite de un contrato: tipo → plantilla → el estado impositivo que la reclama, el mismo camino
 * que el tag de las pantallas (`estadoImpositivoDelContrato`). No se usa el estado del contrato: avanza por
 * el circuito y deja de decir el trámite. Sin plantilla o sin estado que la reclame, `null`: no se adivina.
 */
async function lectorDeTramites(): Promise<(tipo: CompromisoExistente["tipo"]) => string | null> {
  const [plantillas, estados]: [any[], any[]] = await Promise.all([
    ContratoFrame.find().select("name data.id data.nombre contratoId contratoIds").lean(),
    Info.find({ type: "estado-empleado", "data.esImpositivo": true }).select("data.tipoImpositivo data.contratoFrameIds").lean(),
  ]);
  return (tipo) => {
    if (!tipo) return null;
    const id = tipo.contrato_id ? String(tipo.contrato_id) : "";
    const plantilla = plantillaDelContrato(tipo as any, plantillas) || (id ? plantillas.find((p) => [p.contratoId, ...(p.contratoIds || [])].some((c) => String(c) === id)) : null);
    if (!plantilla) return null;
    const estado = estados.find((e) => (e.data?.contratoFrameIds || []).some((f: any) => String(f) === String(plantilla._id)));
    return estado?.data?.tipoImpositivo || null;
  };
}

/** El contrato DE ARCA que la persona ya tiene en esas fechas, si tiene. Uno de Servicios no traba nada. */
export async function contratoDePersonaEnFechas(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<CompromisoExistente | null> {
  if (!userId) return null;
  const enFechas = (await compromisosDePersona(tenantId, userId)).filter((c) => contratoEnLasFechas(pedido, [c]));
  if (enFechas.length === 0) return null;
  const tramiteDe = await lectorDeTramites();
  return enFechas.find((c) => tramiteDe(c.tipo) === "alta_temprana_afip") || null;
}

/** Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de Servicios. */
export async function rechazoAltaArcaConContrato(tenantId: Types.ObjectId, userId: string | undefined, tramite: unknown, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<string | null> {
  if (tramite !== "alta_temprana_afip") return null;
  const contrato = await contratoDePersonaEnFechas(tenantId, userId, pedido);
  return contrato ? mensajeSoloServicios(contrato) : null;
}

/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export async function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string): Promise<Superposicion[]> {
  if (!userId) return [];
  return superposiciones(pedido, await compromisosDePersona(tenantId, userId, excluirSolicitudId), hoyArgentina());
}
