/**
 * LA CORRIDA DE UNA OPERACIÓN SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026): baja, modificación o anulación,
 * en Relaciones Laborales → Modificaciones y Bajas. Misma infraestructura que las altas: el candado de ARCA por
 * tenant, la sesión del usuario delegado (`navegador.ts`), el motor importado en tiempo de ejecución, una corrida
 * en memoria por tenant con eventos que la pantalla lee cada ~2 s, el registro en `arca_altas_logs` y la marca en
 * el contrato por `contratoKey` (auditada por los hooks del modelo).
 *
 * LO QUE AGREGA:
 *   · EN SECO POR DEFECTO. Sólo con `confirmar: true` (y sin `ARCA_ALTAS_EN_SECO=true`) se aprieta algo que no se
 *     deshace. En seco la corrida entra a ARCA, lee la relación, completa el formulario, informa exactamente lo que
 *     mandaría y lo cancela: nada queda en ARCA.
 *   · IDEMPOTENCIA en dos capas: el plan (`reglasOperacionRelacion.ts`) no deja arrancar si ya hay una marca de la
 *     misma operación o el espejo ya muestra el resultado; el motor relee la relación en vivo antes de operar.
 *   · EL RASTRO ANTES DEL CLICK: el contrato se marca `presentando` justo antes de «Confirmar» (o del ícono de anular).
 *     Si el servidor se cae ahí, la marca queda y nadie vuelve a mandar lo mismo sin mirar ARCA.
 *   · DOS CLASES DE FALLO: `regla_arca` (ARCA rechazó o no habilita: el texto literal) y `navegacion` (sesión,
 *     pantalla, timeout: se puede reintentar). Van en la marca, en el log y en los eventos.
 *
 * El núcleo (`ejecutarOperacion`) no toca Mongo ni Playwright: recibe el motor y el guardado por parámetro, y así
 * se prueba con un ARCA simulado (`corridaOperacionRelacion.test.ts`).
 */
import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import UserProject from "../../models/UserProject.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR_MODIFICACIONES } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { enSecoForzado } from "./corridaAltas.js";
import { enContexto } from "../../utils/contextoAuditoria.js";
import { claseDeFallo, NOMBRE_OPERACION, type DatosOperacion, type PlanOperacion, type TipoOperacion } from "./reglasOperacionRelacion.js";
import { OperacionInvalida, planOperacion, type ContextoOperacion, type PlanConContexto, type ReferenciaContrato } from "./operacionRelacion.js";

export type EventoOperacion =
  | { tipo: "abriendo" }
  | { tipo: "sesion"; seLogueo: boolean }
  | { tipo: "empleadoraVerificada"; cuit: string }
  | { tipo: "pantalla"; que: string }
  | { tipo: "pagina"; numero: number }
  | { tipo: "relacion"; relacion: any }
  | { tipo: "formulario"; valores: Record<string, unknown>; cambios?: Array<{ campo: string; antes: string; despues: string }> }
  | { tipo: "seco" }
  | { tipo: "irreversible"; que: string }
  | { tipo: "rechazo"; motivo: string }
  | { tipo: "acuse"; acuse: Record<string, unknown> }
  | { tipo: "dialogoInesperado"; mensaje: string }
  | { tipo: "fin"; resultado: string; clase?: string; motivo?: string }
  | { tipo: "fallo"; mensaje: string; clase: string };

/** Lo que devuelve el motor por cada operación (ver `modificaciones-arca.mjs`). */
export interface ResultadoOperacion {
  resultado: "presentada" | "rechazada" | "fallida" | "indeterminado" | "seco" | "ya_hecha";
  clase?: "regla_arca" | "navegacion" | "";
  motivo?: string;
  acuse?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  relacion?: any;
  cambios?: Array<{ campo: string; antes: string; despues: string }>;
  antes?: Record<string, string>;
  html?: string;
  textoNuevo?: string;
  enRojo?: string[];
  dialogos?: string[];
  leidoDe?: string;
  pantallaDesconocida?: boolean;
}

export interface MotorOperaciones {
  registrarBaja(o: any): Promise<ResultadoOperacion>;
  modificarRelacion(o: any): Promise<ResultadoOperacion>;
  anularRelacion(o: any): Promise<ResultadoOperacion>;
}

