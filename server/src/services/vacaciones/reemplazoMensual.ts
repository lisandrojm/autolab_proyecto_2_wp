import { Types } from "mongoose";
import { User } from "../../models/User.js";
import { Project } from "../../models/Project.js";
import { Shift } from "../../models/Shift.js";
import { Contrato } from "../../models/Contrato.js";
import { RequestConfig } from "../../models/RequestConfig.js";
import type { IPlanVacaciones, IMiembroDelPlan } from "../../models/PlanVacaciones.js";
import { createUserSchema, normalizarRolesFrame } from "../../validators/usuarioSchemas.js";
import { prepararSolicitudNueva, rolesPorDefecto, efectosDeSolicitudNueva } from "../solicitudes.js";
import { superposicionesDeAlta, pedidoDesdeSolicitud } from "../superposicion.js";
import { NOVEDAD_SOLICITUD_CANCELADA, nombreDePersona, notificar } from "../novedadesNotificaciones.js";
import { resolverCategoriasCompatPorId } from "../../utils/categoriaCompat.js";
import { armarPayloadDeSolicitud, type DatosSolicitud } from "../../compartido/solicitudDeContratacion.js";
import { tramiteSinConvenioNiCategoria } from "../../compartido/tramiteSinEscala.js";
import { semanaDelTipoDeContrato } from "../../compartido/diasDeTrabajo.js";
import { derivarImportes, importePorJornada, jornadasCalculadasDelPedido, jornadasFijadasPorElTipo, mesesEquivalentes, mesesParaImportes, periodoDeCalculo, type Importes } from "../../compartido/jornadas.js";
import { rangoDelMesEnVentana, fechaCorta, nombreDeMes } from "../../compartido/planVacaciones/fechas.js";
import { ErrorPlan, claveDeGrupo } from "./planVacaciones.js";
import { sedeDe, sedeParaGuardar } from "../../compartido/areaTurno.js";

/**
 * EL REEMPLAZO MENSUAL DE UN ROL (pedido del 17/10/2026): en vez de cubrir cada quincena con un
 * jornalero (que sale ~150 % más), se contrata UNA persona por el mes entero para el área, turno y
 * rol cuyos integrantes se van de vacaciones. El plan arma la SOLICITUD DE CONTRATACIÓN por el mismo
 * camino que las plantillas de equipo y el alta individual (`armarPayloadDeSolicitud` →
 * `createUserSchema` → `prepararSolicitudNueva` → `User.create`): llega a Proyecto › Solicitudes como
 * cualquier otra, marcada como reemplazo, y la aprueba quien aprueba siempre.
 *
 * El modelo de la solicitud admite UN `replacedUserId`: va el primero de los cubiertos; los demás
 * quedan en el comentario y en `plan.reemplazos[].cubreA`, que es la verdad completa.
 */

export interface PedidoReemplazo {
  areaId: string;
  shiftId: string;
  /** La sede del grupo (fila área × turno × sede), si la tiene. */
  sedeId?: number | null;
  rolFrameId: string | null;
  nombreRol?: string;
  mes: string;
  /** La persona que cubre el mes. */
  userId: string;
  contratoId: string;
  nombreContrato?: string;
  tipoImpositivo?: string;
  categoriaSatId?: string;
  dailyRate?: number;
  motivoReemplazoId?: string;
  comentarios?: string;
  convenioId?: string;
}

export interface ReemplazoArmado {
  datos: DatosSolicitud;
  cubreA: Array<{ userId: string; nombre: string; desde: string; hasta: string }>;
  avisos: string[];
  resumen: { persona: string; nombreContrato: string; desde: string; hasta: string; jornadas: number; dailyRate: number; importes: Importes; esServicios: boolean; motivo: string | null };
}

const oid = (v: unknown) => new Types.ObjectId(String(v));
const idValido = (v: unknown) => !!v && Types.ObjectId.isValid(String(v));
const vivo = (i: any) => i.estado !== "cancelado" && i.estado !== "rechazado";

