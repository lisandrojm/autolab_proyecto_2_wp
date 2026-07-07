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
