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
import { type CodigoErrorPropuesta, type ErrorPropuesta, type EstadoInvitacion, type EstadoVisible, type Tramo } from "./campania.js";
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
export type Paso = "A" | "B" | "C";
/** A: puede elegir (o espera su turno). B: está eligiendo. C: ya no elige acá (propuso, se otorgó, venció). */
export declare function pasoDe(d: Pick<DatosDePantalla, "puedeProponer" | "turnoCerradoDesde">, eligiendo: boolean): Paso;
/** «18/12» (sin año: la campaña es de una temporada). */
export declare const fechaSinAnio: (iso: string) => string;
/** «7 al 13 de dic», o «28 de dic al 3 de ene» si cambia el mes. */
export declare function textoDeFechas(desde: string, hasta: string): string;
/** El primer día de lunes a viernes después del fin: el que vuelve a trabajar (si corresponde a su jornada). */
export declare function diaDeRegreso(hasta: string): string;
/** «volvés el lun 14/12». */
export declare function textoDeRegreso(hasta: string): string;
/** «7 al 13 de dic · 7 días». */
export declare function textoDelTramo(t: Tramo, diasCorridos: boolean): string;
/** La línea del encabezado: «Vacaciones 2026/27 · 21 días · elegí hasta el 18/12» (o el estado, cuando ya no elige). */
export declare function encabezado(d: DatosDePantalla): string;
/** Paso A, en dos líneas: qué le toca y qué pasa si no elige. */
export declare function parrafoDeInvitacion(d: DatosDePantalla): string;
/** Paso B, en una línea: lo único que importa para repartir. */
export declare function reglaDelPaso(d: Pick<DatosDePantalla, "diasDisponibles" | "minPorTramo" | "diasDeInicio">): string;
export interface Progreso {
    repartidos: number;
    total: number;
    faltan: number;
    /** «7 de 21 repartidos». */
    texto: string;
}
export declare function progreso(tramos: Tramo[], diasDisponibles: number, diasCorridos: boolean): Progreso;
/** Lo que dice `erroresDePropuesta` y no es un error sino que todavía falta: se muestra neutro, no en rojo. */
export declare const CODIGOS_DE_AVANCE: CodigoErrorPropuesta[];
export declare const erroresReales: (errores: ErrorPropuesta[]) => ErrorPropuesta[];
/**
 * Los errores reales de UN tramo de la lista de la pantalla. `erroresDePropuesta` se calcula sólo con los tramos
 * completos (`indicesCompletos` dice en qué posición de la pantalla está cada uno).
 */
export declare function erroresDelTramoEnPantalla(errores: ErrorPropuesta[], indicesCompletos: number[], i: number): string[];
/**
 * POR QUÉ NO SE PUEDE ENVIAR TODAVÍA, en una línea neutra; `null` = se puede. En orden: un tramo sin fechas, un
 * error real (el detalle está en rojo en su tarjeta), días sin repartir.
 */
export declare function motivoDelBoton(o: {
    tramos: Tramo[];
    errores: ErrorPropuesta[];
    indicesCompletos: number[];
    faltan: number;
}): string | null;
/** ¿Se puede sumar otro tramo? Sólo si quedan días, los que hay tienen fechas y el saldo admite fraccionar. */
export declare function puedeAgregarTramo(o: {
    tramos: Tramo[];
    faltan: number;
    diasDisponibles: number;
    minPorTramo: number;
}): boolean;
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
export declare const TEXTO_ESTADO_VACACION: Record<string, string>;
/** Quién tiene la propuesta, según en qué paso está cada tramo (lo que la app sabe de cada vacación). */
export declare function quienLaTiene(vacaciones: Pick<VacacionDePantalla, "status">[]): string;
export declare function situacionDe(d: DatosDePantalla): Situacion;
/**
 * EL PRIMER DÍA EN QUE PUEDE EMPEZAR UN TRAMO, para abrir el calendario en ese mes y no en el actual: desde
 * `desde` (incluido), el primero que la pantalla permite y en que se puede empezar. `null` si no hay ninguno
 * en `maxDias` días.
 */
export declare function primerInicioElegible(desde: string, diasDeInicio: number[] | null | undefined, permitida: (fecha: string) => boolean, maxDias?: number): string | null;
