import { TipoNomenclatura } from "../utils/nomenclatura.js";
/**
 * Razón social y CUIT de la empleadora, para el final del nombre.
 *
 * El CUIT sale ETIQUETADO (`CUIT-EMPRESA-30710295839`) y no como once dígitos sueltos. Dos motivos, y el
 * segundo importa: al lado del `CUIL-…` de la persona, dos números de once dígitos sin rótulo son
 * indistinguibles para quien mira la carpeta; y el respaldo que usa `extraerIdentidadDeArchivo` para
 * los archivos viejos busca justamente un CUIT suelto de once dígitos, así que dejarlo pelado sería
 * poner una trampa para el día que alguien saque `{{identidad}}` del patrón.
 */
export declare function empresaAValores(c: any): {
    empresa: string;
    empresaCuit: string;
};
export declare function datosEmpresa(empresaId: unknown, nombreCache?: string): Promise<{
    empresa: string;
    empresaCuit: string;
}>;
/**
 * El nombre de un archivo, según lo que el tenant configuró.
 *
 * Si no configuró nada rige `PATRON_POR_DEFECTO`. Los archivos ya generados NO se renombran nunca:
 * este patrón solo decide cómo se van a llamar los próximos.
 *
 * Ante CUALQUIER problema —la base no responde, el patrón guardado quedó raro, el render sale
 * vacío— cae al default en vez de fallar. Un documento tiene que poder generarse siempre: quedarse
 * sin contrato porque alguien escribió mal una configuración de nombres sería un intercambio pésimo.
 *
 * El resultado entra siempre en `MAX_NOMBRE`: si no entra, se recorta lo descriptivo sin tocar los
 * bloques que los parsers de vuelta necesitan (ver `recortarNombre`). `reservar` es lo que el que
 * llama va a pegar después y todavía no está en el string — como mínimo la extensión.
 */
export declare function nombreArchivo(tenantId: unknown, tipo: TipoNomenclatura, datos: Record<string, unknown>, reservar?: number): Promise<string>;
/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export declare function nombreArchivoDocumento(opts: {
    tenantId: unknown;
    tipo: TipoNomenclatura;
    user: any;
    up: any;
    contract: any;
    docName?: string;
    extra?: string;
    /**
     * La empleadora YA resuelta, cuando quien llama la tiene.
     *
     * Hace falta porque no siempre sale del mismo lado: los documentos de ARCA usan la del contrato
     * (`empresaContratoId`), pero un Release usa la de `releaseEmpresas` del proyecto y un Contrato la
     * de `contratoEmpresas` — o la que se eligió al descargar. Deducirla desde acá miraba el campo
     * equivocado y el nombre salía sin empresa, que es exactamente lo que pasaba.
     */
    empresa?: any;
}): Promise<string>;
