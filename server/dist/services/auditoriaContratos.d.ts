import type { Schema, Collection } from "mongoose";
import { type EventoContrato } from "../utils/auditoriaContratos.js";
/** Guarda los eventos de varios vínculos, en una sola escritura, con el contexto actual. Nunca tira. */
export declare function registrarEventosDeVarios(lista: {
    vinculo: {
        _id: any;
        projectId?: any;
        userId?: any;
    };
    eventos: EventoContrato[];
}[], operacion: string): Promise<void>;
/** Lo mismo, para un vínculo. */
export declare const registrarEventos: (vinculo: {
    _id: any;
    projectId?: any;
    userId?: any;
}, eventos: EventoContrato[], operacion: string) => Promise<void>;
/**
 * Para los scripts que escriben con el driver: la misma auditoría que los hooks. `uno` = updateOne.
 * Devuelve lo mismo que la escritura.
 */
export declare function escribirContratosAuditado(coleccion: Collection, filtro: any, update: any, opciones?: any, uno?: boolean): Promise<import("mongodb").UpdateResult<import("bson").Document>>;
export declare function instalarAuditoriaDeContratos(schema: Schema): void;
