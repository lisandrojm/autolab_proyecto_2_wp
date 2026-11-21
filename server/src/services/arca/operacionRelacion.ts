/**
 * EL CONTEXTO DE UNA OPERACIÓN SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026): el contrato, la persona, la
 * empleadora, lo que el espejo de Relaciones Laborales sabe de esa relación y la tabla de situaciones de baja. Con
 * eso arma el PLAN (`reglasOperacionRelacion.ts`) sin tocar ARCA. Lo usan la ruta `/arca/operaciones/plan`, la
 * corrida (`corridaOperacionRelacion.ts`) y el script `operarRelacionArca.ts`.
 *
 * El contrato se nombra por su `contratoKey` cuando la tiene; si no, por su posición, y en los dos casos se
 * comprueba que la posición resuelta sea un contrato operable (no una lápida) de un proyecto del tenant.
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
  marcas: { alta: any; baja: any; modificacion: any; anulacion: any };
}

export interface ContextoOperacion {
  up: any;
  idx: number;
  contrato: any;
  contratoKey: string | null;
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
    retribucion: r.retribucionPactada ?? null,
    sincronizadoEl: r.sincronizadoEl ? new Date(r.sincronizadoEl).toISOString() : undefined,
  };
}

export async function contextoDeOperacion(tenantObjectId: Types.ObjectId, ref: ReferenciaContrato): Promise<ContextoOperacion> {
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
  const espejo = cuil.length === 11 && empresaCuit.length === 11 ? await espejoDe(tenantObjectId, empresaCuit, cuil, alta) : null;
  const contratoKey = contrato.contratoKey ? String(contrato.contratoKey) : null;
  return {
    up,
    idx,
    contrato,
    contratoKey,
    persona: { userId: String(up.userId), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "(sin nombre)", cuil },
    empresa: { _id: String(e._id), cuit: empresaCuit, razonSocial: String(e.razonSocial || "") },
    espejo,
    paraReglas: {
      cuil,
      empresaCuit,
      alta,
      baja,
      altaArcaPresentada: contrato.altaArcaPresentada || null,
      bajaArcaPresentada: contrato.bajaArcaPresentada || null,
      modificacionArcaPresentada: contrato.modificacionArcaPresentada || null,
      anulacionArcaPresentada: contrato.anulacionArcaPresentada || null,
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
      marcas: { alta: contrato.altaArcaPresentada || null, baja: contrato.bajaArcaPresentada || null, modificacion: contrato.modificacionArcaPresentada || null, anulacion: contrato.anulacionArcaPresentada || null },
    },
  };
}

export interface PlanConContexto {
  plan: PlanOperacion;
  hoy: string;
  contexto: { persona: ContextoOperacion["persona"]; empresa: ContextoOperacion["empresa"]; contrato: ResumenContratoOperable; espejo: RelacionEspejo | null; situacionTexto?: string };
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
  return { plan, hoy, contexto: { persona: ctx.persona, empresa: ctx.empresa, contrato: ctx.resumen, espejo: ctx.espejo, ...(situacionTexto ? { situacionTexto } : {}) }, ctx };
}