export interface GuardadoOperacion {
  /** Justo antes del click que no se deshace: deja dicho en el contrato que se está mandando. */
  presentando(payload: Record<string, unknown>): Promise<void>;
  /** El resultado, apenas se lee. No se llama en seco. */
  resultado(r: ResultadoOperacion): Promise<void>;
}

/**
 * EL RECORRIDO DE UNA OPERACIÓN, sin Mongo ni navegador. Llama al motor con `antesDeConfirmar` cableado al guardado
 * (`presentando`), convierte lo que el motor tira en un resultado con su clase, y guarda el resultado (salvo en seco).
 * Un error DESPUÉS de haber dejado el rastro es `indeterminado`: no se sabe si ARCA tomó la operación.
 */
export async function ejecutarOperacion(o: {
  op: TipoOperacion;
  args: { page?: unknown; empresaCuit: string; cuil: string; fechaInicio: string; fechaFin?: string; datos: any; yaAdentro?: boolean };
  enSeco: boolean;
  motor: MotorOperaciones;
  guardar: GuardadoOperacion;
  emitir?: (e: EventoOperacion) => void;
  señal?: { cortada: boolean };
}): Promise<ResultadoOperacion> {
  const emitir = o.emitir || (() => {});
  let rastro = false;
  const antesDeConfirmar = async (payload: Record<string, unknown>) => {
    // PRIMERO se escribe, DESPUÉS se aprieta: si no se puede dejar el rastro, no se confirma (el motor recibe el error).
    if (!o.enSeco) await o.guardar.presentando(payload);
    rastro = true;
  };
  const d = o.args.datos || {};
  const comun = { page: o.args.page, empresaCuit: o.args.empresaCuit, cuil: o.args.cuil, fechaInicio: o.args.fechaInicio, fechaFin: o.args.fechaFin || "", enSeco: o.enSeco, yaAdentro: !!o.args.yaAdentro, onProgreso: emitir, señal: o.señal || { cortada: false }, antesDeConfirmar };
  let r: ResultadoOperacion;
  try {
    if (o.op === "baja") r = await o.motor.registrarBaja({ ...comun, fechaFin: String(d.fechaFin || ""), situacionBaja: String(d.situacionBaja || ""), fechaTelegrama: String(d.fechaTelegrama || "") });
    else if (o.op === "modificacion") r = await o.motor.modificarRelacion({ ...comun, cambios: { ...(d.cambios || {}), ...(d.obraSocialTexto ? { obraSocialTexto: d.obraSocialTexto } : {}) } });
    else r = await o.motor.anularRelacion({ ...comun, que: d.que });
  } catch (e: any) {
    const mensaje = String(e?.message || e);
    if (rastro) {
      r = { resultado: "indeterminado", clase: "", motivo: `Después de confirmar hubo un error (${mensaje}). Mirá la relación en ARCA antes de hacer nada: NO la vuelvas a mandar desde acá.`, html: e?.html };
    } else {
      const clase = claseDeFallo(e);
      r = { resultado: "fallida", clase, motivo: mensaje, html: e?.html };
      emitir({ tipo: "fallo", mensaje, clase });
    }
  }
  if (!o.enSeco && r.resultado !== "seco") await o.guardar.resultado(r);
  emitir({ tipo: "fin", resultado: r.resultado, clase: r.clase, motivo: r.motivo });
  return r;
}

export interface CorridaOperacion {
  tenantId: string;
  op: TipoOperacion;
  userProjectId: string;
  contractIndex: number;
  contratoKey: string | null;
  persona: string;
  cuil: string;
  empresaRazonSocial: string;
  empresaCuit: string;
  plan: PlanOperacion;
  enSeco: boolean;
  eventos: EventoOperacion[];
  terminada: boolean;
  /** Se avisó el paso que no se deshace: desde acá «Detener» no corta. */
  irreversible: boolean;
  señal: { cortada: boolean };
  arrancadaEl: Date;
  resultado?: ResultadoOperacion;
  logId?: string | null;
  usuarioId?: string;
}

/** Una por tenant, en memoria, igual que la de altas (ver `corridaServidor.ts` por qué). */
const corridas = new Map<string, CorridaOperacion>();
export const corridaOperacionDe = (tenantId: string): CorridaOperacion | undefined => corridas.get(tenantId);

