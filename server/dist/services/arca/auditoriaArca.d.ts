/**
 * ARCA EN MODO AUDITORÍA (etapa 5, 20/11/2026): LO QUE NO ENCAJA ENTRE WEPRODU Y ARCA, EN UN SOLO LUGAR.
 *
 * Las bajas con evidencia fuerte ya llegan solas al contrato (`bajasArcaAutomaticas.ts`). Esto es lo otro:
 * lo que NO se escribe porque la evidencia no alcanza o porque la diferencia es un hecho que tiene que
 * decidir una persona. Se lista, con las dos fechas y el porqué; nada de acá escribe ni deduce.
 *
 *  - faltaBajaArca      el contrato terminó en WeProdu y en ARCA la relación sigue abierta: falta presentar
 *                       la baja EN ARCA (la exposición legal es ésta).
 *  - revisionManual     tramos de ARCA que ningún contrato explica, un hecho en medio de varios tramos, otro
 *                       contrato con la misma alta (Xiara), recibos posteriores a la baja de ARCA (Jordan,
 *                       Fernández: WeProdu fusionó relaciones).
 *  - granularidad       ARCA declara por jornadas dentro del contrato, pero el último tramo termina más de
 *                       15 días antes que el contrato: ¿la persona dejó antes? (Sarli, Peralta, Freno).
 *  - relacionSinContrato una relación de ARCA cuyo inicio no es el alta exacta de ningún contrato, pero que
 *                       se solapa con contratos de esa persona y empleadora: la misma relación con otra
 *                       fecha (Valentina Pellegrini: 07/02 vs 10/02/2025) o un tramo de ARCA que WeProdu
 *                       tiene por jornadas. No se alinea sola (decisión del 18/11).
 *  - discrepanciasFrame lo que FRAME manda distinto de WeProdu y el import no pisó (vacío mientras el import
 *                       esté pausado; el contador tenía que vivir en un lugar que alguien mire).
 *
 * Los TOTALES se guardan en el tenant (`sincronizacionRelaciones.auditoria`) después de cada corrida
 * automática y cada vez que alguien abre la pestaña: así el contador del menú no recalcula nada.
 */
import { Types } from "mongoose";
import { type ItemBajaArca } from "./bajasArcaContratos.js";
/** Un ítem de bajas como lo ve la pantalla (sin los valores crudos que sólo sirven para escribir). */
export type ItemAuditoriaBaja = Omit<ItemBajaArca, "bajaCruda" | "altaCruda">;
export interface ItemRelacionSinContrato {
    userId: string;
    persona: string;
    cuil: string;
    empleadora: string;
    empleadoraCuit: string;
    inicio: string;
    fin: string;
    situacionBaja: string;
    /** Los contratos solapados, del más cercano al más lejano. `dias` positivo = ARCA empieza después. */
    contratos: {
        contratoKey: string;
        userProjectId: string;
        posicion: number;
        proyecto: string;
        contrato: string;
        alta: string;
        baja: string;
        dias: number;
    }[];
}
export interface ItemDiscrepanciaFrame {
    _id: string;
    userId: string;
    persona: string;
    userProjectId: string;
    contratoKey: string | null;
    posicion: number;
    campo: string;
    weprodu: string;
    frame: string;
    detectadaEl: string;
    ultimaVezEl: string;
    veces: number;
}
export interface TotalesAuditoria {
    faltaBajaArca: number;
    revisionManual: number;
    granularidad: number;
    relacionSinContrato: number;
    discrepanciasFrame: number;
    total: number;
}
export interface AuditoriaArca {
    hoy: string;
    espejoAl: string | null;
    calculadoEl: string;
    faltaBajaArca: ItemAuditoriaBaja[];
    revisionManual: ItemAuditoriaBaja[];
    granularidad: ItemAuditoriaBaja[];
    relacionSinContrato: ItemRelacionSinContrato[];
    discrepanciasFrame: ItemDiscrepanciaFrame[];
    totales: TotalesAuditoria;
}
export declare function auditoriaArca(tenantId: Types.ObjectId | string): Promise<AuditoriaArca>;
/** Deja los totales en el tenant: es lo que lee el contador sin recalcular. */
export declare function guardarTotalesAuditoria(tenantId: Types.ObjectId | string, totales: TotalesAuditoria, el?: Date): Promise<void>;
export declare function totalesGuardados(tenantId: Types.ObjectId | string): Promise<{
    el: string | null;
    totales: TotalesAuditoria | null;
}>;
/** Para la corrida automática: recalcula y guarda los totales. Nunca tira. */
export declare function recalcularAuditoriaArca(tenantId: string): Promise<TotalesAuditoria | null>;
