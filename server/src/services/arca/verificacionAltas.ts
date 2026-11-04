import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import UserProject from "../../models/UserProject.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { ArcaVerificacionAlta } from "../../models/ArcaVerificacionAlta.js";
import { Company } from "../../models/Company.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR, MOTOR_ALTAS } from "./motor.js";
import { quienTiene, soltarCandado, tomarCandado } from "./candadoArca.js";
import { avanzarPresentada } from "./corridaAltas.js";
import { decidirVerificacion, decisionSinConsultar, type ConsultaArca, type DecisionVerificacion } from "./decisionVerificacionAlta.js";
import type { CandidatoAlta } from "./presentacionAutomatica.js";
import type { LadoALado } from "./decisionAltaExterna.js";

/**
 * VERIFICACIÓN AUTOMÁTICA EN ARCA de las altas trabadas por «ARCA ya tiene un alta de ese día» (pedido
 * del 02/11/2026). Antes quedaban «Sin fecha prevista» para siempre, hasta que alguien entrara a ARCA a
 * mirarlas. Ahora se consulta ARCA (Relaciones Laborales → Consultas, por CUIL: SOLO LECTURA, nunca se
 * presenta nada) y se aplica lo que decide `decidirVerificacion`:
 *
 *   · presentada → el contrato queda presentado (`altaArcaPresentada.via = "verificacion"`, `porConsulta`)
 *     y avanza a Generar Documentos como cualquier alta presentada. La constancia la baja después la
 *     descarga automática de siempre (`descargaConstanciasAutomatica.ts`), que toma toda alta presentada
 *     sin constancia. Queda en la pestaña Presentadas (un `ArcaAltasLog` de tipo `verificacion`).
 *   · revision_manual → sigue trabada, con el motivo a la vista (`verificacionArca` en el contrato).
 *
 * Cada decisión queda auditada en `ArcaVerificacionAlta`, con la pantalla de ARCA anonimizada.
 *
 * IDEMPOTENTE: marcar presentada es un `updateOne` condicionado a que el contrato siga sin presentar (o
 * con un rechazo): si otra corrida llegó antes, no se toca y la acción dice `ya_resuelta`. Y antes de
 * escribir se comprueba que el índice siga siendo ESE contrato (misma fecha de alta y empleadora).
 *
 * COMO EL RESTO DEL MÓDULO: el candado de ARCA (no se pisa con otra corrida), una sesión por empleadora
 * (volver al selector de CUIT cierra la sesión), y una pausa de 1,5 a 3 s entre personas.
 */

export interface ItemVerificacion {
  userProjectId: string;
  contractIndex: number;
  cuil: string;
  nombre: string;
  empresaId: string;
  empresaRazonSocial: string;
  /** "YYYY-MM-DD" */
  alta: string;
  baja: string;
  otroContratoMismoDia: boolean;
  /** Ver `AltaAVerificar.traba`. */
  traba?: "mismo_dia" | "activa";
}

export interface ResultadoVerificacion {
  item: ItemVerificacion;
  decision: DecisionVerificacion;
  /** `marcada_presentada`, `revision_manual`, `ya_resuelta`, `contrato_cambio`, `en_seco`. */
  accion: string;
  /** Lo que devolvió ARCA (sin la pantalla): va al resumen y a la auditoría. */
  consulta: ConsultaArca | null;
}

export const itemDe = (c: CandidatoAlta): ItemVerificacion => ({
  userProjectId: c.userProjectId,
  contractIndex: c.contractIndex,
  cuil: c.cuil,
  nombre: c.nombre,
  empresaId: c.empresa?._id || "",
  empresaRazonSocial: c.empresa?.razonSocial || "",
  alta: c.fechaAlta,
  baja: c.fechaBaja,
  otroContratoMismoDia: c.otroContratoMismoDia,
  traba: c.verificable || c.otroContratoMismoDia ? "mismo_dia" : "activa",
});

/** Lo que el motor devuelve, más la pantalla para la auditoría. */
export type ConsultaConPantalla = ConsultaArca & { html?: string };

/**
 * EL RECORRIDO, sin Mongo ni navegador: consulta (si hace falta), decide y aplica, persona por persona.
 * Una consulta que tira no corta a las demás: esa persona queda en revisión manual con el error.
 */
