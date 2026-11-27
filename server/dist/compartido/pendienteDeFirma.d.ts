/** Los checks de «Envío a firmar» del tipo de contrato (`Contrato.data`). Ausente = sí, como en el modelo. */
export interface TipoDeContratoParaFirma {
    requiereFirma?: boolean | null;
    requiereFirmaRelease?: boolean | null;
    requiereFirmaAlta?: boolean | null;
}
/** La plantilla de contrato (`ContratoFrame`), con su tipo principal populado o como id. */
export interface PlantillaParaFirma {
    _id: unknown;
    name?: string;
    data?: {
        id?: number | string | null;
        nombre?: string;
    } | null;
    content?: string | null;
    esCustom?: boolean | null;
    contratoId?: unknown;
}
/** Un release (`Release`), con su tipo de release populado o como id. */
export interface ReleaseParaFirma {
    _id: unknown;
    esCustom?: boolean | null;
    contratoIds?: unknown[] | null;
    releaseTipoId?: unknown;
}
/** Lo que la regla mira de un contrato (la fila del listado o el subdocumento de la base). */
export interface ContratoParaFirma {
    nombre_contrato?: string | null;
    tipo_contrato_id?: unknown;
    /** El tipo de contrato que guarda el contrato (`contrato_id`); la fila lo trae como `tipoContratoId`. */
    tipoContratoId?: unknown;
    contrato_id?: unknown;
    firmaGeneradoAt?: unknown;
    firmaReleasesGeneradoAt?: unknown;
    firmaReleases?: {
        releaseId?: unknown;
    }[] | null;
    firmaEnviadaAt?: unknown;
    altaDocumentoUrl?: string | null;
    contenidoCustomContrato?: string | null;
    contenidoCustomReleases?: {
        releaseId?: unknown;
        content?: string | null;
    }[] | null;
    empresaContratoId?: unknown;
    empresaReleaseId?: unknown;
    /** Las empresas que el proyecto ofrece para generar (la fila las trae; el server las arma del proyecto). */
    contratoEmpresas?: {
        id: string;
    }[] | null;
    releaseEmpresas?: {
        id: string;
    }[] | null;
}
export type TramiteImpositivo = "alta_temprana_afip" | "constancia_cuit";
/** ¿Este release está asignado EXPLÍCITAMENTE a este tipo de contrato (`Release.contratoIds`)? */
export declare const releaseEsDelTipo: (release: {
    contratoIds?: unknown[] | null;
}, tipoId: string | null | undefined) => boolean;
/** Un release sin contratos asignados: sólo lo llevan los tipos que no eligieron ninguno. */
export declare const releaseSinContratos: (release: {
    contratoIds?: unknown[] | null;
}) => boolean;
/**
 * LOS RELEASES QUE LE TOCAN A UN TIPO DE CONTRATO:
 *  - si el tipo tiene releases ASIGNADOS, sólo esos («que aparezca sólo el que se eligió»);
 *  - si no tiene ninguno, los que no están asignados a ningún contrato, que es como estaban todos antes
 *    de poder asignarlos: así los tipos que nadie configuró siguen igual.
 * Sin tipo conocido, todos los que vienen. `universo`: si el tipo tiene asignados se decide con TODOS
 * los releases, no con la lista ya filtrada (un asignado que no va a firma igual hace que el tipo deje
 * de llevar los generales).
 */
export declare const releasesDelTipo: <R extends {
    contratoIds?: unknown[] | null;
}>(releases: R[], tipo: {
    _id?: unknown;
} | null | undefined, universo?: {
    contratoIds?: unknown[] | null;
}[]) => R[];
/** «Se envía a firmar» del Tipo de Contrato de la plantilla. Sin el dato populado, sí (como antes de existir el campo). */
export declare const contratoRequiereFirma: (template: PlantillaParaFirma | null) => boolean;
/** «Se envía a firmar el release» del Tipo de Contrato. Sin el dato, sí. */
export declare const contratoRequiereFirmaRelease: (template: PlantillaParaFirma | null) => boolean;
/** «Se envía a firmar el alta de ARCA» del Tipo de Contrato. Sin el dato, sí. */
export declare const contratoRequiereFirmaAlta: (template: PlantillaParaFirma | null) => boolean;
/** Mismo criterio, para el Tipo de Release (`release.releaseTipoId`). */
export declare const releaseRequiereFirma: (release: ReleaseParaFirma) => boolean;
/**
 * La plantilla se puede generar si tiene contenido REAL redactado. El editor devuelve "<p></p>" cuando
 * está vacío, así que se mira el texto sin etiquetas. Una CUSTOM no tiene contenido propio (sólo el
 * placeholder): el texto es del trámite, y eso lo mira `pendienteDeFirma`.
 */
