import { TipoNomenclatura } from "../utils/nomenclatura.js";
/**
 * Razón social y CUIT de la empleadora, para el final del nombre.
 *
 * El CUIT sale PELADO: son los once dígitos y nada más. La etiqueta vive en el PATRÓN
 * (`EMPRESA-{{empresaCuit}}`), donde se ve y se puede acortar; acá adentro estaba escondida y
 * costaba cinco caracteres que el nombre no tiene para regalar.
 *
 * Lo que impide confundirlo con el CUIL de la persona no es la etiqueta sino el ORDEN:
 * `extraerCuitDeNombre` toma el primer número de once dígitos, `{{cuit}}` es obligatoria y
 * `validarPatron` no deja poner `{{empresaCuit}}` antes que ella.
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
 * El código del centro de costo de un proyecto («426»), para `{{centroDeCosto}}`.
 *
 * Es `codAuxiliar` —el número con el que producción nombra al proyecto—, no el `centroCostoId` que
 * guarda el proyecto: ese es el id de Tango, y el mismo id es otro código en cada empresa. Por eso se
 * busca primero el par (empresa de Tango, id), igual que la ficha del proyecto.
 *
 * Se acepta el `_id` del proyecto o su id externo de FRAME, porque los contratos viejos solo tienen
 * el segundo. Sin proyecto o sin centro devuelve "": el campo se cae del nombre y el resto sigue.
 */
export declare function centroDeCostoDelProyecto(o: {
    projectId?: unknown;
    externalProjectId?: unknown;
}): Promise<string>;
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
/** A quién y a qué contrato pertenece el documento: lo que se guarda junto con su código. */
export interface RegistroDocumento {
    userId?: unknown;
    userProjectId?: unknown;
    projectId?: unknown;
    contrato?: {
        indice?: number | null;
        alta?: string;
        baja?: string;
        carga?: string;
    };
}
export declare function nombreArchivo(tenantId: unknown, tipo: TipoNomenclatura, datos: Record<string, unknown>, reservar?: number, 
/** De quién es el documento. Con esto el aviso de Dropbox Sign encuentra el contrato por el código. */
registro?: RegistroDocumento): Promise<string>;
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