export function detenerOperacion(tenantId: string): { detenida: boolean; motivo?: string } {
  const c = corridas.get(tenantId);
  if (!c || c.terminada) return { detenida: false, motivo: "No hay una operación de ARCA en curso." };
  if (c.irreversible) return { detenida: false, motivo: "Ya se apretó lo que no se deshace: no se puede detener. Esperá el resultado." };
  c.señal.cortada = true;
  return { detenida: true };
}

const CAMPO_MARCA: Record<TipoOperacion, string> = { baja: "bajaArcaPresentada", modificacion: "modificacionArcaPresentada", anulacion: "anulacionArcaPresentada" };

/** Lo que una presentación del motor significa en la marca del contrato y en el log. */
export function resultadoParaMarca(r: ResultadoOperacion): { marca: "presentada" | "indeterminado" | "fallida"; log: string; clase: "regla_arca" | "navegacion" | ""; porConsulta: boolean } {
  if (r.resultado === "presentada") return { marca: "presentada", log: "presentada", clase: "", porConsulta: r.leidoDe === "listado" };
  if (r.resultado === "ya_hecha") return { marca: "presentada", log: "ya_hecha", clase: "", porConsulta: true };
  if (r.resultado === "rechazada") return { marca: "fallida", log: "rechazada", clase: "regla_arca", porConsulta: false };
  if (r.resultado === "fallida") return { marca: "fallida", log: "fallida", clase: r.clase || "navegacion", porConsulta: false };
  return { marca: "indeterminado", log: "indeterminado", clase: "", porConsulta: false };
}

/**
 * Arranca la operación y vuelve enseguida; el progreso se sigue por `corridaOperacionDe`. Antes de abrir nada arma
 * el plan: si no se puede, tira `OperacionInvalida` con el motivo y no toma la sesión.
 */
export async function arrancarOperacionRelacion(opts: {
  tenantId: string;
  tenantObjectId: Types.ObjectId;
  usuarioId?: string;
  op: TipoOperacion;
  ref: ReferenciaContrato;
  datos: DatosOperacion;
  /** Sólo con `true` se aprieta lo que no se deshace. Sin eso, en seco. */
  confirmar?: boolean;
}): Promise<{ arrancada: true; enSeco: boolean; plan: PlanOperacion; contexto: PlanConContexto["contexto"] }> {
  const { tenantId, op } = opts;
  // El candado ANTES de cualquier await: dos clicks seguidos no pueden arrancar dos operaciones.
  tomarCandado(tenantId, op);
  try {
    const pc = await planOperacion(opts.tenantObjectId, { op, ref: opts.ref, datos: opts.datos });
    if (!pc.plan.puede) throw new OperacionInvalida(pc.plan.motivo, pc.plan);
    const cred = await credencialesDe(tenantId);
    if (!cred) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
    const enSeco = enSecoForzado() || opts.confirmar !== true;
    const corrida: CorridaOperacion = {
      tenantId,
      op,
      userProjectId: pc.ctx.resumen.userProjectId,
      contractIndex: pc.ctx.idx,
      contratoKey: pc.ctx.contratoKey,
      persona: pc.ctx.persona.nombre,
      cuil: pc.ctx.persona.cuil,
      empresaRazonSocial: pc.ctx.empresa.razonSocial,
      empresaCuit: pc.ctx.empresa.cuit,
      plan: pc.plan,
      enSeco,
      eventos: [],
      terminada: false,
      irreversible: false,
      señal: { cortada: false },
      arrancadaEl: new Date(),
      usuarioId: opts.usuarioId,
    };
    corridas.set(tenantId, corrida);
    void correr({ corrida, ctx: pc.ctx, tenantObjectId: opts.tenantObjectId, usuarioId: opts.usuarioId, cred, datos: opts.datos });
    return { arrancada: true, enSeco, plan: pc.plan, contexto: pc.contexto };
  } catch (e) {
    soltarCandado(tenantId, op);
    throw e;
  }
}

