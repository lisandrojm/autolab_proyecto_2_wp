import { Document, Types, Model } from "mongoose";
/**
 * LAS HORAS EXTRA NO DEPENDEN DEL MOTIVO, ASÍ QUE NO SE CONFIGURAN EN EL MOTIVO.
 *
 * Se liquidan haya o no ausencia: alguien que trabajó su turno normal y se quedó dos horas más
 * genera un 0015 igual, y ningún motivo de novedad está involucrado. Colgarlas de un motivo
 * obligaría a repetir la misma regla en los diez, y a que agregar un motivo nuevo signifique
 * acordarse de volver a cargarla.
 *
 * Vale para el titular y para el reemplazante por igual: cada uno con las horas que le cargaron.
 */
export interface IHorasExtraMemosoft {
    /** El concepto de las horas al 50%. Vacío = no se emiten. */
    codigo50?: string | null;
    /** El concepto de las horas al 100%. */
    codigo100?: string | null;
    param: "par1" | "par2";
    unidad: "cantidad" | "importe";
    vigenteDesde?: string | null;
}
export interface IActivityLogGeneralConfig extends Document {
    tenantId: Types.ObjectId;
    allowedPastDays: number;
    /** Cómo se liquidan las horas extra a Memosoft. Ver `IHorasExtraMemosoft`. */
    memosoftHorasExtra?: IHorasExtraMemosoft | null;
    createdAt: Date;
    updatedAt: Date;
}
interface IActivityLogGeneralConfigModel extends Model<IActivityLogGeneralConfig> {
    getOrCreateDefault(tenantId: Types.ObjectId): Promise<IActivityLogGeneralConfig>;
}
export declare const ActivityLogGeneralConfig: IActivityLogGeneralConfigModel;
export {};
