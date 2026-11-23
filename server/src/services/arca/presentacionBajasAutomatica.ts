/**
 * A.R.C.A BAJAS AUTOMÁTICAS: PRESENTA EN ARCA LO QUE SE CERRÓ EN WEPRODU (22/11/2026, pedido del usuario).
 *
 * OJO CON EL NOMBRE: `bajasArcaAutomaticas.ts` es el proceso CONTRARIO («Bajas de ARCA a contratos»: copia al
 * contrato lo que ARCA ya tiene). Éste va de WeProdu a ARCA, y corre DESPUÉS de aquél, al final de la
 * sincronización automática de las 06:00 (`sincronizacionRelacionesCronService.ts`): necesita el espejo del día
 * para no presentar algo que ARCA ya tiene. Nunca corre antes, ni suelto.
 *
 * NO HAY OTRO CAMINO HACIA ARCA: cada baja se arma con el plan del panel (`planOperacion`) y se manda con el envío
 * del panel (`arrancarOperacionRelacion`), una por vez. Todo lo que el panel rechazaría, acá se saltea con su motivo.
 *
 * QUÉ PRESENTA: sólo las filas de Bajas ARCA en situación 1 (terminado en WeProdu) y 2 (termina antes de su fecha).
 * QUÉ NO PRESENTA NUNCA: la 3, la 4, la 5, la 6 y las bloqueadas (no son candidatas); las relaciones con modalidad
 * de directores (LRT); los contratos sin motivo de baja cargado, o con renuncia sin fecha de telegrama (NUNCA se
 * elige un motivo por defecto: `compartido/arca/motivoBaja.ts`); las de una empleadora cuya lectura falló en esta
 * sincronización (su espejo es viejo); y lo que el plan del panel no deja mandar.
 *
 * LOS FRENOS:
 *  · Apagada por defecto. Tres modos: `apagada`, `simular` (prueba en seco de cada una: entra, completa y cancela)
 *    y `presentar`. Quién cambió el modo y cuándo queda en `cambios`.
 *  · DOS ESCALONES. «Simular» no se puede elegir hasta que exista una prueba en seco hecha A MANO desde el panel
 *    (registrada en Operaciones). «Presentar», hasta que exista una baja mandada a mano y CONFIRMADA por la
 *    sincronización (la relación figura cerrada en el espejo). Lo automático no habilita nada.
 *  · TOPE: 5 por corrida. Si hay más para presentar que el tope, no presenta NINGUNA y avisa.
 *  · Si una queda sin confirmar, ARCA la rechaza o falla, la corrida se CORTA ahí: no sigue con las demás.
 *  · No corre mientras haya una sincronización de relaciones en curso, ni si ARCA está ocupada por otra operación.
 *
 * QUÉ DEJA: cada operación en Bajas ARCA › Operaciones (el mismo registro del panel, con la pantalla de ARCA),
 * marcada `automatica`. Y por corrida, acá: cuántas candidatas, cuántas presentadas o simuladas, y cuáles se
 * saltearon y por qué (`corridas`, en el tenant).
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { enContexto } from "../../utils/contextoAuditoria.js";
import { esModalidadDirectoresLrt } from "../../compartido/arca/modalidadArca.js";
import { TEXTO_FALTA } from "../../compartido/arca/motivoBaja.js";
import { CandadoArcaOcupado } from "./candadoArca.js";
import { enSecoForzado } from "./corridaAltas.js";
import { arrancarOperacionRelacion, corridaOperacionDe, finDeOperacion, type ResultadoOperacion } from "./corridaOperacionRelacion.js";
import { listaBajasArca, type FilaBajaArca } from "./listaBajasArca.js";
import { planOperacion, type ReferenciaContrato } from "./operacionRelacion.js";
import type { DatosBaja } from "./reglasOperacionRelacion.js";
import { syncEnCurso } from "./sincronizarRelaciones.js";

export type ModoBajasAutomaticas = "apagada" | "simular" | "presentar";
export const MODOS: ModoBajasAutomaticas[] = ["apagada", "simular", "presentar"];
export const NOMBRE_MODO: Record<ModoBajasAutomaticas, string> = { apagada: "Apagada", simular: "Solo simular", presentar: "Presentar" };
export const TOPE_POR_CORRIDA = 5;
export const DETALLE_AUDITORIA = "cron sincronizacionRelaciones: bajas automáticas de WeProdu a ARCA";
const BASE = "integrations.arcaSimplificacion.presentacionBajas";
const CORRIDAS_GUARDADAS = 60;
const CAMBIOS_GUARDADOS = 50;

export const modoDe = (v: unknown): ModoBajasAutomaticas => (MODOS.includes(v as ModoBajasAutomaticas) ? (v as ModoBajasAutomaticas) : "apagada");

// ───────────────────────────── Qué entra y qué no: la parte pura ─────────────────────────────

export type RazonDeSalteo = "lrt" | "falta_motivo" | "falta_telegrama" | "empleadora_con_error" | "plan";

export interface Salteada {
  clave: string;
  persona: string;
  cuil: string;
  empleadora: string;
  situacion: number;
  razon: RazonDeSalteo;
  texto: string;
}

const resumenDeFila = (f: FilaBajaArca) => ({ clave: f.clave, persona: f.persona, cuil: f.cuil, empleadora: f.empleadora, situacion: f.situacion as number });

/**
 * De la lista de Bajas ARCA, las CANDIDATAS (situación 1 o 2, con su contrato y sin bloqueo) partidas en las que
 * pasan a mirarse con el plan del panel y las que se saltean acá, con el motivo. Pura.
 */
