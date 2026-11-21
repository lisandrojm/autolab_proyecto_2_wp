import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { Tenant } from "../../models/Tenant.js";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { cambioDeBajaSegunArca } from "../../utils/bajasArcaContrato.js";

/**
 * UNA PERSONA NO TIENE DOS ALTAS A LA VEZ CON LA MISMA EMPLEADORA.
 *
 * Pedido del 10/10/2026: una vez presentada el alta de un contrato, no se presenta otra de la misma
 * persona hasta que termine la vigente. ARCA la aceptaría como una segunda relación laboral
 * superpuesta, y deshacerla es un trámite aparte.
 *
 * Es POR EMPLEADORA a propósito: alguien puede trabajar a la vez para dos CUIT distintos, y eso son
 * dos relaciones legítimas. «Termina» = su fecha de baja; sin baja, la relación sigue abierta.
 *
 * Cuenta como presentada lo que tiene marca y no falló: `presentada`, y también `indeterminado` y
 * `presentando`, que pueden haber entrado en ARCA (ver `altaArcaPresentada` en UserProject).
 */

export interface AltaPresentada {
  userId: string;
  userProjectId: string;
  contractIndex: number;
  empresaId: string;
  alta: string;
  baja: string;
  /** La baja la puso ARCA (Relaciones Laborales sincronizadas), no el contrato de WeProdu. */
  bajaSegunArca?: boolean;
  /** Cuándo se presentó (ISO): si fue después de la última sincronización, ARCA todavía la tiene activa (ver `secuenciaPorPersona.ts`). */
  presentadaEl?: string;
}

const ABIERTA = "9999-12-31";

/**
 * Las altas ya presentadas de estas personas, en los proyectos del tenant. Con `tenantId`, además se
 * cruzan con las Relaciones Laborales de ARCA (ver `aplicarBajasDeArca`).
 */