async function correr(o: { corrida: CorridaOperacion; ctx: ContextoOperacion; tenantObjectId: Types.ObjectId; usuarioId?: string; cred: NonNullable<Awaited<ReturnType<typeof credencialesDe>>>; datos: DatosOperacion }) {
  const { corrida, ctx, tenantObjectId, usuarioId, cred } = o;
  const op = corrida.op;
  const emitir = (e: EventoOperacion) => {
    if (e.tipo === "irreversible") corrida.irreversible = true;
    corrida.eventos.push(e);
  };
  const inicio = Date.now();
  const campo = CAMPO_MARCA[op];
  const key = ctx.contratoKey && Types.ObjectId.isValid(ctx.contratoKey) ? new Types.ObjectId(ctx.contratoKey) : null;
  const usuario = usuarioId && Types.ObjectId.isValid(usuarioId) ? new Types.ObjectId(usuarioId) : null;
  const motivoAuditoria = `${NOMBRE_OPERACION[op]} en ARCA (Relaciones Laborales → Modificaciones y Bajas)`;
  const que = op === "anulacion" ? ((corrida.plan.payload as any).que as "alta" | "baja") : undefined;

  /** Escribe campos del contrato por su clave (o por la posición resuelta si no tiene clave), auditado por los hooks del modelo. */
  const escribir = (set: Record<string, unknown>) =>
    enContexto({ motivo: motivoAuditoria }, () => {
      const conClave = Object.fromEntries(Object.entries(set).map(([k, v]) => [key ? `contracts.$[c].${k}` : `contracts.${ctx.idx}.${k}`, v]));
      return key ? UserProject.updateOne({ _id: ctx.up._id, "contracts.contratoKey": key }, { $set: conClave }, { arrayFilters: [{ "c.contratoKey": key }] }).exec() : UserProject.updateOne({ _id: ctx.up._id }, { $set: conClave }).exec();
    });

  // El log se crea ANTES de operar y se completa al final: si el servidor se cae, queda.
  const log = await ArcaAltasLog.create({
    tenantId: tenantObjectId,
    tipo: op,
    usuarioId: usuario || undefined,
    empresaId: new Types.ObjectId(ctx.empresa._id),
    empresaCuit: ctx.empresa.cuit,
    empresaRazonSocial: ctx.empresa.razonSocial,
    enSeco: corrida.enSeco,
    contratos: [{ userProjectId: new Types.ObjectId(ctx.resumen.userProjectId), contractIndex: ctx.idx, contratoKey: key, cuil: ctx.persona.cuil, nombre: ctx.persona.nombre, resultado: "pendiente" }],
    resultado: "en_curso",
    irreversible: false,
    operacion: { que, payload: corrida.plan.payload },
  }).catch((e: any) => {
    console.error("Operaciones ARCA: no pude crear el log:", e?.message || e);
    return null;
  });
  corrida.logId = log?._id ? String(log._id) : null;

  const guardar: GuardadoOperacion = {
    presentando: async (payload) => {
      // Sin `catch` a propósito: si no se puede dejar el rastro, el motor no confirma.
      await escribir({ [campo]: { via: "modificaciones", fecha: new Date(), resultado: "presentando", payload, que, logId: log?._id, usuarioId: usuario } });
      if (log) await ArcaAltasLog.updateOne({ _id: log._id }, { $set: { irreversible: true, "contratos.0.resultado": "presentando", "operacion.payload": payload } }).catch(() => {});
    },
    resultado: async (r) => {
      const x = resultadoParaMarca(r);
      const marca: Record<string, unknown> = {
        via: "modificaciones",
        fecha: new Date(),
        resultado: x.marca,
        clase: x.clase,
        motivo: r.motivo || undefined,
        acuse: r.acuse || undefined,
        payload: r.payload || corrida.plan.payload,
        relacion: r.relacion ? { inicio: r.relacion.inicio, fin: r.relacion.fin, cat: r.relacion.cat, cbt: r.relacion.cbt, sitRevista: r.relacion.sitRevista } : undefined,
        que,
        cambios: r.cambios || undefined,
        logId: log?._id,
        porConsulta: x.porConsulta || undefined,
        usuarioId: usuario,
      };
      const set: Record<string, unknown> = { [campo]: marca };
      /*
        LO QUE UNA ANULACIÓN CONFIRMADA CAMBIA EN LAS OTRAS MARCAS: anulada el alta, `altaArcaPresentada` pasa a `anulada`
        (ya no traba otra alta de la persona ni se vuelve a presentar sola: no entra en la cola, que sólo toma lo que
        no tiene marca o está `fallida`). Anulada la baja, `bajaArcaPresentada` pasa a `anulada`. Las fechas del
        contrato en WeProdu no se tocan: eso lo decide una persona.
      */
      if (op === "anulacion" && x.marca === "presentada") {
        if (que === "alta" && ctx.contrato.altaArcaPresentada) set["altaArcaPresentada.resultado"] = "anulada";
        if (que === "alta" && ctx.contrato.altaArcaPresentada) set["altaArcaPresentada.motivo"] = `Alta anulada en ARCA desde WeProdu el ${new Date().toLocaleDateString("es-AR")}.`;
        if (que === "baja" && ctx.contrato.bajaArcaPresentada) set["bajaArcaPresentada.resultado"] = "anulada";
      }
      await escribir(set).catch((e: any) => console.error("Operaciones ARCA: no pude marcar el contrato:", e?.message || e));
    },
  };

  let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
  let r: ResultadoOperacion | null = null;
  let error: string | undefined;
  try {
    emitir({ tipo: "abriendo" });
    sesion = await abrirSesionArca(corrida.tenantId, cred);
    emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
    // Como URL `file://`: en Windows una ruta absoluta («C:\…») no se puede importar tal cual.
    const motor = (await import(pathToFileURL(MOTOR_MODIFICACIONES).href)) as MotorOperaciones;
    r = await ejecutarOperacion({
      op,
      args: { page: sesion.page, empresaCuit: ctx.empresa.cuit, cuil: ctx.persona.cuil, fechaInicio: ctx.paraReglas.alta, fechaFin: ctx.paraReglas.baja, datos: { ...(o.datos as any), ...corrida.plan.payload } },
      enSeco: corrida.enSeco,
      motor,
      guardar,
      emitir,
      señal: corrida.señal,
    });
    corrida.resultado = r;
    if (r.resultado === "fallida" && r.clase === "navegacion") error = r.motivo;
  } catch (e: any) {
    // Lo que no pasó por `ejecutarOperacion`: abrir la sesión, importar el motor.
    error = String(e?.message || e);
    const clase = claseDeFallo(e);
    emitir({ tipo: "fallo", mensaje: error, clase });
    emitir({ tipo: "fin", resultado: "fallida", clase, motivo: error });
    corrida.resultado = { resultado: "fallida", clase, motivo: error };
  } finally {
    const s: any = sesion;
    if (s && !error) await guardarSesion(corrida.tenantId, s.ctx).catch(() => {});
    await s?.browser.close().catch(() => {});
    soltarCandado(corrida.tenantId, op);
    // «Terminada» DESPUÉS de soltar el candado (ver `correr` en corridaAltas.ts).
    corrida.terminada = true;
    if (log) {
      const x = corrida.resultado ? resultadoParaMarca(corrida.resultado) : null;
      const res = corrida.resultado;
      await ArcaAltasLog.updateOne(
        { _id: log._id },
        {
          $set: {
            resultado: res ? (res.resultado === "seco" ? "seco" : x!.log) : "fallo",
            irreversible: corrida.irreversible,
            error: error || (res && res.resultado !== "presentada" && res.resultado !== "seco" && res.resultado !== "ya_hecha" ? res.motivo : undefined),
            textoArca: res?.clase === "regla_arca" ? res.motivo : undefined,
            dialogos: res?.dialogos,
            seLogueo: s?.seLogueo,
            tiempos: s?.tiempos,
            duracionMs: Date.now() - inicio,
            htmlResultado: res?.html,
            "contratos.0.resultado": res ? (res.resultado === "seco" ? "seco" : x!.log) : "fallo",
            "contratos.0.motivo": res?.motivo,
            operacion: { que, payload: res?.payload || corrida.plan.payload, relacion: res?.relacion, acuse: res?.acuse, clase: res?.clase || (error ? "navegacion" : ""), cambios: res?.cambios, textoNuevo: res?.textoNuevo, enRojo: res?.enRojo, leidoDe: res?.leidoDe, pantallaDesconocida: res?.pantallaDesconocida || undefined },
          },
        },
      ).catch((e: any) => console.error("Operaciones ARCA: no pude cerrar el log:", e?.message || e));
    }
  }
}
