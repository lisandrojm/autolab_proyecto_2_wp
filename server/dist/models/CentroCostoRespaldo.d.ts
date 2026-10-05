import mongoose, { Document, Types } from "mongoose";
export interface ICentroCostoRespaldo extends Document {
    /** Quién lo corrió y desde dónde (la pantalla o el script). */
    ejecutadoPor?: Types.ObjectId;
    origen: "pantalla" | "script";
    modo: string;
    /** El catálogo tal cual estaba, crudo. */
    catalogoAnterior: unknown[];
    /** Un registro por proyecto tocado: `despues` es null cuando sólo se anotó el estado previo. */
    proyectos: Array<{
        projectId: Types.ObjectId;
        nombre?: string;
        antes: number;
        despues?: number | null;
    }>;
    /** Los que no se pudieron remapear, con el motivo, para que alguien los resuelva. */
    sinEquivalente: Array<{
        projectId: Types.ObjectId;
        nombre?: string;
        centroCostoId: number;
        motivo: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CentroCostoRespaldo: mongoose.Model<ICentroCostoRespaldo, {}, {}, {}, mongoose.Document<unknown, {}, ICentroCostoRespaldo, {}, {}> & ICentroCostoRespaldo & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
