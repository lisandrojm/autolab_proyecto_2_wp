import { leerAnclas } from "../../utils/anclasNombre.js";
import type { ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
import { motivoSinColocacion, tipoDeDocumento } from "./reglas.js";

/**
 * LA COLA DE ENVÍO Y LA PRÓXIMA TANDA. Lógica pura (sin Dropbox ni base).
 *
 * Nada se envía si no fue ENCOLADO desde el tab «Para Firmar» (22/10/2026). `validarEncolado` decide
 * si un archivo puede entrar en la cola; `planificar` toma SÓLO lo encolado (y lo frenado por el
 * límite, que se reintenta), por orden de encolado, y aplica tanda, tope diario, ventana horaria y
 * enfriamiento. Lo que no está encolado simplemente espera.
 */

export interface ConfigEnvio {
  activo: boolean;
  tamanoTanda: number;
  intervaloHoras: number;
  topeDiario: number;
  enfriamientoHoras: number;
  horaDesde: number;
  horaHasta: number;
}

export const CONFIG_POR_DEFECTO: ConfigEnvio = { activo: false, tamanoTanda: 10, intervaloHoras: 4, topeDiario: 40, enfriamientoHoras: 6, horaDesde: 8, horaHasta: 22 };

export interface EstadoThrottle {
  contadorDia: { fecha: string; enviados: number };
  enfriadoHasta: Date | null;
  ultimaCorridaAt: Date | null;
}

/** Un documento en la cola (un `DropboxSignEnvio` en estado `en_cola` o `limite`). */
export interface ItemEnCola {
  archivo: string;
  codigo: string;
  tipo: string;
  email: string;
  firmante: string;
  orden: number;
  /** La última detección del ancla (✓/✗), si se hizo; la muestra «Ver cola». */
  colocacion?: { ok: boolean; pagina: number | null; rotulo: string; motivo: string; verificadaAt: Date } | null;
  /** Cuándo saldría según la simulación del scheduler (`estimarEnvios`), si el envío automático está activo. */
  estimadoAt?: Date | null;
}

export interface Candidato extends ItemEnCola {}

export interface Plan {
  tanda: Candidato[];
  /** Encolados cuyo archivo ya no está en Outbox (el IMAP lo movió, o alguien lo borró): no se envían. */
  faltantes: ItemEnCola[];
  /** Cuántos encolados quedan para tandas siguientes. */
  pendientesDespues: number;
  /** Cupo que queda hoy. */
  cupoHoy: number;
}

/** La fecha (YYYY-MM-DD) y la hora (0-23) en Argentina. */
export function fechaYHoraArgentina(ahora: Date): { fecha: string; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(ahora);
  const de = (t: string) => partes.find((p) => p.type === t)?.value || "";
  return { fecha: `${de("year")}-${de("month")}-${de("day")}`, hora: Number(de("hour")) % 24 };
}

/** Argentina no tiene horario de verano desde 2009: UTC-3 fijo. */
const OFFSET_AR_HORAS = 3;

/** El instante de «ese día (YYYY-MM-DD) a esa hora, en Argentina». */
export function instanteArgentino(fecha: string, hora: number, minutos = 0): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hora + OFFSET_AR_HORAS, minutos, 0, 0));
}