export async function armarReemplazoMensual(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, pedido: PedidoReemplazo): Promise<ReemplazoArmado> {
  if (!idValido(pedido?.areaId) || !idValido(pedido?.shiftId)) throw new ErrorPlan("Falta el área o el turno del grupo.");
  if (!/^\d{4}-\d{2}$/.test(String(pedido?.mes || ""))) throw new ErrorPlan("Mes inválido.");
  if (!idValido(pedido?.userId)) throw new ErrorPlan("Elegí a la persona que cubre el mes.");
  if (!idValido(pedido?.contratoId)) throw new ErrorPlan("Elegí el tipo de contrato del reemplazo.");
  const rango = rangoDelMesEnVentana(pedido.mes, plan.ventanaDesde, plan.ventanaHasta);
  if (!rango) throw new ErrorPlan("Ese mes está fuera de la ventana del plan.");
  const sedeDelGrupo = sedeDe(pedido.sedeId);
  const grupo = { areaId: String(pedido.areaId), shiftId: String(pedido.shiftId), ...(sedeDelGrupo ? { sedeId: sedeDelGrupo } : {}), rolFrameId: idValido(pedido.rolFrameId) ? String(pedido.rolFrameId) : null, nombreRol: String(pedido.nombreRol || "") };
  const clave = claveDeGrupo(grupo);
  const equipo = plan.equipo as IMiembroDelPlan[];
  const miembroDe = new Map(equipo.map((m) => [String(m.userId), m]));

  // A quiénes cubre: los bloques vivos de ese grupo en ese mes.
  const bloques = (plan.items as any[]).filter((i) => claveDeGrupo(i) === clave && i.mes === pedido.mes && vivo(i) && i.dias > 0).sort((a, b) => a.desde.localeCompare(b.desde));
  if (bloques.length === 0) throw new ErrorPlan(`No hay bloques de ese rol en ${nombreDeMes(pedido.mes)} para cubrir.`, 404);
  const cubreA = bloques.map((b) => ({ userId: String(b.userId), nombre: miembroDe.get(String(b.userId))?.nombre || "Persona", desde: b.desde, hasta: b.hasta }));
  const primero = miembroDe.get(cubreA[0].userId);
  const nombreRol = bloques[0].nombreRol || grupo.nombreRol;

  const [persona, contrato, shift, project, motivos, primeroUser]: any[] = await Promise.all([
    User.findOne({ _id: pedido.userId, tenantId: tenantObjectId }).select("firstName lastName email metadata.fullName metadata.activo metadata.isSolicitud metadata.id projectIds").lean(),
    Contrato.findById(pedido.contratoId).select("name data").lean(),
    Shift.findById(pedido.shiftId).select("name days startTime endTime").lean(),
    Project.findOne({ _id: plan.projectId, tenantId: tenantObjectId }).select("name metadata.sedeId metadata.sedeIds areasConfig").lean(),
    RequestConfig.find({ tenantId: tenantObjectId, isActive: true }).select("name").lean(),
    User.findById(cubreA[0].userId).select("metadata.id").lean(),
  ]);
  if (!persona) throw new ErrorPlan("La persona elegida no existe.", 404);
  if (persona.metadata?.isSolicitud) throw new ErrorPlan("Esa persona es una solicitud de alta, no una persona registrada.");
  if (persona.metadata?.activo === false) throw new ErrorPlan("La persona elegida está inactiva.");
  if (cubreA.some((c) => c.userId === String(persona._id))) throw new ErrorPlan("La persona que cubre no puede ser una de las que se van de vacaciones.");
  if (!contrato) throw new ErrorPlan("El tipo de contrato elegido ya no existe.", 404);

  const avisos: string[] = [];
  const tipoImpositivo = String(pedido.tipoImpositivo || "");
  const esServicios = tramiteSinConvenioNiCategoria(tipoImpositivo);
  const nombreContrato = String(pedido.nombreContrato || contrato.name || "");
  const data = contrato.data || {};
  if (data.esTiempoIndeterminado) avisos.push("El tipo de contrato elegido es de tiempo indeterminado: el reemplazo se pide igual por el mes, con fecha de baja.");

  // Horario: el del turno; si el turno no lo tiene, el del contrato del primero que se va.
  const inTime = String(shift?.startTime || primero?.horaInicio || "");
  const outTime = String(shift?.endTime || primero?.horaFin || "");
  if (!inTime || !outTime) avisos.push("El turno no tiene horario cargado: la solicitud sale sin horario (completalo al aprobar).");

  // La semana: la del tipo de contrato («6x6» → 6 días) sobre los días del turno; sin dato, lunes a viernes.
  const diasDelTurno: number[] = Array.isArray(shift?.days) && shift.days.length > 0 ? shift.days.map(Number) : [1, 2, 3, 4, 5];
  const semana = semanaDelTipoDeContrato(data.diasPorSemana, diasDelTurno, false);
  const diasSemana = semana?.dias || diasDelTurno;
  const diasPorSemana = semana?.diasPorSemana || diasSemana.length;
  const periodo = periodoDeCalculo(rango.desde, rango.hasta, false);
  const calculadas = jornadasCalculadasDelPedido({ porDiasSueltos: false, fechas: [], rotativos: false, desde: periodo.desde, hasta: periodo.hasta, dias: diasSemana, jornadasDelTipo: data.cantidadJornadas });
  const jornadas = jornadasFijadasPorElTipo(data.cantidadJornadas, false, periodo.desde, periodo.hasta) ?? calculadas ?? 0;

  // Lo que se paga por jornada: lo que diga el pedido; si no, la escala de la categoría.
  const categoriaSatId = esServicios ? "" : idValido(pedido.categoriaSatId) ? String(pedido.categoriaSatId) : "";
  let dailyRate = Number(pedido.dailyRate) > 0 ? Number(pedido.dailyRate) : 0;
  if (!dailyRate && categoriaSatId) {
    const [cat] = await resolverCategoriasCompatPorId([oid(categoriaSatId)]);
    if (cat) dailyRate = importePorJornada({ neto: Number((cat as any).data?.neto) || 0, sueldoBasico: Number((cat as any).data?.sueldoBasico) || 0, sueldoAdicional: Number((cat as any).data?.sueldoAdicional) || 0, presentismo: Number((cat as any).data?.presentismo) || 0, sueldoBruto: Number((cat as any).data?.sueldoBruto) || 0 } as any, Number(data.multiplicadorDiario) > 0 ? Number(data.multiplicadorDiario) : 1, Number(data.cantidadJornadas) || null);
  }
  if (!esServicios && !categoriaSatId) avisos.push("Falta la categoría: la solicitud sale sin categoría ni importe (se completan al aprobar).");
  const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana);
  const importes = derivarImportes({ ancla: null, jornada: dailyRate > 0 ? dailyRate : null, mesesEq: mesesParaImportes(mesesEq, jornadas, Number(data.cantidadJornadas) || null), jornadas, diasSemana: Number(data.diasPorSemana) > 0 ? Number(data.diasPorSemana) : diasPorSemana });

  // El motivo: el que venga; si no, el de Novedades que hable de vacaciones. Mismo filtro que el formulario («horas extra» no es una ausencia).
  const motivosValidos = (motivos as any[]).filter((m) => !String(m.name || "").toLowerCase().includes("horas extra"));
  let motivo = idValido(pedido.motivoReemplazoId) && motivosValidos.some((m) => String(m._id) === String(pedido.motivoReemplazoId)) ? motivosValidos.find((m) => String(m._id) === String(pedido.motivoReemplazoId)) : motivosValidos.find((m) => /vacacion/i.test(String(m.name || "")));
  if (!motivo && motivosValidos.length > 0) avisos.push("No hay un motivo de reemplazo «Vacaciones» en Novedades: elegí uno.");

  const sedeIds: number[] = Array.isArray(project?.metadata?.sedeIds) ? project.metadata.sedeIds.map(Number).filter((n: number) => n > 0) : [];
  const sedePrincipal = sedeIds[0] || (Number(project?.metadata?.sedeId) > 0 ? Number(project.metadata.sedeId) : undefined);

  const comentarios = [
    `Reemplazo mensual · Plan «${plan.nombre}» · ${nombreRol} · ${nombreDeMes(pedido.mes)}`,
    `Cubre a ${cubreA.map((c) => `${c.nombre} (${fechaCorta(c.desde)}–${fechaCorta(c.hasta)})`).join(" y ")}.`,
    String(pedido.comentarios || "").trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const datos: DatosSolicitud = {
    fullName: nombreDePersona(persona),
    projectIds: [String(plan.projectId)],
    solicitudUserId: String(persona._id),
    roleFrameIds: grupo.rolFrameId ? [grupo.rolFrameId] : [],
    esServicios,
    categoriaSatId: categoriaSatId || undefined,
    startDate: rango.desde,
    dueDate: rango.hasta,
    indeterminado: false,
    porDiasSueltos: false,
    workdaysCount: jornadas,
    workdaysCalculated: calculadas,
    ajusteJornadas: false,
    diasPorSemana,
    diasSemana,
    diasRotativos: false,
    fechasTrabajadas: [],
    inTime,
    outTime,
    empresaContratoId: primero?.empresaContratoId ? String(primero.empresaContratoId) : undefined,
    // Un grupo de una sede («Edición · Libertador») pide el reemplazo en esa sede; si no, la principal del proyecto.
    sedeId: sedeDelGrupo || sedePrincipal,
    convenioId: !esServicios && idValido(pedido.convenioId) ? String(pedido.convenioId) : undefined,
    dailyRate,
    isReplacement: true,
    empleado_id_reemplezado: primeroUser?.metadata?.id || undefined,
    replacedUserId: cubreA[0].userId,
    motivoReemplazoId: motivo ? String(motivo._id) : undefined,
    comentarios,
    tipoImpositivo: tipoImpositivo || undefined,
    contratoId: String(pedido.contratoId),
    nombreContrato,
    // La sede explícita de la asignación (la principal, si el grupo es la fila sin sede de un área con varias sedes).
    areaShiftAssignments: [{ areaId: grupo.areaId, shiftIds: [grupo.shiftId], ...(sedeParaGuardar(project?.areasConfig, grupo.areaId, sedeDelGrupo, sedePrincipal) ? { sedeId: sedeParaGuardar(project?.areasConfig, grupo.areaId, sedeDelGrupo, sedePrincipal) } : {}) }],
  };
  if (!grupo.rolFrameId) avisos.push("El grupo no tiene rol empresa resuelto: la solicitud sale sin rol (completalo al aprobar).");

  // Lo que la persona ya tiene en esas fechas (otros contratos, solicitudes pendientes): se avisa, no se frena.
  try {
    const payload = armarPayloadDeSolicitud(datos);
    const sup: any[] = await superposicionesDeAlta(tenantObjectId, String(persona._id), pedidoDesdeSolicitud(payload.metadata));
    for (const s of sup) avisos.push(String(s?.texto || s?.mensaje || s?.detalle || "Se superpone con otro compromiso de la persona."));
  } catch (e) {
    console.error("[PLAN-VACACIONES] No se pudieron mirar las superposiciones del reemplazo:", e);
  }

  return {
    datos,
    cubreA,
    avisos,
    resumen: { persona: datos.fullName, nombreContrato, desde: rango.desde, hasta: rango.hasta, jornadas, dailyRate, importes, esServicios, motivo: motivo ? String(motivo.name) : null },
  };
}

