import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { DropboxSignEnvio, type EstadoEnvio, type ResumenColocacion } from "../../models/DropboxSignEnvio.js";
import { DropboxSignEnvioLog, type ILineaEnvio } from "../../models/DropboxSignEnvioLog.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { abrirOcr } from "../../utils/ocrPaginas.js";
import { CONFIG_POR_DEFECTO, cupoDelDia, estimarEnvios, fechaYHoraArgentina, planificar, puedeCorrer, validarEncolado, type Candidato, type ConfigEnvio, type EstadoThrottle, type ItemEnCola, type Plan } from "./planificador.js";
import { esTextoDeLimite, guardDeEnvio } from "./reglas.js";
import { motivosDesactualizado, pantallaAPdf, pdfAPantalla, reglaDe, type Colocacion } from "../../compartido/reglasColocacionFirma.js";
import { ContratoFrame } from "../../models/ContratoFrame.js";
import { agruparTrabados, cupoVentana24h, estadoDelPanel, ordenPorRecientes } from "../../compartido/colaFirma.js";
import { Release } from "../../models/Release.js";
import { abrirSesionDropboxSign, anotarError, guardarSesion, probarConexionDropboxSign, type SesionDropboxSign } from "./navegador.js";
import { quienTieneDropboxSign, soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
import { MOTOR_DROPBOX_SIGN } from "./motor.js";
import { leerOutbox, resolverFirmante } from "./outbox.js";
import { reglasDelTenant } from "./reglasTenant.js";
import { declaradasDe, detectarParaArchivo, guardarResumen, resumenDeArchivo, verificacionDe } from "./colocacion.js";

export { leerOutbox, resolverFirmante };

/**
 * LA CORRIDA DE ENVÍO A LA FIRMA (patrón `arca/corridaAltas.ts`): una tanda de documentos DE LA COLA
 * pasa por el motor de pantalla de Dropbox Sign, de a uno. Vive en memoria, arranca sin esperar y la
 * UI la sigue por polling (`GET /dropbox-sign/bot/corrida`).
 *
 *  · LA COLA la arma la gente desde «Para Firmar» (`encolar`); nada se envía si no fue encolado. El
 *    PLAN lo hace `planificador.ts` (puro) con la cola y el Outbox: nunca se envía dos veces un código.
 *  · EL FIRMANTE sale de la base (`DocumentoGenerado` por código → usuario), no del nombre de archivo.
 *  · El click «Enviar para firmar» es el único irreversible: pasa por el guard de `reglas.ts` y por el
 *    modo seco, y a partir de ahí «Detener» ya no corta ese documento.
 *  · El LÍMITE antiabuso frena la tanda, deja `enfriadoHasta`, el documento queda `limite` (sigue en la
 *    cola) y el scheduler no reintenta hasta que venza.
 *  · DÓNDE VA LA FIRMA se resuelve ANTES de abrir el navegador (`compartido/reglasColocacionFirma.ts`,
 *    con las reglas del tenant): se baja el PDF, se lee su texto con posiciones (y el OCR de la franja
 *    si la regla lo pide) y se busca el ancla del tipo. Sin ancla → requiere_revision con el motivo; sin
 *    regla → requiere_revision sin abrir Chromium. No hay recetas de pantalla de respaldo: lo que se
 *    coloca es lo que muestra la previsualización (`colocacion.ts`).
 */

const BASE = "integrations.dropboxSign.bot";

export type EventoEnvio = {
  tipo: "abriendo" | "sesion" | "cola" | "documento" | "irreversible" | "resultado" | "limite" | "fin" | "fallo" | "info";
  at: Date;
  texto: string;
  archivo?: string;
  codigo?: string;
  estado?: string;
};

export interface CorridaEnvio {
  tenantId: string;
  enSeco: boolean;
  automatica: boolean;
  eventos: EventoEnvio[];
  terminada: boolean;
  /** Se está apretando «Enviar para firmar» de un documento: «Detener» espera a que termine ése. */
  irreversible: boolean;
  señal: { cortada: boolean };
  arrancadaEl: Date;
  total: number;
  enviados: number;
  errores: number;
  limite: boolean;
  /** El archivo que está pasando por el wizard ahora. */
  actual: string | null;
  lineas: ILineaEnvio[];
  /** «Enviar ahora N»: cuántos pidió la persona (si no, el tamaño de tanda). El cupo de 24 h sigue mandando. */
  cantidad?: number;
}

const corridas = new Map<string, CorridaEnvio>();
export const corridaEnvioDe = (tenantId: string): CorridaEnvio | undefined => corridas.get(tenantId);
export const ocupadaPor = (tenantId: string) => quienTieneDropboxSign(tenantId);

/** Seco salvo que se diga lo contrario fuera de producción; en producción, real salvo que se fuerce seco. */
export function enSecoForzado(): boolean {
  const v = String(process.env.DROPBOX_SIGN_BOT_EN_SECO || "").toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function detenerCorridaEnvio(tenantId: string): { ok: boolean; motivo?: string } {
  const c = corridas.get(tenantId);
  if (!c || c.terminada) return { ok: false, motivo: "No hay una corrida en curso." };
  c.señal.cortada = true;
  c.eventos.push({ tipo: "info", at: new Date(), texto: c.irreversible ? "Se pidió detener: se termina el documento que está enviándose y se frena ahí." : "Se pidió detener: se frena antes del próximo documento." });
  return { ok: true };
}

/** La configuración y el estado del throttle del tenant, con los defaults. */
export async function configDelTenant(tenantId: string): Promise<{ config: ConfigEnvio; estado: EstadoThrottle; cc: string; bot: any }> {
  const t: any = await Tenant.findById(tenantId).select("integrations.dropboxSign").lean();
  const ds = t?.integrations?.dropboxSign || {};
  const bot = ds.bot || {};
  const e = bot.envio || {};
  const config: ConfigEnvio = {
    activo: !!e.activo,
    tamanoTanda: Number(e.tamanoTanda) || CONFIG_POR_DEFECTO.tamanoTanda,
    intervaloHoras: Number(e.intervaloHoras) || CONFIG_POR_DEFECTO.intervaloHoras,
    topeDiario: Number(e.topeDiario) || CONFIG_POR_DEFECTO.topeDiario,
    enfriamientoHoras: Number(e.enfriamientoHoras) || CONFIG_POR_DEFECTO.enfriamientoHoras,
    horaDesde: e.horaDesde ?? CONFIG_POR_DEFECTO.horaDesde,
    horaHasta: e.horaHasta ?? CONFIG_POR_DEFECTO.horaHasta,
  };
  // VENTANA MÓVIL DE 24 H (25/10/2026): lo enviado por el bot con su hora (`enviadoAt`), no un contador
  // que se resetea a la medianoche. Dropbox Sign libera los lugares a medida que cada envío cumple 24 h.
  const ahora = new Date();
  const recientes: any[] = await DropboxSignEnvio.find({ tenantId, estado: "enviado", enviadoAt: { $gt: new Date(ahora.getTime() - 24 * 3600_000) } }).select("enviadoAt").lean();
  const ventana = cupoVentana24h(Number(e.topeDiario) || CONFIG_POR_DEFECTO.topeDiario, recientes.map((r) => r.enviadoAt), ahora);
  const estado: EstadoThrottle = {
    contadorDia: { fecha: bot.contadorDia?.fecha || "", enviados: Number(bot.contadorDia?.enviados) || 0 },
    enfriadoHasta: bot.enfriadoHasta ? new Date(bot.enfriadoHasta) : null,
    ultimaCorridaAt: bot.ultimaCorridaAt ? new Date(bot.ultimaCorridaAt) : null,
    enviados24h: ventana.usados,
    liberaAt: ventana.liberaAt,
  };
  return { config, estado, cc: String(ds.email || "").trim(), bot };
}

const itemDe = (r: any): ItemEnCola => ({ archivo: r.archivo, codigo: r.codigo, tipo: r.tipo, email: r.email, firmante: r.firmante, orden: Number(r.orden) || 0, colocacion: r.colocacion || null });

/**
 * ENCOLAR desde «Para Firmar»: cada archivo se valida (`validarEncolado`) y entra con el próximo
 * `orden`. Lo que no pasa queda `requiere_revision` con su motivo (salvo lo ya enviado o encolado,
 * que no se toca). `todosElegibles` recorre el Outbox entero.
 */
export async function encolar(tenantId: string, userId: string | undefined, pedido: { archivos?: string[]; todosElegibles?: boolean }): Promise<{ encolados: number; rechazados: Array<{ archivo: string; motivo: string }>; porMotivo: Record<string, number> }> {
  const { archivos: enOutbox, fechas } = await leerOutbox(tenantId);
  const { reglas } = await reglasDelTenant(tenantId);
  const setOutbox = new Set(enOutbox);
  const pedidos = pedido.todosElegibles ? enOutbox : [...new Set((pedido.archivos || []).map((a) => String(a).trim()).filter(Boolean))];
  const codigos = pedidos.map((a) => leerAnclas(a).codigo).filter(Boolean);
  const previos = new Map<string, any>(((await DropboxSignEnvio.find({ tenantId, codigo: { $in: codigos } }).lean()) as any[]).map((r) => [r.codigo, r]));
  // Los generados desde una plantilla con {{firma}} traen su posición: no necesitan regla por nombre.
  const declaradas = await declaradasDe(tenantId, codigos);
  const ultimo: any = await DropboxSignEnvio.findOne({ tenantId, orden: { $ne: null } }).sort({ orden: -1 }).select("orden").lean();
  let orden = Number(ultimo?.orden) || 0;
  const tid = new Types.ObjectId(tenantId);
  const quien = userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;

  let encolados = 0;
  const rechazados: Array<{ archivo: string; motivo: string }> = [];
  const porMotivo: Record<string, number> = {};
  for (const archivo of pedidos) {
    const { codigo } = leerAnclas(archivo);
    const { firmante, motivoSinFirmante } = setOutbox.has(archivo) ? await resolverFirmante(tenantId, archivo) : { firmante: null, motivoSinFirmante: undefined };
    const r = validarEncolado(archivo, { enOutbox: setOutbox.has(archivo), registroPrevio: codigo ? previos.get(codigo) || null : null, firmante, motivoSinFirmante, reglas, posicionDeclarada: codigo ? declaradas.get(codigo) || null : null });
    if (r.ok && r.firmante) {
      orden++;
      await DropboxSignEnvio.updateOne(
        { tenantId: tid, codigo: r.codigo },
        { $set: { archivo, email: r.firmante.email, firmante: r.firmante.nombre, tipo: r.tipo || "", estado: "en_cola", detalle: "", orden, encoladoAt: new Date(), encoladoPor: quien, probadoEnSecoAt: null }, $setOnInsert: { tenantId: tid, codigo: r.codigo } },
        { upsert: true },
      );
      encolados++;
      continue;
    }
    rechazados.push({ archivo, motivo: r.motivo });
    porMotivo[r.motivo] = (porMotivo[r.motivo] || 0) + 1;
    // Queda registrado como «requiere revisión» para que se vea en el tab, salvo lo que ya está enviado/encolado.
    if (r.reencolable && r.codigo) {
      await DropboxSignEnvio.updateOne({ tenantId: tid, codigo: r.codigo }, { $set: { archivo, estado: "requiere_revision", detalle: r.motivo }, $setOnInsert: { tenantId: tid, codigo: r.codigo } }, { upsert: true }).catch(() => {});
    }
  }
  // CONECTARSE SOLO AL ENCOLAR LO PRIMERO (pedido del 23/10/2026): sin sesión guardada pero con usuario
  // y contraseña, el bot intenta entrar en segundo plano unos segundos después. Si «Enviar a la firma»
  // arranca la corrida en el acto, ésa ya se loguea y la prueba se saltea (candado tomado).
  // Lo nuevo se ubica por su fecha, no al final (salvo orden manual).
  if (encolados > 0) await aplicarOrdenAutomatico(tenantId, { fechas }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo ordenar la cola:", e?.message || e));
  if (encolados > 0) {
    const t: any = await Tenant.findById(tenantId).select(`${BASE}.sesionEnc ${BASE}.loginPasswordEnc`).lean();
    const b = t?.integrations?.dropboxSign?.bot || {};
    if (!b.sesionEnc && b.loginPasswordEnc) {
      setTimeout(() => {
        if (!quienTieneDropboxSign(tenantId)) void probarConexionDropboxSign(tenantId).catch(() => {});
      }, 5000);
    }
  }
  return { encolados, rechazados, porMotivo };
}

/** Saca de la cola. Sólo afecta `en_cola`: lo enviado, lo frenado por el límite y lo demás no se toca. */
export async function desencolar(tenantId: string, codigos: string[]): Promise<{ quitados: number }> {
  const r = await DropboxSignEnvio.deleteMany({ tenantId, codigo: { $in: codigos }, estado: "en_cola" });
  return { quitados: r.deletedCount || 0 };
}

export interface EstadoArchivo {
  archivo: string;
  codigo: string;
  /** `en_cola` | `enviando` | `enviado` | `limite` | `error` | `requiere_revision` | `seco` | "" (sin encolar) */
  estado: string;
  detalle: string;
  enviadoAt: string | null;
  /** Posición en la cola (1 = próximo), si está en ella. */
  posicion: number | null;
  /** La última detección del ancla de la firma (✓/✗ con página, rótulo y motivo), si se hizo. */
  colocacion: ResumenColocacion | null;
  /** Cuándo saldría según el scheduler (ISO), si está en la cola y el envío automático está activo. */
  estimadoAt: string | null;
}

/**
 * El estado de cada archivo del listado del tab: una query por lote, sin tocar Dropbox.
 *
 * `hashes` (opcional): el `contentHash` que la pantalla ya tiene del listado del Outbox. Con eso, y con
 * la fecha de las reglas y la versión de la plantilla, cada colocación guardada dice si quedó
 * DESACTUALIZADA (25/10/2026): antes se mostraba la de días atrás como si fuera el estado actual.
 */
export async function estadoDeArchivos(tenantId: string, archivos: string[], hashes: Record<string, string> = {}): Promise<EstadoArchivo[]> {
  const codigoDe = new Map(archivos.map((a) => [a, leerAnclas(a).codigo]));
  const codigos = [...new Set([...codigoDe.values()].filter(Boolean))];
  const registros = new Map<string, any>(((await DropboxSignEnvio.find({ tenantId, codigo: { $in: codigos } }).lean()) as any[]).map((r) => [r.codigo, r]));
  const { cambiadasAt } = await reglasDelTenant(tenantId);
  const plantillaIds = [...new Set([...registros.values()].map((r) => r.colocacion?.plantillaId).filter((id) => id && Types.ObjectId.isValid(id)))];
  const versionDe = new Map<string, number>();
  if (plantillaIds.length) {
    const [contratos, releases] = await Promise.all([ContratoFrame.find({ _id: { $in: plantillaIds } }).select("versionContenido").lean(), Release.find({ _id: { $in: plantillaIds } }).select("versionContenido").lean()]);
    for (const p of [...contratos, ...releases] as any[]) versionDe.set(String(p._id), Number(p.versionContenido) || 1);
  }
  const conVigencia = (archivo: string, c: any) =>
    c ? { ...c, desactualizado: motivosDesactualizado(c, { contentHash: hashes[archivo], reglasAt: cambiadasAt, plantillaVersion: c.plantillaId ? versionDe.get(String(c.plantillaId)) ?? null : null }) } : null;
  const enCola: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1 }).select("codigo archivo orden").lean();
  const posicion = new Map(enCola.map((r, i) => [r.codigo, i + 1]));
  const { config, estado: throttle } = await configDelTenant(tenantId);
  const estimados = estimarEnvios(enCola.map(itemDe), config, throttle, new Date());
  const corrida = corridas.get(tenantId);
  const actual = corrida && !corrida.terminada ? corrida.actual : null;
  return archivos.map((archivo) => {
    const codigo = codigoDe.get(archivo) || "";
    const r = registros.get(codigo);
    if (!r) return { archivo, codigo, estado: "", detalle: "", enviadoAt: null, posicion: null, colocacion: null, estimadoAt: null };
    const estado = archivo === actual ? "enviando" : r.estado === "en_cola" && r.probadoEnSecoAt ? "seco" : r.estado;
    return { archivo, codigo, estado, detalle: r.detalle || "", enviadoAt: r.enviadoAt ? new Date(r.enviadoAt).toISOString() : null, posicion: posicion.get(codigo) ?? null, colocacion: conVigencia(archivo, r.colocacion), estimadoAt: estimados.get(codigo)?.toISOString() || null };
  });
}

export interface Cola extends Plan {
  outbox: string | null;
  archivosEnOutbox: number;
  enCola: number;
  /** Por qué el scheduler no correría ahora (informativo). */
  motivoNoCorre: string | null;
}

/** Qué enviaría la próxima tanda: la cola contra el Outbox, planificada. No envía nada. */
export async function armarCola(tenantId: string, opciones: { manual?: boolean; cantidad?: number } = {}): Promise<Cola> {
  const { config, estado } = await configDelTenant(tenantId);
  const { outbox, archivos } = await leerOutbox(tenantId);
  const enCola: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1 }).lean();
  const ahora = new Date();
  const items = enCola.map(itemDe);
  const estimados = estimarEnvios(items, config, estado, ahora);
  for (const it of items) it.estimadoAt = estimados.get(it.codigo) || null;
  // «Enviar ahora N» (25/10/2026): la cantidad pedida reemplaza el tamaño de tanda; el cupo de 24 h sigue mandando.
  const plan = planificar(items, new Set(archivos), opciones.cantidad ? { ...config, tamanoTanda: opciones.cantidad } : config, estado, ahora);
  const puede = puedeCorrer(config, estado, ahora, opciones);
  return { ...plan, outbox, archivosEnOutbox: archivos.length, enCola: enCola.length, motivoNoCorre: puede.ok ? null : puede.motivo || "No se puede correr ahora." };
}

