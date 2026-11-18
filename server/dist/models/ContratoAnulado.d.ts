import { Document, Types } from "mongoose";
/**
 * UN CONTRATO ANULADO, ENTERO (etapa 2b, 18/11/2026; ver `utils/anulacionContrato.ts`).
 *
 * En `users_&_projects` queda sólo la lápida (su clave y la marca), para que no se corran las posiciones
 * de los demás. Lo que el contrato era vive acá, tal cual estaba al anularlo, con quién lo anuló, cuándo
 * y por qué. Si al anularlo no quedaba ningún contrato de verdad en el vínculo, el vínculo se borró como
 * antes (`vinculoEliminado`): el contrato no se pierde igual.
 */
export interface IContratoAnulado extends Document {
    tenantId: Types.ObjectId | null;
    userProjectId: Types.ObjectId;
    userId: Types.ObjectId;
    projectId: Types.ObjectId;
    contratoKey: Types.ObjectId;
    /** La posición que tenía en el array al anularlo (la lápida queda ahí). */
    posicion: number;
    /** El contrato completo, como estaba. */
    contrato: Record<string, unknown>;
    anuladoEl: Date;
    anuladoPor: Types.ObjectId | null;
    anuladoPorNombre: string;
    motivo: string;
    /** Desde dónde: el panel, o el borrado de la solicitud aprobada que lo había creado. */
    origen: "panel" | "borrar_solicitud" | "delete_deprecado";
    /** No quedaba ningún contrato de verdad: el vínculo con el proyecto se borró (como hacía el borrado físico). */
    vinculoEliminado: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ContratoAnulado: import("mongoose").Model<IContratoAnulado, {}, {}, {}, Document<unknown, {}, IContratoAnulado, {}, {}> & IContratoAnulado & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default ContratoAnulado;