export function elegirCandidatas(filas: FilaBajaArca[], empleadorasConError: string[] = []): { candidatas: FilaBajaArca[]; paraPlan: FilaBajaArca[]; salteadas: Salteada[] } {
  const conError = new Set(empleadorasConError.map((c) => String(c).replace(/\D/g, "")));
  const candidatas = filas.filter((f) => (f.situacion === 1 || f.situacion === 2) && !f.bloqueo && !!f.contrato);
  const paraPlan: FilaBajaArca[] = [];
  const salteadas: Salteada[] = [];
  for (const f of candidatas) {
    const saltear = (razon: RazonDeSalteo, texto: string) => salteadas.push({ ...resumenDeFila(f), razon, texto });
    if (esModalidadDirectoresLrt(f.modalidadArca)) saltear("lrt", "Modalidad de directores (LRT): no se presenta sola; la confirma una persona desde el panel.");
    else if (f.falta === "motivo") saltear("falta_motivo", `${TEXTO_FALTA.motivo}: la baja en ARCA lo exige y nunca se elige uno por defecto.`);
    else if (f.falta === "telegrama") saltear("falta_telegrama", `${TEXTO_FALTA.telegrama}: es una renuncia y ARCA la pide.`);
    else if (conError.has(f.empleadoraCuit)) saltear("empleadora_con_error", "La lectura de esta empleadora falló en la sincronización de hoy: su espejo puede estar viejo.");
    else paraPlan.push(f);
  }
  return { candidatas, paraPlan, salteadas };
}

/** Lo que se le pasa al plan y al envío del panel para una fila: el contrato y los datos de la baja, todos del contrato. */
export function pedidoDeBaja(f: FilaBajaArca): { ref: ReferenciaContrato; datos: DatosBaja } {
  return {
    ref: { userProjectId: f.contrato!.userProjectId, contratoKey: f.contrato!.contratoKey, contractIndex: f.contrato!.posicion },
    datos: { fechaFin: f.finWeprodu, situacionBaja: f.motivoBaja?.codigo || "", ...(f.motivoBaja?.fechaTelegrama ? { fechaTelegrama: f.motivoBaja.fechaTelegrama } : {}) },
  };
}

/** Con más para presentar que el tope no se presenta NINGUNA. Pura. */
export const superaElTope = (cuantas: number, tope = TOPE_POR_CORRIDA): boolean => cuantas > tope;