/** Arranca una corrida y vuelve en el acto. Manual (botón) respeta sólo enfriamiento y cupo. */
export async function arrancarCorridaEnvio(tenantId: string, opciones: { automatica?: boolean; enSeco?: boolean; cantidad?: number } = {}): Promise<{ enSeco: boolean; cantidad: number | null }> {
  const automatica = !!opciones.automatica;
  tomarCandadoDropboxSign(tenantId, automatica);
  try {
    const { config, estado, cc } = await configDelTenant(tenantId);
    const puede = puedeCorrer(config, estado, new Date(), { manual: !automatica });
    if (!puede.ok) throw Object.assign(new Error(puede.motivo || "No se puede correr ahora."), { status: 409 });
    if (!cc) throw Object.assign(new Error("Falta la casilla de CC (Configuración → DropboxSign → correo que recibe los avisos)."), { status: 400 });
    const enSeco = enSecoForzado() || !!opciones.enSeco;
    await aplicarOrdenAutomatico(tenantId).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo ordenar la cola:", e?.message || e));
    const corrida: CorridaEnvio = { tenantId, enSeco, automatica, eventos: [], terminada: false, irreversible: false, señal: { cortada: false }, arrancadaEl: new Date(), total: 0, enviados: 0, errores: 0, limite: false, actual: null, lineas: [], cantidad: opciones.cantidad ? Math.max(1, Math.floor(opciones.cantidad)) : undefined };
    corridas.set(tenantId, corrida);
    await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorridaAt`]: corrida.arrancadaEl } });
    void correr(corrida, cc, config);
    return { enSeco, cantidad: corrida.cantidad ?? null };
  } catch (e) {
    soltarCandadoDropboxSign(tenantId);
    throw e;
  }
}

const dirTemporal = (tenantId: string) => path.join(os.tmpdir(), "weprodu-dropbox-sign", tenantId);

async function sumarAlContador(tenantId: string): Promise<void> {
  const { fecha } = fechaYHoraArgentina(new Date());
  const r = await Tenant.updateOne({ _id: tenantId, [`${BASE}.contadorDia.fecha`]: fecha }, { $inc: { [`${BASE}.contadorDia.enviados`]: 1 } });
  if (r.modifiedCount === 0) await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.contadorDia`]: { fecha, enviados: 1 } } });
}

