/**
 * EL CONTEXTO DE UNA OPERACIÓN SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026): el contrato, la persona, la
 * empleadora, lo que el espejo de Relaciones Laborales sabe de esa relación y la tabla de situaciones de baja. Con
 * eso arma el PLAN (`reglasOperacionRelacion.ts`) sin tocar ARCA. Lo usan la ruta `/arca/operaciones/plan`, la
 * corrida (`corridaOperacionRelacion.ts`) y el script `operarRelacionArca.ts`.
 *
 * El contrato se nombra por su `contratoKey` cuando la tiene; si no, por su posición, y en los dos casos se
 * comprueba que la posición resuelta sea un contrato operable (no una lápida) de un proyecto del tenant.
 *
 * MODO «SIN CONTRATO» (22/11/2026): una relación de ARCA que ningún contrato de WeProdu explica (las altas viejas
 * hechas a mano) se nombra por la relación misma —empleadora, CUIL y fecha de inicio— y se opera igual. No hay
 * contrato donde guardar el resultado: las marcas que impiden mandar dos veces lo mismo salen del registro de
 * operaciones (`registroOperaciones.ts`). Si la relación SÍ tiene un contrato, este modo se niega: se opera desde él.
 */
import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { ArcaSituacionBaja } from "../../models/ArcaSituacionBaja.js";
import { indiceDeReferencia } from "../../utils/identidadContrato.js";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { tramiteDelContrato } from "../superposicion.js";
import { claveDeRelacion, marcasDeRegistro, SIN_MARCAS } from "./registroOperaciones.js";
import { relacionesOperables } from "./relacionesOperables.js";
import { marcaTraba } from "./reglasOperacionRelacion.js";
import { motivoDeBajaParaGuardar, type MotivoDeBaja } from "../../compartido/arca/motivoBaja.js";
import { planDeOperacion, type ContratoParaOperar, type DatosOperacion, type PlanOperacion, type RelacionEspejo, type TipoOperacion } from "./reglasOperacionRelacion.js";

export class OperacionInvalida extends Error {
  status = 400;
  constructor(
    message: string,
    public plan?: PlanOperacion,
  ) {
    super(message);
  }
}

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const iso = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : "");

export interface ReferenciaContrato {
  userProjectId: string;
  contratoKey?: string | null;
  contractIndex?: number | null;
  /** Modo «sin contrato»: la relación de ARCA misma, cuando no hay `userProjectId`. */
  relacion?: { empleadoraCuit: string; cuil: string; fechaInicio: string } | null;
}

export interface ResumenContratoOperable {
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  nombre_contrato: string;
  alta: string;
  baja: string;
  nombre_empresa_contrato: string;
  estadoContrato: string;
  /** El motivo de baja cargado en el contrato (código de ARCA) y la fecha de telegrama: el panel los trae precargados. */
  motivoBajaArca: string;
  fechaTelegramaBaja: string;
  marcas: { alta: any; baja: any; modificacion: any; anulacion: any };
}

export interface ContextoOperacion {
  /** `null` en modo «sin contrato». */
  up: any;
  idx: number;
  contrato: any;
  contratoKey: string | null;
  /** La relación no tiene contrato en WeProdu: el resultado no se guarda en ninguno, sólo en el registro. */
  sinContrato: boolean;
  /** Empleadora + CUIL + fecha de inicio: la identidad de la relación en el registro de operaciones. */
  claveRelacion: string;
  persona: { userId: string; nombre: string; cuil: string };
  empresa: { _id: string; cuit: string; razonSocial: string };
  espejo: RelacionEspejo | null;
  paraReglas: ContratoParaOperar;
  resumen: ResumenContratoOperable;
}

/** La tabla de situaciones de baja, como la ve la pantalla: código y descripción. */
export async function situacionesDeBaja(): Promise<Array<{ codigo: string; descripcion: string }>> {
  const docs: any[] = await ArcaSituacionBaja.find().select("externalId name").sort({ name: 1 }).lean();
  return docs.map((d) => ({ codigo: String(d.externalId || "").trim(), descripcion: String(d.name || "") })).filter((d) => d.codigo);
}