/** Crea la Solicitud de contratación y la deja vinculada al plan. Un solo reemplazo pedido por grupo y mes. */
export async function crearReemplazoMensual(tenantObjectId: Types.ObjectId, creadorId: string, plan: IPlanVacaciones, pedido: PedidoReemplazo): Promise<{ solicitudId: string; reemplazoId: string; avisos: string[] }> {
  if (plan.estado === "cancelado") throw new ErrorPlan("El plan está cancelado.", 409);
  const clave = claveDeGrupo({ areaId: pedido.areaId, shiftId: pedido.shiftId, sedeId: pedido.sedeId, rolFrameId: idValido(pedido.rolFrameId) ? pedido.rolFrameId : null, nombreRol: pedido.nombreRol });
  if ((plan.reemplazos as any[]).some((r) => r.estado === "solicitado" && r.mes === pedido.mes && claveDeGrupo(r) === clave)) {
    throw new ErrorPlan("Ese rol ya tiene un reemplazo pedido para ese mes: cancelalo antes de pedir otro.", 409);
  }
  const armado = await armarReemplazoMensual(tenantObjectId, plan, pedido);
  const payload = armarPayloadDeSolicitud(armado.datos, { sufijoEmail: `_plan_${Math.random().toString(36).slice(2, 7)}` });
  const data: any = createUserSchema.parse(payload);
  normalizarRolesFrame(data.metadata);
  data.metadata.planVacacionesId = plan._id;
  const rechazo = await prepararSolicitudNueva(tenantObjectId, creadorId, data.metadata);
  if (rechazo) throw new ErrorPlan(rechazo, 422);
  const roles = await rolesPorDefecto(tenantObjectId);
  const u: any = await User.create({ ...data, roles, tenantId: tenantObjectId });
  await efectosDeSolicitudNueva(tenantObjectId, creadorId, u);

  const reemplazoId = new Types.ObjectId();
  plan.reemplazos.push({
    _id: reemplazoId,
    areaId: oid(pedido.areaId),
    shiftId: oid(pedido.shiftId),
    ...(sedeDe(pedido.sedeId) ? { sedeId: sedeDe(pedido.sedeId) } : {}),
    rolFrameId: idValido(pedido.rolFrameId) ? oid(pedido.rolFrameId) : null,
    nombreRol: String(pedido.nombreRol || ""),
    mes: pedido.mes,
    userId: oid(pedido.userId),
    contratoId: oid(pedido.contratoId),
    nombreContrato: armado.resumen.nombreContrato,
    desde: armado.resumen.desde,
    hasta: armado.resumen.hasta,
    cubreA: armado.cubreA.map((c) => ({ userId: oid(c.userId), desde: c.desde, hasta: c.hasta })),
    solicitudId: u._id,
    estado: "solicitado",
    creadoPor: oid(creadorId),
    creadoAt: new Date(),
  } as any);
  await plan.save();
  return { solicitudId: String(u._id), reemplazoId: String(reemplazoId), avisos: armado.avisos };
}