async function actualizarRegistro(tenantId: string, codigo: string, set: Partial<{ estado: EstadoEnvio; detalle: string; enviadoAt: Date | null; probadoEnSecoAt: Date | null }>): Promise<void> {
  await DropboxSignEnvio.updateOne({ tenantId, codigo }, { $set: set }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo actualizar el registro:", e?.message || e));
}

async function correr(corrida: CorridaEnvio, cc: string, config: ConfigEnvio): Promise<void> {
  const { tenantId } = corrida;
  const emitir = (e: Omit<EventoEnvio, "at">) => {
    if (e.tipo === "irreversible") corrida.irreversible = true;
    corrida.eventos.push({ ...e, at: new Date() });
  };
  let sesion: SesionDropboxSign | null = null;
  let error: string | null = null;
  let capturaError: string | undefined;
  let resultado = "ok";
  const dir = dirTemporal(tenantId);
  fs.mkdirSync(dir, { recursive: true });

  try {
    emitir({ tipo: "cola", texto: "Leyendo la cola y el Outbox…" });
    const cola = await armarCola(tenantId, { manual: !corrida.automatica, cantidad: corrida.cantidad });
    for (const f of cola.faltantes) {
      const detalle = "El archivo ya no está en Outbox (¿se movió a Pendbox o se borró?): salió de la cola.";
      corrida.lineas.push({ archivo: f.archivo, codigo: f.codigo, email: f.email, estado: "requiere_revision", detalle });
      await actualizarRegistro(tenantId, f.codigo, { estado: "requiere_revision", detalle });
    }
    corrida.total = cola.tanda.length;
    emitir({ tipo: "cola", texto: `${cola.enCola} en la cola · ${cola.tanda.length} en esta tanda · ${cola.pendientesDespues} quedan para después · ${cola.faltantes.length} ya no están en Outbox · cupo hoy ${cola.cupoHoy}${corrida.enSeco ? " · MODO SECO: no se envía nada" : ""}` });
    if (cola.tanda.length === 0) {
      resultado = "sin_tanda";
      return;
    }

    // Resolver la colocación de cada documento ANTES de abrir el navegador (el mismo código que la
    // previsualización): los que no tienen dónde firmar salen como requiere_revision sin gastar un
    // intento de pantalla. Un solo worker de OCR para toda la tanda, sólo si algún tipo lo necesita.
    const { cfg } = await leerOutbox(tenantId);
    const { reglas, cambiadasAt } = await reglasDelTenant(tenantId);
    const resueltos = new Map<string, { rutaPdf: string; colocacion: Colocacion }>();
    const worker = (cola.tanda as Candidato[]).some((c) => reglaDe(c.archivo, reglas)?.ocr) ? await abrirOcr() : null;
    try {
      for (const c of cola.tanda as Candidato[]) {
        const rutaPdf = path.join(dir, c.archivo);
        try {
          const d = await detectarParaArchivo(tenantId, { cfg, outbox: cola.outbox || "" }, c.archivo, reglas, { firmante: { nombre: c.firmante, email: c.email }, worker: worker || undefined });
          await guardarResumen(tenantId, c.codigo, resumenDeArchivo(d, cambiadasAt));
          if (d.deteccion.ok === false) {
            const motivo: string = d.deteccion.motivo;
            corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "requiere_revision", detalle: motivo });
            emitir({ tipo: "resultado", archivo: c.archivo, codigo: c.codigo, estado: "requiere_revision", texto: `requiere_revision: ${motivo}` });
            await actualizarRegistro(tenantId, c.codigo, { estado: "requiere_revision", detalle: motivo });
            continue;
          }
          fs.writeFileSync(rutaPdf, d.buffer);
          emitir({ tipo: "info", archivo: c.archivo, texto: `Colocación: ${d.deteccion.colocacion.nota}${d.ocrMs ? ` (OCR ${d.ocrMs} ms)` : ""}` });
          resueltos.set(c.codigo, { rutaPdf, colocacion: d.deteccion.colocacion });
        } catch (e: any) {
          fs.rmSync(rutaPdf, { force: true });
          const detalle = `No se pudo bajar o leer el PDF: ${e?.message || e}`;
          corrida.errores++;
          corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "error", detalle });
          emitir({ tipo: "resultado", archivo: c.archivo, codigo: c.codigo, estado: "error", texto: `error: ${detalle}` });
          await actualizarRegistro(tenantId, c.codigo, { estado: "error", detalle });
        }
      }
    } finally {
      await worker?.terminate().catch(() => {});
    }
    const tanda = (cola.tanda as Candidato[]).filter((c) => resueltos.has(c.codigo));
    if (tanda.length === 0) {
      resultado = corrida.errores > 0 ? "con_errores" : "sin_tanda";
      emitir({ tipo: "info", texto: "Ningún documento de la tanda tiene colocación de firma: no se abre el navegador." });
      return;
    }

    emitir({ tipo: "abriendo", texto: "Abriendo el navegador con la sesión de Dropbox Sign…" });
    sesion = await abrirSesionDropboxSign(tenantId);
    emitir({ tipo: "sesion", texto: sesion.seLogueo ? "Sesión iniciada con usuario y contraseña." : "Sesión guardada vigente." });
    const motor: any = await import(pathToFileURL(MOTOR_DROPBOX_SIGN).href);

    // Borradores que dejó un envío frenado por el límite: se informan (eliminarlos desde el menú es frágil).
    try {
      const b = await motor.revisarBorradores({ page: sesion.page, onProgreso: (t: string) => emitir({ tipo: "info", texto: t }) });
      if (b?.encontrados) emitir({ tipo: "info", texto: `Hay ${b.encontrados} borrador(es) en Dropbox Sign sin enviar: conviene eliminarlos a mano desde Documentos.` });
    } catch (e: any) {
      emitir({ tipo: "info", texto: `No se pudieron revisar los borradores: ${e?.message || e}` });
    }

    for (const c of tanda) {
      if (corrida.señal.cortada) {
        resultado = "detenida";
        emitir({ tipo: "info", texto: "Detenida antes del siguiente documento." });
        break;
      }
      // Segunda mirada al dedupe, por si otra corrida (otro proceso) lo mandó mientras se armaba la cola.
      const vigente: any = await DropboxSignEnvio.findOne({ tenantId, codigo: c.codigo }).select("estado").lean();
      if (!vigente || !["en_cola", "limite"].includes(vigente.estado)) {
        corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "salteado", detalle: vigente?.estado === "enviado" ? "Ya figuraba como enviado." : "Salió de la cola mientras se armaba la tanda." });
        continue;
      }
      corrida.actual = c.archivo;
      emitir({ tipo: "documento", archivo: c.archivo, codigo: c.codigo, texto: `${c.archivo} → ${c.firmante} (${c.email})` });
      const { rutaPdf, colocacion } = resueltos.get(c.codigo)!;
      let r: any;
      try {
        r = await motor.enviarDocumento({
          page: sesion.page,
          rutaPdf,
          archivo: c.archivo,
          firmante: { nombre: c.firmante, email: c.email },
          cc,
          colocacion,
          geometria: { pdfAPantalla, pantallaAPdf },
          enSeco: corrida.enSeco,
          señal: corrida.señal,
          onProgreso: (texto: string) => emitir({ tipo: "info", archivo: c.archivo, texto }),
          antesDelIrreversible: () => emitir({ tipo: "irreversible", archivo: c.archivo, codigo: c.codigo, texto: "Apretando «Enviar para firmar»…" }),
          // Con la posición declarada por la plantilla no hace falta regla por nombre (ver `guardDeEnvio`).
          guard: (d: any) => guardDeEnvio({ ...d, archivo: c.archivo, ccEsperado: cc, firmanteNombre: c.firmante, firmanteEmail: c.email, reglas, posicionDeclarada: resueltos.get(c.codigo)?.colocacion?.origen === "plantilla" }),
          esLimite: esTextoDeLimite,
        });
      } catch (e: any) {
        r = { resultado: "error", detalle: e?.message || String(e), captura: e?.captura };
      } finally {
        corrida.irreversible = false;
        corrida.actual = null;
        fs.rmSync(rutaPdf, { force: true });
      }
      const estado = r?.resultado || "error";
      const detalle = String(r?.detalle || "");
      corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado, detalle });
      emitir({ tipo: estado === "limite" ? "limite" : "resultado", archivo: c.archivo, codigo: c.codigo, estado, texto: `${estado}: ${detalle}` });
      if (r?.captura && !capturaError) capturaError = Buffer.from(r.captura).toString("base64");

      if (estado === "enviado") {
        corrida.enviados++;
        await actualizarRegistro(tenantId, c.codigo, { estado: "enviado", detalle, enviadoAt: new Date() });
        await sumarAlContador(tenantId);
      } else if (estado === "limite") {
        corrida.limite = true;
        resultado = "limite";
        const hasta = new Date(Date.now() + config.enfriamientoHoras * 3600_000);
        await actualizarRegistro(tenantId, c.codigo, { estado: "limite", detalle: `${detalle} Se reintenta después del enfriamiento.` });
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.enfriadoHasta`]: hasta } });
        emitir({ tipo: "limite", texto: `Dropbox Sign frenó los envíos. Enfriamiento hasta ${hasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Quedó un borrador en Dropbox Sign.` });
        break;
      } else if (estado === "seco") {
        await actualizarRegistro(tenantId, c.codigo, { detalle, probadoEnSecoAt: new Date() });
      } else if (estado === "requiere_revision") {
        await actualizarRegistro(tenantId, c.codigo, { estado: "requiere_revision", detalle });
      } else {
        corrida.errores++;
        await actualizarRegistro(tenantId, c.codigo, { estado: "error", detalle });
      }
    }
    if (resultado === "ok" && corrida.errores > 0) resultado = "con_errores";
  } catch (e: any) {
    error = e?.message || String(e);
    resultado = "fallo";
    emitir({ tipo: "fallo", texto: error! });
    await anotarError(tenantId, error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (sesion && !error) await guardarSesion(tenantId, sesion.ctx).catch(() => {});
    await sesion?.browser.close().catch(() => {});
    soltarCandadoDropboxSign(tenantId);
    corrida.actual = null;
    corrida.terminada = true;
    emitir({ tipo: "fin", texto: `Fin: ${corrida.enviados} enviado(s), ${corrida.errores} error(es)${corrida.limite ? ", frenada por el límite" : ""}.` });
    const resumen = { arrancadaEl: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, total: corrida.total, automatica: corrida.automatica };
    await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorrida`]: resumen, ...(error ? {} : { [`${BASE}.ultimoError`]: null }) } }).catch(() => {});
    await DropboxSignEnvioLog.create({ tenantId: new Types.ObjectId(tenantId), inicio: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, automatica: corrida.automatica, lineas: corrida.lineas, error: error || undefined, capturaError }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo guardar el log:", e?.message || e));
  }
}

