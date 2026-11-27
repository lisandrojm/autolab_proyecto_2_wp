/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA PANTALLA DE VACACIONES DEL EMPLEADO, POR PASOS (27/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Pedido del usuario: en vez de una pantalla con todo a la vista (saldo, aviso, acuse, link al saldo y el
 * formulario entero), un flujo guiado con UNA cosa protagonista por pantalla:
 *   · A — invitada: qué le toca y hasta cuándo en dos líneas, y dos acciones («Solicitar vacaciones» y
 *     «Mis solicitudes y saldo»). Si en su rol eligen por antigüedad y no es su turno, la primera espera.
 *   · B — eligiendo: cuántos días lleva repartidos, la única regla que importa en una línea, los tramos
 *     como tarjetas y el botón de enviar con el motivo (neutro, no rojo) cuando todavía no se puede.
 *   · C — en camino o resuelta: la propuesta enviada, aprobada, asignada por la empresa o vencida, con quién
 *     la tiene y qué sigue. Sin formulario.
 *
 * Acá viven las decisiones puras (qué paso, qué textos, qué motivo), probadas con node:test; la vista
 * (`apps/mobile/src/views/Campania.tsx`) sólo dibuja. Las reglas de la propuesta siguen en `campania.ts` y
 * no se tocan: lo que acá se hace es separar lo que es AVANCE («te faltan repartir 14 días») de lo que es
 * un ERROR real (tramos que se pisan, un tramo corto), porque se muestran distinto.
 *
 * El acuse de la invitación no es obligatorio para elegir (el server lo registra solo al proponer, ver
 * `proponerFechas`): «Solicitar vacaciones» lo registra como acto de la persona al entrar al paso B.
 */

import { ETIQUETA_ESTADO, OTORGADOS, PUEDE_PROPONER, contarDiasTramo, erroresDelTramo, normalizarDiasDeInicio, puedeEmpezar, textoDiasDeInicio, type CodigoErrorPropuesta, type ErrorPropuesta, type EstadoInvitacion, type EstadoVisible, type Tramo } from "./campania.js";
import { esISO, fechaCorta, sumarDias } from "../planVacaciones/fechas.js";

/* ─────────────────────────── Lo que la pantalla necesita ─────────────────────────── */

export interface VacacionDePantalla {
  status: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
}

/** Lo que la pantalla toma de `MiInvitacion` (lo que manda el server), sin acoplarse al tipo del API. */
export interface DatosDePantalla {
  estado: EstadoInvitacion;
  estadoVisible?: EstadoVisible;
  /** En plazo y con el turno abierto (lo decide el server). */
  puedeProponer: boolean;
  /** En plazo, pero en su rol eligen primero las más antiguas y su turno todavía no se abrió: desde cuándo (`null` = no espera). */
  turnoCerradoDesde?: string | null;
  diasDisponibles: number;
  diasCorridos: boolean;
  minPorTramo: number;
  diasDeInicio?: number[] | null;
  ventanaDesde: string;
  ventanaHasta: string;
  fechaLimite: string;
  nombreCampania: string;
  acuseOtorgamientoAt?: string | Date | null;
  /** Llegó el aviso por escrito del otorgamiento. */
  hayAviso: boolean;
  asignadaPorEmpresa: boolean;
  /** Si la última propuesta se rechazó (en parte o entera), el motivo. */
  rechazoMotivo?: string | null;
  vacaciones: VacacionDePantalla[];
}

/* ─────────────────────────── El paso ─────────────────────────── */

export type Paso = "A" | "B" | "C";

/** A: puede elegir (o espera su turno). B: está eligiendo. C: ya no elige acá (propuso, se otorgó, venció). */
export function pasoDe(d: Pick<DatosDePantalla, "puedeProponer" | "turnoCerradoDesde">, eligiendo: boolean): Paso {
  if (d.puedeProponer) return eligiendo ? "B" : "A";
  if (d.turnoCerradoDesde != null) return "A";
  return "C";
}

/* ─────────────────────────── Fechas cortas ─────────────────────────── */

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const diaDeSemana = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** «18/12» (sin año: la campaña es de una temporada). */
export const fechaSinAnio = (iso: string): string => (esISO(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso || "—");

/** «7 al 13 de dic», o «28 de dic al 3 de ene» si cambia el mes. */
export function textoDeFechas(desde: string, hasta: string): string {
  if (!esISO(desde) || !esISO(hasta)) return "";
  const dia = (iso: string) => String(Number(iso.slice(8, 10)));
  const mes = (iso: string) => MES_CORTO[Number(iso.slice(5, 7)) - 1];
  if (desde.slice(0, 7) === hasta.slice(0, 7)) return desde === hasta ? `${dia(desde)} de ${mes(desde)}` : `${dia(desde)} al ${dia(hasta)} de ${mes(desde)}`;
  return `${dia(desde)} de ${mes(desde)} al ${dia(hasta)} de ${mes(hasta)}`;
}

/** El primer día de lunes a viernes después del fin: el que vuelve a trabajar (si corresponde a su jornada). */
export function diaDeRegreso(hasta: string): string {
  if (!esISO(hasta)) return "";
  let d = sumarDias(hasta, 1);
  while (diaDeSemana(d) === 0 || diaDeSemana(d) === 6) d = sumarDias(d, 1);
  return d;
}

/** «volvés el lun 14/12». */
export function textoDeRegreso(hasta: string): string {
  const d = diaDeRegreso(hasta);
  return d ? `volvés el ${DIA_CORTO[diaDeSemana(d)]} ${fechaSinAnio(d)}` : "";
}

/** «7 al 13 de dic · 7 días». */
export function textoDelTramo(t: Tramo, diasCorridos: boolean): string {
  if (!esISO(t.desde) || !esISO(t.hasta) || t.hasta < t.desde) return "";
  const n = contarDiasTramo(t, diasCorridos);
  return `${textoDeFechas(t.desde, t.hasta)} · ${n} ${n === 1 ? "día" : "días"}`;
}

/* ─────────────────────────── Textos de cada paso ─────────────────────────── */

/** La línea del encabezado: «Vacaciones 2026/27 · 21 días · elegí hasta el 18/12» (o el estado, cuando ya no elige). */
export function encabezado(d: DatosDePantalla): string {
  const base = `${d.nombreCampania} · ${d.diasDisponibles} ${d.diasDisponibles === 1 ? "día" : "días"}`;
  if (d.puedeProponer || d.turnoCerradoDesde != null) return `${base} · elegí hasta el ${fechaSinAnio(d.fechaLimite)}`;
  const etiqueta = d.estadoVisible ? ETIQUETA_ESTADO[d.estadoVisible] : ETIQUETA_ESTADO[d.estado];
  return etiqueta ? `${base} · ${etiqueta}` : base;
}

/** Paso A, en dos líneas: qué le toca y qué pasa si no elige. */
export function parrafoDeInvitacion(d: DatosDePantalla): string {
  const dias = `${d.diasDisponibles} ${d.diasDisponibles === 1 ? "día" : "días"} ${d.diasCorridos ? "corridos" : "hábiles"}`;
  return `Tenés ${dias} para tomar entre el ${fechaCorta(d.ventanaDesde)} y el ${fechaCorta(d.ventanaHasta)}. Si no elegís antes del ${fechaCorta(d.fechaLimite)}, la empresa te propone unas fechas.`;
}

/** La cuenta regresiva de la tarjeta «Solicitar vacaciones»: cuántos días quedan para elegir (hasta la fecha límite). */
export function cuentaRegresiva(diasParaLaFechaLimite: number): string {
  if (diasParaLaFechaLimite < 0) return "Venció el plazo";
  if (diasParaLaFechaLimite === 0) return "Hoy es el último día";
  return diasParaLaFechaLimite === 1 ? "Queda 1 día" : `Quedan ${diasParaLaFechaLimite} días`;
}

/** Paso B, en una línea: lo único que importa para repartir. */
export function reglaDelPaso(d: Pick<DatosDePantalla, "diasDisponibles" | "minPorTramo" | "diasDeInicio">): string {
  const inicio = normalizarDiasDeInicio(d.diasDeInicio);
  const empieza = inicio.length > 0 ? `empieza ${textoDiasDeInicio(inicio)}` : "";
  if (d.diasDisponibles < d.minPorTramo) return `Tus ${d.diasDisponibles} días van seguidos, en un solo tramo${empieza ? ` que ${empieza}` : ""}.`;
  return `Tenés que repartir los ${d.diasDisponibles} días. Cada tramo ${empieza ? `${empieza} y ` : ""}dura al menos ${d.minPorTramo}.`;
}

/* ─────────────────────────── El avance y los errores ─────────────────────────── */

export interface Progreso {
  repartidos: number;
  total: number;
  faltan: number;
  /** «7 de 21 repartidos». */
  texto: string;
}

const completo = (t: Tramo): boolean => esISO(t.desde) && esISO(t.hasta) && t.hasta >= t.desde;

export function progreso(tramos: Tramo[], diasDisponibles: number, diasCorridos: boolean): Progreso {
  const repartidos = tramos.filter(completo).reduce((s, t) => s + contarDiasTramo(t, diasCorridos), 0);
  return { repartidos, total: diasDisponibles, faltan: Math.max(0, diasDisponibles - repartidos), texto: `${repartidos} de ${diasDisponibles} repartidos` };
}

/** Lo que dice `erroresDePropuesta` y no es un error sino que todavía falta: se muestra neutro, no en rojo. */
export const CODIGOS_DE_AVANCE: CodigoErrorPropuesta[] = ["sin_tramos", "faltan"];

export const erroresReales = (errores: ErrorPropuesta[]): ErrorPropuesta[] => errores.filter((e) => !CODIGOS_DE_AVANCE.includes(e.codigo));

/**
 * Los errores reales de UN tramo de la lista de la pantalla. `erroresDePropuesta` se calcula sólo con los tramos
 * completos (`indicesCompletos` dice en qué posición de la pantalla está cada uno).
 */
export function erroresDelTramoEnPantalla(errores: ErrorPropuesta[], indicesCompletos: number[], i: number): string[] {
  const k = indicesCompletos.indexOf(i);
  if (k < 0) return [];
  return erroresDelTramo(erroresReales(errores), k).map((e) => e.mensaje);
}

/**
 * POR QUÉ NO SE PUEDE ENVIAR TODAVÍA, en una línea neutra; `null` = se puede. En orden: un tramo sin fechas, un
 * error real (el detalle está en rojo en su tarjeta), días sin repartir.
 */
export function motivoDelBoton(o: { tramos: Tramo[]; errores: ErrorPropuesta[]; indicesCompletos: number[]; faltan: number }): string | null {
  if (o.tramos.length === 0) return "Agregá un tramo";
  const sinFechas = o.tramos.findIndex((t) => !completo(t));
  if (sinFechas >= 0) return o.tramos.length > 1 ? `Elegí las fechas del tramo ${sinFechas + 1}` : "Elegí tus fechas";
  const reales = erroresReales(o.errores);
  if (reales.length > 0) {
    const k = reales[0].tramo ?? reales[0].tramos?.[0];
    const i = k != null ? o.indicesCompletos[k] : undefined;
    return i != null && o.tramos.length > 1 ? `Corregí el tramo ${i + 1}` : "Corregí lo marcado";
  }
  if (o.faltan > 0) return `Faltan ${o.faltan} ${o.faltan === 1 ? "día" : "días"} por repartir`;
  return null;
}

/** ¿Se puede sumar otro tramo? Sólo si quedan días, los que hay tienen fechas y el saldo admite fraccionar. */
export function puedeAgregarTramo(o: { tramos: Tramo[]; faltan: number; diasDisponibles: number; minPorTramo: number }): boolean {
  return o.faltan > 0 && o.tramos.every(completo) && o.diasDisponibles >= o.minPorTramo;
}

/* ─────────────────────────── Paso C: en qué está ─────────────────────────── */

export type ClaveDeSituacion = "enviada" | "otorgada" | "vencida" | "sin_dias" | "otra";

export interface Situacion {
  clave: ClaveDeSituacion;
  titulo: string;
  /** Quién la tiene, o qué pasó. */
  detalle: string;
  /** Qué sigue para la persona. */
  queSigue: string;
  /** Llegó el aviso por escrito y todavía no acusó recibo. */
  acusePendiente: boolean;
}

export const TEXTO_ESTADO_VACACION: Record<string, string> = { pending: "Esperando aprobación", pre_approved: "Esperando a RR.HH.", approved: "Aprobada", delivered: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada" };

/** Quién tiene la propuesta, según en qué paso está cada tramo (lo que la app sabe de cada vacación). */
export function quienLaTiene(vacaciones: Pick<VacacionDePantalla, "status">[]): string {
  if (vacaciones.length === 0) return "";
  const estados = new Set(vacaciones.map((v) => v.status));
  const pendiente = estados.has("pending");
  const enRrhh = estados.has("pre_approved");
  if (pendiente && enRrhh) return "Parte la revisa tu supervisor o tu coordinador y parte RR.HH.";
  if (pendiente) return "La revisa tu supervisor o tu coordinador.";
  if (enRrhh) return "La revisa RR.HH.";
  if (vacaciones.every((v) => ["approved", "delivered"].includes(v.status))) return "Aprobada.";
  if (vacaciones.every((v) => ["rejected", "cancelled"].includes(v.status))) return "Rechazada.";
  return "";
}

export function situacionDe(d: DatosDePantalla): Situacion {
  const otorgada = OTORGADOS.includes(d.estado);
  if (otorgada) {
    const acusePendiente = d.hayAviso && !d.acuseOtorgamientoAt;
    return {
      clave: "otorgada",
      titulo: d.asignadaPorEmpresa ? "Vacaciones asignadas por la empresa" : "Vacaciones aprobadas",
      detalle: d.hayAviso ? "Te llegó el aviso por escrito." : "",
      queSigue: acusePendiente ? "Acusá recibo del aviso." : "No tenés nada más que hacer: disfrutalas.",
      acusePendiente,
    };
  }
  if (d.estado === "propuso_fechas") {
    return { clave: "enviada", titulo: "Propuesta enviada", detalle: quienLaTiene(d.vacaciones), queSigue: "Cuando se apruebe te llega el aviso por escrito acá y acusás recibo.", acusePendiente: false };
  }
  if (d.estado === "vencido_sin_definir" || (PUEDE_PROPONER.includes(d.estado) && !d.puedeProponer && d.turnoCerradoDesde == null)) {
    return { clave: "vencida", titulo: "Venció el plazo para elegir", detalle: "", queSigue: "La empresa te asigna un período continuo y te llega el aviso por escrito acá.", acusePendiente: false };
  }
  if (d.estado === "sin_dias_pendientes") {
    return { clave: "sin_dias", titulo: "Sin días pendientes", detalle: "Ya tomaste los días de esta temporada.", queSigue: "", acusePendiente: false };
  }
  return { clave: "otra", titulo: ETIQUETA_ESTADO[d.estado] || d.estado, detalle: "", queSigue: "", acusePendiente: false };
}

/* ─────────────────────────── El calendario ─────────────────────────── */

/**
 * EL PRIMER DÍA EN QUE PUEDE EMPEZAR UN TRAMO, para abrir el calendario en ese mes y no en el actual: desde
 * `desde` (incluido), el primero que la pantalla permite y en que se puede empezar. `null` si no hay ninguno
 * en `maxDias` días.
 */
export function primerInicioElegible(desde: string, diasDeInicio: number[] | null | undefined, permitida: (fecha: string) => boolean, maxDias = 400): string | null {
  if (!esISO(desde)) return null;
  const dias = normalizarDiasDeInicio(diasDeInicio);
  for (let i = 0; i < maxDias; i++) {
    const f = sumarDias(desde, i);
    if (permitida(f) && puedeEmpezar(f, dias)) return f;
  }
  return null;
}
