/**
 * LAS BAJAS DE ARCA LLEGAN SOLAS AL CONTRATO (decisión del usuario, 19/11/2026).
 *
 * Hasta acá las bajas con evidencia fuerte se escribían sólo cuando alguien apretaba «Sincronizar bajas a
 * contratos». Un botón que hay que acordarse de apretar es la misma falla de siempre: Becerini estuvo
 * veinte meses abierto en la plataforma con la baja en ARCA desde febrero de 2025, y nadie se enteró
 * porque nada avisaba. Ahora, después de cada corrida AUTOMÁTICA de Relaciones Laborales (la de las
 * 06:00 de cada tenant que la tenga activa), se aplican solas. «Sincronizar ahora» no las aplica: ahí hay
 * una persona delante que puede mirar el plan.
 *
 * Las condiciones del usuario:
 *  - Sólo `aplicar: true` (evidencia fuerte, guardián de recibos incluido). El resto se LISTA, nunca se
 *    infiere.
 *  - Auditado con su propio nombre (origen «sistema», detalle «cron …»), para distinguir siempre «lo
 *    aplicó el cron» de «lo aplicó alguien a mano» (origen «app», con la persona).
 *  - UN TOPE. Si la corrida va a aplicar más bajas que `TOPE_BAJAS_ARCA_AUTOMATICAS` (20 si no está),
 *    no aplica NINGUNA y lo reporta: un escritor automático sobre 8.000 contratos sin nadie delante
 *    necesita un radio de explosión acotado (un archivo raro de ARCA, un matcher degradado por un cambio
 *    futuro, una corrección masiva de empleadoras). Lo frenado se ve en «Última sincronización» y en
 *    «Sincronizar bajas», y lo aplica una persona si corresponde.
 *  - Una empleadora cuya lectura falló en esta corrida tiene el espejo viejo: sus bajas quedan afuera
 *    hasta la próxima corrida sana.
 * El resultado queda en `ultimaSync.bajasContratos` (Tenant), que es lo que muestra la pestaña.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { enContexto } from "../../utils/contextoAuditoria.js";
import { aplicarBajasArca, planDeBajasArca } from "./bajasArcaContratos.js";

export const TOPE_POR_DEFECTO = 20;
export const DETALLE_AUDITORIA = "cron sincronizacionRelaciones: bajas de ARCA a contratos";

/** El tope vigente: `TOPE_BAJAS_ARCA_AUTOMATICAS` (entero ≥ 1) o 20. */
export function topeBajasAutomaticas(valor: unknown = process.env.TOPE_BAJAS_ARCA_AUTOMATICAS): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : TOPE_POR_DEFECTO;
}

export interface ResumenBajasAutomaticas {
  /** Cuántas iban a aplicarse (evidencia fuerte, después del guardián y sin las empleadoras con error). */
  aplicables: number;
  aplicadas: number;
  /** Cambiaron entre el plan y la escritura (no se pisó nada). */
  cambiaron: number;
  /** Las que se listan para una persona (sin evidencia, revisión manual, granularidad…). */
  listadas: number;
  /** Con evidencia pero de una empleadora cuya lectura falló en esta corrida. */
  excluidasPorEmpleadora: number;
  frenada: boolean;
  tope: number;
  error?: string;
}

/**
 * La decisión, pura: qué claves se escriben, o nada si se pasa del tope.
 * `cuitsConError`: empleadoras cuya lectura falló en esta corrida (su espejo es viejo).
 */
export function decidirBajasAutomaticas(
  items: { contratoKey: string; aplicar: boolean; empleadoraCuit: string }[],
  tope: number,
  cuitsConError: string[] = [],
): Pick<ResumenBajasAutomaticas, "aplicables" | "listadas" | "excluidasPorEmpleadora" | "frenada" | "tope"> & { claves: string[] } {
  const conError = new Set(cuitsConError);
  const conEvidencia = items.filter((x) => x.aplicar);
  const sanas = conEvidencia.filter((x) => !conError.has(x.empleadoraCuit));
  const frenada = sanas.length > tope;
  return {
    claves: frenada ? [] : sanas.map((x) => x.contratoKey),
    aplicables: sanas.length,
    listadas: items.length - conEvidencia.length,
    excluidasPorEmpleadora: conEvidencia.length - sanas.length,
    frenada,
    tope,
  };
}

/** Después de una corrida automática sana: aplica (o frena) y deja el resultado en `ultimaSync.bajasContratos`. */
export async function aplicarBajasArcaAutomaticas(tenantId: string, cuitsConError: string[] = []): Promise<ResumenBajasAutomaticas> {
  const tid = new Types.ObjectId(tenantId);
  const tope = topeBajasAutomaticas();
  let r: ResumenBajasAutomaticas;
  try {
    const plan = await planDeBajasArca(tid);
    const d = decidirBajasAutomaticas(plan.items, tope, cuitsConError);
    r = { aplicables: d.aplicables, aplicadas: 0, cambiaron: 0, listadas: d.listadas, excluidasPorEmpleadora: d.excluidasPorEmpleadora, frenada: d.frenada, tope };
    if (d.frenada) {
      console.error(`[bajas-arca-auto] ${tenantId}: FRENADA. Iban a aplicarse ${d.aplicables} bajas y el tope es ${tope}: no se escribió ninguna. Revisarlas en «Sincronizar bajas a contratos».`);
    } else if (d.claves.length) {
      const e = await enContexto({ origen: "sistema", detalle: DETALLE_AUDITORIA }, () => aplicarBajasArca(tid, { claves: d.claves, plan }));
      r.aplicadas = e.escritos.length;
      r.cambiaron = e.cambiaron.length;
    }
    console.log(`[bajas-arca-auto] ${tenantId}: ${r.aplicadas} aplicadas · ${r.listadas} listadas para una persona${r.excluidasPorEmpleadora ? ` · ${r.excluidasPorEmpleadora} sin aplicar por empleadora con error` : ""}${r.cambiaron ? ` · ${r.cambiaron} cambiaron en el medio` : ""}`);
  } catch (e: any) {
    r = { aplicables: 0, aplicadas: 0, cambiaron: 0, listadas: 0, excluidasPorEmpleadora: 0, frenada: false, tope, error: String(e?.message || e) };
    console.error(`[bajas-arca-auto] ${tenantId}: falló:`, r.error);
  }
  await Tenant.updateOne({ _id: tid }, { $set: { "integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.bajasContratos": r } }).catch(() => {});
  return r;
}
