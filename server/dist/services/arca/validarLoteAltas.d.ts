import { Diferencia, ModoAltas } from "./cotejoAltas.js";
/**
 * EL LOTE LO DECIDE EL SERVIDOR.
 *
 * El cliente manda `{ userProjectId, contractIndex, registro }` por contrato. Acá se comprueba que
 * cada registro sea EXACTAMENTE el de ese contrato —posición por posición contra la base, ver
 * `cotejoAltas.ts`— y que el lote sea presentable: una sola empleadora (la de la pestaña), contratos
 * en el estado de Alta temprana, sin CUILs repetidos, y no más de 9 si es Altas Masivas.
 *
 * Si UNA línea no coincide se rechaza el lote ENTERO. Mandar «los que estén bien» haría que el
 * resultado en ARCA dependa de un filtrado que nadie vio.
 */
export interface ItemLoteAltas {
    userProjectId: string;
    contractIndex: number;
    registro: string;
}
export interface LoteAltasValidado {
    modo: ModoAltas;
    empresa: {
        _id: string;
        cuit: string;
        razonSocial: string;
    };
    items: Array<{
        userProjectId: string;
        contractIndex: number;
        cuil: string;
        nombre: string;
        registro: string;
    }>;
    /** El texto tal cual va a ARCA: LF, LF final en el archivo; sin LF final en el pegado. */
    texto: string;
}
export declare class LoteAltasError extends Error {
    status: number;
    detalle: Array<string | Diferencia>;
    constructor(message: string, status?: number, detalle?: Array<string | Diferencia>);
}
export declare function validarLoteAltas(o: {
    tenantObjectId: any;
    modo: ModoAltas;
    empresaId: string;
    items: ItemLoteAltas[];
    forzar?: boolean;
}): Promise<LoteAltasValidado>;
