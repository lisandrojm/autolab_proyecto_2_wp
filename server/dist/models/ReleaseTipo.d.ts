import { Document, Model, Types } from "mongoose";
/**
 * ReleaseTipo: el tipo de release (análogo a `Contrato` para `ContratoFrame`). "Plantillas |
 * Release" (colección `Release`) apunta a un ReleaseTipo vía `releaseTipoId`; ahí vive el
 * documento PDF en sí. Un ReleaseTipo puede tener varios Release (variantes).
 *
 * A diferencia de `Contrato` (sin tenant), acá sí hay `tenantId`: `Release` ya está scopeado por
 * tenant, así que el tipo también lo está para no mezclar catálogos entre tenants.
 */
export interface IReleaseTipo extends Document {
    tenantId: Types.ObjectId;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ReleaseTipo: Model<IReleaseTipo>;
