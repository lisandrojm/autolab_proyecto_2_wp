import { ClientSession, Types } from "mongoose";
/**
 * ANTES DE GUARDAR: valida lo que el server exige y pone lo que sólo el server pone. Modifica
 * `metadata`. Devuelve el motivo del rechazo, o `null` si se puede guardar.
 */
export declare function prepararSolicitudNueva(tenantId: Types.ObjectId, creadorId: string, metadata: any): Promise<string | null>;
/** El rol por defecto del tenant, que es con el que nace un alta que no pide otro. */
export declare function rolesPorDefecto(tenantId: Types.ObjectId, session?: ClientSession): Promise<string[]>;
/**
 * DESPUÉS DE GUARDAR: lo que la solicitud dispara afuera. Cada efecto con su propio catch donde hace
 * falta: la solicitud ya existe, y eso es lo que no se puede perder.
 */
export declare function efectosDeSolicitudNueva(tenantId: Types.ObjectId, creadorId: string, user: any): Promise<void>;