export type ResultadoDeItem = "presentada" | "simulada" | "sin_confirmar" | "rechazada" | "fallida";

/** Qué significa el resultado del envío del panel para la corrida, y si la corta. Pura. */
export function lecturaDelResultado(r: ResultadoOperacion | undefined): { resultado: ResultadoDeItem; corta: boolean; detalle: string } {
  if (!r) return { resultado: "fallida", corta: true, detalle: "La operación no dejó resultado." };
  if (r.resultado === "seco") return { resultado: "simulada", corta: false, detalle: "Prueba en seco: se completó y se canceló sin confirmar." };
  if (r.resultado === "presentada" || r.resultado === "ya_hecha") return { resultado: "presentada", corta: false, detalle: r.resultado === "ya_hecha" ? "ARCA ya la tenía registrada." : r.acuse?.cbt ? `C.B.T. ${String(r.acuse.cbt)}` : "" };
  if (r.resultado === "rechazada") return { resultado: "rechazada", corta: true, detalle: r.motivo || "ARCA la rechazó." };
  if (r.resultado === "indeterminado") return { resultado: "sin_confirmar", corta: true, detalle: r.motivo || "Se mandó y no se pudo leer el resultado: mirar la relación en ARCA." };
  return { resultado: "fallida", corta: true, detalle: r.motivo || "No se pudo recorrer la pantalla de ARCA." };
}

// ───────────────────────────── Los dos escalones ─────────────────────────────

export interface Requisitos {
  /** Hay una prueba en seco de una baja hecha a mano desde el panel: habilita «Solo simular». */
  secoManual: { cumplido: boolean; el: string | null };
  /** Hay una baja mandada a mano y confirmada por la sincronización (cerrada en el espejo): habilita «Presentar». */
  bajaConfirmada: { cumplido: boolean; el: string | null; pendientesDeSincronizar: number };
}

const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);

export async function requisitosDe(tenantObjectId: Types.ObjectId): Promise<Requisitos> {
  const manual = { tenantId: tenantObjectId, tipo: "baja", automatica: { $ne: true } };
  const [seco, reales]: [any, any[]] = await Promise.all([
    ArcaAltasLog.findOne({ ...manual, enSeco: true, resultado: "seco" }).sort({ createdAt: 1 }).select("createdAt").lean(),
    ArcaAltasLog.find({ ...manual, enSeco: { $ne: true }, resultado: { $in: ["presentada", "ya_hecha"] } }).sort({ createdAt: 1 }).select("createdAt operacion.claveRelacion").lean(),
  ]);
  // «Confirmada por la sincronización»: la relación de esa baja figura con fecha de fin en el espejo.
  let confirmada: any = null;
  for (const l of reales) {
    const [empleadoraCuit, cuil, inicio] = String(l.operacion?.claveRelacion || "").split("|");
    if (!empleadoraCuit || !cuil || !/^\d{4}-\d{2}-\d{2}$/.test(inicio || "")) continue;
    const cerrada = await RelacionLaboralArca.exists({ tenantId: tenantObjectId, empleadoraCuit, cuil, fechaInicio: new Date(`${inicio}T00:00:00.000Z`), fechaFin: { $ne: null } });
    if (cerrada) {
      confirmada = l;
      break;
    }
  }
  return {
    secoManual: { cumplido: !!seco, el: iso(seco?.createdAt) },
    bajaConfirmada: { cumplido: !!confirmada, el: iso(confirmada?.createdAt), pendientesDeSincronizar: confirmada ? 0 : reales.length },
  };
}