export declare const plantillaTieneContenido: (cf: PlantillaParaFirma | null) => boolean;
/** La plantilla de contrato que le corresponde al contrato (ver `plantillaDelContrato`). */
export declare const plantillaDe: <T extends PlantillaParaFirma>(contrato: ContratoParaFirma, plantillas: T[]) => T | null;
/**
 * EL TIPO DE CONTRATO DE LA FILA, para saber qué releases le tocan: el que guarda el contrato
 * (`tipoContratoId` en la fila, `contrato_id` en la base) y, si no lo guarda, el principal de su plantilla.
 */
export declare const tipoDeLaFila: (contrato: ContratoParaFirma, template: PlantillaParaFirma | null) => {
    _id?: string;
} | null;
/**
 * LOS RELEASES QUE VAN A FIRMA PARA ESTA FILA: los que su tipo de release manda a firmar (ya vienen
 * filtrados en `releasesQueFirman`) y sólo si el Tipo de Contrato también lo pide. Un release custom
 * entra sólo en el trámite que tiene su texto escrito.
 */
export declare const releasesDeLaFila: <R extends ReleaseParaFirma>(template: PlantillaParaFirma | null, releasesQueFirman: R[], contrato: ContratoParaFirma, todosLosReleases?: ReleaseParaFirma[]) => R[];
/** El alta de ARCA va a firma: trámite de alta temprana, documento cargado y el tipo lo pide. */
export declare const altaVaAFirma: (contrato: ContratoParaFirma, template: PlantillaParaFirma | null, tipo?: TramiteImpositivo | null) => boolean;
export declare const contratoGenerado: (c: ContratoParaFirma) => boolean;
export declare const releasesGenerados: (c: ContratoParaFirma, releasesAplicables: ReleaseParaFirma[]) => boolean;
/** Con qué empresa generar: la guardada o, si el proyecto ofrece una sola, ésa. Con varias y ninguna elegida, falta una decisión. */
export declare const empresaParaGenerar: (guardada: unknown, opciones: {
    id: string;
}[] | null | undefined) => {
    id?: string;
    falta: boolean;
};
export interface PendienteDeFirma<P extends PlantillaParaFirma = PlantillaParaFirma, R extends ReleaseParaFirma = ReleaseParaFirma> {
    /** La fila tiene algo que mandar a firma (contrato, release o alta). Sin esto no hay nada que hacer. */
    algoAplica: boolean;
    template: P | null;
    /** El contrato se firma (según el tipo). */
    contratoAplica: boolean;
    releasesAplicables: R[];
    faltaContrato: boolean;
    faltaRelease: boolean;
    /** Con qué empresa generar (`undefined` = la que elija el server: la primera del proyecto). */
    empresaContrato?: string;
    empresaRelease?: string;
    /** Por qué no se puede generar solo el contrato / el release. Vacío = se puede (o no hace falta). */
    motivoContrato: string;
    motivoRelease: string;
    /** Los dos juntos. */
    motivo: string;
    /** Todo lo que aplica ya está generado y no se envió: se puede mandar a firmar. */
    enviable: boolean;
    /** Lo que lleva el envío (los tres checks del tipo). */
    envio: {
        incluirContrato: boolean;
        incluirReleases: boolean;
        incluirAlta: boolean;
    };
}
/**
 * LO QUE LE FALTA A UNA FILA PARA PODER ENVIARSE, y si se puede generar sin preguntar nada.
 *
 * `releasesQueFirman`: los releases activos cuyo tipo de release manda a firmar. `todosLosReleases`:
 * los activos, con o sin firma (para decidir si el tipo tiene asignados; ver `releasesDelTipo`).
 */
export declare function pendienteDeFirma<P extends PlantillaParaFirma, R extends ReleaseParaFirma>(contrato: ContratoParaFirma, plantillas: P[], releasesQueFirman: R[], tipo: TramiteImpositivo | null | undefined, todosLosReleases?: ReleaseParaFirma[]): PendienteDeFirma<P, R>;
