/**
 * ARCA EN MODO AUDITORÍA (etapa 5, 20/11/2026): LO QUE NO ENCAJA ENTRE WEPRODU Y ARCA, EN UN SOLO LUGAR.
 *
 * Las bajas con evidencia fuerte ya llegan solas al contrato (`bajasArcaAutomaticas.ts`). Esto es lo otro:
 * lo que NO se escribe porque la evidencia no alcanza o porque la diferencia es un hecho que tiene que
 * decidir una persona. Se lista, con las dos fechas y el porqué; nada de acá escribe ni deduce.
 *
 *  - faltaBajaArca      el contrato terminó en WeProdu y en ARCA la relación sigue abierta: falta presentar
 *                       la baja EN ARCA (la exposición legal es ésta).
 *  - revisionManual     tramos de ARCA que ningún contrato explica, un hecho en medio de varios tramos, otro
 *                       contrato con la misma alta (Xiara), recibos posteriores a la baja de ARCA (Jordan,
 *                       Fernández: WeProdu fusionó relaciones).
 *  - granularidad       ARCA declara por jornadas dentro del contrato, pero el último tramo termina más de
 *                       15 días antes que el contrato: ¿la persona dejó antes? (Sarli, Peralta, Freno).
 *  - relacionSinContrato una relación de ARCA cuyo inicio no es el alta exacta de ningún contrato, pero que
 *                       se solapa con contratos de esa persona y empleadora: la misma relación con otra
 *                       fecha (Valentina Pellegrini: 07/02 vs 10/02/2025) o un tramo de ARCA que WeProdu
 *                       tiene por jornadas. No se alinea sola (decisión del 18/11).
 *  - discrepanciasFrame lo que FRAME manda distinto de WeProdu y el import no pisó (vacío mientras el import
 *                       esté pausado; el contador tenía que vivir en un lugar que alguien mire).
 *
 * Los TOTALES se guardan en el tenant (`sincronizacionRelaciones.auditoria`) después de cada corrida
 * automática y cada vez que alguien abre la pestaña: así el contador del menú no recalcula nada.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { DiscrepanciaFrame } from "../../models/DiscrepanciaFrame.js";
import { User } from "../../models/User.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
import { UMBRAL_GRANULARIDAD_DIAS } from "../../utils/bajasArcaContrato.js";
import { relacionesSinContratoExacto } from "../../utils/auditoriaArca.js";
import { cargarContextoArca, planDeBajasArca, type ItemBajaArca } from "./bajasArcaContratos.js";

const BASE = "integrations.arcaSimplificacion.sincronizacionRelaciones";
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fechaDe = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v as any));

/** Un ítem de bajas como lo ve la pantalla (sin los valores crudos que sólo sirven para escribir). */
export type ItemAuditoriaBaja = Omit<ItemBajaArca, "bajaCruda" | "altaCruda">;

export interface ItemRelacionSinContrato {
  userId: string;
  persona: string;
  cuil: string;
  empleadora: string;
  empleadoraCuit: string;
  inicio: string;
  fin: string;
  situacionBaja: string;
  /** Los contratos solapados, del más cercano al más lejano. `dias` positivo = ARCA empieza después. */
  contratos: { contratoKey: string; userProjectId: string; posicion: number; proyecto: string; contrato: string; alta: string; baja: string; dias: number }[];
}

export interface ItemDiscrepanciaFrame {
  _id: string;
  userId: string;
  persona: string;
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  campo: string;
  weprodu: string;
  frame: string;
  detectadaEl: string;
  ultimaVezEl: string;
  veces: number;
}

export interface TotalesAuditoria {
  faltaBajaArca: number;
  revisionManual: number;
  granularidad: number;
  relacionSinContrato: number;
  discrepanciasFrame: number;
  total: number;
}

export interface AuditoriaArca {
  hoy: string;
  espejoAl: string | null;
  calculadoEl: string;
  faltaBajaArca: ItemAuditoriaBaja[];
  revisionManual: ItemAuditoriaBaja[];
  granularidad: ItemAuditoriaBaja[];
  relacionSinContrato: ItemRelacionSinContrato[];
  discrepanciasFrame: ItemDiscrepanciaFrame[];
  totales: TotalesAuditoria;
}

const sinCrudos = ({ bajaCruda: _b, altaCruda: _a, ...x }: ItemBajaArca): ItemAuditoriaBaja => x;