/** Por qué no se puede elegir ese modo ("" si se puede). Pura. */
export function motivoParaNoElegir(modo: ModoBajasAutomaticas, r: Requisitos): string {
  if (modo === "apagada") return "";
  if (!r.secoManual.cumplido) return "Todavía no hay ninguna prueba en seco de una baja hecha a mano desde el panel (Bajas ARCA › «Dar de baja» › «Probar en seco»). Es el primer escalón: sin ésa no se puede simular ni presentar sola.";
  if (modo === "simular") return "";
  if (!r.bajaConfirmada.cumplido)
    return r.bajaConfirmada.pendientesDeSincronizar > 0
      ? "Hay una baja mandada a mano, pero la sincronización todavía no la trajo cerrada: «Presentar» se habilita cuando ARCA la confirme en el espejo."
      : "Todavía no hay ninguna baja mandada a mano desde el panel y confirmada por la sincronización: nunca se confirmó una baja real. Hasta entonces sólo se puede simular.";
  return "";
}

// ───────────────────────────── La configuración ─────────────────────────────

export interface CambioDeModo {
  el: string;
  de: ModoBajasAutomaticas;
  a: ModoBajasAutomaticas;
  por: { userId: string; nombre: string };
}

export interface ItemDeCorrida {
  clave: string;
  persona: string;
  cuil: string;
  empleadora: string;
  situacion: number;
  resultado: ResultadoDeItem;
  detalle: string;
  logId: string | null;
}

export interface CorridaBajasAutomaticas {
  el: string;
  modo: ModoBajasAutomaticas;
  /** `false`: no llegó a mirar la lista (sincronización en curso, requisito que ya no se cumple). */
  corrio: boolean;
  candidatas: number;
  /** Las que pasaron todos los filtros y el plan del panel. */
  paraPresentar: number;
  presentadas: number;
  simuladas: number;
  salteadas: Salteada[];
  items: ItemDeCorrida[];
  /** Por qué no se presentó ninguna o se cortó ("" si terminó). */
  aviso: string;
  duracionMs: number;
  log: string[];
}

export interface GuardadoBajasAutomaticas {
  modo: ModoBajasAutomaticas;
  cambios: CambioDeModo[];
  ultimaCorrida: CorridaBajasAutomaticas | null;
  corridas: CorridaBajasAutomaticas[];
}

export async function guardadoDe(tenantObjectId: Types.ObjectId): Promise<GuardadoBajasAutomaticas> {
  const t: any = await Tenant.findById(tenantObjectId).select(BASE).lean();
  const g = t?.integrations?.arcaSimplificacion?.presentacionBajas || {};
  const corridas: CorridaBajasAutomaticas[] = [...(g.corridas || [])].reverse();
  return { modo: modoDe(g.modo), cambios: [...(g.cambios || [])].reverse(), ultimaCorrida: corridas[0] || null, corridas };
}

export class ModoNoPermitido extends Error {}

/** Cambia el modo. Tira `ModoNoPermitido` si el escalón no está cumplido. Deja quién lo cambió. */
export async function cambiarModo(tenantObjectId: Types.ObjectId, modo: ModoBajasAutomaticas, por: { userId: string; nombre: string }): Promise<GuardadoBajasAutomaticas> {
  if (!MODOS.includes(modo)) throw new ModoNoPermitido(`Modo desconocido: «${String(modo)}». Son: ${MODOS.join(", ")}.`);
  const motivo = motivoParaNoElegir(modo, await requisitosDe(tenantObjectId));
  if (motivo) throw new ModoNoPermitido(motivo);
  const antes = (await guardadoDe(tenantObjectId)).modo;
  if (antes !== modo) {
    const cambio: CambioDeModo = { el: new Date().toISOString(), de: antes, a: modo, por };
    await Tenant.updateOne({ _id: tenantObjectId }, { $set: { [`${BASE}.modo`]: modo }, $push: { [`${BASE}.cambios`]: { $each: [cambio], $slice: -CAMBIOS_GUARDADOS } } });
    console.log(`[bajas-automaticas-arca] ${String(tenantObjectId)}: modo ${antes} → ${modo} por ${por.nombre || por.userId}`);
  }
  return guardadoDe(tenantObjectId);
}

// ───────────────────────────── Qué haría hoy (sin tocar ARCA) ─────────────────────────────

export interface Previa {
  candidatas: number;
  paraPresentar: Array<ReturnType<typeof resumenDeFila> & { motivo: string; fechaFin: string }>;
  salteadas: Salteada[];
  superaElTope: boolean;
}