export async function altasPresentadasDe(proyectosDelTenant: Array<string | Types.ObjectId>, userIds: string[], tenantId?: Types.ObjectId | string): Promise<AltaPresentada[]> {
  const ids = [...new Set(userIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (ids.length === 0 || proyectosDelTenant.length === 0) return [];
  const filas: any[] = await UserProject.aggregate([
    { $match: { userId: { $in: ids }, projectId: { $in: proyectosDelTenant.map((p) => new Types.ObjectId(String(p))) }, "contracts.altaArcaPresentada.resultado": { $in: ["presentada", "indeterminado", "presentando"] } } },
    {
      $project: {
        userId: 1,
        c: {
          $map: {
            input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
            as: "i",
            /*
              CADA CAMPO DEL MISMO CONTRATO. Antes se leía `$contracts.altaArcaPresentada.resultado` por
              índice, pero ese camino devuelve sólo los contratos QUE TIENEN el campo: con un contrato viejo
              sin marca adelante, el resultado del contrato 15 caía en el 0. Así un contrato de 2023 sin
              baja y nunca presentado figuraba «presentado» y bloqueaba altas nuevas (Pereda, 18/10/2026).
            */
            in: {
              $let: {
                vars: { k: { $arrayElemAt: ["$contracts", "$$i"] } },
                in: { i: "$$i", r: "$$k.altaArcaPresentada.resultado", f: "$$k.altaArcaPresentada.fecha", e: "$$k.empresaContratoId", a: "$$k.fecha_alta_contrato", b: "$$k.fecha_baja_contrato" },
              },
            },
          },
        },
      },
    },
  ]);
  const out: AltaPresentada[] = [];
  for (const f of filas) {
    for (const c of f.c || []) {
      if (!["presentada", "indeterminado", "presentando"].includes(String(c.r || ""))) continue;
      const presentadaEl = c.f && !Number.isNaN(new Date(c.f).getTime()) ? new Date(c.f).toISOString() : undefined;
      out.push({ userId: String(f.userId), userProjectId: String(f._id), contractIndex: Number(c.i), empresaId: String(c.e || ""), alta: fechaISO(c.a), baja: fechaISO(c.b), ...(presentadaEl ? { presentadaEl } : {}) });
    }
  }
  if (!tenantId || out.length === 0) return out;
  // Lo que ARCA tiene registrado de estas personas con estas empleadoras: de ahí salen las bajas que WeProdu no tiene.
  const [usuarios, empresas] = await Promise.all([
    User.find({ _id: { $in: [...new Set(out.map((p) => p.userId))] } }).select("metadata.cuit").lean(),
    Company.find({ _id: { $in: [...new Set(out.map((p) => p.empresaId))].filter((id) => Types.ObjectId.isValid(id)) } }).select("cuit").lean(),
  ]);
  const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const cuilDe = new Map((usuarios as any[]).map((u) => [String(u._id), digitos(u.metadata?.cuit)]));
  const cuitDe = new Map((empresas as any[]).map((e) => [String(e._id), digitos(e.cuit)]));
  const cuils = [...new Set([...cuilDe.values()].filter((c) => c.length === 11))];
  if (cuils.length === 0) return out;
  return aplicarBajasDeArca(
    out,
    await relacionesArcaDe(tenantId, cuils),
    (p) => cuilDe.get(p.userId) || "",
    (p) => cuitDe.get(p.empresaId) || "",
  );
}

export interface RelacionArcaResumida {
  cuil: string;
  empleadoraCuit: string;
  /** "YYYY-MM-DD" */
  inicio: string;
  /** "YYYY-MM-DD"; vacío = relación abierta en ARCA. */
  fin: string;
  /**
   * ARCA ya procesó la baja («SITUACION De BAJA» cargada). Una relación con fecha de fin pero SIN esto
   * sigue ACTIVA para ARCA: rechaza otra alta de la persona con esa empleadora (ver `secuenciaPorPersona.ts`).
   */
  cerrada?: boolean;
  /** El motivo de baja de ARCA («Renuncia…», «Vencimiento…»): la regla distingue un hecho de la granularidad. */
  situacionBaja?: string;
  /** La modalidad de liquidación tal como la escribe ARCA («MES», «JORNAL»…): ver `compartido/altaVigente.ts`. */
  modLiquidacion?: string;
}

/**
 * Las Relaciones Laborales de ARCA de esas personas (con todas las empleadoras), resumidas. Con `desde`
 * ("YYYY-MM-DD"), sólo las que pueden importar: las activas (sin baja procesada), las abiertas y las que
 * terminan desde ese día. Una persona con historia desde 2010 trae decenas de filas (memoria «Latencia = bytes»).
 */
export async function relacionesArcaDe(tenantId: Types.ObjectId | string, cuils: Iterable<string>, desde?: string): Promise<RelacionArcaResumida[]> {
  const lista = [...new Set([...cuils].map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length === 11))];
  if (lista.length === 0) return [];
  const filtro: any = { tenantId: new Types.ObjectId(String(tenantId)), cuil: { $in: lista } };
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) filtro.$or = [{ fechaFin: null }, { situacionBaja: { $in: ["", null] } }, { fechaFin: { $gte: new Date(`${desde}T00:00:00.000Z`) } }];
  const rels: any[] = await RelacionLaboralArca.find(filtro).select("-_id cuil empleadoraCuit fechaInicio fechaFin situacionBaja modLiquidacion").lean();
  const iso = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : "");
  return rels.map((r) => ({ cuil: r.cuil, empleadoraCuit: r.empleadoraCuit, inicio: iso(r.fechaInicio), fin: iso(r.fechaFin), cerrada: !!String(r.situacionBaja || "").trim(), situacionBaja: String(r.situacionBaja || "").trim(), modLiquidacion: String(r.modLiquidacion || "").trim() }));
}

/**
 * Cuándo fue la última sincronización de Relaciones Laborales que leyó bien cada empleadora (CUIT →
 * ISO). Destraba los rechazos por alta activa (ver `rechazoAltaActivaDestrabado`). Una empleadora con
 * error en esa corrida no figura: sus datos no se refrescaron.
 */
export async function ultimaSyncOkPorCuit(tenantId: Types.ObjectId | string): Promise<Map<string, string>> {
  const t: any = await Tenant.findById(tenantId).select("integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.fecha integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.empresas.cuit integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.empresas.error integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.empresas.meses.resultado").lean();
  const u = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.ultimaSync;
  const out = new Map<string, string>();
  if (!u?.fecha) return out;
  for (const e of u.empresas || []) if (e?.cuit && !e.error && !(e.meses || []).some((m: any) => m?.resultado === "error")) out.set(String(e.cuit).replace(/\D/g, ""), String(u.fecha));
  return out;
}