/* ─────────────────── el ORDEN de la cola, a mano (25/10/2026) ─────────────────── */

/** ¿Hay una corrida enviando? Mientras tanto la cola no se reordena: el bot la está leyendo. */
const enviando = (tenantId: string) => {
  const c = corridas.get(tenantId);
  return !!c && !c.terminada;
};
const errorEnviando = () => Object.assign(new Error("Hay una corrida enviando: el orden se puede cambiar cuando termine."), { status: 409 });

/**
 * Mueve documentos de la cola: al principio, al fondo, o antes de otro (el arrastre). El resto conserva
 * su orden relativo y se renumera 1..n. Persiste en el servidor (`orden`), así que sobrevive a recargar
 * y es el que usa el planificador. Deja la cola marcada como «orden manual».
 */
export async function reordenarCola(tenantId: string, codigos: string[], a: "tope" | "fondo" | { antesDe: string }): Promise<{ movidos: number }> {
  if (enviando(tenantId)) throw errorEnviando();
  const cola: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1, encoladoAt: 1 }).select("_id codigo").lean();
  const pedidos = new Set(codigos);
  const movidos = cola.filter((r) => pedidos.has(r.codigo));
  if (movidos.length === 0) return { movidos: 0 };
  const resto = cola.filter((r) => !pedidos.has(r.codigo));
  let nueva: any[];
  if (a === "tope") nueva = [...movidos, ...resto];
  else if (a === "fondo") nueva = [...resto, ...movidos];
  else {
    const i = resto.findIndex((r) => r.codigo === a.antesDe);
    nueva = i < 0 ? [...resto, ...movidos] : [...resto.slice(0, i), ...movidos, ...resto.slice(i)];
  }
  await renumerar(nueva);
  await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ordenManual`]: true } });
  return { movidos: movidos.length };
}

/** Vuelve al orden automático: de más reciente a menos reciente (el que usa el bot si nadie lo toca). */
export async function ordenAutomaticoDeCola(tenantId: string): Promise<{ total: number }> {
  if (enviando(tenantId)) throw errorEnviando();
  await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ordenManual`]: false } });
  return { total: await aplicarOrdenAutomatico(tenantId, { forzar: true }) };
}

