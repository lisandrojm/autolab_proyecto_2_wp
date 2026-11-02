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
    /**
     * Solo con `descartarPresentadas`: lo que venía en la selección y NO se presenta porque ya tiene
     * marca. `presentada` se saltea; `incierta` (sin resultado: «presentando» o «indeterminado») se
     * consulta en ARCA antes que nada, y tampoco se presenta.
     */
    descartadas: Array<{
        userProjectId: string;
        contractIndex: number;
        cuil: string;
        nombre: string;
        registro: string;
        motivo: "presentada" | "incierta";
    }>;
}
export declare class LoteAltasError extends Error {
    status: number;
    detalle: Array<string | Diferencia>;
    /** Los contratos que tienen algún problema: la pantalla ofrece sacarlos del lote y presentar el resto. */
    conProblema: Array<{
        userProjectId: string;
        contractIndex: number;
    }>;
    constructor(message: string, status?: number, detalle?: Array<string | Diferencia>, 
    /** Los contratos que tienen algún problema: la pantalla ofrece sacarlos del lote y presentar el resto. */
    conProblema?: Array<{
        userProjectId: string;
        contractIndex: number;
    }>);
}
export declare function validarLoteAltas(o: {
    tenantObjectId: any;
    modo: ModoAltas;
    empresaId: string;
    items: ItemLoteAltas[];
    forzar?: boolean;
    descartarPresentadas?: boolean;
}): Promise<LoteAltasValidado>;
/**
 * EL PRECHEQUEO DE LA PRESENTACIÓN MASIVA (pedido del 01/11/2026): qué contratos de la selección no se
 * pueden presentar todavía porque la persona ya tiene algo activo con esta empleadora (o el alta de ese
 * día ya está hecha). Los mismos textos que `validarLoteAltas`, que igual rechazaría el lote: el modal los
 * saca ANTES, con aviso, como a las personas repetidas. Sólo lee.
 */
export declare function bloqueadasPorVigencia(tenantObjectId: any, empresaId: string, items: Array<{
    userProjectId: string;
    contractIndex: number;
}>): Promise<Array<{
    userProjectId: string;
    contractIndex: number;
    motivo: string;
}>>;
