import { Document, Types } from "mongoose";
import { TipoNomenclatura } from "../utils/nomenclatura.js";
/**
 * El patrón de nombre de archivo de un tipo de documento, por tenant.
 *
 * Una fila por (tenant, tipo). Si no hay fila, rige `PATRON_POR_DEFECTO` — que reproduce exactamente
 * los nombres que la plataforma generaba antes de que esto existiera. Por eso no hace falta sembrar
 * nada al crear un tenant ni migrar los que ya existen: sin configurar, todo sigue igual.
 *
 * No se guarda un patrón inválido: `validarPatron()` corre en la ruta antes de escribir. Las reglas y
 * el porqué están en `utils/nomenclatura.ts`.
 */
export interface INomenclaturaArchivo extends Document {
    tenantId: Types.ObjectId;
    tipo: TipoNomenclatura;
    patron: string;
    /** Quién lo cambió por última vez. El nombre de archivo es un dato que después se audita. */
    actualizadoPor?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const NomenclaturaArchivo: import("mongoose").Model<INomenclaturaArchivo, {}, {}, {}, Document<unknown, {}, INomenclaturaArchivo, {}, {}> & INomenclaturaArchivo & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default NomenclaturaArchivo;
