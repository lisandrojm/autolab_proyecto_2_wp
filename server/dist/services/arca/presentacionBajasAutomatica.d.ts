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
import { type ResultadoOperacion } from "./corridaOperacionRelacion.js";
import { type FilaBajaArca } from "./listaBajasArca.js";
import { type ReferenciaContrato } from "./operacionRelacion.js";
import type { DatosBaja } from "./reglasOperacionRelacion.js";
export type ModoBajasAutomaticas = "apagada" | "simular" | "presentar";
export declare const MODOS: ModoBajasAutomaticas[];
export declare const NOMBRE_MODO: Record<ModoBajasAutomaticas, string>;
export declare const TOPE_POR_CORRIDA = 5;
export declare const DETALLE_AUDITORIA = "cron sincronizacionRelaciones: bajas autom\u00E1ticas de WeProdu a ARCA";
export declare const modoDe: (v: unknown) => ModoBajasAutomaticas;
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
declare const resumenDeFila: (f: FilaBajaArca) => {
    clave: string;
    persona: string;
    cuil: string;
    empleadora: string;
    situacion: number;
};
/**
 * De la lista de Bajas ARCA, las CANDIDATAS (situación 1 o 2, con su contrato y sin bloqueo) partidas en las que
 * pasan a mirarse con el plan del panel y las que se saltean acá, con el motivo. Pura.
 */
export declare function elegirCandidatas(filas: FilaBajaArca[], empleadorasConError?: string[]): {
    candidatas: FilaBajaArca[];
    paraPlan: FilaBajaArca[];
    salteadas: Salteada[];
};
/** Lo que se le pasa al plan y al envío del panel para una fila: el contrato y los datos de la baja, todos del contrato. */
export declare function pedidoDeBaja(f: FilaBajaArca): {
    ref: ReferenciaContrato;
    datos: DatosBaja;
};
/** Con más para presentar que el tope no se presenta NINGUNA. Pura. */
export declare const superaElTope: (cuantas: number, tope?: number) => boolean;
export type ResultadoDeItem = "presentada" | "simulada" | "sin_confirmar" | "rechazada" | "fallida";
/** Qué significa el resultado del envío del panel para la corrida, y si la corta. Pura. */
export declare function lecturaDelResultado(r: ResultadoOperacion | undefined): {
    resultado: ResultadoDeItem;
    corta: boolean;
    detalle: string;
};
export interface Requisitos {
    /** Hay una prueba en seco de una baja hecha a mano desde el panel: habilita «Solo simular». */
    secoManual: {
        cumplido: boolean;
        el: string | null;
    };
    /** Hay una baja mandada a mano y confirmada por la sincronización (cerrada en el espejo): habilita «Presentar». */
    bajaConfirmada: {
        cumplido: boolean;
        el: string | null;
        pendientesDeSincronizar: number;
    };
}
export declare function requisitosDe(tenantObjectId: Types.ObjectId): Promise<Requisitos>;
/** Por qué no se puede elegir ese modo ("" si se puede). Pura. */
export declare function motivoParaNoElegir(modo: ModoBajasAutomaticas, r: Requisitos): string;
export interface CambioDeModo {
    el: string;
    de: ModoBajasAutomaticas;
    a: ModoBajasAutomaticas;
    por: {
        userId: string;
        nombre: string;
    };
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
export declare function guardadoDe(tenantObjectId: Types.ObjectId): Promise<GuardadoBajasAutomaticas>;
export declare class ModoNoPermitido extends Error {
}
/** Cambia el modo. Tira `ModoNoPermitido` si el escalón no está cumplido. Deja quién lo cambió. */
export declare function cambiarModo(tenantObjectId: Types.ObjectId, modo: ModoBajasAutomaticas, por: {
    userId: string;
    nombre: string;
}): Promise<GuardadoBajasAutomaticas>;
export interface Previa {
    candidatas: number;
    paraPresentar: Array<ReturnType<typeof resumenDeFila> & {
        motivo: string;
        fechaFin: string;
    }>;
    salteadas: Salteada[];
    superaElTope: boolean;
}
/** Lo que la corrida haría ahora mismo con el espejo que hay. No abre ARCA ni escribe nada. */
export declare function previaDe(tenantObjectId: Types.ObjectId): Promise<Previa>;
/**
 * LA CORRIDA, al final de la sincronización automática. `empleadorasConError`: los CUIT cuya lectura falló hoy.
 * Apagada no hace ni guarda nada. Nunca tira: una falla acá no toca la sincronización.
 */
export declare function correrBajasAutomaticas(tenantId: string, empleadorasConError?: string[]): Promise<CorridaBajasAutomaticas | null>;
/** Lo mismo, con el nombre del cron en la auditoría de los contratos que toque. */
export declare const correrBajasAutomaticasDelCron: (tenantId: string, empleadorasConError?: string[]) => Promise<CorridaBajasAutomaticas>;
export {};
