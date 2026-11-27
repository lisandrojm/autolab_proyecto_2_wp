export type TramiteImpositivo = "alta_temprana_afip" | "constancia_cuit";
export declare const YA_ENVIADO = "Este tr\u00E1mite ya se envi\u00F3 a firmar: sus documentos quedan como se enviaron.";
/** Un error que es del pedido, no del server: la ruta lo devuelve con su status. */
export declare class ErrorDeTramite extends Error {
    status: number;
    constructor(status: number, mensaje: string);
}
/** Errores de generarContratoPdf / generarReleasePdf que son culpa del pedido, no del server. */
export declare const statusDeErrorDePdf: (msg: string) => 500 | 400 | 404;
/** Lee un archivo guardado en disco local a partir de su URL pública `/storage/...`. */
export declare function leerArchivoStorage(urlStorage: string): Buffer;
/** Borra un archivo guardado en disco a partir de su URL pública `/storage/...` — no falla si ya no existe. */
export declare function borrarArchivoStorage(urlStorage?: string | null): void;
export interface Tramite {
    projectId: string;
    userId: string;
    contractIndex: number;
}
/**
 * GENERAR EL CONTRATO del trámite: arma el PDF y lo guarda en disco local (mismo patrón que
 * `altaDocumentoUrl`) para poder revisarlo antes de mandarlo a firmar. Independiente de los releases.
 *
 * La etiqueta del trámite viaja por el PATRÓN del nombre, como `{{extra}}`: los DOS trámites se
 * etiquetan (antes sólo la constancia llevaba sufijo y las altas tempranas no se distinguían de un
 * contrato generado fuera de un trámite).
 */
export declare function generarContratoDeTramite(opts: Tramite & {
    tenantId: string;
    contratoTemplateId: string;
    empresaContratoId?: string;
    tramite?: TramiteImpositivo;
}): Promise<{
    firmaContratoUrl: string;
    firmaContratoNombre: string;
    firmaGeneradoAt: Date;
}>;
/** GENERAR EL/LOS RELEASE(S) del trámite: un PDF por release, en disco local. Independiente del contrato. */
export declare function generarReleasesDeTramite(opts: Tramite & {
    tenantId: string;
    releaseIds: string[];
    empresaReleaseId?: string;
    tramite?: TramiteImpositivo;
}): Promise<{
    firmaReleases: {
        releaseId: string;
        nombre: string;
        url: string;
    }[];
    firmaReleasesGeneradoAt: Date;
}>;
/** Borra el PDF del contrato y limpia sus campos, para poder volver a generar (p. ej. con otra empresa). */
export declare function eliminarContratoDeTramite(t: Tramite): Promise<void>;
/** Borra los PDF de los releases y limpia sus campos, para poder volver a generar. */
export declare function eliminarReleasesDeTramite(t: Tramite): Promise<void>;
export interface TargetDeEnvio extends Tramite {
    /** Determina si además del Contrato/Release hay que sumar el documento de Alta temprana de ARCA ya cargado. */
    tipoImpositivo?: TramiteImpositivo;
    /** «Se envía a firmar» del Tipo de Contrato: en false no se exige el Contrato generado ni se sube. */
    incluirContrato: boolean;
    /** «Se envía a firmar el release» / «…el alta de ARCA» del Tipo de Contrato. */
    incluirReleases: boolean;
    incluirAlta: boolean;
}
export interface ResultadoDeEnvio extends Tramite {
    ok: boolean;
    error?: string;
    archivosSubidos?: number;
}
/**
 * ENVIAR A FIRMAR: sube a la carpeta Outbox de Dropbox los documentos YA generados (nunca genera nada
 * acá) — Contrato + Release(s), y si el trámite fue «Alta temprana de ARCA» también el documento de
 * Alta ya cargado, renombrado con la nomenclatura del sistema (el escaneo matchea por CUIT en el
 * nombre). La Constancia de CUIT (el JSON) NUNCA se manda a firmar. El alta sale UNA sola vez
 * (`altaEnviadaAFirmarEl`): un reenvío del contrato no la vuelve a mandar.
 *
 * Sin Dropbox o sin Outbox no se puede enviar nada: `ErrorDeTramite` 400.
 */
export declare function enviarAFirmar(opts: {
    tenantObjectId: any;
    targets: TargetDeEnvio[];
}): Promise<{
    resultados: ResultadoDeEnvio[];
    enviados: number;
}>;