export async function verificarLote(o: {
  items: ItemVerificacion[];
  consultar: (i: ItemVerificacion) => Promise<ConsultaConPantalla>;
  aplicar: (i: ItemVerificacion, d: DecisionVerificacion, consulta: ConsultaConPantalla | null) => Promise<string>;
  pausa?: () => Promise<void>;
}): Promise<ResultadoVerificacion[]> {
  const out: ResultadoVerificacion[] = [];
  let consultadas = 0;
  for (const item of o.items) {
    let consulta: ConsultaConPantalla | null = null;
    let decision = decisionSinConsultar(item);
    if (!decision) {
      if (consultadas++ > 0) await o.pausa?.();
      try {
        consulta = await o.consultar(item);
      } catch (e: any) {
        consulta = { ok: false, error: String(e?.message || e) };
      }
      decision = decidirVerificacion(item, consulta);
    }
    const accion = await o.aplicar(item, decision, consulta);
    const { html: _html, ...sinPantalla } = (consulta || {}) as any;
    out.push({ item, decision, accion, consulta: consulta ? (sinPantalla as ConsultaArca) : null });
    console.log(`[verificacion-altas] ${item.nombre} (${item.cuil}) alta ${item.alta}: ${decision.accion} → ${accion}. ${decision.motivo}`);
  }
  return out;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pausaEntrePersonas = () => esperar(1500 + Math.floor(Math.random() * 1500));
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

/** Lo que está verificando un tenant, para que la pantalla muestre qué filas esperan resultado. */
export interface VerificacionEnCurso {
  arrancadaEl: Date;
  claves: string[];
  terminada: boolean;
  resultados: Array<{ clave: string; nombre: string; resultado: string; motivo: string }>;
  error?: string;
}
const enCurso = new Map<string, VerificacionEnCurso>();
export const verificacionEnCursoDe = (tenantId: string): VerificacionEnCurso | null => enCurso.get(tenantId) || null;
export const claveDe = (i: { userProjectId: string; contractIndex: number }) => `${i.userProjectId}:${i.contractIndex}`;

/**
 * Verifica en ARCA estas altas: una sesión por empleadora, con el candado de ARCA. `enSeco`: consulta
 * ARCA y decide, pero no escribe NADA en la base (ni el contrato, ni la auditoría, ni el registro).
 */
export async function verificarAltasEnArca(o: {
  tenantId: string;
  tenantObjectId: Types.ObjectId;
  items: ItemVerificacion[];
  automatica: boolean;
  usuarioId?: string | null;
  enSeco?: boolean;
}): Promise<ResultadoVerificacion[]> {
  const estado: VerificacionEnCurso = { arrancadaEl: new Date(), claves: o.items.map(claveDe), terminada: false, resultados: [] };
  if (!o.enSeco) enCurso.set(o.tenantId, estado);
  const resultados: ResultadoVerificacion[] = [];
  try {
    const cred = await credencialesDe(o.tenantId);
    if (!cred) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
    const grupos = new Map<string, ItemVerificacion[]>();
    for (const i of o.items) grupos.set(i.empresaId, [...(grupos.get(i.empresaId) || []), i]);

    for (const [empresaId, items] of grupos) {
      const empresa: any = Types.ObjectId.isValid(empresaId) ? await Company.findById(empresaId).select("cuit razonSocial").lean() : null;
      const cuit = String(empresa?.cuit || "").replace(/\D/g, "");
      const aplicar = aplicador({ ...o, empresaId, empresaRazonSocial: String(empresa?.razonSocial || items[0].empresaRazonSocial), empresaCuit: cuit });
      // Si ninguna necesita ARCA (todas son duplicados de WeProdu), no se abre sesión.
      const necesitanArca = items.some((i) => !decisionSinConsultar(i));
      if (!necesitanArca || cuit.length !== 11) {
        const error = cuit.length !== 11 ? "La empleadora del contrato no tiene CUIT de 11 dígitos." : "";
        resultados.push(...(await verificarLote({ items, consultar: async () => ({ ok: false, error }), aplicar })));
        continue;
      }
      // Otra corrida de ARCA (altas, constancias, obras sociales) usa la misma sesión: se espera hasta 30 min.
      const fin = Date.now() + 30 * 60_000;
      while (quienTiene(o.tenantId) && Date.now() < fin) await esperar(5000);
      if (quienTiene(o.tenantId)) {
        resultados.push(...(await verificarLote({ items, consultar: async () => ({ ok: false, error: "Había otra corrida de ARCA en curso y no terminó en 30 minutos." }), aplicar })));
        continue;
      }
      tomarCandado(o.tenantId, "verificacion");
      let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
      let fallo = false;
      try {
        sesion = await abrirSesionArca(o.tenantId, cred);
        const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href)) as any;
        const motor = (await import(pathToFileURL(MOTOR_ALTAS).href)) as any;
        const page = sesion.page;
        if (!(await aceptarSelectorDeCuit(page, cuit))) throw new Error(`No pude elegir la empleadora ${cuit} en ARCA (¿el usuario delegado la tiene?).`);
        // Como la descarga de constancias: un respiro antes de salir del selector, y a Relaciones Laborales.
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500).catch(() => {});
        await motor.entrarARelacionesLaborales({ page });
        const r = await verificarLote({
          items,
          consultar: async (i) => {
            const x = await motor.relacionesPorCuil({ page, cuil: i.cuil, fechaInicio: ddmmaaaa(i.alta) });
            return { ok: true, relaciones: x.relaciones || [], encontrada: x.encontrada === true ? true : null, html: x.html };
          },
          aplicar,
          pausa: pausaEntrePersonas,
        });
        resultados.push(...r);
      } catch (e: any) {
        fallo = true;
        // Lo que no llegó a consultarse queda en revisión manual con el error (mañana se vuelve a mirar).
        const hechos = new Set(resultados.map((x) => claveDe(x.item)));
        const quedan = items.filter((i) => !hechos.has(claveDe(i)));
        resultados.push(...(await verificarLote({ items: quedan, consultar: async () => ({ ok: false, error: String(e?.message || e) }), aplicar })));
      } finally {
        const s: any = sesion;
        if (s && !fallo && !o.enSeco) await guardarSesion(o.tenantId, s.ctx).catch(() => {});
        await s?.browser.close().catch(() => {});
        soltarCandado(o.tenantId, "verificacion");
      }
    }
  } catch (e: any) {
    estado.error = String(e?.message || e);
    throw e;
  } finally {
    estado.resultados = resultados.map((r) => ({ clave: claveDe(r.item), nombre: r.item.nombre, resultado: r.decision.accion, motivo: r.decision.motivo }));
    estado.terminada = true;
  }
  return resultados;
}