async function mirar(tenantObjectId: Types.ObjectId, empleadorasConError: string[]): Promise<{ candidatas: FilaBajaArca[]; presentables: FilaBajaArca[]; salteadas: Salteada[] }> {
  const lista = await listaBajasArca(tenantObjectId);
  const { candidatas, paraPlan, salteadas } = elegirCandidatas(lista.filas, empleadorasConError);
  const presentables: FilaBajaArca[] = [];
  for (const f of paraPlan) {
    // EL PLAN DEL PANEL: lo que él no dejaría mandar (ARCA ya tiene la baja, otra fecha de fin, baja ya mandada…) no se manda.
    const { ref, datos } = pedidoDeBaja(f);
    try {
      const { plan } = await planOperacion(tenantObjectId, { op: "baja", ref, datos });
      if (plan.puede) presentables.push(f);
      else salteadas.push({ ...resumenDeFila(f), razon: "plan", texto: plan.motivo });
    } catch (e: any) {
      salteadas.push({ ...resumenDeFila(f), razon: "plan", texto: String(e?.message || e) });
    }
  }
  return { candidatas, presentables, salteadas };
}

/** Lo que la corrida haría ahora mismo con el espejo que hay. No abre ARCA ni escribe nada. */
export async function previaDe(tenantObjectId: Types.ObjectId): Promise<Previa> {
  const { candidatas, presentables, salteadas } = await mirar(tenantObjectId, []);
  return {
    candidatas: candidatas.length,
    paraPresentar: presentables.map((f) => ({ ...resumenDeFila(f), motivo: `${f.motivoBaja?.codigo || ""}${f.motivoBaja?.descripcion ? ` · ${f.motivoBaja.descripcion}` : ""}`, fechaFin: f.finWeprodu })),
    salteadas,
    superaElTope: superaElTope(presentables.length),
  };
}

// ───────────────────────────── La corrida ─────────────────────────────

async function guardarCorrida(tenantObjectId: Types.ObjectId, c: CorridaBajasAutomaticas): Promise<void> {
  await Tenant.updateOne({ _id: tenantObjectId }, { $push: { [`${BASE}.corridas`]: { $each: [c], $slice: -CORRIDAS_GUARDADAS } } }).catch((e: any) => console.error("[bajas-automaticas-arca] no pude guardar la corrida:", e?.message || e));
}

/**
 * LA CORRIDA, al final de la sincronización automática. `empleadorasConError`: los CUIT cuya lectura falló hoy.
 * Apagada no hace ni guarda nada. Nunca tira: una falla acá no toca la sincronización.
 */
