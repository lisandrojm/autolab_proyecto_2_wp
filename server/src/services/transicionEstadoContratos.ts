/**
 * LA TRANSICIÓN DIARIA DEL ESTADO DE LOS CONTRATOS (etapa 3, 19/11/2026).
 *
 * El estado guardado envejece con el calendario: un contrato con baja el 30/11 es VIGENTE hoy y
 * FINALIZADO el 1/12 sin que nadie lo toque. Una vez por día (pasada la medianoche argentina):
 *  1. VIGENTE con la baja ya pasada → FINALIZADO (`transicionDiaria`). EN UN SOLO SENTIDO: nunca vuelve
 *     a VIGENTE ni toca otro estado (decisión del usuario).
 *  2. Completa los contratos que quedaron SIN estado (escrituras por `updateOne` que no pasan por el
 *     hook de `save`), con la misma regla de la migración: lo indecidible queda SIN_DETERMINAR.
 * Cada cambio pasa por el modelo, así que queda en la auditoría de contratos como «tarea
 * initTransicionEstadoScheduler». El filtro de cada escritura repite la condición (sigue VIGENTE, sigue
 * sin estado): lo que cambió en el medio no se pisa.
 *
 * OJO con `enContexto`: una consulta de Mongoose corre cuando se la espera, no cuando se arma; si se
 * espera afuera del contexto, el contexto se pierde. Por eso `.exec()` adentro.
 *
 * El paso 2 corre además cada 30 min (ver el reloj abajo). Lo corre el servidor. Para mirar sin escribir, `transicionarEstados({ escribir: false })`.
 */
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { estadoSegunDatosLocales, tipoEsIndeterminado, transicionDiaria } from "../utils/estadoDeContrato.js";
import { catalogoDeTipos } from "./estadoContratoAlGuardar.js";
import { enContexto } from "../utils/contextoAuditoria.js";

export async function transicionarEstados(opciones: { escribir?: boolean; hoy?: string; soloCompletar?: boolean } = {}): Promise<{ finalizados: number; completados: number; vinculos: number }> {
  const escribir = opciones.escribir !== false;
  const hoy = opciones.hoy || hoyArgentina();
  const proy = "contracts.contratoKey contracts.estadoContrato contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.contrato_id contracts.nombre_contrato";
  let finalizados = 0;
  let completados = 0;
  let vinculos = 0;

  // 1. VIGENTE → FINALIZADO.
  const conVigentes: any[] = opciones.soloCompletar ? [] : await UserProject.find({ contracts: { $elemMatch: { estadoContrato: "VIGENTE", fecha_baja_contrato: { $nin: [null, "", "null"] } } } }).select(proy).lean();
  for (const up of conVigentes) {
    const claves = (up.contracts || []).filter((c: any) => c?.contratoKey && transicionDiaria(c, hoy)).map((c: any) => new Types.ObjectId(String(c.contratoKey)));
    if (!claves.length) continue;
    finalizados += claves.length;
    vinculos++;
    if (escribir) await enContexto({ motivo: `Transición diaria: la baja ya pasó (hoy ${hoy})` }, () => UserProject.updateOne({ _id: up._id }, { $set: { "contracts.$[c].estadoContrato": "FINALIZADO" } }, { arrayFilters: [{ "c.contratoKey": { $in: claves }, "c.estadoContrato": "VIGENTE" }] }).exec());
  }

  // 2. Los que quedaron sin estado.
  const sinEstado: any[] = await UserProject.find({ contracts: { $elemMatch: { estadoContrato: { $in: [null] } } } }).select(proy).lean();
  if (sinEstado.length) {
    const { porId, porNombre } = await catalogoDeTipos();
    for (const up of sinEstado) {
      const grupos = new Map<string, { estado: string; motivo?: string; claves: Types.ObjectId[] }>();
      for (const c of up.contracts || []) {
        if (!c?.contratoKey || c.estadoContrato) continue;
        const r = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy);
        const k = `${r.estado}|${r.motivo || ""}`;
        (grupos.get(k) || grupos.set(k, { ...r, claves: [] }).get(k)!).claves.push(new Types.ObjectId(String(c.contratoKey)));
      }
      if (!grupos.size) continue;
      vinculos++;
      const set: Record<string, unknown> = {};
      const arrayFilters: any[] = [];
      [...grupos.values()].forEach((g, n) => {
        completados += g.claves.length;
        set[`contracts.$[e${n}].estadoContrato`] = g.estado;
        if (g.motivo) set[`contracts.$[e${n}].estadoContratoMotivo`] = g.motivo;
        arrayFilters.push({ [`e${n}.contratoKey`]: { $in: g.claves }, [`e${n}.estadoContrato`]: { $in: [null] } });
      });
      if (escribir) await enContexto({ motivo: "Contrato sin estado: se completa con la regla de datos locales" }, () => UserProject.updateOne({ _id: up._id }, { $set: set }, { arrayFilters }).exec());
    }
  }
  return { finalizados, completados, vinculos };
}

// ---- el reloj: cada 30 min.
//  - Completar los SIN estado corre en CADA vuelta: un contrato de un día escrito por `updateOne` (sin el
//    hook) no puede esperar a mañana, porque mañana ya venció y nunca habría estado VIGENTE (lo marcó el
//    usuario, 19/11). Sólo toca estados nulos.
//  - VIGENTE → FINALIZADO, una vez por día pasada la medianoche argentina.
const CADA_MS = 30 * 60_000;
let ultimoDia = "";
let enCurso = false;

async function tick() {
  if (enCurso) return;
  const hoy = hoyArgentina();
  const soloCompletar = ultimoDia === hoy;
  enCurso = true;
  try {
    const r = await transicionarEstados({ hoy, soloCompletar });
    if (soloCompletar) {
      if (r.completados) console.log(`[estado-contratos] ${hoy}: ${r.completados} sin estado completados · ${r.vinculos} vínculo(s)`);
      return;
    }
    ultimoDia = hoy;
    console.log(`[estado-contratos] ${hoy}: ${r.finalizados} pasaron a FINALIZADO · ${r.completados} sin estado completados · ${r.vinculos} vínculo(s)`);
  } catch (e: any) {
    console.error("[estado-contratos] falló la transición diaria:", e?.message || e);
  } finally {
    enCurso = false;
  }
}

export function initTransicionEstadoScheduler(): void {
  setTimeout(() => void tick(), 120_000);
  setInterval(() => void tick(), CADA_MS);
  console.log("[estado-contratos] transición diaria VIGENTE → FINALIZADO programada (cada 30 min mira si ya corrió hoy)");
}