/**
 * Cómo se aplica cada decisión en la base (o no, en seco).
 *
 * Lo usan dos caminos que terminan igual —el alta ya estaba en ARCA, se marca presentada y sigue el
 * circuito—: la VERIFICACIÓN (consulta en vivo, `via: "verificacion"`) y la ADOPCIÓN DE ALTAS EXTERNAS
 * (Relaciones Laborales sincronizadas, `via: "externa"`, ver `adopcionAltasExternas.ts`).
 *
 * `noRepetirManual`: la adopción corre en cada sincronización; una revisión manual que ya dice lo mismo
 * no se vuelve a escribir ni a auditar (`sin_cambios`).
 */
export function aplicador(o: {
  tenantObjectId: Types.ObjectId;
  automatica: boolean;
  usuarioId?: string | null;
  enSeco?: boolean;
  empresaId: string;
  empresaRazonSocial: string;
  empresaCuit: string;
  via?: "verificacion" | "externa";
  detectadaPor?: string;
  noRepetirManual?: boolean;
}) {
  const via = o.via || "verificacion";
  const origen = via === "externa" ? "sync" : "consulta";
  /** El registro de la pestaña Presentadas: uno por empleadora y verificación, creado con la primera que se marca. */
  let logId: Types.ObjectId | null = null;
  const usuario = o.usuarioId && Types.ObjectId.isValid(o.usuarioId) ? new Types.ObjectId(o.usuarioId) : undefined;

  return async (item: ItemVerificacion, d: DecisionVerificacion & { ladoALado?: LadoALado }, consulta: ConsultaConPantalla | null): Promise<string> => {
    if (o.enSeco) return "en_seco";
    const campo = `contracts.${item.contractIndex}`;
    // ¿Sigue siendo ESE contrato y sigue sin presentar? Si no, no se toca nada.
    const up: any = await UserProject.findById(item.userProjectId).select(`contracts.fecha_alta_contrato contracts.empresaContratoId contracts.altaArcaPresentada contracts.verificacionArca`).lean();
    const c = up?.contracts?.[item.contractIndex];
    if (o.noRepetirManual && d.accion === "revision_manual" && c?.verificacionArca?.resultado === "revision_manual" && c.verificacionArca.origen === origen && c.verificacionArca.motivo === d.motivo) return "sin_cambios";
    let accion = d.accion === "presentada" ? "marcada_presentada" : d.accion === "sin_alta" ? "sigue_trabada" : "revision_manual";
    if (!c || fechaISO(c.fecha_alta_contrato) !== item.alta || String(c.empresaContratoId || "") !== item.empresaId) accion = "contrato_cambio";
    else if (c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida") accion = "ya_resuelta";

    const { html, ...consultaSinPantalla } = (consulta || {}) as any;
    const auditoria = await ArcaVerificacionAlta.create({
      tenantId: o.tenantObjectId,
      userProjectId: new Types.ObjectId(item.userProjectId),
      contractIndex: item.contractIndex,
      cuil: item.cuil,
      nombre: item.nombre,
      empresaId: Types.ObjectId.isValid(o.empresaId) ? new Types.ObjectId(o.empresaId) : undefined,
      empresaRazonSocial: o.empresaRazonSocial,
      alta: item.alta,
      baja: item.baja,
      automatica: o.automatica,
      usuarioId: usuario,
      enSeco: false,
      consulta: consulta ? consultaSinPantalla : null,
      decision: d.accion,
      motivo: d.motivo,
      accion,
      html: typeof html === "string" ? html : undefined,
      origen,
      detectadaPor: o.detectadaPor,
      ladoALado: d.ladoALado,
    });
    if (accion === "contrato_cambio" || accion === "ya_resuelta") return accion;

    const verificacionArca = {
      el: new Date(),
      resultado: d.accion,
      motivo: d.motivo,
      ...("relacion" in d && d.relacion ? { relacion: { inicio: d.relacion.inicio, fin: d.relacion.fin, baja: d.relacion.baja || "", ...(d.relacion.modalidad ? { modalidad: d.relacion.modalidad } : {}) } } : {}),
      origen,
      ...(d.ladoALado ? { esperado: d.ladoALado.esperado, encontradas: d.ladoALado.encontradas } : {}),
      automatica: o.automatica,
      usuarioId: usuario,
      auditoriaId: auditoria._id,
    };
    // Sólo si sigue sin presentar (o rechazada): una segunda verificación, o una corrida que llegó antes, no la pisa.
    const sinPresentar = { $or: [{ [`${campo}.altaArcaPresentada`]: null }, { [`${campo}.altaArcaPresentada.resultado`]: "fallida" }] };

    // Todavía no está en ARCA: no se toca la marca de presentación; queda anotado cuándo se miró.
    if (d.accion === "sin_alta") {
      const r = await UserProject.updateOne({ _id: item.userProjectId, ...sinPresentar }, { $set: { [`${campo}.verificacionArca`]: verificacionArca } });
      return r.modifiedCount > 0 ? "sigue_trabada" : "ya_resuelta";
    }

    if (d.accion === "revision_manual") {
      const r = await UserProject.updateOne({ _id: item.userProjectId, ...sinPresentar }, { $set: { [`${campo}.verificacionArca`]: verificacionArca } });
      return r.modifiedCount > 0 ? "revision_manual" : "ya_resuelta";
    }

    if (!logId) {
      const log = await ArcaAltasLog.create({
        tenantId: o.tenantObjectId,
        tipo: via,
        usuarioId: usuario,
        automatica: o.automatica,
        empresaId: Types.ObjectId.isValid(o.empresaId) ? new Types.ObjectId(o.empresaId) : undefined,
        empresaCuit: o.empresaCuit,
        empresaRazonSocial: o.empresaRazonSocial,
        enSeco: false,
        contratos: [],
        resultado: "aceptada",
        irreversible: false,
      });
      logId = log._id as Types.ObjectId;
    }
    const r = await UserProject.updateOne(
      { _id: item.userProjectId, ...sinPresentar },
      {
        $set: {
          [`${campo}.altaArcaPresentada`]: { via, fecha: new Date(), resultado: "presentada", ...(via === "verificacion" ? { porConsulta: true } : {}), motivo: d.motivo, logId },
          [`${campo}.verificacionArca`]: verificacionArca,
        },
      },
    );
    if (r.modifiedCount === 0) {
      await ArcaVerificacionAlta.updateOne({ _id: auditoria._id }, { $set: { accion: "ya_resuelta" } });
      return "ya_resuelta";
    }
    await ArcaAltasLog.updateOne(
      { _id: logId },
      { $push: { contratos: { userProjectId: new Types.ObjectId(item.userProjectId), contractIndex: item.contractIndex, cuil: item.cuil, nombre: item.nombre, resultado: "presentada", motivo: d.motivo, porConsulta: via === "verificacion" } } },
    );
    await avanzarPresentada(item.userProjectId, item.contractIndex);
    return "marcada_presentada";
  };
}