export async function auditoriaArca(tenantId: Types.ObjectId | string): Promise<AuditoriaArca> {
  const tid = new Types.ObjectId(String(tenantId));
  const ctx = await cargarContextoArca(tid);
  const plan = await planDeBajasArca(tid, { contexto: ctx });

  // Lo que sale del clasificador de bajas.
  const faltaBajaArca = plan.items.filter((x) => x.tipo === "arca_abierta").map(sinCrudos);
  const revisionManual = plan.items.filter((x) => x.tipo === "revision_manual").map(sinCrudos);
  const granularidad = plan.items.filter((x) => x.tipo === "arca_granularidad" && (x.diasAntesDelFin ?? 0) > UMBRAL_GRANULARIDAD_DIAS).map(sinCrudos);

  // Relaciones de ARCA sin contrato exacto (regla pura en `utils/auditoriaArca.ts`).
  const porClave = new Map<string, { up: any; c: any; i: number }>();
  const porPersona = new Map<string, { userId: string; persona: string }>();
  const empresaPorCuit = new Map([...ctx.empresa.values()].map((e) => [e.cuit, e.nombre]));
  const contratos: { contratoKey: string; alta: string; baja: string; cuil: string; cuit: string; estadoContrato?: unknown }[] = [];
  for (const up of ctx.ups) {
    const u = ctx.porUsuario.get(String(up.userId));
    if (!u) continue;
    const cuil = dig(u.metadata.cuit);
    porPersona.set(cuil, { userId: String(up.userId), persona: `${u.firstName || ""} ${u.lastName || ""}`.trim() });
    (up.contracts || []).forEach((c: any, i: number) => {
      if (!c?.contratoKey || !c.empresaContratoId) return;
      const e = ctx.empresa.get(String(c.empresaContratoId));
      if (!e) return;
      porClave.set(String(c.contratoKey), { up, c, i });
      contratos.push({ contratoKey: String(c.contratoKey), alta: fechaDe(c.fecha_alta_contrato), baja: fechaDe(c.fecha_baja_contrato), cuil, cuit: e.cuit, estadoContrato: c.estadoContrato });
    });
  }
  const relacionSinContrato: ItemRelacionSinContrato[] = relacionesSinContratoExacto(contratos, [...ctx.relsPorCuil.values()].flat(), ctx.hoy)
    .map((x) => ({
      userId: porPersona.get(x.cuil)?.userId || "",
      persona: porPersona.get(x.cuil)?.persona || x.cuil,
      cuil: x.cuil,
      empleadora: empresaPorCuit.get(x.cuit) || x.cuit,
      empleadoraCuit: x.cuit,
      inicio: x.inicio,
      fin: x.fin,
      situacionBaja: x.situacionBaja,
      contratos: x.contratos.map((s) => {
        const d = porClave.get(s.contratoKey)!;
        return { contratoKey: s.contratoKey, userProjectId: String(d.up._id), posicion: d.i, proyecto: d.up.nombre_proyecto || "", contrato: d.c.nombre_contrato || "", alta: s.alta, baja: s.baja, dias: s.dias };
      }),
    }))
    .sort((a, b) => a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));

  // Discrepancias con FRAME sin resolver (las viejas pueden no tener tenant).
  const disc: any[] = await DiscrepanciaFrame.find({ tenantId: { $in: [tid, null] }, resuelta: false }).sort({ ultimaVezEl: -1 }).lean();
  const ids = [...new Set(disc.map((d) => String(d.userId || "")).filter((x) => Types.ObjectId.isValid(x)))];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const us: any[] = await User.find({ _id: { $in: ids.map((x) => new Types.ObjectId(x)) } }).select("firstName lastName").lean();
    for (const u of us) nombres.set(String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim());
  }
  const discrepanciasFrame: ItemDiscrepanciaFrame[] = disc.map((d) => ({
    _id: String(d._id),
    userId: String(d.userId || ""),
    persona: nombres.get(String(d.userId || "")) || String(d.userId || ""),
    userProjectId: String(d.userProjectId),
    contratoKey: d.contratoKey ? String(d.contratoKey) : null,
    posicion: Number(d.posicion ?? 0),
    campo: String(d.campo || ""),
    weprodu: String(d.weprodu?.nombre || d.weprodu?.id || "—"),
    frame: String(d.frame?.nombre || d.frame?.id || "—"),
    detectadaEl: d.detectadaEl ? new Date(d.detectadaEl).toISOString() : "",
    ultimaVezEl: d.ultimaVezEl ? new Date(d.ultimaVezEl).toISOString() : "",
    veces: Number(d.veces || 1),
  }));

  const totales: TotalesAuditoria = {
    faltaBajaArca: faltaBajaArca.length,
    revisionManual: revisionManual.length,
    granularidad: granularidad.length,
    relacionSinContrato: relacionSinContrato.length,
    discrepanciasFrame: discrepanciasFrame.length,
    total: faltaBajaArca.length + revisionManual.length + granularidad.length + relacionSinContrato.length + discrepanciasFrame.length,
  };
  return { hoy: ctx.hoy, espejoAl: ctx.espejoAl, calculadoEl: new Date().toISOString(), faltaBajaArca, revisionManual, granularidad, relacionSinContrato, discrepanciasFrame, totales };
}

/** Deja los totales en el tenant: es lo que lee el contador sin recalcular. */
export async function guardarTotalesAuditoria(tenantId: Types.ObjectId | string, totales: TotalesAuditoria, el = new Date()): Promise<void> {
  await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, { $set: { [`${BASE}.auditoria`]: { el, totales } } });
}

export async function totalesGuardados(tenantId: Types.ObjectId | string): Promise<{ el: string | null; totales: TotalesAuditoria | null }> {
  const t: any = await Tenant.findById(new Types.ObjectId(String(tenantId))).select(`${BASE}.auditoria`).lean();
  const a = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.auditoria;
  return { el: a?.el ? new Date(a.el).toISOString() : null, totales: a?.totales || null };
}

/** Para la corrida automática: recalcula y guarda los totales. Nunca tira. */
export async function recalcularAuditoriaArca(tenantId: string): Promise<TotalesAuditoria | null> {
  try {
    const a = await auditoriaArca(tenantId);
    await guardarTotalesAuditoria(tenantId, a.totales);
    console.log(`[auditoria-arca] ${tenantId}: ${a.totales.total} para mirar (falta baja en ARCA ${a.totales.faltaBajaArca} · revisión manual ${a.totales.revisionManual} · granularidad ${a.totales.granularidad} · relación sin contrato exacto ${a.totales.relacionSinContrato} · FRAME ${a.totales.discrepanciasFrame})`);
    return a.totales;
  } catch (e: any) {
    console.error(`[auditoria-arca] ${tenantId}: falló:`, e?.message || e);
    return null;
  }
}
