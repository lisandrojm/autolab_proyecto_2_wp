import mongoose, { Types } from "mongoose";
/**
 * QUÉ SE DECIDIÓ CON UN CONTRATO POR VENCER: RENOVARLO O DEJARLO VENCER.
 *
 * Es lo que saca un contrato de la pestaña «Por vencer» de Contratación (ver
 * `services/contratosPorVencer.ts`). Sin esto la lista no tiene memoria: el mismo contrato volvería a
 * aparecer cada día hasta su fecha de baja, aunque alguien ya lo hubiera resuelto.
 *
 * EL CONTRATO SE IDENTIFICA POR (UserProject, fecha de baja). Los contratos son subdocumentos sin `_id`
 * (`UserProject.contracts[]`), así que no hay otra forma estable de nombrarlos: dentro de una misma
 * asignación, dos contratos no terminan el mismo día.
 *
 * - `renovar`: se pidió una solicitud de contratación con la etiqueta «Renovación» (`solicitudId`). Si
 *   esa solicitud después se RECHAZA o se CANCELA, el contrato vuelve a la lista: la renovación no pasó.
 * - `dejar_vencer`: no se renueva; el contrato termina en su fecha. Queda quién lo decidió y cuándo.
 *
 * Una decisión nueva sobre el mismo contrato pisa a la anterior (se guarda con upsert).
 */
export interface IRenovacionContrato {
    tenantId: Types.ObjectId;
    userProjectId: Types.ObjectId;
    userId?: Types.ObjectId;
    projectId?: Types.ObjectId;
    /** "YYYY-MM-DD": junto con `userProjectId` es la identidad del contrato. */
    fechaBajaContrato: string;
    decision: "renovar" | "dejar_vencer";
    /** La solicitud de renovación, cuando `decision` es "renovar". */
    solicitudId?: Types.ObjectId;
    decididoPor?: Types.ObjectId;
    decididoPorNombre?: string;
    decididoEl: Date;
}
export declare const RenovacionContrato: mongoose.Model<IRenovacionContrato, {}, {}, {}, mongoose.Document<unknown, {}, IRenovacionContrato, {}, {}> & IRenovacionContrato & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>;