/**
 * EL ORDEN AUTOMÁTICO, APLICADO (26/10/2026): la cola de más reciente a menos reciente por la fecha del
 * archivo en el Outbox (`ordenPorRecientes`). No toca un orden puesto a mano ni una cola que el bot
 * está enviando, y sólo escribe si el orden cambió. Corre al encolar, al mirar la cola y antes de cada
 * corrida, así que la cola que ya estaba en la base se reordena sola. Devuelve cuántos hay en la cola.
 */
async function aplicarOrdenAutomatico(tenantId: string, opciones: { fechas?: Map<string, string>; forzar?: boolean } = {}): Promise<number> {
  if (enviando(tenantId)) return 0;
  if (!opciones.forzar) {
    const t: any = await Tenant.findById(tenantId).select(`${BASE}.ordenManual`).lean();
    if (t?.integrations?.dropboxSign?.bot?.ordenManual) return 0;
  }
  const cola: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1, encoladoAt: 1 }).select("_id codigo archivo encoladoAt orden").lean();
  if (!cola.length) return 0;
  const fechas = opciones.fechas || (await leerOutbox(tenantId)).fechas;
  const ordenada = ordenPorRecientes(cola, fechas);
  if (!ordenada.every((r, i) => Number(r.orden) === i + 1)) await renumerar(ordenada);
  return cola.length;
}