export async function correrBajasAutomaticas(tenantId: string, empleadorasConError: string[] = []): Promise<CorridaBajasAutomaticas | null> {
  const tenantObjectId = new Types.ObjectId(tenantId);
  const inicio = Date.now();
  let modo: ModoBajasAutomaticas = "apagada";
  try {
    modo = (await guardadoDe(tenantObjectId)).modo;
  } catch (e: any) {
    console.error(`[bajas-automaticas-arca] ${tenantId}: no pude leer la configuración:`, e?.message || e);
    return null;
  }
  if (modo === "apagada") return null;

  const corrida: CorridaBajasAutomaticas = { el: new Date().toISOString(), modo, corrio: false, candidatas: 0, paraPresentar: 0, presentadas: 0, simuladas: 0, salteadas: [], items: [], aviso: "", duracionMs: 0, log: [] };
  const anotar = (texto: string) => {
    corrida.log.push(`${new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })} ${texto}`);
    console.log(`[bajas-automaticas-arca] ${tenantId}: ${texto}`);
  };
  const cerrar = async (aviso = "") => {
    corrida.aviso = aviso;
    if (aviso) anotar(aviso);
    corrida.duracionMs = Date.now() - inicio;
    await guardarCorrida(tenantObjectId, corrida);
    return corrida;
  };

  try {
    anotar(`Modo «${NOMBRE_MODO[modo]}»${enSecoForzado() && modo === "presentar" ? " (este servidor fuerza la prueba en seco: no se confirma nada)" : ""}.`);
    if (syncEnCurso(tenantId)) return await cerrar("No corrió: hay una sincronización de relaciones en curso.");
    // El escalón se vuelve a mirar al correr: si ya no se cumple, no se hace nada.
    const motivo = motivoParaNoElegir(modo, await requisitosDe(tenantObjectId));
    if (motivo) return await cerrar(`No corrió: ${motivo}`);

    corrida.corrio = true;
    const { candidatas, presentables, salteadas } = await mirar(tenantObjectId, empleadorasConError);
    corrida.candidatas = candidatas.length;
    corrida.paraPresentar = presentables.length;
    corrida.salteadas = salteadas;
    anotar(`${candidatas.length} candidata${candidatas.length === 1 ? "" : "s"} (situaciones 1 y 2): ${presentables.length} para ${modo === "simular" ? "simular" : "presentar"}, ${salteadas.length} salteada${salteadas.length === 1 ? "" : "s"}.`);
    for (const s of salteadas) anotar(`Salteada ${s.persona}: ${s.texto}`);
    if (!presentables.length) return await cerrar();
    if (superaElTope(presentables.length)) return await cerrar(`Hay ${presentables.length} para ${modo === "simular" ? "simular" : "presentar"} y el tope por corrida es ${TOPE_POR_CORRIDA}: no se ${modo === "simular" ? "simuló" : "presentó"} ninguna. Revisalas en Bajas ARCA y presentalas a mano.`);

    for (const f of presentables) {
      const { ref, datos } = pedidoDeBaja(f);
      const item: ItemDeCorrida = { ...resumenDeFila(f), resultado: "fallida", detalle: "", logId: null };
      try {
        // EL ENVÍO DEL PANEL, tal cual: vuelve a armar el plan, toma el candado de ARCA y deja el registro en Operaciones.
        await arrancarOperacionRelacion({ tenantId, tenantObjectId, op: "baja", ref, datos, confirmar: modo === "presentar", automatica: true });
        // La referencia se toma ANTES de esperar: al terminar se suelta el candado y otra operación podría ocupar el lugar.
        const hecha = corridaOperacionDe(tenantId);
        await finDeOperacion(tenantId);
        const lectura = lecturaDelResultado(hecha?.resultado);
        Object.assign(item, { resultado: lectura.resultado, detalle: lectura.detalle, logId: hecha?.logId || null });
        corrida.items.push(item);
        if (lectura.resultado === "presentada") corrida.presentadas++;
        if (lectura.resultado === "simulada") corrida.simuladas++;
        anotar(`${f.persona}: ${lectura.resultado}${lectura.detalle ? ` · ${lectura.detalle}` : ""}`);
        if (lectura.corta) return await cerrar(`Se cortó en ${f.persona} (${lectura.resultado.replace("_", " ")}): no se siguió con las ${presentables.length - corrida.items.length} restantes.`);
      } catch (e: any) {
        // No llegó a arrancar: ARCA ocupada, el plan cambió entre que se miró y se mandó, faltan credenciales.
        item.detalle = e instanceof CandadoArcaOcupado ? `ARCA está ocupada por otra operación: ${e.message}` : String(e?.message || e);
        corrida.items.push(item);
        return await cerrar(`Se cortó en ${f.persona}: ${item.detalle}`);
      }
    }
    return await cerrar();
  } catch (e: any) {
    console.error(`[bajas-automaticas-arca] ${tenantId}:`, e?.message || e);
    return await cerrar(`La corrida falló: ${String(e?.message || e)}`).catch(() => null);
  }
}

/** Lo mismo, con el nombre del cron en la auditoría de los contratos que toque. */
export const correrBajasAutomaticasDelCron = (tenantId: string, empleadorasConError: string[] = []) => enContexto({ origen: "sistema", detalle: DETALLE_AUDITORIA }, () => correrBajasAutomaticas(tenantId, empleadorasConError));