/**
 * LAS BAJAS LAS DICE ARCA (pedido del 18/10/2026). Un contrato de WeProdu puede no tener fecha de baja
 * (tiempo indeterminado) aunque en ARCA la relación ya terminó (renuncia, fin de plazo): si se lo toma
 * como vigente, bloquea altas nuevas que en ARCA son perfectamente posibles. Para cada alta presentada se
 * busca en las Relaciones Laborales de ARCA la de la misma persona, misma empleadora y misma fecha de
 * inicio; si ARCA tiene baja, manda la de ARCA (la más temprana de las dos). Sin relación en ARCA (todavía
 * no sincronizada) queda lo de WeProdu. Puro.
 */
export function aplicarBajasDeArca(presentadas: AltaPresentada[], relaciones: RelacionArcaResumida[], cuilDe: (p: AltaPresentada) => string, cuitDe: (p: AltaPresentada) => string): AltaPresentada[] {
  return presentadas.map((p) => {
    // Las otras altas presentadas de la persona con esa empleadora (las no presentadas no están acá: si
    // un tramo queda sin explicar, la regla no aplica la baja, que es el lado conservador).
    const otrasAltas = presentadas.filter((o) => o !== p && o.userId === p.userId && o.empresaId === p.empresaId && o.alta).map((o) => o.alta);
    const r = bajaDeArcaQueAplica({ cuil: cuilDe(p), cuit: cuitDe(p), alta: p.alta, baja: p.baja }, relaciones, { otrasAltas });
    return r ? { ...p, baja: r.fin, bajaSegunArca: true } : p;
  });
}

/**
 * LA BAJA QUE LA VALIDACIÓN USA EN MEMORIA = LA QUE SE ESCRIBIRÍA (alineado el 19/11/2026, pedido del
 * usuario). Antes tomaba el fin de la primera relación con la misma persona, empleadora y fecha de inicio,
 * sin más: en una relación que ARCA lleva por tramos (Palomino) daba el fin del primer tramo y la validación
 * veía cerrado un contrato que seguía. Ahora es LA MISMA REGLA que «Sincronizar bajas»
 * (`utils/bajasArcaContrato.ts`): devuelve la relación con la baja que se escribiría, o `null` si la regla
 * no escribe nada (sin CUIL/CUIT/relación, relación abierta, el contrato termina antes, granularidad de
 * ARCA, revisión manual…). `otrasAltas`: las altas de los otros contratos de la persona con esa empleadora
 * (para el paraguas). Puro.
 */
export function bajaDeArcaQueAplica(c: { cuil: string; cuit: string; alta: string; baja: string }, relaciones: RelacionArcaResumida[], opciones: { otrasAltas?: string[]; hoy?: string } = {}): RelacionArcaResumida | null {
  if (!c.cuil || !c.cuit || !c.alta) return null;
  const cambio = cambioDeBajaSegunArca({ fecha_alta_contrato: c.alta, fecha_baja_contrato: c.baja }, c.cuil, c.cuit, relaciones, opciones.hoy || hoyArgentina(), opciones.otrasAltas || []);
  if (!cambio?.aplicar) return null;
  const r = relaciones.find((x) => x.cuil === c.cuil && x.empleadoraCuit === c.cuit && x.inicio === c.alta)!;
  return { ...r, fin: cambio.finArca };
}

/**
 * El alta ya presentada que se superpone con este contrato, si hay. Dos períodos se pisan si cada uno
 * empieza antes de que termine el otro. El mismo contrato no cuenta (es el que se está presentando).
 */
export function altaQueSePisa(
  contrato: { userId: string; userProjectId: string; contractIndex: number; empresaId: string; alta: string; baja: string },
  presentadas: AltaPresentada[],
): AltaPresentada | null {
  const alta = fechaISO(contrato.alta);
  if (!alta || !contrato.empresaId) return null;
  const baja = fechaISO(contrato.baja) || ABIERTA;
  for (const p of presentadas) {
    if (p.userId !== contrato.userId || p.empresaId !== contrato.empresaId) continue;
    if (p.userProjectId === contrato.userProjectId && p.contractIndex === contrato.contractIndex) continue;
    if (!p.alta) continue;
    const pBaja = p.baja || ABIERTA;
    if (p.alta <= baja && alta <= pBaja) return p;
  }
  return null;
}

/** «12/10/2026» para los mensajes. */
export const fechaCorta = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");

export const textoAltaQueSePisa = (p: AltaPresentada): string =>
  `ya tiene un alta presentada con esta empleadora del ${fechaCorta(p.alta)} ${p.baja ? `al ${fechaCorta(p.baja)}${p.bajaSegunArca ? " (baja según ARCA)" : ""}` : "sin fecha de baja"}: no se da otra hasta que termine la vigente`;