async function renumerar(lista: Array<{ _id: unknown }>): Promise<void> {
  if (!lista.length) return;
  await DropboxSignEnvio.bulkWrite(lista.map((r, i) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { orden: i + 1 } } } })));
}

/* ─────────────────── la COLA como la ve la persona (25/10/2026) ─────────────────── */

export interface ItemDeCola {
  posicion: number;
  archivo: string;
  codigo: string;
  firmante: string;
  tipo: string;
  /** en_cola | limite | enviando */
  estado: string;
  enOutbox: boolean;
  /** Entra en el cupo de las próximas 24 h (está arriba de la línea de corte). */
  entra: boolean;
  estimadoAt: string | null;
}

export interface VistaDeCola extends Cola {
  items: ItemDeCola[];
  resumen: { listos: number; entranAhora: number; quedan: number; cupo: number; enviados24h: number; tope: number; liberaAt: string | null; tamanoTanda: number };
  ordenManual: boolean;
  trabados: Array<{ tipo: string; titulo: string; accion: { texto: string; destino: string }; cantidad: number; items: Array<{ archivo: string; codigo: string; detalle: string; firmante: string; verificadaAt: string | null }> }>;
  verificacion: { ultimaAt: string | null; desactualizada: boolean; corriendo: boolean };
  estadoPanel: { tipo: string; texto: string };
  corriendo: boolean;
}

