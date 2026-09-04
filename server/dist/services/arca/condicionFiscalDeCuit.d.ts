import { Types } from "mongoose";
import { CondicionFiscal } from "./condicionFiscal.js";
/**
 * La condición fiscal de un CUIT, lista para devolver: consulta A5, deriva y cachea.
 *
 * NUNCA TIRA. Cualquier problema —servicio sin autorizar en AFIP, timeout, tenant sin conexión de
 * ARCA configurada— vuelve como `DESCONOCIDO` con el motivo adentro. Es lo que permite que el alta
 * de usuario siga funcionando cuando esto no anda, que es el requisito que ordena todo lo demás: la
 * condición fiscal es un dato que suma, no un permiso para dar de alta a alguien.
 */
export declare function condicionFiscalDeCuit(tenantId: Types.ObjectId | string, cuit: string, opts?: {
    refrescar?: boolean;
}): Promise<CondicionFiscal>;
