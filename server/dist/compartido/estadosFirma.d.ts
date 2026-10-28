/**
 * ESTADOS QUE DEPENDEN DE UNA FIRMA DEL COLABORADOR (Dropbox Sign) (28/10/2026).
 *
 * Un estado marcado `vinculadoAFirma` (ENVIO DE DOCUMENTACION, FIRMA PENDIENTE, FIRMA ENVIADA…) sólo
 * tiene sentido en un tipo de contrato que manda algo a firmar: el contrato, el release o el alta de
 * ARCA. Si el tipo no manda nada, el contrato nunca pasaría por esos estados y no se le pueden asignar.
 *
 * Sin dependencias: lo usan el modal de Contrato (`@compartido`), la ruta de estados y la semilla.
 */
/** Los checks de «Envío a firmar» del tipo de contrato (`Contrato.data`). Ausente = `true`, como en el modelo. */
export interface TipoParaFirma {
    requiereFirma?: boolean | null;
    requiereFirmaRelease?: boolean | null;
    requiereFirmaAlta?: boolean | null;
    generaAlta?: boolean | null;
}
/** ¿El tipo manda a firmar algo? La firma del alta sólo cuenta si el tipo genera alta (como se muestra el check). */
export declare function tipoEnviaAFirmar(t: TipoParaFirma | null | undefined): boolean;
export interface EstadoParaFirma {
    data?: {
        vinculadoAFirma?: boolean | null;
        esImpositivo?: boolean | null;
    } | null;
}
/** Un impositivo nunca es de firma: es el trámite de ARCA, no lo que firma la persona. */
export declare const esEstadoDeFirma: (e: EstadoParaFirma | null | undefined) => boolean;
/** ¿Se le puede asignar este estado a un tipo con estos checks? */
export declare const estadoPermitidoParaTipo: (e: EstadoParaFirma | null | undefined, t: TipoParaFirma | null | undefined) => boolean;
export declare function pareceEstadoDeFirma(name: string, carpetas?: Array<{
    proposito?: string | null;
}> | null): boolean;
