import mongoose, { Types } from "mongoose";
/**
 * UN LOTE DE CONTRATACIÓN: las N solicitudes que salieron juntas al contratar una plantilla de equipo.
 *
 * Cada solicitud apunta acá (`metadata.loteId`): así el Historial las agrupa con el nombre del equipo.
 *
 * IDEMPOTENCIA: el índice único `(tenantId, idempotencyKey)` es lo que evita duplicar un lote por un
 * doble toque o un reintento después de un corte de red. El cliente genera la clave una vez por
 * contratación y la repite en cada intento; el segundo choca contra el índice y recibe el lote que ya
 * existe, sin crear nada. Mismo patrón que `RenovacionContrato` (índice único + lectura del existente).
 */
export interface ILoteContratacion {
    tenantId: Types.ObjectId;
    plantillaEquipoId: Types.ObjectId;
    projectId: Types.ObjectId;
    /** El nombre de la plantilla AL CONTRATAR: renombrarla después no cambia cómo se llamó este lote. */
    nombrePlantilla: string;
    idempotencyKey: string;
    creadoPor: Types.ObjectId;
    solicitudIds: Types.ObjectId[];
    totales: {
        personas: number;
        jornadas: number;
        importe: number;
    };
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const LoteContratacion: mongoose.Model<ILoteContratacion, {}, {}, {}, mongoose.Document<unknown, {}, ILoteContratacion, {}, {}> & ILoteContratacion & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>;
