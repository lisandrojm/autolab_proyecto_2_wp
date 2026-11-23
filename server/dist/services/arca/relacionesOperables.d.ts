/**
 * LAS RELACIONES DE ARCA SOBRE LAS QUE SE PUEDE OPERAR, VISTAS DESDE ARCA (22/11/2026).
 *
 * Gestión › Bajas ARCA (`listaBajasArca.ts`) parte de la RELACIÓN (una fila del espejo de Relaciones Laborales), y
 * una relación puede tener un contrato en WeProdu, varios o ninguno:
 *
 *   · `contrato`      un solo contrato con esa persona, empleadora y fecha de alta: el panel abre con él.
 *   · `elegir`        varios: hay que elegir cuál antes de abrir.
 *   · `sin_contrato`  ninguno (las altas viejas hechas a mano): el panel abre «sin contrato». La operación no
 *                     se puede guardar en ningún contrato; la marca que impide mandarla dos veces va al registro
 *                     de operaciones (`registroOperaciones.ts`).
 *   · `null`          no hay nada que operar (y `motivo` dice por qué).
 *
 * LA DECISIÓN ES LA DE SIEMPRE: `compartido/arca/relacionParaOperar.ts`, la misma que usa el panel, contrato por
 * contrato. Acá sólo se arma con qué llamarla. Un contrato de Servicios con la misma fecha
 * de alta no cuenta como contrato de la relación: Servicios no tiene relación en ARCA.
 *
 * LIVIANA A PROPÓSITO (la base está lejos): de los contratos sólo viajan los que empiezan en la fecha de inicio de
 * alguna de las relaciones pedidas, con los campos que la regla mira.
 */
import { Types } from "mongoose";
import { type RelacionParaOperar } from "../../compartido/arca/relacionParaOperar.js";
import { type MarcasDeRegistro } from "./registroOperaciones.js";
/** Hasta cuántos días atrás una relación cerrada cuenta como «cerrada hace poco» (`estadoDeRelacion`). */
export declare const DIAS_CERRADA_RECIENTE = 30;
export type EstadoDeRelacion = "abierta" | "fin_futuro" | "cerrada_reciente" | "cerrada";
export type ModoDeOperar = "contrato" | "elegir" | "sin_contrato";
export interface ContratoDeRelacion {
    userProjectId: string;
    contratoKey: string | null;
    posicion: number;
    proyecto: string;
    contrato: string;
    alta: string;
    baja: string;
    /** La decisión de la regla compartida para ESTE contrato. */
    relacionArca: RelacionParaOperar;
    /** La baja presentada desde WeProdu en este contrato (`bajaArcaPresentada`), si hay. */
    bajaPresentada: {
        resultado: string;
        clase: string;
        fecha: string;
    } | null;
    /** El motivo de baja cargado en el contrato (código de ARCA) y la fecha de telegrama (sólo con renuncia). */
    motivoBaja?: string;
    fechaTelegrama?: string;
}
export interface RelacionOperable {
    clave: string;
    empleadoraCuit: string;
    empleadora: string;
    cuil: string;
    persona: string;
    /** La persona en WeProdu, si está. */
    userId: string | null;
    inicio: string;
    fin: string;
    situacionBaja: string;
    modalidadContrato: string;
    estado: EstadoDeRelacion;
    /** Los contratos de WeProdu de esa relación (misma persona, empleadora y fecha de alta; sin anulados ni Servicios). */
    contratos: ContratoDeRelacion[];
    modo: ModoDeOperar | null;
    puede: boolean;
    /** Por qué no se opera ("" si se puede). */
    motivo: string;
    /** Modo `contrato` con el contrato ya terminado en WeProdu: cuántos días pasaron desde su fin. */
    diasDesdeFinContrato: number | null;
    /** La baja de esta relación en el registro de operaciones (lo que hay cuando no tiene contrato donde marcarla). */
    bajaEnRegistro: {
        resultado: string;
        fecha: string;
    } | null;
}
/** El estado de una relación por su fecha de fin. Pura. */
export declare function estadoDeRelacion(fin: string, hoy: string): EstadoDeRelacion;
export interface ContratoCandidato {
    userProjectId: string;
    contratoKey: string | null;
    posicion: number;
    proyecto: string;
    contrato: string;
    alta: string;
    baja: string;
    estadoContrato: string;
    tramite: string | null;
    altaArcaPresentada: {
        resultado?: string;
        via?: string;
    } | null;
    marcas: Array<{
        resultado?: string;
        fecha?: unknown;
    } | null | undefined>;
    /** La marca de la baja (`bajaArcaPresentada`), con su clase: para saber si quedó sin confirmar. */
    marcaBaja?: {
        resultado?: string;
        clase?: string;
        fecha?: unknown;
    } | null;
    motivoBaja?: string;
    fechaTelegrama?: string;
}
/**
 * CÓMO SE OPERA UNA RELACIÓN, dados los contratos de WeProdu que empiezan ese día con esa empleadora. Pura: es la
 * parte que se prueba (`relacionesOperables.test.ts`).
 */
export declare function modoDeOperar(rel: {
    empleadoraCuit: string;
    cuil: string;
    inicio: string;
    fin: string;
}, contratos: ContratoCandidato[], registro: MarcasDeRegistro, hoy: string): Pick<RelacionOperable, "contratos" | "modo" | "puede" | "motivo" | "diasDesdeFinContrato">;
export interface FiltroRelaciones {
    /** Todas las relaciones de una persona (Antigüedad ARCA). */
    cuil?: string;
    /** UNA relación (el panel, en modo «sin contrato»). */
    relacion?: {
        empleadoraCuit: string;
        cuil: string;
        fechaInicio: string;
    };
}
export declare function relacionesOperables(tenantId: Types.ObjectId | string, filtro?: FiltroRelaciones): Promise<{
    hoy: string;
    relaciones: RelacionOperable[];
}>;
