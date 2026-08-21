import { TipoNomenclatura } from "../utils/nomenclatura.js";
/**
 * El nombre de un archivo, según lo que el tenant configuró.
 *
 * Si no configuró nada rige `PATRON_POR_DEFECTO`, que reproduce exactamente el nombre que la
 * plataforma generaba antes: por eso esto se puede soltar sin migrar nada.
 *
 * Ante CUALQUIER problema —la base no responde, el patrón guardado quedó raro, el render sale
 * vacío— cae al default en vez de fallar. Un documento tiene que poder generarse siempre: quedarse
 * sin contrato porque alguien escribió mal una configuración de nombres sería un intercambio pésimo.
 */
export declare function nombreArchivo(tenantId: unknown, tipo: TipoNomenclatura, datos: Record<string, unknown>): Promise<string>;
/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export declare function nombreArchivoDocumento(opts: {
    tenantId: unknown;
    tipo: TipoNomenclatura;
    user: any;
    up: any;
    contract: any;
    docName?: string;
    extra?: string;
}): Promise<string>;
