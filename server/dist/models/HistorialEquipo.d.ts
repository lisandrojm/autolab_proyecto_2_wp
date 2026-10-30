import { Model, Types } from "mongoose";
/**
 * CADA CAMBIO DEL ÁREA/TURNO O DEL ROL DE UN MIEMBRO EN EL EQUIPO (30/10/2026).
 *
 * Existe porque «se cambian solos» no se podía rastrear: `teamConfig` y `UserProject.nombre_rol_frame`
 * se reescribían desde varios lugares (wizard, aprobar, renovar, la Jerarquía, el guardado entero del
 * equipo) y no quedaba quién ni desde dónde. Un documento por miembro y por cambio, con el antes, el
 * después y lo que llegó en el pedido. Sólo se escribe si algo cambió.
 */
export interface IHistorialEquipo {
    tenantId?: Types.ObjectId;
    projectId: Types.ObjectId;
    userId: Types.ObjectId;
    campo: "areas" | "rol";
    antes: any;
    despues: any;
    /** Desde dónde: "assign-member", "jerarquia", "team-config", "sede-de-area"… */
    origen: string;
    /** Lo que llegó en el pedido (recortado a lo que importa para entender el cambio). */
    payload?: any;
    por?: Types.ObjectId;
    porNombre?: string;
    el: Date;
}
export declare const HistorialEquipo: Model<IHistorialEquipo>;
