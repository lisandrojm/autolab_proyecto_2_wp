import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import { Info } from "../models/Info.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { bajaDeArcaQueAplica, relacionesArcaDe, type RelacionArcaResumida } from "./arca/altasVigentes.js";
import { plantillaDelContrato } from "../compartido/plantillaDelContrato.js";
// El `populate("clientId")` necesita el modelo registrado; no se depende de que otro archivo lo haya cargado.
import "../models/Client.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion, contratoEnLasFechas, superposiciones } from "../utils/superposicionContratos.js";
import { Contrato } from "../models/Contrato.js";
import { getArcaDefaults } from "../models/ArcaDefault.js";
import { ArcaModalidadContratacion } from "../models/ArcaModalidadContratacion.js";
import { ArcaModalidadLiquidacion } from "../models/ArcaModalidadLiquidacion.js";
import { conCascada } from "../compartido/arca/cascadaArca.js";
import { buscarTipoContrato } from "../compartido/arca/afipCompleteness.js";
import { decidirAltaVigente, liquidacionDelAlta, mensajeMismaEmpleadora, mensajeSoloServicios, type Liquidacion } from "../compartido/altaVigente.js";

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
  return (await compromisosDePersonas(tenantId, [userId], excluirSolicitudId)).get(userId) || [];
}

/**
 * LO MISMO PARA VARIAS PERSONAS, EN UNA SOLA LECTURA (26/11/2026). El alta masiva de plantillas revisa a
 * 36 personas de una vez y por cada una hacía estas cinco consultas, dos veces (avisos y altas de ARCA):
 * 360 idas a la base, y el preview tardaba lo que tardaban en volver. Acá son las mismas cinco para
 * todas juntas. Por `userId`; quien no tiene nada, lista vacía. Un id inválido no figura.
 */
export async function compromisosDePersonas(tenantId: Types.ObjectId, userIds: string[], excluirSolicitudId?: string): Promise<Map<string, CompromisoExistente[]>> {
  const ids = [...new Set(userIds.filter((id) => Types.ObjectId.isValid(id)))];
  const porPersona = new Map<string, CompromisoExistente[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porPersona;
  const uids = ids.map((id) => new Types.ObjectId(id));
  /*
    SÓLO LOS PROYECTOS DEL TENANT (18/11/2026). `UserProject` no tiene `tenantId`: se acota por los
    proyectos del tenant. Antes se buscaba por `userId` solo.
  */
  const proyectosDelTenant = await Project.find({ tenantId }).distinct("_id");
  /*
    LOS CONTRATOS, UNA CONSULTA POR PERSONA Y TODAS A LA VEZ, no una sola con `$in`. Son los mismos
    bytes (28 personas de LN+ = 2.000 contratos, 700 KB), pero Atlas entrega por conexión a un ritmo
    acotado: una sola consulta los trae por una conexión y tarda lo que esa conexión da; en paralelo
    viajan por varias. Medido: 7 s la única contra 1,3 s las 28 juntas (la base los resuelve en 9 ms).
    Lo chico (proyectos, solicitudes, nombres, turnos) sí va en una consulta cada uno.
  */
  const [porUsuario, pendientes] = await Promise.all([
    Promise.all(uids.map((uid) => UserProject.find({ userId: uid, projectId: { $in: proyectosDelTenant } })
      .select("userId projectId nombre_proyecto contracts.empresaContratoId contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.dias_semana contracts.dias_rotativos contracts.fechas_trabajadas contracts.hora_inicio contracts.hora_fin contracts.shiftId contracts.areaShiftAssignments contracts.nombre_turno contracts.nombre_contrato contracts.tipo_contrato_id contracts.contrato_id contracts.estadoContrato")
      .lean() as Promise<any[]>)),
    User.find({
      tenantId,
      "metadata.isSolicitud": true,
      "metadata.solicitudStatus": "pendiente",
      "metadata.solicitudUserId": { $in: [...ids, ...uids] },
      ...(excluirSolicitudId && Types.ObjectId.isValid(excluirSolicitudId) ? { _id: { $ne: new Types.ObjectId(excluirSolicitudId) } } : {}),
    })
      .select("metadata.solicitudUserId metadata.startDate metadata.dueDate metadata.fechasTrabajadas metadata.diasSemana metadata.diasRotativos metadata.schedule metadata.areaShiftAssignments metadata.projectIds")
      .lean() as Promise<any[]>,
  ]);
  const asignaciones = porUsuario.flat();

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

  for (const a of asignaciones) {
    const compromisos = porPersona.get(String(a.userId));
    if (!compromisos) continue;
    for (const [contractIndex, c] of (a.contracts || []).entries()) {
      const desde = fechaISO(c.fecha_alta_contrato);
      if (!desde) continue;
      // Un contrato anulado (la lápida que queda en su lugar) no compromete a nadie: ni avisa ni traba.
      if (c.estadoContrato === "ANULADO") continue;
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
        ref: { userProjectId: String(a._id), contractIndex },
        empresaId: c.empresaContratoId ? String(c.empresaContratoId) : "",
      });
    }
  }
  for (const p of pendientes) {
    const compromisos = porPersona.get(String(p.metadata?.solicitudUserId));
    if (!compromisos) continue;
    const pedido = pedidoDesdeSolicitud(p.metadata);
    if (!pedido.desde && !pedido.fechas?.length) continue;
    compromisos.push({ origen: "solicitud", proyectoNombre: nombreDe.get(String(p.metadata?.projectIds?.[0])) || "", ...pedido });
  }
  return porPersona;
}

