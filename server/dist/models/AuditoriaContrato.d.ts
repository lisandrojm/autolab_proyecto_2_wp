import mongoose, { Types } from "mongoose";
/**
 * AUDITORÍA DE CONTRATOS (etapa 3, 19/11/2026). Un evento por contrato y por escritura: se creó, cambió
 * (campo por campo, antes y después), se anuló o se quitó. Indexada por `contratoKey`, nunca por
 * posición (la posición se guarda sólo para leer). Se escribe sola desde los hooks de `UserProject` y
 * desde el helper de los scripts (`services/auditoriaContratos.ts`); se lee en la app, donde se ve el
 * contrato. Es registro: nada la edita ni la borra.
 */
export interface IAuditoriaContrato {
    contratoKey: Types.ObjectId | null;
    userProjectId: Types.ObjectId;
    projectId: Types.ObjectId | null;
    userId: Types.ObjectId | null;
    posicion: number;
    tipo: "creado" | "modificado" | "anulado" | "quitado";
    cambios: {
        campo: string;
        antes: unknown;
        despues: unknown;
    }[];
    resumen: {
        nombre_contrato?: string;
        fecha_alta_contrato?: string;
        fecha_baja_contrato?: string;
    };
    motivo?: string;
    nota?: string;
    el: Date;
    origen: "app" | "script" | "sistema";
    por?: {
        userId?: string;
        email?: string;
    };
    detalle?: string;
    /** Cómo se escribió: save, updateOne, updateMany, findOneAndUpdate, deleteMany, crudo… */
    operacion: string;
}
export declare const AuditoriaContrato: mongoose.Model<IAuditoriaContrato, {}, {}, {}, mongoose.Document<unknown, {}, IAuditoriaContrato, {}, {}> & IAuditoriaContrato & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>;