/** La relación del contrato en el espejo de Relaciones Laborales (misma empleadora, CUIL y fecha de inicio exacta). */
export async function espejoDe(tenantObjectId: Types.ObjectId, empleadoraCuit: string, cuil: string, alta: string): Promise<RelacionEspejo | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alta)) return null;
  const r: any = await RelacionLaboralArca.findOne({ tenantId: tenantObjectId, empleadoraCuit, cuil, fechaInicio: new Date(`${alta}T00:00:00.000Z`) }).lean();
  if (!r) return null;
  return {
    inicio: iso(r.fechaInicio),
    fin: r.fechaFin ? iso(r.fechaFin) : "",
    situacionBaja: String(r.situacionBaja || ""),
    // El TXT trae la modalidad y la obra social como TEXTO, no como código: no se comparan con los códigos del formulario.
    // La modalidad viaja aparte, como texto, para la advertencia de directores (LRT) del panel.
    modalidadTexto: String(r.modalidadContrato || ""),
    retribucion: r.retribucionPactada ?? null,
    sincronizadoEl: r.sincronizadoEl ? new Date(r.sincronizadoEl).toISOString() : undefined,
  };
}

/** El contexto de una relación SIN contrato en WeProdu. Se niega si la relación tiene uno: se opera desde él. */
async function contextoSinContrato(tenantObjectId: Types.ObjectId, rel: NonNullable<ReferenciaContrato["relacion"]>): Promise<ContextoOperacion> {
  const empleadoraCuit = dig(rel.empleadoraCuit);
  const cuil = dig(rel.cuil);
  const inicio = String(rel.fechaInicio || "").slice(0, 10);
  if (empleadoraCuit.length !== 11 || cuil.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new OperacionInvalida("Relación mal identificada: hacen falta el CUIT de la empleadora, el CUIL y la fecha de inicio.");
  const { relaciones } = await relacionesOperables(tenantObjectId, { relacion: { empleadoraCuit, cuil, fechaInicio: inicio } });
  const r = relaciones[0];
  if (!r) throw new OperacionInvalida("Esa relación no figura en las Relaciones Laborales sincronizadas desde ARCA.");
  if (r.contratos.length > 0) throw new OperacionInvalida("Esta relación tiene un contrato en WeProdu: se opera desde el contrato, no «sin contrato».");
  const e: any = ((await Company.find({}).select("cuit razonSocial").lean()) as any[]).find((x) => dig(x.cuit) === empleadoraCuit) || null;
  const claveRelacion = claveDeRelacion(empleadoraCuit, cuil, inicio);
  const reg = (await marcasDeRegistro(tenantObjectId, [claveRelacion])).get(claveRelacion) || SIN_MARCAS;
  const espejo = await espejoDe(tenantObjectId, empleadoraCuit, cuil, inicio);
  const altaAnulada = reg.altaAnulada ? { resultado: "anulada" } : null;
  const razonSocial = String(e?.razonSocial || r.empleadora || empleadoraCuit);
  return {
    up: null,
    idx: -1,
    contrato: null,
    contratoKey: null,
    sinContrato: true,
    claveRelacion,
    persona: { userId: r.userId || "", nombre: r.persona || cuil, cuil },
    empresa: { _id: e ? String(e._id) : "", cuit: empleadoraCuit, razonSocial },
    espejo,
    paraReglas: { cuil, empresaCuit: empleadoraCuit, alta: inicio, baja: "", altaArcaPresentada: altaAnulada, bajaArcaPresentada: reg.baja, modificacionArcaPresentada: reg.modificacion, anulacionArcaPresentada: reg.anulacion },
    resumen: {
      userProjectId: "",
      contratoKey: null,
      posicion: -1,
      nombre_contrato: "Sin contrato en WeProdu",
      alta: inicio,
      baja: "",
      nombre_empresa_contrato: razonSocial,
      estadoContrato: "",
      motivoBajaArca: "",
      fechaTelegramaBaja: "",
      marcas: { alta: altaAnulada, baja: reg.baja, modificacion: reg.modificacion, anulacion: reg.anulacion },
    },
  };
}

export async function contextoDeOperacion(tenantObjectId: Types.ObjectId, ref: ReferenciaContrato): Promise<ContextoOperacion> {
  if (!String(ref.userProjectId || "") && ref.relacion) return contextoSinContrato(tenantObjectId, ref.relacion);
  if (!Types.ObjectId.isValid(String(ref.userProjectId || ""))) throw new OperacionInvalida("Contrato mal identificado.");
  const up: any = await UserProject.findById(ref.userProjectId).lean();
  if (!up) throw new OperacionInvalida("No se encontró el vínculo del contrato.");
  const proyecto: any = await Project.findOne({ _id: up.projectId, tenantId: tenantObjectId }).select("_id name").lean();
  if (!proyecto) throw new OperacionInvalida("El contrato no es de un proyecto de este cliente.");
  const idx = indiceDeReferencia(up.contracts, { contratoKey: ref.contratoKey || undefined, indice: ref.contractIndex ?? null });
  const contrato = idx >= 0 ? up.contracts?.[idx] : null;
  if (!contrato) throw new OperacionInvalida("Contrato no encontrado (o anulado).");
  if (contrato.estadoContrato === "ANULADO") throw new OperacionInvalida("El contrato está anulado en WeProdu.");
  const u: any = await User.findOne({ _id: up.userId, tenantId: tenantObjectId }).select("firstName lastName email metadata.cuit").lean();
  if (!u) throw new OperacionInvalida("La persona del contrato no es de este cliente.");
  const empresaId = contrato.empresaContratoId ? String(contrato.empresaContratoId) : "";
  const e: any = Types.ObjectId.isValid(empresaId) ? await Company.findById(empresaId).select("cuit razonSocial").lean() : null;
  if (!e) throw new OperacionInvalida("El contrato no tiene Empresa Contrato: sin la empleadora no se puede entrar a ARCA.");
  const cuil = dig(u.metadata?.cuit);
  const empresaCuit = dig(e.cuit);
  const alta = fechaISO(contrato.fecha_alta_contrato) || "";
  const baja = fechaISO(contrato.fecha_baja_contrato) || "";
  const [espejo, tramite] = await Promise.all([
    cuil.length === 11 && empresaCuit.length === 11 ? espejoDe(tenantObjectId, empresaCuit, cuil, alta) : Promise.resolve(null),
    // Un Servicios no tiene relación en ARCA: la misma condición que el ícono de la bandeja (`relacionParaOperar`).
    tramiteDelContrato({ nombre_contrato: contrato.nombre_contrato, tipo_contrato_id: contrato.tipo_contrato_id, contrato_id: contrato.contrato_id }).catch(() => undefined),
  ]);
  const contratoKey = contrato.contratoKey ? String(contrato.contratoKey) : null;
  /*
    LAS MARCAS DEL REGISTRO TAMBIÉN TRABAN. Si esta relación se operó antes «sin contrato» (el contrato se cargó
    después), el contrato no tiene la marca pero el registro sí: donde el contrato no dice nada, vale el registro.
  */
  const claveRelacion = claveDeRelacion(empresaCuit, cuil, alta);
  const reg = cuil.length === 11 && empresaCuit.length === 11 && alta ? (await marcasDeRegistro(tenantObjectId, [claveRelacion])).get(claveRelacion) || SIN_MARCAS : SIN_MARCAS;
  const marca = (delContrato: any, delRegistro: any) => (!delContrato && marcaTraba(delRegistro) ? delRegistro : delContrato || null);
  return {
    up,
    idx,
    contrato,
    contratoKey,
    sinContrato: false,
    claveRelacion,
    persona: { userId: String(up.userId), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "(sin nombre)", cuil },
    empresa: { _id: String(e._id), cuit: empresaCuit, razonSocial: String(e.razonSocial || "") },
    espejo,
    paraReglas: {
      tramite,
      estadoContrato: String(contrato.estadoContrato || ""),
      cuil,
      empresaCuit,
      alta,
      baja,
      altaArcaPresentada: contrato.altaArcaPresentada || null,
      bajaArcaPresentada: marca(contrato.bajaArcaPresentada, reg.baja),
      modificacionArcaPresentada: marca(contrato.modificacionArcaPresentada, reg.modificacion),
      anulacionArcaPresentada: marca(contrato.anulacionArcaPresentada, reg.anulacion),
    },
    resumen: {
      userProjectId: String(up._id),
      contratoKey,
      posicion: idx,
      nombre_contrato: String(contrato.nombre_contrato || ""),
      alta,
      baja,
      nombre_empresa_contrato: String(contrato.nombre_empresa_contrato || e.razonSocial || ""),
      estadoContrato: String(contrato.estadoContrato || ""),
      motivoBajaArca: String(contrato.motivoBajaArca || ""),
      fechaTelegramaBaja: String(contrato.fechaTelegramaBaja || ""),
      marcas: { alta: contrato.altaArcaPresentada || null, baja: contrato.bajaArcaPresentada || null, modificacion: contrato.modificacionArcaPresentada || null, anulacion: contrato.anulacionArcaPresentada || null },
    },
  };
}

/**
 * GUARDA EN EL CONTRATO EL MOTIVO DE BAJA Y LA FECHA DE TELEGRAMA (desde la fila de Bajas ARCA). No toca ARCA.
 * Queda auditado como cualquier cambio del contrato (los hooks del modelo, a nombre de quien lo hizo). Una relación
 * sin contrato no tiene dónde guardarlo: ahí el motivo se elige en el panel al mandar. Con la baja ya mandada no se
 * cambia: lo que viajó a ARCA está en la operación.
 */
export async function guardarMotivoDeBaja(tenantObjectId: Types.ObjectId, ref: ReferenciaContrato, entrada: { motivo?: unknown; fechaTelegrama?: unknown }): Promise<MotivoDeBaja> {
  const ctx = await contextoDeOperacion(tenantObjectId, ref);
  if (ctx.sinContrato || !ctx.up) throw new OperacionInvalida("Esta relación no tiene contrato en WeProdu: el motivo se elige en el panel, al mandar la baja.");
  if (marcaTraba(ctx.paraReglas.bajaArcaPresentada)) throw new OperacionInvalida("La baja de este contrato ya se mandó a ARCA: el motivo que viajó está en la operación (Bajas ARCA › Operaciones).");
  const codigos = new Set((await situacionesDeBaja()).map((s) => s.codigo));
  let guardar: MotivoDeBaja;
  try {
    guardar = motivoDeBajaParaGuardar(entrada, codigos);
  } catch (e: any) {
    throw new OperacionInvalida(String(e?.message || e));
  }
  // Por clave, nunca por posición; un contrato sin clave (no debería quedar ninguno) va por su posición.
  const filtro: Record<string, unknown> = { _id: ctx.up._id };
  const set: Record<string, unknown> = {};
  if (ctx.contratoKey) {
    filtro["contracts.contratoKey"] = new Types.ObjectId(ctx.contratoKey);
    set["contracts.$.motivoBajaArca"] = guardar.motivoBajaArca;
    set["contracts.$.fechaTelegramaBaja"] = guardar.fechaTelegramaBaja;
  } else {
    set[`contracts.${ctx.idx}.motivoBajaArca`] = guardar.motivoBajaArca;
    set[`contracts.${ctx.idx}.fechaTelegramaBaja`] = guardar.fechaTelegramaBaja;
  }
  const r = await UserProject.updateOne(filtro, { $set: set });
  if (!r.matchedCount) throw new OperacionInvalida("No se encontró el contrato para guardar el motivo.");
  return guardar;
}

export interface PlanConContexto {
  plan: PlanOperacion;
  hoy: string;
  contexto: { persona: ContextoOperacion["persona"]; empresa: ContextoOperacion["empresa"]; contrato: ResumenContratoOperable; espejo: RelacionEspejo | null; situacionTexto?: string; sinContrato: boolean };
  /** Lo que la corrida necesita y no viaja a la pantalla. */
  ctx: ContextoOperacion;
}

/** El plan de una operación: qué se mandaría y si se puede, SIN tocar ARCA. */
export async function planOperacion(tenantObjectId: Types.ObjectId, o: { op: TipoOperacion; ref: ReferenciaContrato; datos: DatosOperacion }): Promise<PlanConContexto> {
  const ctx = await contextoDeOperacion(tenantObjectId, o.ref);
  const hoy = hoyArgentina();
  const catalogo = o.op === "baja" ? new Map((await situacionesDeBaja()).map((s) => [s.codigo, s.descripcion])) : undefined;
  const plan = planDeOperacion(o.op, ctx.paraReglas, ctx.espejo, o.datos, hoy, catalogo && catalogo.size > 0 ? catalogo : undefined);
  const situacionTexto = o.op === "baja" && catalogo ? catalogo.get(String((plan.payload as any).situacionBaja || "")) : undefined;
  return { plan, hoy, contexto: { persona: ctx.persona, empresa: ctx.empresa, contrato: ctx.resumen, espejo: ctx.espejo, sinContrato: ctx.sinContrato, ...(situacionTexto ? { situacionTexto } : {}) }, ctx };
}