/** Cancela el reemplazo: la solicitud, si sigue pendiente, pasa a cancelada (como desde Proyecto › Solicitudes). */
export async function cancelarReemplazoMensual(tenantObjectId: Types.ObjectId, actorId: string, plan: IPlanVacaciones, reemplazoId: string, motivo?: string): Promise<void> {
  const r: any = idValido(reemplazoId) ? (plan.reemplazos as any).id(reemplazoId) : null;
  if (!r) throw new ErrorPlan("Reemplazo no encontrado.", 404);
  if (r.estado === "cancelado") return;
  if (r.solicitudId) {
    const u: any = await User.findOne({ _id: r.solicitudId, tenantId: tenantObjectId });
    if (u?.metadata?.isSolicitud) {
      if (u.metadata.solicitudStatus === "aprobada") throw new ErrorPlan("La solicitud del reemplazo ya fue aprobada: es un contrato, no se cancela desde el plan.", 409);
      if (u.metadata.solicitudStatus !== "cancelada") {
        const texto = String(motivo || "").trim() || "Cancelado desde el plan de vacaciones.";
        await User.updateOne({ _id: u._id }, { $set: { "metadata.solicitudStatus": "cancelada", "metadata.solicitudMotivoRechazo": texto.slice(0, 1000), "metadata.solicitudRechazadaPor": actorId, "metadata.solicitudRechazadaEl": new Date() } });
        await notificar({ tenantId: tenantObjectId, destinatarios: [u.metadata.solicitudCreadaPor], type: NOVEDAD_SOLICITUD_CANCELADA, title: "Solicitud cancelada", message: `${nombreDePersona(u)}: ${texto}`, refId: u._id, excepto: actorId });
      }
    }
  }
  r.estado = "cancelado";
  await plan.save();
}
