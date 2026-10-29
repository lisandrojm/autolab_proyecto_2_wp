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
/**
 * TERMINADO EL TRÁMITE IMPOSITIVO, LOS QUE NO SE FIRMAN VAN A CONTRATADOS (29/10/2026). La constancia de
 * CUIT archivada (o el alta registrada) llevaba el contrato a «Envío de documentación», la bandeja
 * Generar Documentos, aunque su tipo no mande nada a firmar: quedaba ahí diciendo «No se firma». Si el
 * tipo no firma nada —contando la firma del alta sólo si el contrato viene de un alta temprana—, el
 * destino pasa a ser Contratados. Sólo contratos de WeProdu (solicitud o «Agregar miembro»), como el
 * paso 6. Devuelve el estado que corresponde, o el mismo destino.
 */
export declare function destinoSiNoSeFirma(contrato: any, destino: IInfo): Promise<IInfo>;
export declare function estadoDirectoAContratado(contratoId: unknown, estadoId: unknown): Promise<IInfo | null>;