/**
 * LA COLA DE VERDAD: lo que se va a enviar, en orden, con la línea de corte del cupo; lo trabado,
 * agrupado por motivo con su salida; y en qué estado está el envío. Lee de los registros (que escribe
 * «Verificar todos» y la corrida), no de una caché propia.
 */
export async function vistaDeCola(tenantId: string): Promise<VistaDeCola> {
  const { archivos, fechas: fechasOutbox } = await leerOutbox(tenantId);
  await aplicarOrdenAutomatico(tenantId, { fechas: fechasOutbox }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo ordenar la cola:", e?.message || e));
  const cola = await armarCola(tenantId, { manual: true });
  const { config, estado, bot } = await configDelTenant(tenantId);
  const enOutbox = new Set(archivos);
  const registros: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1, encoladoAt: 1 }).lean();
  const corrida = corridas.get(tenantId);
  const corriendo = !!corrida && !corrida.terminada;
  const ahora = new Date();
  const items = registros.map(itemDe);
  const estimados = estimarEnvios(items, config, estado, ahora);
  const cupo = cupoDelDia(config, estado, ahora);
  let listos = 0;
  const vista: ItemDeCola[] = registros.map((r, i) => {
    const esta = enOutbox.has(r.archivo);
    if (esta) listos++;
    return {
      posicion: i + 1,
      archivo: r.archivo,
      codigo: r.codigo,
      firmante: r.firmante || "",
      tipo: r.tipo || "",
      estado: corriendo && corrida?.actual === r.archivo ? "enviando" : r.estado,
      enOutbox: esta,
      entra: esta && listos <= cupo,
      estimadoAt: estimados.get(r.codigo)?.toISOString() || null,
    };
  });

  const trabadosReg: any[] = await DropboxSignEnvio.find({ tenantId, estado: "requiere_revision" }).sort({ updatedAt: -1 }).limit(500).lean();
  const grupos = agruparTrabados(trabadosReg.map((r) => ({ archivo: r.archivo, codigo: r.codigo, detalle: r.detalle || "", firmante: r.firmante || "", verificadaAt: r.colocacion?.verificadaAt ? new Date(r.colocacion.verificadaAt).toISOString() : null })));

  // La última verificación: la de «Verificar todos» si la hay en memoria; si no, la más reciente guardada.
  const v = verificacionDe(tenantId);
  const fechas = [...registros, ...trabadosReg].map((r) => (r.colocacion?.verificadaAt ? new Date(r.colocacion.verificadaAt).getTime() : 0));
  const ultima = v?.terminadaEl ? v.terminadaEl.getTime() : fechas.length ? Math.max(...fechas) : 0;
  const { cambiadasAt } = await reglasDelTenant(tenantId);
  const desactualizada = !ultima || ahora.getTime() - ultima > 24 * 3600_000 || (!!cambiadasAt && cambiadasAt.getTime() > ultima);

  const conexionCaida = bot.conexion?.estado === "caida";
  const proximaTandaAt = vista.find((x) => x.estimadoAt)?.estimadoAt;
  const panel = estadoDelPanel(
    {
      corriendo,
      progreso: corrida ? { hechos: corrida.enviados + corrida.errores, total: corrida.total, actual: corrida.actual } : undefined,
      tieneSesion: !!bot.sesionEnc,
      conexionCaida,
      enfriadoHasta: estado.enfriadoHasta,
      cupo,
      liberaAt: estado.liberaAt || null,
      enCola: listos,
      trabados: trabadosReg.length,
      envioAutomatico: config.activo,
      horaDesde: config.horaDesde,
      horaHasta: config.horaHasta,
      horaActual: fechaYHoraArgentina(ahora).hora,
      proximaTandaAt: proximaTandaAt ? new Date(proximaTandaAt) : null,
    },
    ahora,
  );

  return {
    ...cola,
    items: vista,
    resumen: { listos, entranAhora: Math.min(listos, cupo), quedan: Math.max(0, listos - cupo), cupo, enviados24h: estado.enviados24h ?? 0, tope: config.topeDiario, liberaAt: estado.liberaAt ? estado.liberaAt.toISOString() : null, tamanoTanda: config.tamanoTanda },
    ordenManual: !!bot.ordenManual,
    trabados: grupos,
    verificacion: { ultimaAt: ultima ? new Date(ultima).toISOString() : null, desactualizada, corriendo: !!v && !v.terminadaEl },
    estadoPanel: panel,
    corriendo,
  };
}

/** Saca de la lista de trabados (no se envían; si se vuelven a encolar, se re-evalúan). */
export async function descartarTrabados(tenantId: string, codigos: string[]): Promise<{ quitados: number }> {
  const r = await DropboxSignEnvio.deleteMany({ tenantId, codigo: { $in: codigos }, estado: "requiere_revision" });
  return { quitados: r.deletedCount || 0 };
}