const diaSiguiente = (fecha: string): string => {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

/**
 * CUÁNDO SALDRÍA CADA ÍTEM DE LA COLA (la cuenta regresiva del tab, 22/10/2026): se simula el
 * scheduler hacia adelante —tandas de `tamanoTanda` cada `intervaloHoras`, dentro de la ventana
 * horaria, sin pasar el tope diario y después del enfriamiento— y se le asigna a cada ítem, por
 * orden, la hora de arranque de la tanda que lo lleva. Con el envío automático apagado no hay
 * estimación (sale cuando alguien aprieta «Enviar tanda ahora»). Es una estimación: una corrida
 * manual, un cambio de configuración o un freno de Dropbox Sign la mueven.
 */
export function estimarEnvios(enCola: ItemEnCola[], config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Map<string, Date> {
  const res = new Map<string, Date>();
  if (!config.activo || enCola.length === 0) return res;
  const ordenados = [...enCola].sort((a, b) => a.orden - b.orden || a.archivo.localeCompare(b.archivo));
  const tanda = Math.max(1, Math.min(config.tamanoTanda, config.topeDiario));
  const intervaloMs = Math.max(0.5, config.intervaloHoras) * 3600_000;
  // Enviados por día, arrancando con los de hoy.
  const hoy = fechaYHoraArgentina(ahora);
  const enviadosPorDia = new Map<string, number>([[hoy.fecha, estado.contadorDia?.fecha === hoy.fecha ? estado.contadorDia.enviados || 0 : 0]]);

  let t = new Date(ahora.getTime());
  if (estado.enfriadoHasta && estado.enfriadoHasta.getTime() > t.getTime()) t = new Date(estado.enfriadoHasta.getTime());
  if (estado.ultimaCorridaAt) t = new Date(Math.max(t.getTime(), estado.ultimaCorridaAt.getTime() + intervaloMs));

  let i = 0;
  for (let vueltas = 0; i < ordenados.length && vueltas < 2000; vueltas++) {
    const { fecha, hora } = fechaYHoraArgentina(t);
    if (hora < config.horaDesde) {
      t = instanteArgentino(fecha, config.horaDesde);
      continue;
    }
    if (hora >= config.horaHasta) {
      t = instanteArgentino(diaSiguiente(fecha), config.horaDesde);
      continue;
    }
    const cupo = config.topeDiario - (enviadosPorDia.get(fecha) || 0);
    if (cupo <= 0) {
      t = instanteArgentino(diaSiguiente(fecha), config.horaDesde);
      continue;
    }
    const n = Math.min(tanda, cupo, ordenados.length - i);
    for (let k = 0; k < n; k++) res.set(ordenados[i + k].codigo, new Date(t.getTime()));
    enviadosPorDia.set(fecha, (enviadosPorDia.get(fecha) || 0) + n);
    i += n;
    t = new Date(t.getTime() + intervaloMs);
  }
  return res;
}

export const cupoDelDia = (config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): number => {
  const { fecha } = fechaYHoraArgentina(ahora);
  const enviadosHoy = estado.contadorDia?.fecha === fecha ? estado.contadorDia.enviados || 0 : 0;
  return Math.max(0, config.topeDiario - enviadosHoy);
};

/**
 * ¿Le toca correr al scheduler ahora? Devuelve el motivo si no. (El botón «Enviar a la firma» no pasa
 * por acá salvo por el enfriamiento y el cupo: es una decisión de la persona.)
 */
export function puedeCorrer(config: ConfigEnvio, estado: EstadoThrottle, ahora: Date, opciones: { manual?: boolean } = {}): { ok: boolean; motivo?: string } {
  if (estado.enfriadoHasta && estado.enfriadoHasta.getTime() > ahora.getTime()) {
    return { ok: false, motivo: `Enfriamiento por el freno de Dropbox Sign hasta las ${estado.enfriadoHasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.` };
  }
  if (cupoDelDia(config, estado, ahora) <= 0) return { ok: false, motivo: `Se alcanzó el tope diario (${config.topeDiario}).` };
  if (opciones.manual) return { ok: true };
  if (!config.activo) return { ok: false, motivo: "El envío automático está desactivado." };
  const { hora } = fechaYHoraArgentina(ahora);
  if (hora < config.horaDesde || hora >= config.horaHasta) return { ok: false, motivo: `Fuera de la ventana horaria (${config.horaDesde} a ${config.horaHasta} h).` };
  if (estado.ultimaCorridaAt && ahora.getTime() - estado.ultimaCorridaAt.getTime() < config.intervaloHoras * 3600_000) {
    return { ok: false, motivo: `Todavía no pasaron ${config.intervaloHoras} h desde la última corrida.` };
  }
  return { ok: true };
}

/** Lo que hace falta saber de un archivo para decidir si entra en la cola. */
export interface ContextoDeEncolado {
  /** Está en el Outbox tal como lo lista Dropbox. */
  enOutbox: boolean;
  /** El registro previo de ese código, si hay. */
  registroPrevio: { estado: string } | null;
  /** El firmante resuelto desde la base, o null. */
  firmante: { nombre: string; email: string } | null;
  motivoSinFirmante?: string;
  /** Las reglas de colocación del tenant (sin ellas, el catálogo de fábrica). */
  reglas?: ReglaColocacion[];
}

export interface ResultadoEncolado {
  ok: boolean;
  codigo: string;
  /** Por qué no entra ("" si entra). */
  motivo: string;
  /** Si no entra: ¿se puede volver a intentar cuando se arregle la causa? (false para lo enviado/encolado) */
  reencolable: boolean;
  tipo?: string;
  firmante?: { nombre: string; email: string };
}

/**
 * ¿Puede entrar este archivo en la cola? Lo que no pasa queda `requiere_revision` con el motivo, salvo
 * lo que ya está enviado o encolado (eso no se toca). UN ARCHIVO ENVIADO JAMÁS SE RE-ENCOLA.
 */
export function validarEncolado(archivo: string, ctx: ContextoDeEncolado): ResultadoEncolado {
  const { codigo } = leerAnclas(archivo);
  if (!ctx.enOutbox) return { ok: false, codigo, motivo: "No está en Outbox.", reencolable: false };
  if (!codigo) return { ok: false, codigo, motivo: "El nombre no trae el código del documento (ID-NNNNNN): no se puede garantizar que no se envíe dos veces.", reencolable: false };
  const previo = ctx.registroPrevio?.estado;
  if (previo === "enviado") return { ok: false, codigo, motivo: "Ya se envió a la firma: no se vuelve a encolar.", reencolable: false };
  if (previo === "en_cola") return { ok: false, codigo, motivo: "Ya está en la cola.", reencolable: false };
  if (previo === "limite") return { ok: false, codigo, motivo: "Ya está en la cola (frenado por el límite de Dropbox Sign; se reintenta solo).", reencolable: false };
  const sinColocacion = motivoSinColocacion(archivo, ctx.reglas);
  if (sinColocacion) return { ok: false, codigo, motivo: sinColocacion, reencolable: true };
  if (!ctx.firmante) return { ok: false, codigo, motivo: ctx.motivoSinFirmante || "No se pudo resolver al firmante en la base.", reencolable: true };
  return { ok: true, codigo, motivo: "", reencolable: false, tipo: tipoDeDocumento(archivo, ctx.reglas)!, firmante: ctx.firmante };
}

/** La tanda a enviar, a partir de la cola y de lo que sigue en Outbox. */
export function planificar(enCola: ItemEnCola[], archivosEnOutbox: Set<string>, config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Plan {
  const ordenados = [...enCola].sort((a, b) => a.orden - b.orden || a.archivo.localeCompare(b.archivo));
  const cupoHoy = cupoDelDia(config, estado, ahora);
  const tope = Math.max(0, Math.min(config.tamanoTanda, cupoHoy));
  const tanda: Candidato[] = [];
  const faltantes: ItemEnCola[] = [];
  let pendientesDespues = 0;
  const vistos = new Set<string>();
  for (const it of ordenados) {
    if (vistos.has(it.codigo)) continue;
    vistos.add(it.codigo);
    if (!archivosEnOutbox.has(it.archivo)) {
      faltantes.push(it);
      continue;
    }
    if (tanda.length < tope) tanda.push(it);
    else pendientesDespues++;
  }
  return { tanda, faltantes, pendientesDespues, cupoHoy };
}