/**
 * Lee el trámite de un contrato: tipo → plantilla → el estado impositivo que la reclama, el mismo camino
 * que el tag de las pantallas (`estadoImpositivoDelContrato`). No se usa el estado del contrato: avanza por
 * el circuito y deja de decir el trámite. Sin plantilla o sin estado que la reclame, `null`: no se adivina.
 */
/**
 * El trámite (`alta_temprana_afip`, `constancia_cuit`…) del tipo de cada contrato, con las plantillas y los
 * estados impositivos leídos UNA vez. Lo usan también la bandeja Contratos y el panel de Modificaciones y Bajas.
 */
export async function lectorDeTramites(): Promise<(tipo: CompromisoExistente["tipo"]) => string | null> {
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

/**
 * LAS BAJAS DE ARCA SOBRE LOS CONTRATOS (18/11/2026). Un contrato a tiempo indeterminado sin fecha de baja
 * en WeProdu cubre cualquier fecha futura, aunque en ARCA la relación ya terminó: la baja llega al espejo
 * (`RelacionLaboralArca`) pero no al contrato. Antes de mirar si se pisa, cada contrato toma la baja de
 * ARCA con el MISMO match de la presentación de altas (`bajaDeArcaQueAplica`: CUIL + CUIT de la empresa
 * del contrato + fecha de alta exacta). Sin empresa, sin CUIT o sin relación en ARCA queda como está.
 * `cuitDe`: `empresaId` → CUIT. Puro.
 */
export function compromisosConBajasDeArca(compromisos: CompromisoExistente[], relaciones: RelacionArcaResumida[], cuil: string, cuitDe: (empresaId: string) => string): CompromisoExistente[] {
  return compromisos.map((c) => {
    if (c.origen !== "contrato") return c;
    const cuit = c.empresaId ? cuitDe(c.empresaId) : "";
    const otrasAltas = compromisos.filter((o) => o !== c && o.origen === "contrato" && o.empresaId === c.empresaId && o.desde).map((o) => o.desde);
    const r = bajaDeArcaQueAplica({ cuil, cuit, alta: c.desde, baja: c.hasta }, relaciones, { otrasAltas });
    return r ? { ...c, hasta: r.fin, bajaSegunArca: { hastaContrato: c.hasta, empleadoraCuit: cuit } } : c;
  });
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Lo que el cruce con ARCA necesita de la base para un grupo de personas: el CUIL de cada una, el CUIT y el nombre de cada empresa, y sus relaciones. */
interface LecturaArca {
  cuilDe: (userId: string) => string;
  cuitDe: (empresaId: string) => string;
  nombreEmpresa: (empresaId: string) => string;
  relaciones: RelacionArcaResumida[];
}

/**
 * Lee lo de ARCA UNA vez para todas las personas: sólo las que tienen algún contrato con empresa (a las
 * demás no hay qué cruzar), las empresas de esos contratos y las relaciones de los CUILes válidos.
 */
async function lecturaArca(tenantId: Types.ObjectId, porPersona: Map<string, CompromisoExistente[]>): Promise<LecturaArca> {
  const conEmpresa = [...porPersona].filter(([, lista]) => lista.some((c) => Types.ObjectId.isValid(c.empresaId || ""))).map(([id]) => id);
  const empresaIds = [...new Set([...porPersona.values()].flat().map((c) => c.empresaId || "").filter((id) => Types.ObjectId.isValid(id)))];
  const nada: LecturaArca = { cuilDe: () => "", cuitDe: () => "", nombreEmpresa: () => "", relaciones: [] };
  if (conEmpresa.length === 0 || empresaIds.length === 0) return nada;
  const [usuarios, empresas]: [any[], any[]] = await Promise.all([
    User.find({ _id: { $in: conEmpresa.map((id) => new Types.ObjectId(id)) } }).select("metadata.cuit").lean(),
    Company.find({ _id: { $in: empresaIds } }).select("cuit name").lean(),
  ]);
  const cuils = new Map(usuarios.map((u) => [String(u._id), digitos(u.metadata?.cuit)]));
  const cuits = new Map(empresas.map((e) => [String(e._id), digitos(e.cuit)]));
  const nombres = new Map(empresas.map((e) => [String(e._id), String(e.name || "")]));
  // Una consulta por CUIL y todas a la vez, por lo mismo que los contratos (ver `compromisosDePersonas`): 28 CUILes de LN+ son 2.000 relaciones, 600 KB.
  const relaciones = (await Promise.all([...new Set([...cuils.values()].filter((c) => c.length === 11))].map((c) => relacionesArcaDe(tenantId, [c])))).flat();
  return { cuilDe: (id) => cuils.get(id) || "", cuitDe: (id) => cuits.get(id) || "", nombreEmpresa: (id) => nombres.get(id) || "", relaciones };
}

/**
 * Los contratos de UNA persona con las bajas de ARCA aplicadas (ver `compromisosConBajasDeArca`), y lo que
 * hizo falta para eso: su CUIL, el CUIT y el nombre de cada empresa y sus relaciones de ARCA (de ahí sale
 * también la liquidación de cada alta, ver `altasArcaEnFechas`). Puro: todo sale de la lectura del grupo.
 */
function contratosConBajasDeArca(userId: string, compromisos: CompromisoExistente[], lectura: LecturaArca) {
  const { cuitDe, nombreEmpresa } = lectura;
  const cuil = lectura.cuilDe(userId);
  if (cuil.length !== 11) return { contratos: compromisos, cuil: "", relaciones: [] as RelacionArcaResumida[], cuitDe, nombreEmpresa };
  const relaciones = lectura.relaciones.filter((r) => r.cuil === cuil);
  return { contratos: compromisosConBajasDeArca(compromisos, relaciones, cuil, cuitDe), cuil, relaciones, cuitDe, nombreEmpresa };
}

/**
 * Los códigos de ARCA de cada tipo de contrato (por `contrato_id`, o por el nombre en los contratos viejos)
 * con la cascada global, como el registro de alta (`afipCompleteness`, sin escalón de empresa): la
 * liquidación (el código, que decide) y, para decirlo, «código - nombre» de la liquidación y de la modalidad.
 */
async function lectorDeCodigosArca(): Promise<(tipo: CompromisoExistente["tipo"]) => { liquidacion: string; liquidacionTexto: string; modalidadTexto: string }> {
  const [tipos, dg, modalidades, liquidaciones]: [any[], any, any[], any[]] = await Promise.all([
    Contrato.find().select("name data.afipModalidadLiquidacion data.afipModalidadContrato").lean(),
    getArcaDefaults().catch(() => null),
    ArcaModalidadContratacion.find().select("externalId name").lean(),
    ArcaModalidadLiquidacion.find().select("externalId name").lean(),
  ]);
  const porId = new Map(tipos.map((t) => [String(t._id), t]));
  const num = (v: unknown) => String(Number(String(v ?? "").replace(/\D/g, "") || NaN));
  const nombre = (catalogo: any[], codigo: string) => (codigo ? catalogo.find((c) => num(c.externalId) === num(codigo))?.name || "" : "");
  const texto = (catalogo: any[], codigo: string) => (codigo ? [codigo, nombre(catalogo, codigo)].filter(Boolean).join(" - ") : "");
  return (tipo) => {
    const t = (tipo?.contrato_id && porId.get(String(tipo.contrato_id))) || buscarTipoContrato(tipos, tipo?.nombre_contrato);
    const liquidacion = conCascada(t?.data?.afipModalidadLiquidacion, "tipo_contrato", "modalidadLiquidacion", undefined, dg || undefined).valor;
    const modalidad = conCascada(t?.data?.afipModalidadContrato, "tipo_contrato", "modalidadContratacion", undefined, dg || undefined).valor;
    return { liquidacion, liquidacionTexto: texto(liquidaciones, liquidacion), modalidadTexto: texto(modalidades, modalidad) };
  };
}

/** Un contrato de ARCA de la persona que se cruza con lo pedido, con su liquidación y su empresa. */
export interface AltaArcaEnFechas extends CompromisoExistente {
  liquidacion: Liquidacion;
  origenLiquidacion: "arca" | "tipo" | "sin_dato";
  empresaNombre: string;
  nombreContrato: string;
  modalidadContrato: string;
  liquidacionTexto: string;
}

/**
 * Los contratos DE ARCA (trámite `alta_temprana_afip`) que la persona ya tiene en esas fechas, cada uno
 * con su liquidación: la de su relación en ARCA (misma persona, misma empleadora, misma fecha de alta) y,
 * si no está, la de su tipo de contrato. Uno de Servicios no cuenta.
 */
/** El contrato que se está editando: no se frena consigo mismo. */
export type ContratoExcluido = { userProjectId: string; contractIndex: number } | null | undefined;

/**
 * TODO LO QUE EL CHEQUEO DE UN ALTA LEE DE LA BASE, UNA VEZ PARA UN GRUPO DE PERSONAS: los compromisos de
 * cada una, lo de ARCA y los catálogos (trámites y códigos). El alta masiva de plantillas lo arma una vez
 * y se lo pasa a cada persona (`superposicionesDeAlta`, `decisionAltaDePersona`); el alta individual no
 * lo pasa, y cada función lo lee para esa sola persona, como siempre.
 */
export interface LecturasDeAlta {
  compromisos: Map<string, CompromisoExistente[]>;
  arca: LecturaArca;
  /** Los catálogos, leídos la primera vez que hacen falta: sólo si alguien ya tiene un contrato en esas fechas. */
  lectores: () => Promise<{ tramiteDe: Awaited<ReturnType<typeof lectorDeTramites>>; codigosDelTipo: Awaited<ReturnType<typeof lectorDeCodigosArca>> }>;
}

export async function lecturasDeAlta(tenantId: Types.ObjectId, userIds: (string | undefined)[]): Promise<LecturasDeAlta> {
  const compromisos = await compromisosDePersonas(tenantId, userIds.filter((id): id is string => !!id));
  const arca = await lecturaArca(tenantId, compromisos);
  let lectores: ReturnType<LecturasDeAlta["lectores"]> | null = null;
  return {
    compromisos,
    arca,
    lectores: () => (lectores ||= Promise.all([lectorDeTramites(), lectorDeCodigosArca()]).then(([tramiteDe, codigosDelTipo]) => ({ tramiteDe, codigosDelTipo }))),
  };
}

export async function altasArcaEnFechas(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, excluir?: ContratoExcluido, lecturas?: LecturasDeAlta): Promise<AltaArcaEnFechas[]> {
  if (!userId) return [];
  const l = lecturas || (await lecturasDeAlta(tenantId, [userId]));
  const propios = (l.compromisos.get(userId) || []).filter((c) => c.origen === "contrato" && !(excluir && c.ref?.userProjectId === excluir.userProjectId && c.ref?.contractIndex === excluir.contractIndex));
  const { contratos, cuil, relaciones, cuitDe, nombreEmpresa } = contratosConBajasDeArca(userId, propios, l.arca);
  const enFechas = contratos.filter((c) => contratoEnLasFechas(pedido, [c]));
  if (enFechas.length === 0) return [];
  const { tramiteDe, codigosDelTipo } = await l.lectores();
  const altas: AltaArcaEnFechas[] = [];
  for (const c of enFechas) {
    if (tramiteDe(c.tipo) !== "alta_temprana_afip") continue;
    const cuit = c.empresaId ? cuitDe(c.empresaId) : "";
    const relacion = cuil && cuit ? relaciones.find((r) => r.cuil === cuil && r.empleadoraCuit === cuit && r.inicio === c.desde) : undefined;
    const delTipo = codigosDelTipo(c.tipo);
    const l = liquidacionDelAlta(relacion?.modLiquidacion, delTipo.liquidacion);
    altas.push({
      ...c,
      liquidacion: l.liquidacion,
      origenLiquidacion: l.origen,
      empresaNombre: c.empresaId ? nombreEmpresa(c.empresaId) : "",
      nombreContrato: String(c.tipo?.nombre_contrato || ""),
      // Para decirlo, lo de ARCA si está la relación; si no, lo del tipo.
      modalidadContrato: relacion?.modalidadContrato || delTipo.modalidadTexto,
      liquidacionTexto: l.origen === "arca" ? relacion?.modLiquidacion || "" : delTipo.liquidacionTexto,
    });
  }
  // Rastro de cada alta que entró en la decisión: con qué baja y qué liquidación.
  for (const a of altas) {
    console.log(
      `[alta-vigente] user ${userId}: contrato ${a.ref?.userProjectId}#${a.ref?.contractIndex} (${a.proyectoNombre || "?"}, ${a.desde} → ${a.hasta || "sin baja"}${a.bajaSegunArca ? ` según ARCA; en el contrato ${a.bajaSegunArca.hastaContrato || "sin baja"}` : ""}) ` +
        `liquidación ${a.liquidacion} (${a.origenLiquidacion}), empresa ${a.empresaNombre || a.empresaId || "?"}`,
    );
  }
  return altas;
}

export interface DecisionAlta {
  /** Un alta mensual en esas fechas: sólo Servicios. */
  soloServicios: AltaArcaEnFechas | null;
  /** Un alta por jornada con la misma empresa en esas fechas: no otra alta de ARCA con ella. */
  mismaEmpleadora: AltaArcaEnFechas | null;
  /** El primero de los dos, ya dicho. Vacío si nada frena. */
  mensaje: string;
  /** Todas las altas de ARCA en esas fechas, frenen o no (para avisar cuando todavía no hay fechas). */
  altas: AltaArcaEnFechas[];
}

/** La regla de `compartido/altaVigente.ts` sobre las altas de la persona en esas fechas. */
export async function decisionAltaDePersona(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, empresaId?: string | null, excluir?: ContratoExcluido, lecturas?: LecturasDeAlta): Promise<DecisionAlta> {
  const altas = await altasArcaEnFechas(tenantId, userId, pedido, excluir, lecturas);
  const d = decidirAltaVigente(altas, empresaId);
  return { ...d, altas, mensaje: d.soloServicios ? mensajeSoloServicios(d.soloServicios) : d.mismaEmpleadora ? mensajeMismaEmpleadora(d.mismaEmpleadora) : "" };
}

/**
 * Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de
 * Servicios. `empresaId`: la empresa del contrato nuevo (sin ella no se revisa la misma empleadora).
 */
export async function rechazoAltaArcaConContrato(tenantId: Types.ObjectId, userId: string | undefined, tramite: unknown, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, empresaId?: string | null, excluir?: ContratoExcluido): Promise<string | null> {
  if (tramite !== "alta_temprana_afip") return null;
  return (await decisionAltaDePersona(tenantId, userId, pedido, empresaId, excluir)).mensaje || null;
}

/** El trámite de un tipo de contrato por su `_id` (tipo → plantilla → estado impositivo), o `null`. */
/** El trámite del tipo de UN contrato (por su `contrato_id`, o por el nombre en los viejos). */
export async function tramiteDelContrato(c: { nombre_contrato?: string; tipo_contrato_id?: unknown; contrato_id?: unknown }): Promise<string | null> {
  return (await lectorDeTramites())({ nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id, contrato_id: c.contrato_id });
}

export async function tramiteDelTipo(contratoId: unknown): Promise<string | null> {
  if (!contratoId || !Types.ObjectId.isValid(String(contratoId))) return null;
  return (await lectorDeTramites())({ contrato_id: String(contratoId) });
}

/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. `compromisos`: los ya leídos para el lote (ver `lecturasDeAlta`). */
export async function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string, compromisos?: CompromisoExistente[]): Promise<Superposicion[]> {
  if (!userId) return [];
  return superposiciones(pedido, compromisos || (await compromisosDePersona(tenantId, userId, excluirSolicitudId)), hoyArgentina());
}
