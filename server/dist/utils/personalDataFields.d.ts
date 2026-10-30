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
export declare const BANKING_FIELD_KEYS: string[];
/** True si el objeto sanitizado incluye alguna modificación de datos bancarios. */
export declare function includesBankingChange(sanitized: Record<string, any> | undefined | null): boolean;
/**
 * Filtra un objeto de datos propuestos dejando sólo las claves permitidas y
 * habilitadas (según la config del tipo de pedido).
 */
export declare function sanitizePersonalData(proposed: Record<string, any> | undefined | null, enabledKeys: string[] | undefined | null): Record<string, any>;
/**
 * LOS ROLES DE LA FICHA AL APROBAR UN PEDIDO DE DATOS PERSONALES (30/10/2026). El pedido trae la lista
 * entera que la persona veía al pedirlo; aplicarla tal cual borraba los roles agregados después. Se
 * aplica sólo lo que el pedido CAMBIÓ: lo que sacó respecto de la ficha de ese momento se saca, lo que
 * agregó se agrega, y el resto queda como está hoy. Sin la foto del momento (pedidos viejos), sólo se
 * agrega: nunca se quita un rol que no se sabe si la persona quiso quitar.
 */
export declare function rolesTrasAprobarPedido(actuales: any[], alPedir: any[] | null | undefined, propuestos: any[]): string[];
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
