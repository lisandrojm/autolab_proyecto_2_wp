import { IInfo } from "../models/Info.js";
/**
 * EL ESTADO «CONTRATADO» (paso 6 de Gestión de Contratos): el último del circuito, al que llega el
 * contrato cuando Dropbox Sign devuelve el firmado (la carpeta con propósito «firmados»). No hay un
 * nombre fijo: se resuelve por la configuración del tenant, como el de Envío de documentación.
 */
export declare function estadoContratado(): Promise<IInfo | null>;
/**
 * TIPOS QUE NO PASAN POR EL CIRCUITO (28/10/2026): un contrato nuevo de un tipo que no manda nada a
 * firmar y no genera alta temprana de ARCA no tiene nada que hacer en los pasos 1 a 5. Queda
 * contratado al crearse. Devuelve ese estado, o null si el contrato sigue el circuito normal.
 *
 * Si genera alta lo dice el estado impositivo que ya trae el contrato (el de su plantilla): el
 * `generaAlta` guardado en el tipo quedó viejo, ahora lo decide ese estado (ver ContractTypesTab).
 */
export declare function estadoDirectoAContratado(contratoId: unknown, estadoId: unknown): Promise<IInfo | null>;
