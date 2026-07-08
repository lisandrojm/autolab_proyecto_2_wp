import { Types } from "mongoose";
type PersonalDataSection = "General" | "Domicilio" | "Datos bancarios";
interface PersonalDataFieldMeta {
    key: string;
    label: string;
    section: PersonalDataSection;
    type: "text" | "date" | "boolean" | "catalog";
    catalogType?: string;
}
export declare const PERSONAL_DATA_FIELD_META: PersonalDataFieldMeta[];
/**
 * Arma el HTML de la lista de datos modificados (solo los campos presentes en
 * `proposed`), resolviendo los valores de catálogo a su nombre legible.
 * Devuelve una lista <ul> lista para inyectar en la plantilla PDF.
 */
export declare function buildDatosModificadosHtml(proposed: Record<string, any> | undefined | null, tenantId: Types.ObjectId | string | undefined): Promise<string>;
export declare const PERSONAL_DATA_FIELD_KEYS: string[];
/**
 * Filtra un objeto de datos propuestos dejando sólo las claves permitidas y
 * habilitadas (según la config del tipo de pedido).
 */
export declare function sanitizePersonalData(proposed: Record<string, any> | undefined | null, enabledKeys: string[] | undefined | null): Record<string, any>;
/**
 * Construye el `$set` para User a partir de datos personales sanitizados.
 * Casos especiales:
 *  - nombre/apellido: además de metadata.*, actualizan firstName/lastName top-level y metadata.fullName / name.
 *  - rolesFrameIds: se guarda en metadata.roles_frame (array de refs).
 */
export declare function buildUserPersonalDataSet(sanitized: Record<string, any>, current: {
    firstName?: string;
    lastName?: string;
}): Record<string, any>;
export {};
